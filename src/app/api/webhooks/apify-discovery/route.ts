/**
 * POST /api/webhooks/apify-discovery
 *
 * Receives raw Instagram profile/post records scraped by an Apify actor,
 * classifies handles that aren't already in `production_entities`, and
 * ingests them through the existing `InstagramIngestWorker` — which already owns bio
 * contact parsing, FTC brand-disclosure detection (blackout windows), and
 * availability scoring deterministically. This route's own job is narrow:
 * auth, dedupe, LLM classification for the fields that genuinely need
 * natural-language judgment, and deterministic aggregation for the fields
 * that don't.
 *
 * Auth: shared-secret header `x-apify-webhook-secret`, compared against
 * `process.env.APIFY_WEBHOOK_SECRET` with a constant-time comparison
 * (`crypto.timingSafeEqual`) so response timing can't leak the secret.
 *
 * Declared assumptions / design decisions (called out because the
 * originating request left them unspecified and getting them wrong would
 * silently corrupt data or duplicate cost/latency already solved elsewhere):
 *
 *  - LLM: Claude Opus 5 via the official `@anthropic-ai/sdk`, using
 *    structured outputs (`messages.parse` + `zodOutputFormat`). The Zod
 *    schema's `primaryMetro`/`primaryNiche` fields are typed directly as
 *    `z.enum(METRO_HUBS)` / `z.enum(PRIMARY_NICHES)` — the real Postgres
 *    enum labels (`DFW_TEXAS`, `CULTURAL_EVENTS`, ...), not the short codes
 *    or display labels used elsewhere in the product. Structured outputs
 *    constrain the model to one of those exact literals, so there is no
 *    separate LLM-label -> DB-enum translation table to keep in sync.
 *  - Only `primaryMetro`, `primaryNiche`, `secondaryLanguages`, the rate
 *    range, and `deliverabilityScore` go through the LLM — these need
 *    judgment a regression/formula can't cheaply replicate. Bio contact
 *    parsing, rep-type classification, and brand-disclosure detection are
 *    left to `InstagramIngestWorker`'s existing regex-based logic (already
 *    tested, deterministic, and immune to LLM hallucination on exact-match
 *    extraction). `avgReelViews`/`engagementRate` are computed here as a
 *    plain average over whatever view/like/comment counts the scrape
 *    provided — raw arithmetic, not a classification task.
 *  - No `metrics` or `media_samples` tables exist in the current schema.
 *    Telemetry is written to the existing columns on `production_entities`
 *    (matches `ScrapedCreatorPayload`). Per-reel row-level
 *    storage remains a real, disclosed gap (see the class doc on
 *    `InstagramIngestWorker`: "no per-reel data model exists yet") — add a
 *    dedicated migration for it if per-reel history is actually needed;
 *    nothing here reads or writes such a table.
 *  - Raw item shape follows the common Apify Instagram-scraper actor output
 *    (`username`/`fullName`/`biography`/`latestPosts[].caption`/...). If the
 *    actual actor differs, adjust `ApifyProfileItem`/`ApifyPostItem` below —
 *    malformed items are skipped and reported per-item rather than failing
 *    the whole batch, so a partial field mismatch degrades gracefully.
 */

import { timingSafeEqual } from 'crypto';

import Anthropic from '@anthropic-ai/sdk';
import { zodOutputFormat } from '@anthropic-ai/sdk/helpers/zod';
import { NextResponse, type NextRequest } from 'next/server';
import { z } from 'zod';

import { getServiceRoleClient } from '@/lib/supabase/service';
import { ENTITY_TYPES, METRO_HUBS, PRIMARY_NICHES, type EntityDetails } from '@/types/creator';
import { InstagramIngestWorker, type ScrapedCreatorPayload, type ScrapedPost } from '@/workers/ingest-worker';

const CLASSIFY_CONCURRENCY = 5;

const anthropic = new Anthropic();
const worker = new InstagramIngestWorker();

