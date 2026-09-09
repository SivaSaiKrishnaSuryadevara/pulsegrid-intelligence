/**
 * Deterministic (no-LLM) normalizer for `apify/instagram-profile-scraper`
 * output -> `ScrapedCreatorPayload`. Shared by the `ingest:apify` CLI
 * script and the `/api/ingest` webhook route, so there is exactly one
 * implementation of the bio-keyword entity-type heuristic, the engagement-
 * rate formula, and the media-proof extraction — not two copies drifting
 * apart.
 *
 * Deliberately separate from `src/app/api/webhooks/apify-discovery/route.ts`,
 * which classifies these same fields with Claude for cases where bio-keyword
 * heuristics aren't good enough. This module trades that judgment for
 * speed/cost: no API call per row, safe for a bulk CLI backfill over a large
 * dataset.
 *
 * Declared defaults/assumptions (called out because the request didn't
 * specify them and guessing silently would be worse than disclosing):
 *  - `primaryNiche` isn't addressed by the heuristic spec at all, but it's a
 *    required, NOT NULL column. Derived from the already-inferred
 *    `entityType` via ENTITY_TYPE_TO_DEFAULT_NICHE below rather than a
 *    second keyword pass over the same bio text.
 *  - `estMinimumRateUsd`/`estMaximumRateUsd`: an early version of this
 *    module left these unset entirely (a fabricated rate range being a
 *    financial figure with no basis felt worse than the card's honest
 *    "—"). Reversed on explicit request — `estimateRateRangeUsd` below
 *    derives a rough range from real signal (followers x engagement), the
 *    same "disclosed heuristic, not verified data" treatment already given
 *    to `computeEngagementRate`'s DEFAULT_ENGAGEMENT_RATE fallback.
 *  - `avgReelViews` is NOT given an equivalent fallback — unlike rate,
 *    which can be derived from other real signals, a null here (see
 *    `computeAvgReelViews`) means the scraped posts were genuinely photos,
 *    not reels; there's nothing to derive a view count from, so "—" stays
 *    accurate rather than getting a fabricated number.
 */

import { ENGAGEMENT_RATE_BOUNDS } from '@/lib/discover/constants';
import { InstagramIngestWorker, type ScrapedCreatorPayload, type ScrapedPost } from '@/workers/ingest-worker';
import {
  METRO_HUBS,
  type EntityDetails,
  type EntityType,
  type MediaProof,
  type MetroHub,
  type PrimaryNiche,
} from '@/types/creator';

// =====================================================================================
// Raw `apify/instagram-profile-scraper` item shape (subset actually used)
// =====================================================================================

export interface RawApifyPost {
  caption?: string | null;
  timestamp?: string | null;
  likesCount?: number | null;
  commentsCount?: number | null;
  displayUrl?: string | null;
  shortCode?: string | null;
  playCount?: number | null;
  videoPlayCount?: number | null;
  taggedUsers?: { username?: string | null }[] | null;
}

export interface RawApifyProfileItem {
  username?: string | null;
  fullName?: string | null;
  biography?: string | null;
  profilePicUrl?: string | null;
  profilePicUrlHD?: string | null;
  externalUrl?: string | null;
  followersCount?: number | null;
  verified?: boolean | null;
  latestPosts?: RawApifyPost[] | null;
}

// =====================================================================================
// Metro short-code mapping (--metro=DFW, ?metro=DFW, ...)
// =====================================================================================

export const METRO_SHORT_CODE_TO_HUB: Record<string, MetroHub> = {
  DFW: 'DFW_TEXAS',
  DMV: 'DMV_NOVA',
  HOU: 'HOUSTON_TX',
  ATX: 'AUSTIN_TX',
  'NYC/NJ': 'TRI_STATE_NY_NJ',
  ATL: 'ATLANTA_GA',
  CHI: 'CHICAGO_IL',
};

/** Accepts either a short code (DFW) or the full Postgres enum value (DFW_TEXAS). */
export function resolveMetroHub(input: string): MetroHub | null {
  const trimmed = input.trim();
  const byShortCode = METRO_SHORT_CODE_TO_HUB[trimmed.toUpperCase()];
  if (byShortCode) return byShortCode;
  const upper = trimmed.toUpperCase() as MetroHub;
  return METRO_HUBS.includes(upper) ? upper : null;
}

// =====================================================================================
// Entity-type heuristic
// =====================================================================================

/**
 * Word-boundary matching, not a plain substring check — "dj" as a raw
 * substring would false-positive inside ordinary words like "adjust" or
 * "adjacent", which a bio full of prose will realistically contain.
 */
