/**
 * POST /api/ingest/discover
 *
 * Stage 1->2 orchestrator for fully-autonomous regional discovery. Apify
 * webhook target for the *hashtag-discovery* task's run-succeeded event
 * (an `apify/instagram-hashtag-scraper` run over regional hashtags like
 * #dfwevents) — NOT the same contract as `/api/ingest`, whose dataset is
 * Instagram *profiles*. This route's dataset is Instagram *posts*
 * (`ownerUsername`, caption, ...); pointing a profile-shaped payload at
 * this route, or a post-shaped payload at `/api/ingest`, would silently
 * misparse.
 *
 * What it does:
 *  1. Fetches the hashtag-scrape dataset, extracts + dedupes `ownerUsername`
 *     from every post.
 *  2. Drops handles already on file in `production_entities` — this is
 *     framed as *discovery* (finding new creators), not a refresh job, so
 *     re-spending Apify credits re-scraping known creators every cycle
 *     isn't the default. (If you want existing creators refreshed too,
 *     remove the `.not('handle', 'in', ...)` filter below.)
 *  3. Caps the remaining list at MAX_DISCOVERED_HANDLES per run — a hashtag
 *     crawl can return far more authors than is sensible to enrich (and
 *     pay for) in one cycle.
 *  4. Starts a NEW `apify/instagram-profile-scraper` run with that handle
 *     list as input, with an AD-HOC webhook attached directly to that run
 *     (via the `webhooks` param on the "start run" call — see
 *     `startApifyActorRun`) pointing back at `/api/ingest`. No second
 *     persistent webhook needs to exist in the Apify console for the
 *     enrichment stage; it's wired up dynamically, per invocation, here.
 *
 * Stage 3 (bio-keyword entity-type filtering + upsert into
 * production_entities) is unchanged, existing code — it's just whatever
 * runs when that ad-hoc-webhook-triggered run lands on `/api/ingest`.
 *
 * Auth: same shared-secret pattern as `/api/ingest` — `x-apify-secret`
 * header against `process.env.APIFY_WEBHOOK_SECRET`.
 */

import { timingSafeEqual } from 'crypto';

import { NextResponse, type NextRequest } from 'next/server';

import { fetchApifyDatasetItems, startApifyActorRun } from '@/lib/ingest/apify-client';
import { resolveMetroHub } from '@/lib/ingest/apify-instagram-parser';
import { getServiceRoleClient } from '@/lib/supabase/service';
import { ENTITY_TYPES, type EntityType } from '@/types/creator';

const PROFILE_SCRAPER_ACTOR_ID = 'apify/instagram-profile-scraper';
const MAX_DISCOVERED_HANDLES = 50;

interface ApifyRunFinishedPayload {
  datasetId?: string;
  resource?: { defaultDatasetId?: string };
}

interface HashtagPostItem {
  ownerUsername?: string | null;
  /** e.g. "https://www.instagram.com/explore/tags/dfwdesievents/" — the only field in the scraper's output that says which tracked hashtag surfaced this post (`hashtags` is the post's OWN caption tags, unrelated). Used to keep MAX_DISCOVERED_HANDLES from being dominated by whichever hashtag the actor happens to write to the dataset first. */
  inputUrl?: string | null;
}

/** Last non-empty path segment of the tag-explore URL, lowercased; "unknown" if unparseable rather than silently merging into another bucket. */
function extractHashtagLabel(inputUrl: string | null | undefined): string {
  const segments = (inputUrl ?? '').split('/').filter(Boolean);
  const last = segments.at(-1);
  return last ? last.toLowerCase() : 'unknown';
}

/**
 * Round-robins across hashtag groups (each already in dataset-encounter
 * order) instead of taking a flat prefix slice. A flat slice over an
 * arbitrarily-ordered global list let whichever hashtag the actor happens
 * to write last get silently zeroed out once earlier hashtags filled the
 * cap — confirmed in production: #dfwdesievents (13 authors) was written
 * last across a 5-hashtag run and every one of its authors fell past
 * MAX_DISCOVERED_HANDLES=50, so zero of them ever reached profile
 * enrichment. Round-robin guarantees every tracked hashtag gets a fair
 * share before any one hashtag gets a second pick.
 */
function selectFairlyAcrossHashtags(groupedHandles: Map<string, string[]>, max: number): string[] {
  const queues = Array.from(groupedHandles.values()).map((handles) => [...handles]);
  const selected: string[] = [];
  let tookAny = true;
  while (selected.length < max && tookAny) {
    tookAny = false;
    for (const queue of queues) {
      if (selected.length >= max) break;
      const next = queue.shift();
      if (next !== undefined) {
        selected.push(next);
        tookAny = true;
      }
    }
  }
  return selected;
}

function errorResponse(status: number, error: string, message: string): NextResponse {
  return NextResponse.json({ error, message }, { status });
}

function isAuthorized(request: NextRequest): boolean {
  const expected = process.env.APIFY_WEBHOOK_SECRET;
  if (!expected) return false;

  const provided = request.headers.get('x-apify-secret');
  if (!provided) return false;

  const expectedBuf = Buffer.from(expected);
  const providedBuf = Buffer.from(provided);
  if (expectedBuf.length !== providedBuf.length) return false;
  return timingSafeEqual(expectedBuf, providedBuf);
}

function errorMessage(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}