const ClassificationSchema = z.object({
  entityType: z
    .enum(ENTITY_TYPES)
    .describe(
      'What kind of production entity this account is: solo_creator (individual content ' +
        'creator/social promoter), stage_emcee (live mic host/moderator), dance_troupe ' +
        '(dance studio/academy/performance group), local_dj (DJ/sound engineer), or ' +
        'event_planner (decorator/stage designer/event coordinator). Infer from bio/handle/captions.'
    ),
  primaryMetro: z
    .enum(METRO_HUBS)
    .describe(
      'Best-matching US metro hub from location cues in the bio/handle/captions. ' +
        'DFW_TEXAS=Dallas-Fort Worth, DMV_NOVA=DC/Maryland/Virginia, AUSTIN_TX=Austin, ' +
        'HOUSTON_TX=Houston, TRI_STATE_NY_NJ=NYC/NJ, ATLANTA_GA=Atlanta, CHICAGO_IL=Chicago.'
    ),
  primaryNiche: z
    .enum(PRIMARY_NICHES)
    .describe(
      'Best-matching content niche: CULTURAL_EVENTS, NIGHTLIFE, LUXURY_BRIDAL, STAGE_EMCEE, ' +
        'FOOD_DINING, or CHOREOGRAPHY.'
    ),
  secondaryLanguages: z
    .array(z.string())
    .max(10)
    .describe('Non-English languages evidenced in the bio/captions (e.g. "Telugu", "Hindi", "Punjabi"). Empty array if none.'),
  estMinimumRateUsd: z.number().int().min(0).max(1_000_000).describe('Estimated minimum USD rate for one sponsored post.'),
  estMaximumRateUsd: z.number().int().min(0).max(1_000_000).describe('Estimated maximum USD rate for one sponsored post.'),
  deliverabilityScore: z
    .number()
    .int()
    .min(0)
    .max(100)
    .describe('0-100: how likely outreach (email/DM) is to reach and be answered, from bio contact signals and activity.'),
});

type Classification = z.infer<typeof ClassificationSchema>;

// =====================================================================================
// Raw Apify payload shape (see header note — adjust if the actual actor differs)
// =====================================================================================

interface ApifyPostItem {
  caption?: string | null;
  timestamp?: string | null;
  taggedUsers?: { username?: string | null }[] | null;
  likesCount?: number | null;
  commentsCount?: number | null;
  videoViewCount?: number | null;
  videoPlayCount?: number | null;
}

interface ApifyProfileItem {
  username?: string | null;
  fullName?: string | null;
  biography?: string | null;
  profilePicUrl?: string | null;
  externalUrl?: string | null;
  followersCount?: number | null;
  verified?: boolean | null;
  latestPosts?: ApifyPostItem[] | null;
}

interface WebhookItemError {
  handle: string;
  stage: string;
  message: string;
}

// =====================================================================================
// Helpers
// =====================================================================================

function errorResponse(status: number, error: string, message: string): NextResponse {
  return NextResponse.json({ error, message }, { status });
}

function isAuthorized(request: NextRequest): boolean {
  const expected = process.env.APIFY_WEBHOOK_SECRET;
  if (!expected) return false;

  const provided = request.headers.get('x-apify-webhook-secret');
  if (!provided) return false;

  const expectedBuf = Buffer.from(expected);
  const providedBuf = Buffer.from(provided);
  if (expectedBuf.length !== providedBuf.length) return false;
  return timingSafeEqual(expectedBuf, providedBuf);
}

function normalizeHandle(handle: string): string {
  return handle.trim().replace(/^@/, '').toLowerCase();
}

function isValidDateOnly(value: string): boolean {
  return /^\d{4}-\d{2}-\d{2}$/.test(value) && !Number.isNaN(new Date(`${value}T00:00:00.000Z`).getTime());
}

function daysSince(dateStr: string): number {
  const diffMs = Date.now() - new Date(`${dateStr}T00:00:00.000Z`).getTime();
  return Math.max(0, Math.floor(diffMs / 86_400_000));
}

function toRecentPosts(raw: ApifyPostItem[] | null | undefined): ScrapedPost[] {
  if (!Array.isArray(raw)) return [];
  const posts: ScrapedPost[] = [];
  for (const post of raw) {
    if (typeof post?.caption !== 'string' || typeof post?.timestamp !== 'string') continue;
    const postDate = post.timestamp.slice(0, 10);
    if (!isValidDateOnly(postDate)) continue;
    posts.push({
      caption: post.caption,
      postDate,
      taggedAccounts: (post.taggedUsers ?? []).map((t) => t?.username).filter((u): u is string => Boolean(u)),
    });
  }
  return posts;
}

/** Plain arithmetic over whatever view counts the scrape provided — not an LLM task. */
function averageReelViews(raw: ApifyPostItem[] | null | undefined): number | null {
  const counts = (raw ?? [])
    .map((p) => p.videoViewCount ?? p.videoPlayCount)
    .filter((v): v is number => typeof v === 'number' && v >= 0);
  if (counts.length === 0) return null;
  return Math.round(counts.reduce((sum, v) => sum + v, 0) / counts.length);
}