function bioContainsWord(bio: string, keyword: string): boolean {
  const escaped = keyword.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  return new RegExp(`\\b${escaped}\\b`, 'i').test(bio);
}

const ENTITY_TYPE_KEYWORD_RULES: { entityType: EntityType; keywords: string[] }[] = [
  { entityType: 'local_dj', keywords: ['dj', 'sound', 'music'] },
  { entityType: 'dance_troupe', keywords: ['dance', 'choreograph', 'academy'] },
  { entityType: 'stage_emcee', keywords: ['emcee', 'host', 'anchor', 'speaker'] },
  { entityType: 'event_planner', keywords: ['planner', 'decor', 'events', 'wedding'] },
];

export function inferEntityType(bio: string, defaultType: EntityType): EntityType {
  for (const rule of ENTITY_TYPE_KEYWORD_RULES) {
    if (rule.keywords.some((keyword) => bioContainsWord(bio, keyword))) {
      return rule.entityType;
    }
  }
  return defaultType;
}

/** No separate niche heuristic — derived from the entity type already inferred from the same bio. */
const ENTITY_TYPE_TO_DEFAULT_NICHE: Record<EntityType, PrimaryNiche> = {
  local_dj: 'NIGHTLIFE',
  dance_troupe: 'CHOREOGRAPHY',
  event_planner: 'LUXURY_BRIDAL',
  stage_emcee: 'STAGE_EMCEE',
  solo_creator: 'CULTURAL_EVENTS',
};

/**
 * Default specialized telemetry per entity type so card stats render
 * smoothly instead of a wall of "Pending"/"—". These are honest,
 * documented placeholders, not measurements — ops should overwrite them
 * with real values as they're confirmed.
 */
function buildDefaultEntityDetails(entityType: EntityType): EntityDetails {
  switch (entityType) {
    case 'local_dj':
      return { kind: 'local_dj', avSpecNotes: '', maxCapacity: 300, setLengthMinutes: 120, genreTags: [] };
    case 'dance_troupe':
      return { kind: 'dance_troupe', troupeSize: 10, style: 'Cultural Dance' };
    case 'event_planner':
      return { kind: 'event_planner', venueScaleBracket: 'mid_scale' };
    case 'solo_creator':
    case 'stage_emcee':
      return { kind: entityType };
  }
}

// =====================================================================================
// Telemetry derived from latestPosts
// =====================================================================================

const DEFAULT_ENGAGEMENT_RATE = 3.5;

/**
 * Clamped to the Discover page's own ENGAGEMENT_RATE_BOUNDS.max (currently
 * 15), not an independent number — the default filter state AND the
 * slider's hard `max` prop are both bound to that same constant
 * (src/lib/discover/constants.ts), so a value above it isn't just
 * "off by default," it's permanently unreachable through the UI (the
 * slider physically cannot be dragged past its own max, and it stays
 * excluded even when searching by exact handle, since every filter
 * condition — search included — is ANDed together). An early real-data
 * ingest run produced 38.99% for a 283K-follower account (a scraper-
 * reported likesCount outlier on one post, not a plausible sustained
 * rate) and a first fix that clamped to 25 was *still* above this ceiling
 * and just as invisible. Importing the same constant the UI uses is what
 * actually closes the gap, rather than picking another number that could
 * drift out of sync with it again.
 */
export function computeEngagementRate(posts: RawApifyPost[] | null | undefined, followerCount: number): number {
  if (!posts || posts.length === 0 || followerCount <= 0) {
    return DEFAULT_ENGAGEMENT_RATE;
  }
  const totalEngagement = posts.reduce((sum, post) => sum + (post.likesCount ?? 0) + (post.commentsCount ?? 0), 0);
  const rate = (totalEngagement / (posts.length * followerCount)) * 100;
  if (!Number.isFinite(rate) || rate <= 0) {
    return DEFAULT_ENGAGEMENT_RATE;
  }
  return Math.min(ENGAGEMENT_RATE_BOUNDS.max, Math.round(rate * 100) / 100);
}

/** Average play count across posts that report one — same source data as extractMediaProofs, so computed alongside it. */
export function computeAvgReelViews(posts: RawApifyPost[] | null | undefined): number | null {
  const counts = (posts ?? [])
    .map((post) => post.playCount ?? post.videoPlayCount)
    .filter((count): count is number => typeof count === 'number' && count >= 0);
  if (counts.length === 0) return null;
  return Math.round(counts.reduce((sum, count) => sum + count, 0) / counts.length);
}