export async function POST(request: NextRequest): Promise<NextResponse> {
  if (!isAuthorized(request)) {
    return errorResponse(401, 'UNAUTHORIZED', 'Missing or invalid x-apify-secret header.');
  }

  const { searchParams, origin } = request.nextUrl;

  const metroParam = searchParams.get('metro');
  const metro = metroParam ? resolveMetroHub(metroParam) : null;
  if (!metro) {
    return errorResponse(
      400,
      'INVALID_REQUEST',
      'Missing or unrecognized ?metro= query param. Expected a short code (DFW, DMV, HOU, ATX, NYC/NJ, ATL, CHI) or the full metro_hub value.'
    );
  }

  const defaultTypeParam = searchParams.get('defaultType') ?? 'solo_creator';
  if (!ENTITY_TYPES.includes(defaultTypeParam as EntityType)) {
    return errorResponse(400, 'INVALID_REQUEST', `Invalid defaultType "${defaultTypeParam}". Expected one of: ${ENTITY_TYPES.join(', ')}`);
  }

  let body: ApifyRunFinishedPayload;
  try {
    body = (await request.json()) as ApifyRunFinishedPayload;
  } catch {
    return errorResponse(400, 'INVALID_JSON', 'Request body must be valid JSON.');
  }

  const datasetId = body.datasetId || body.resource?.defaultDatasetId;
  if (!datasetId) {
    return errorResponse(
      400,
      'INVALID_REQUEST',
      'Could not find a dataset id — expected resource.defaultDatasetId (Apify run-finished payload) or a top-level datasetId.'
    );
  }

  const apiToken = process.env.APIFY_API_TOKEN;
  if (!apiToken) {
    return errorResponse(500, 'CONFIGURATION_ERROR', 'Missing APIFY_API_TOKEN environment variable.');
  }

  // ---------------------------------------------------------------------
  // Fetch the hashtag-scrape dataset and extract unique authors.
  // ---------------------------------------------------------------------
  let rawPosts: unknown[];
  try {
    rawPosts = await fetchApifyDatasetItems(datasetId, apiToken);
  } catch (err) {
    return errorResponse(502, 'DATASET_FETCH_FAILED', errorMessage(err));
  }

  // Grouped by tracked hashtag (dataset-encounter order preserved within
  // each group) so the cap below can be applied fairly — see
  // selectFairlyAcrossHashtags. A handle stays in whichever hashtag group
  // it was first seen under if it appears under more than one.
  const handlesByHashtag = new Map<string, string[]>();
  const seenHandles = new Set<string>();
  let discoveredCount = 0;
  for (const item of rawPosts as HashtagPostItem[]) {
    const username = item?.ownerUsername?.trim().toLowerCase();
    if (!username) continue;
    discoveredCount += 1;
    if (seenHandles.has(username)) continue;
    seenHandles.add(username);
    const tag = extractHashtagLabel(item.inputUrl);
    const group = handlesByHashtag.get(tag) ?? [];
    group.push(username);
    handlesByHashtag.set(tag, group);
  }
  const discoveredHandles = seenHandles;

  // ---------------------------------------------------------------------
  // Drop handles already on file (discovery, not a refresh job — see
  // header note), then cap the batch — fairly across hashtags, not by a
  // flat prefix slice (see selectFairlyAcrossHashtags).
  // ---------------------------------------------------------------------
  const serviceClient = getServiceRoleClient();
  const { data: existingRows, error: existingError } = await serviceClient
    .from('production_entities')
    .select('handle')
    .in('handle', Array.from(discoveredHandles));

  if (existingError) {
    return errorResponse(500, 'LOOKUP_FAILED', existingError.message);
  }

  const existingHandles = new Set((existingRows ?? []).map((r) => (r as { handle: string }).handle));
  const newHandlesByHashtag = new Map(
    Array.from(handlesByHashtag.entries()).map(([tag, handles]) => [
      tag,
      handles.filter((handle) => !existingHandles.has(handle)),
    ])
  );
  const newHandles = selectFairlyAcrossHashtags(newHandlesByHashtag, MAX_DISCOVERED_HANDLES);

  if (newHandles.length === 0) {
    return NextResponse.json({
      datasetId,
      postsScanned: rawPosts.length,
      uniqueAuthorsFound: discoveredHandles.size,
      alreadyOnFile: existingHandles.size,
      newHandlesEnriching: 0,
      enrichmentRunId: null,
    });
  }

  // ---------------------------------------------------------------------
  // Stage 2: start the profile-enrichment run, with an ad-hoc webhook
  // wired directly to /api/ingest for THIS run only.
  // ---------------------------------------------------------------------
  const secret = process.env.APIFY_WEBHOOK_SECRET;
  if (!secret) {
    return errorResponse(500, 'CONFIGURATION_ERROR', 'Missing APIFY_WEBHOOK_SECRET environment variable.');
  }

  let enrichmentRun: { runId: string; datasetId: string };
  try {
    enrichmentRun = await startApifyActorRun(
      PROFILE_SCRAPER_ACTOR_ID,
      { usernames: newHandles },
      apiToken,
      [
        {
          eventTypes: ['ACTOR.RUN.SUCCEEDED'],
          // strict=1: these handles are unvetted (anyone who used a tracked
          // hashtag once), so a bio with no event-industry signal should be
          // skipped rather than defaulted into defaultTypeParam — see
          // requireBioSignal in apify-instagram-parser.ts.
          requestUrl: `${origin}/api/ingest?metro=${encodeURIComponent(metroParam ?? metro)}&defaultType=${encodeURIComponent(defaultTypeParam)}&strict=1`,
          headersTemplate: JSON.stringify({ 'x-apify-secret': secret }),
        },
      ]
    );
  } catch (err) {
    return errorResponse(502, 'ENRICHMENT_START_FAILED', errorMessage(err));
  }

  return NextResponse.json({
    datasetId,
    postsScanned: rawPosts.length,
    uniqueAuthorsFound: discoveredHandles.size,
    alreadyOnFile: existingHandles.size,
    newHandlesEnriching: newHandles.length,
    enrichmentRunId: enrichmentRun.runId,
  });
}