/** Plain arithmetic (likes+comments)/followers — not an LLM task. */
function averageEngagementRate(raw: ApifyPostItem[] | null | undefined, followerCount: number | null | undefined): number | null {
  if (!followerCount || followerCount <= 0) return null;
  const rates: number[] = [];
  for (const post of raw ?? []) {
    if (typeof post.likesCount !== 'number' && typeof post.commentsCount !== 'number') continue;
    const engagement = (post.likesCount ?? 0) + (post.commentsCount ?? 0);
    rates.push((engagement / followerCount) * 100);
  }
  if (rates.length === 0) return null;
  const avg = rates.reduce((sum, r) => sum + r, 0) / rates.length;
  return Math.min(100, Math.round(avg * 100) / 100);
}

function errorMessage(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}

/** Bounded-concurrency map that never rejects — failures land in the settled result. */
async function mapWithConcurrency<T, R>(items: T[], limit: number, fn: (item: T) => Promise<R>): Promise<PromiseSettledResult<R>[]> {
  const results: PromiseSettledResult<R>[] = new Array(items.length);
  let cursor = 0;

  async function worker(): Promise<void> {
    while (cursor < items.length) {
      const current = cursor++;
      const item = items[current] as T;
      try {
        results[current] = { status: 'fulfilled', value: await fn(item) };
      } catch (reason) {
        results[current] = { status: 'rejected', reason };
      }
    }
  }

  const workerCount = Math.max(1, Math.min(limit, items.length));
  await Promise.all(Array.from({ length: workerCount }, () => worker()));
  return results;
}

async function classifyCreator(item: ApifyProfileItem, recentPosts: ScrapedPost[]): Promise<Classification> {
  const captionSample = recentPosts.slice(0, 5).map((p) => `- ${p.caption}`).join('\n') || '(no recent captions)';

  const response = await anthropic.messages.parse({
    model: 'claude-opus-5',
    max_tokens: 2048,
    system:
      'You classify Instagram creator-economy accounts for a US-based South Asian event-production ' +
      'intelligence directory covering solo creators, stage emcees, dance troupes, DJs, and event ' +
      'planners/decorators. Infer the best-fitting entity type, metro hub, and content niche strictly ' +
      'from the enums provided, extract any non-English languages evidenced in the text, and give a ' +
      'realistic USD per-post/per-booking rate range and a 0-100 deliverability score (how likely ' +
      'outreach is to reach and be answered) based on bio contact signals, follower count, and posting ' +
      'activity. When information is thin, give your best reasonable inference rather than defaulting to zero.',
    messages: [
      {
        role: 'user',
        content:
          `Handle: @${item.username ?? 'unknown'}\n` +
          `Display name: ${item.fullName ?? ''}\n` +
          `Bio: ${item.biography ?? ''}\n` +
          `Followers: ${item.followersCount ?? 'unknown'}\n` +
          `Recent captions:\n${captionSample}`,
      },
    ],
    output_config: { format: zodOutputFormat(ClassificationSchema) },
  });

  if (!response.parsed_output) {
    throw new Error(`model returned no parsed output (stop_reason: ${response.stop_reason})`);
  }
  return response.parsed_output;
}

// =====================================================================================
// Route
// =====================================================================================