/**
 * Rough sponsored-post rate estimate, not a verified figure — derived from
 * "engaged audience" (followers x engagement rate) at a commonly-cited
 * mid-tier creator-economy rule of thumb of ~$0.01-$0.03 per engaged
 * follower, floored so nano accounts don't show $0. Exists so a card
 * doesn't sit permanently blank on a field the UI has a place for; ops
 * should treat this as a starting point for outreach, not a quote.
 */
export function estimateRateRangeUsd(followerCount: number, engagementRatePercent: number): { min: number; max: number } {
  const engagedAudience = followerCount * (engagementRatePercent / 100);
  const min = Math.max(50, Math.round(engagedAudience * 0.01));
  const max = Math.max(min + 50, Math.round(engagedAudience * 0.03));
  return { min, max };
}

export function extractMediaProofs(posts: RawApifyPost[] | null | undefined): MediaProof[] {
  const proofs: MediaProof[] = [];
  for (const post of posts ?? []) {
    if (proofs.length >= 3) break;
    if (!post.displayUrl || !post.shortCode) continue;
    proofs.push({ displayUrl: post.displayUrl, shortCode: post.shortCode, playCount: post.playCount ?? post.videoPlayCount ?? null });
  }
  return proofs;
}

function isValidDateOnly(value: string): boolean {
  return /^\d{4}-\d{2}-\d{2}$/.test(value) && !Number.isNaN(new Date(`${value}T00:00:00.000Z`).getTime());
}

function daysSince(dateStr: string): number {
  const diffMs = Date.now() - new Date(`${dateStr}T00:00:00.000Z`).getTime();
  return Math.max(0, Math.floor(diffMs / 86_400_000));
}

function toRecentPosts(raw: RawApifyPost[] | null | undefined): ScrapedPost[] {
  const posts: ScrapedPost[] = [];
  for (const post of raw ?? []) {
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

// =====================================================================================
// Top-level parse
// =====================================================================================

export interface ParseApifyItemOptions {
  metro: MetroHub;
  defaultType: EntityType;
}

export type ParsedApifyItem =
  | { ok: true; payload: ScrapedCreatorPayload }
  | { ok: false; identifier: string; error: string };

/**
 * `worker` is passed in (rather than constructed here) so callers reuse one
 * `InstagramIngestWorker` instance across a whole batch — its methods are
 * stateless, but this keeps construction in the caller's hands.
 */
export function parseApifyProfileItem(raw: RawApifyProfileItem, worker: InstagramIngestWorker, opts: ParseApifyItemOptions): ParsedApifyItem {
  const rawUsername = raw?.username;
  if (!rawUsername || typeof rawUsername !== 'string' || !rawUsername.trim()) {
    return { ok: false, identifier: '(missing username)', error: 'username is required' };
  }
  const handle = rawUsername.trim().replace(/^@/, '').toLowerCase();
  const bio = raw.biography ?? '';
  const entityType = inferEntityType(bio, opts.defaultType);
  const recentPosts = toRecentPosts(raw.latestPosts);
  const followerCount = raw.followersCount ?? 0;

  let recentSponsorshipCount14d = 0;
  for (const post of recentPosts) {
    if (daysSince(post.postDate) > 14) continue;
    try {
      if (worker.detectBrandDisclosures(post.caption, post.taggedAccounts).isCommercial) {
        recentSponsorshipCount14d += 1;
      }
    } catch {
      // Malformed single post — don't let it block the whole item.
    }
  }
  const lastPostDate = recentPosts.map((p) => p.postDate).sort().at(-1);

  const entityDetails: EntityDetails = {
    ...buildDefaultEntityDetails(entityType),
    mediaProofs: extractMediaProofs(raw.latestPosts),
  };

  const engagementRate = computeEngagementRate(raw.latestPosts, followerCount);
  const rateRange = estimateRateRangeUsd(followerCount, engagementRate);

  const payload: ScrapedCreatorPayload = {
    handle,
    displayName: raw.fullName?.trim() || handle,
    avatarUrl: raw.profilePicUrlHD || raw.profilePicUrl || null,
    bio,
    externalUrl: raw.externalUrl ?? null,
    entityType,
    entityDetails,
    primaryMetro: opts.metro,
    primaryNiche: ENTITY_TYPE_TO_DEFAULT_NICHE[entityType],
    followerCount,
    engagementRate,
    avgReelViews: computeAvgReelViews(raw.latestPosts),
    estMinimumRateUsd: rateRange.min,
    estMaximumRateUsd: rateRange.max,
    isVerified: raw.verified ?? false,
    recentPosts,
    daysSinceLastPost: lastPostDate ? daysSince(lastPostDate) : 9999,
    recentSponsorshipCount14d,
  };

  return { ok: true, payload };
}