export async function POST(request: NextRequest): Promise<NextResponse> {
  if (!isAuthorized(request)) {
    return errorResponse(401, 'UNAUTHORIZED', 'Missing or invalid x-apify-webhook-secret header.');
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return errorResponse(400, 'INVALID_JSON', 'Request body must be valid JSON.');
  }

  const items = Array.isArray(body) ? body : (body as { items?: unknown[] } | null)?.items;
  if (!Array.isArray(items)) {
    return errorResponse(400, 'INVALID_REQUEST', 'Expected a JSON array of scraped profile items (or `{ "items": [...] }`).');
  }

  const serviceClient = getServiceRoleClient();
  const errors: WebhookItemError[] = [];

  // ---------------------------------------------------------------------
  // Normalize + dedupe against existing creators
  // ---------------------------------------------------------------------
  const candidates: { item: ApifyProfileItem; handle: string; recentPosts: ScrapedPost[] }[] = [];
  for (const raw of items as ApifyProfileItem[]) {
    const rawHandle = raw?.username;
    if (!rawHandle || typeof rawHandle !== 'string' || !rawHandle.trim()) {
      errors.push({ handle: '(missing handle)', stage: 'validation', message: 'username is required' });
      continue;
    }
    candidates.push({ item: raw, handle: normalizeHandle(rawHandle), recentPosts: toRecentPosts(raw.latestPosts) });
  }

  if (candidates.length === 0) {
    return NextResponse.json({ totalReceived: items.length, skippedExisting: 0, classified: 0, created: 0, failed: errors.length, errors });
  }

  const { data: existingRows, error: existingError } = await serviceClient
    .from('production_entities')
    .select('handle')
    .in('handle', candidates.map((c) => c.handle));

  if (existingError) {
    return errorResponse(500, 'LOOKUP_FAILED', existingError.message);
  }

  const existingHandles = new Set((existingRows ?? []).map((r) => (r as { handle: string }).handle));
  const newCandidates = candidates.filter((c) => !existingHandles.has(c.handle));

  // ---------------------------------------------------------------------
  // Classify new handles (LLM, bounded concurrency) and compute deterministic telemetry
  // ---------------------------------------------------------------------
  const settled = await mapWithConcurrency(newCandidates, CLASSIFY_CONCURRENCY, async (candidate) => {
    const classification = await classifyCreator(candidate.item, candidate.recentPosts);
    return { candidate, classification };
  });

  const payloads: ScrapedCreatorPayload[] = [];
  settled.forEach((result, index) => {
    const candidate = newCandidates[index];
    if (!candidate) return;

    if (result.status === 'rejected') {
      errors.push({ handle: candidate.handle, stage: 'classification', message: errorMessage(result.reason) });
      return;
    }

    const { item, recentPosts } = candidate;
    const { classification } = result.value;
    const lastPostDate = recentPosts.map((p) => p.postDate).sort().at(-1);

    let recentSponsorshipCount14d = 0;
    for (const post of recentPosts) {
      if (daysSince(post.postDate) > 14) continue;
      try {
        if (worker.detectBrandDisclosures(post.caption, post.taggedAccounts).isCommercial) {
          recentSponsorshipCount14d += 1;
        }
      } catch {
        // Malformed caption/taggedAccounts for this one post — don't let it block ingestion.
      }
    }

    payloads.push({
      handle: candidate.handle,
      displayName: item.fullName?.trim() || candidate.handle,
      avatarUrl: item.profilePicUrl ?? null,
      bio: item.biography ?? '',
      externalUrl: item.externalUrl ?? null,
      entityType: classification.entityType,
      // Minimal — { kind } only. Full per-type rider/spec fields (troupe
      // size, AV spec, venue scale) aren't something an LLM should invent
      // from a bio; they're populated later via ops review/manual entry.
      entityDetails: { kind: classification.entityType } as EntityDetails,
      primaryMetro: classification.primaryMetro,
      primaryNiche: classification.primaryNiche,
      secondaryLanguages: classification.secondaryLanguages,
      followerCount: item.followersCount ?? null,
      engagementRate: averageEngagementRate(item.latestPosts, item.followersCount),
      avgReelViews: averageReelViews(item.latestPosts),
      estMinimumRateUsd: classification.estMinimumRateUsd,
      estMaximumRateUsd: Math.max(classification.estMaximumRateUsd, classification.estMinimumRateUsd),
      deliverabilityScoreHint: classification.deliverabilityScore,
      isVerified: item.verified ?? false,
      recentPosts,
      daysSinceLastPost: lastPostDate ? daysSince(lastPostDate) : 9999,
      recentSponsorshipCount14d,
    });
  });

  // ---------------------------------------------------------------------
  // Ingest (reuses InstagramIngestWorker's bio/brand/availability logic + chunked upsert)
  // ---------------------------------------------------------------------
  const ingestResult =
    payloads.length > 0
      ? await worker.ingestCreatorBatch(serviceClient, payloads)
      : { totalProcessed: 0, succeeded: 0, failed: 0, errors: [] };

  return NextResponse.json({
    totalReceived: items.length,
    skippedExisting: candidates.length - newCandidates.length,
    classified: payloads.length,
    created: ingestResult.succeeded,
    failed: errors.length + ingestResult.failed,
    errors: [...errors, ...ingestResult.errors.map((e) => ({ handle: e.identifier, stage: e.stage, message: e.message }))],
  });
}
