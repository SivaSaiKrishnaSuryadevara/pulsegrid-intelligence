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

import { DJ_GENRE_TAG_OPTIONS, ENGAGEMENT_RATE_BOUNDS, LANGUAGE_OPTIONS } from '@/lib/discover/constants';
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
  CLT: 'CLT_CAROLINAS',
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
 * Phrase-level patterns, not bare dictionary words. An earlier version
 * matched single generic words anywhere in the bio ("events", "music",
 * "academy", "host", "speaker", "decor", ...) and it false-positived
 * constantly on unrelated businesses whose bios happen to contain one of
 * those ordinary English words — e.g. a digital classifieds/marketing
 * platform whose bio mentions "...Classifieds, BoxOffice, YellowPages,
 * Events & HotDeals..." matched `event_planner` on the bare word "Events"
 * alone. "dj"/"emcee"/"choreograph" are domain-specific enough to stand
 * alone; everything else now requires event-specific phrasing.
 */
const ENTITY_TYPE_KEYWORD_RULES: { entityType: EntityType; patterns: RegExp[] }[] = [
  {
    entityType: 'local_dj',
    patterns: [/\bdj\b/i, /\bmobile\s+dj\b/i, /\bsound\s+engineer\b/i],
  },
  {
    entityType: 'dance_troupe',
    patterns: [/\bchoreograph\w*\b/i, /\bballet\b/i, /\bdance\s+(troupe|academy|company|crew|team|studio|collective)\b/i],
  },
  {
    entityType: 'stage_emcee',
    patterns: [/\bemcee\b/i, /\b(event|wedding|stage)\s+host\b/i, /\bkeynote\s+speaker\b/i],
  },
  {
    entityType: 'event_planner',
    patterns: [
      /\bevent\s+plann(er|ing)\b/i,
      /\bwedding\s+planner\b/i,
      /\bevent\s+coordinat\w*\b/i,
      /\bdecor\s+(rentals?|hire|design)\b/i,
      /\bevent\s+(design|production|producers?|rentals?)\b/i,
    ],
  },
  {
    // solo_creator had no positive rule at all before this — it only ever
    // existed as the requireBioSignal fallback, so once strict mode started
    // rejecting no-match bios instead of defaulting into it, the
    // auto-discovery pipeline became structurally unable to ever surface a
    // real content creator/influencer. These phrases are how creators
    // actually self-describe (as opposed to e.g. "collab", too generic —
    // any small business says that).
    entityType: 'solo_creator',
    patterns: [/\bcontent\s+creator\b/i, /\bugc\s+creator\b/i, /\binfluencer\b/i, /\bbrand\s+partnerships?\b/i, /\bmedia\s+kit\b/i],
  },
];

/**
 * `signalText` should be the bio and the profile's display name joined —
 * IG display names are often the clearest signal ("Dawn Cross - Dallas DJ",
 * "Kelly Hooper | DFW Female DJ") and a bio alone can say nothing job-
 * related at all (e.g. "Founder @shespinsglobal. Available worldwide.").
 * Returns null when neither carries any event-industry signal — callers
 * decide what "no signal" means (see requireBioSignal below).
 *
 * When multiple categories match (common — "DJ & Emcee" and "DJ/MC" are
 * standard bundled wedding-vendor packages), the earliest match in the
 * text wins rather than whichever rule happens to sit first in
 * ENTITY_TYPE_KEYWORD_RULES. Confirmed necessary: "NINA THE EMCEE /
 * Professional Event Emcee / ... / DJ / Radio Personality" and "Emcee
 * Pooja"'s "Experienced EMCEE / Event Planning / ... / Basic DJ" both
 * matched local_dj under array-order priority (local_dj was checked
 * first) despite "emcee" being both accounts' own primary self-
 * description, appearing well before the passing "DJ" mention — bios
 * conventionally lead with the role the person considers primary.
 *
 * NFKD-normalizes first — stylized bio fonts ("𝐌𝐮𝐬𝐢𝐜𝐚𝐥 𝐞𝐯𝐞𝐧𝐭 𝐩𝐫𝐨𝐝𝐮𝐜𝐞𝐫", a
 * popular Instagram bio-generator trick) are Unicode Mathematical
 * Alphanumeric Symbols, not the plain Latin letters these patterns match —
 * confirmed a real account ("Ultra Entertainments") slipped through
 * undetected for exactly this reason. NFKD has a compatibility
 * decomposition back to the base letter for that whole block, so this is
 * one line, not a hand-rolled lookup table.
 */
export function inferEntityType(rawSignalText: string): EntityType | null {
  const signalText = rawSignalText.normalize('NFKD');
  let bestType: EntityType | null = null;
  let bestIndex = Infinity;
  for (const rule of ENTITY_TYPE_KEYWORD_RULES) {
    for (const pattern of rule.patterns) {
      const match = signalText.match(pattern);
      if (match?.index !== undefined && match.index < bestIndex) {
        bestIndex = match.index;
        bestType = rule.entityType;
      }
    }
  }
  return bestType;
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
// DJ genre + dialect inference
// =====================================================================================

/**
 * Keyed by the exact DJ_GENRE_TAG_OPTIONS label (iterated from that constant
 * below, not retyped as a parallel list, so a future edit to the options
 * can't silently drift out of sync with these patterns). `language` is the
 * exact LANGUAGE_OPTIONS label the genre implies, where one exists — an
 * approximation (a Bollywood-genre DJ isn't necessarily a Hindi speaker),
 * but the best available signal from bios that rarely state language
 * directly. Western/generic genres (EDM, Hip-Hop, Afrobeats) imply none.
 */
const GENRE_TAG_SIGNAL: Record<string, { language: string | null; patterns: RegExp[] }> = {
  Bollywood: { language: 'Hindi', patterns: [/\bbollywood\b/i] },
  'Bhangra / Punjabi': { language: 'Punjabi', patterns: [/\bbhangra\b/i, /\bpunjabi\b/i] },
  'Garba / Raas': { language: 'Gujarati', patterns: [/\bgarba\b/i, /\braas\b/i] },
  'Sufi / Qawwali': { language: 'Urdu', patterns: [/\bsufi\b/i, /\bqawwali\b/i] },
  'Tollywood Mass': { language: 'Telugu', patterns: [/\btollywood\b/i] },
  EDM: { language: null, patterns: [/\bedm\b/i] },
  'Hip-Hop / Top 40': { language: null, patterns: [/\bhip.?hop\b/i, /\btop\s?40\b/i] },
  Afrobeats: { language: null, patterns: [/\bafrobeats?\b/i] },
};

/** NFKD-normalizes first — see inferEntityType for why (stylized bio fonts). */
export function inferGenreTags(rawSignalText: string): string[] {
  const signalText = rawSignalText.normalize('NFKD');
  return DJ_GENRE_TAG_OPTIONS.filter((tag) => GENRE_TAG_SIGNAL[tag]?.patterns.some((p) => p.test(signalText)) ?? false);
}

/** Direct language self-mentions ("Hindi/English DJ", "Fluent in Tamil") union'd with the genre-implied languages above. NFKD-normalizes first — see inferEntityType. */
export function inferSecondaryLanguages(rawSignalText: string): string[] {
  const signalText = rawSignalText.normalize('NFKD');
  const languages = new Set<string>();
  for (const language of LANGUAGE_OPTIONS) {
    if (new RegExp(`\\b${language}\\b`, 'i').test(signalText)) languages.add(language);
  }
  for (const tag of DJ_GENRE_TAG_OPTIONS) {
    const signal = GENRE_TAG_SIGNAL[tag];
    if (signal?.language && signal.patterns.some((p) => p.test(signalText))) {
      languages.add(signal.language);
    }
  }
  return Array.from(languages);
}

// =====================================================================================
// Suburb -> metro normalization
// =====================================================================================

interface SuburbEntry {
  /** Matched as `\b<keyword>\b` (internal spaces become `\s+`) against the same NFKD-normalized signalText used elsewhere in this file. */
  keyword: string;
  metroHub: MetroHub;
  /**
   * Properly-cased "City, ST" display string for the talent card's metro
   * badge — `null` for bare regional acronyms/generic terms (dc, nova,
   * dmv, atx, hou, clt, triangle) where a specific-locality badge
   * wouldn't read as a real place, even though the keyword still routes
   * the profile to the right metroHub for filtering.
   */
  locality: string | null;
}

/**
 * One entry per suburb/keyword (not grouped by metro) so each carries its
 * own display-cased locality independently. A few of these are bare,
 * generic-sounding words with elevated false-positive risk as a `\b`-bounded
 * bio match — kept because they were given explicitly, flagged here so a
 * noisy misclassification is easy to trace back to its source:
 *  - "nova": also a common first name/brand word, not just Northern Virginia.
 *  - "dmv": also literally the Department of Motor Vehicles.
 *  - "spring": an ordinary English word (season, verb) far more often than
 *    it means Spring, TX — kept metro-routing only, no locality badge.
 *  - "triangle": a common shape/generic word, not just the Raleigh-Durham area.
 */
const SUBURB_TO_METRO: SuburbEntry[] = [
  // DFW
  { keyword: 'dallas', metroHub: 'DFW_TEXAS', locality: 'Dallas, TX' },
  { keyword: 'fort worth', metroHub: 'DFW_TEXAS', locality: 'Fort Worth, TX' },
  { keyword: 'plano', metroHub: 'DFW_TEXAS', locality: 'Plano, TX' },
  { keyword: 'frisco', metroHub: 'DFW_TEXAS', locality: 'Frisco, TX' },
  { keyword: 'irving', metroHub: 'DFW_TEXAS', locality: 'Irving, TX' },
  { keyword: 'mckinney', metroHub: 'DFW_TEXAS', locality: 'McKinney, TX' },
  { keyword: 'allen', metroHub: 'DFW_TEXAS', locality: 'Allen, TX' },
  { keyword: 'prosper', metroHub: 'DFW_TEXAS', locality: 'Prosper, TX' },
  { keyword: 'celina', metroHub: 'DFW_TEXAS', locality: 'Celina, TX' },
  { keyword: 'aubrey', metroHub: 'DFW_TEXAS', locality: 'Aubrey, TX' },
  { keyword: 'denton', metroHub: 'DFW_TEXAS', locality: 'Denton, TX' },
  { keyword: 'southlake', metroHub: 'DFW_TEXAS', locality: 'Southlake, TX' },
  { keyword: 'carrollton', metroHub: 'DFW_TEXAS', locality: 'Carrollton, TX' },
  { keyword: 'lewisville', metroHub: 'DFW_TEXAS', locality: 'Lewisville, TX' },
  { keyword: 'richardson', metroHub: 'DFW_TEXAS', locality: 'Richardson, TX' },
  // DMV
  { keyword: 'washington', metroHub: 'DMV_NOVA', locality: 'Washington, DC' },
  { keyword: 'dc', metroHub: 'DMV_NOVA', locality: null },
  { keyword: 'fairfax', metroHub: 'DMV_NOVA', locality: 'Fairfax, VA' },
  { keyword: 'ashburn', metroHub: 'DMV_NOVA', locality: 'Ashburn, VA' },
  { keyword: 'loudoun', metroHub: 'DMV_NOVA', locality: 'Loudoun County, VA' },
  { keyword: 'sterling', metroHub: 'DMV_NOVA', locality: 'Sterling, VA' },
  { keyword: 'leesburg', metroHub: 'DMV_NOVA', locality: 'Leesburg, VA' },
  { keyword: 'tysons', metroHub: 'DMV_NOVA', locality: 'Tysons, VA' },
  { keyword: 'alexandria', metroHub: 'DMV_NOVA', locality: 'Alexandria, VA' },
  { keyword: 'arlington', metroHub: 'DMV_NOVA', locality: 'Arlington, VA' },
  { keyword: 'bethesda', metroHub: 'DMV_NOVA', locality: 'Bethesda, MD' },
  { keyword: 'rockville', metroHub: 'DMV_NOVA', locality: 'Rockville, MD' },
  { keyword: 'silver spring', metroHub: 'DMV_NOVA', locality: 'Silver Spring, MD' },
  { keyword: 'gaithersburg', metroHub: 'DMV_NOVA', locality: 'Gaithersburg, MD' },
  { keyword: 'frederick', metroHub: 'DMV_NOVA', locality: 'Frederick, MD' },
  { keyword: 'baltimore', metroHub: 'DMV_NOVA', locality: 'Baltimore, MD' },
  { keyword: 'howard county', metroHub: 'DMV_NOVA', locality: 'Howard County, MD' },
  { keyword: 'columbia', metroHub: 'DMV_NOVA', locality: 'Columbia, MD' },
  { keyword: 'nova', metroHub: 'DMV_NOVA', locality: null },
  { keyword: 'dmv', metroHub: 'DMV_NOVA', locality: null },
  // ATX
  { keyword: 'austin', metroHub: 'AUSTIN_TX', locality: 'Austin, TX' },
  { keyword: 'round rock', metroHub: 'AUSTIN_TX', locality: 'Round Rock, TX' },
  { keyword: 'cedar park', metroHub: 'AUSTIN_TX', locality: 'Cedar Park, TX' },
  { keyword: 'leander', metroHub: 'AUSTIN_TX', locality: 'Leander, TX' },
  { keyword: 'georgetown', metroHub: 'AUSTIN_TX', locality: 'Georgetown, TX' },
  { keyword: 'pflugerville', metroHub: 'AUSTIN_TX', locality: 'Pflugerville, TX' },
  { keyword: 'san marcos', metroHub: 'AUSTIN_TX', locality: 'San Marcos, TX' },
  { keyword: 'atx', metroHub: 'AUSTIN_TX', locality: null },
  // HOU
  { keyword: 'houston', metroHub: 'HOUSTON_TX', locality: 'Houston, TX' },
  { keyword: 'sugar land', metroHub: 'HOUSTON_TX', locality: 'Sugar Land, TX' },
  { keyword: 'katy', metroHub: 'HOUSTON_TX', locality: 'Katy, TX' },
  { keyword: 'woodlands', metroHub: 'HOUSTON_TX', locality: 'The Woodlands, TX' },
  { keyword: 'cypress', metroHub: 'HOUSTON_TX', locality: 'Cypress, TX' },
  { keyword: 'pearland', metroHub: 'HOUSTON_TX', locality: 'Pearland, TX' },
  { keyword: 'spring', metroHub: 'HOUSTON_TX', locality: null },
  { keyword: 'hou', metroHub: 'HOUSTON_TX', locality: null },
  // CLT (Carolinas)
  { keyword: 'charlotte', metroHub: 'CLT_CAROLINAS', locality: 'Charlotte, NC' },
  { keyword: 'ballantyne', metroHub: 'CLT_CAROLINAS', locality: 'Ballantyne, NC' },
  { keyword: 'matthews', metroHub: 'CLT_CAROLINAS', locality: 'Matthews, NC' },
  { keyword: 'pineville', metroHub: 'CLT_CAROLINAS', locality: 'Pineville, NC' },
  { keyword: 'fort mill', metroHub: 'CLT_CAROLINAS', locality: 'Fort Mill, SC' },
  { keyword: 'indian land', metroHub: 'CLT_CAROLINAS', locality: 'Indian Land, SC' },
  { keyword: 'raleigh', metroHub: 'CLT_CAROLINAS', locality: 'Raleigh, NC' },
  { keyword: 'durham', metroHub: 'CLT_CAROLINAS', locality: 'Durham, NC' },
  { keyword: 'cary', metroHub: 'CLT_CAROLINAS', locality: 'Cary, NC' },
  { keyword: 'morrisville', metroHub: 'CLT_CAROLINAS', locality: 'Morrisville, NC' },
  { keyword: 'clt', metroHub: 'CLT_CAROLINAS', locality: null },
  { keyword: 'triangle', metroHub: 'CLT_CAROLINAS', locality: null },
];

export interface LocalityMatch {
  metroHub: MetroHub;
  locality: string | null;
}

/**
 * Scans `rawSignalText` (the same fullName+bio join used elsewhere in this
 * file) for a known suburb/city/regional keyword. When multiple keywords
 * match, the earliest position in the text wins — same tie-break as
 * `inferEntityType`, for the same reason: bios conventionally lead with
 * the detail the person considers most specific/primary (a bio reading
 * "Ashburn, VA \n serving the DMV" should badge as Ashburn, not fall back
 * to the generic "dmv" mention that happens to appear too). Returns null
 * when nothing in SUBURB_TO_METRO matches — callers keep whatever metro
 * they already had (the batch-level assignment for new discovery, the
 * pinned classification for a refresh).
 */
export function inferLocality(rawSignalText: string): LocalityMatch | null {
  const signalText = rawSignalText.normalize('NFKD');
  let best: SuburbEntry | null = null;
  let bestIndex = Infinity;
  for (const entry of SUBURB_TO_METRO) {
    const pattern = new RegExp(`\\b${entry.keyword.replace(/\s+/g, '\\s+')}\\b`, 'i');
    const match = signalText.match(pattern);
    if (match?.index !== undefined && match.index < bestIndex) {
      bestIndex = match.index;
      best = entry;
    }
  }
  return best ? { metroHub: best.metroHub, locality: best.locality } : null;
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
  /**
   * When true, a bio with no event-industry signal is rejected instead of
   * silently falling back to `defaultType`. Off by default so the existing
   * `ingest:apify` CLI backfill and any manually-curated `/api/ingest` batch
   * keep working unchanged (a human already vetted those handles, so "no
   * keyword match" there just means the bio-heuristic can't narrow further
   * than the given default — not "reject it"). The auto-discovery pipeline
   * (`/api/ingest/discover`) turns this on: those handles are anyone who
   * used a tracked hashtag once, unvetted, so "no signal" should mean
   * "probably not an event professional," not "assume solo_creator."
   */
  requireBioSignal?: boolean;
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
  const signalText = `${raw.fullName ?? ''}\n${bio}`;
  const inferredType = inferEntityType(signalText);
  if (inferredType === null && opts.requireBioSignal) {
    return { ok: false, identifier: handle, error: 'no event-industry signal found in bio — skipped' };
  }
  const entityType = inferredType ?? opts.defaultType;
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
  if (entityDetails.kind === 'local_dj') {
    entityDetails.genreTags = inferGenreTags(signalText);
  }
  const secondaryLanguages = inferSecondaryLanguages(signalText);
  // A suburb/city named in the bio is a more precise signal than the
  // batch-level --metro flag (which really only says "which hashtag/task
  // scraped this"), so it wins when present; otherwise fall back to opts.metro
  // exactly as before.
  const localityMatch = inferLocality(signalText);

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
    secondaryLanguages,
    primaryMetro: localityMatch?.metroHub ?? opts.metro,
    locality: localityMatch?.locality ?? null,
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

// =====================================================================================
// Refresh parse — telemetry only, classification pinned
// =====================================================================================

export interface ExistingClassification {
  entityType: EntityType;
  entityDetails: EntityDetails;
  primaryMetro: MetroHub;
  primaryNiche: PrimaryNiche;
  secondaryLanguages: string[];
  estMinimumRateUsd: number | null;
  estMaximumRateUsd: number | null;
  locality: string | null;
}

/**
 * Same raw-item -> payload translation as `parseApifyProfileItem`, but for
 * re-scraping a handle already on file: every classification field
 * (entity type/details beyond mediaProofs, metro, niche, languages, rate
 * range) is pinned to `existing` instead of re-derived from the fresh bio.
 * Some of those fields were originally set by the LLM webhook path
 * (`/api/webhooks/apify-discovery`), which is strictly better judgment than
 * this module's bio-keyword heuristic — re-running the heuristic on every
 * refresh would risk silently downgrading a classification the smarter
 * pass already got right. Only genuinely time-sensitive fields (follower
 * count, bio, avatar, engagement, recent posts/availability, media proofs)
 * come from the new scrape.
 */
export function parseApifyProfileItemForRefresh(
  raw: RawApifyProfileItem,
  worker: InstagramIngestWorker,
  existing: ExistingClassification
): ParsedApifyItem {
  const rawUsername = raw?.username;
  if (!rawUsername || typeof rawUsername !== 'string' || !rawUsername.trim()) {
    return { ok: false, identifier: '(missing username)', error: 'username is required' };
  }
  const handle = rawUsername.trim().replace(/^@/, '').toLowerCase();
  const bio = raw.biography ?? '';
  const signalText = `${raw.fullName ?? ''}\n${bio}`;
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
    ...existing.entityDetails,
    mediaProofs: extractMediaProofs(raw.latestPosts),
  };
  if (entityDetails.kind === 'local_dj') {
    entityDetails.genreTags = inferGenreTags(signalText);
  }

  // primaryMetro stays pinned (classification) even on refresh — but
  // locality is closer to telemetry (a nicer display badge, not a
  // filtering-critical field) so it's safe to refresh EXCEPT when the
  // freshly-detected suburb implies a different metro than the pinned
  // one, which would produce a locality badge that contradicts the
  // creator's actual (pinned) metro — in that case keep whatever
  // locality was already on file rather than show a mismatched one.
  const localityMatch = inferLocality(signalText);
  const locality =
    localityMatch && localityMatch.metroHub === existing.primaryMetro
      ? (localityMatch.locality ?? existing.locality)
      : existing.locality;

  const engagementRate = computeEngagementRate(raw.latestPosts, followerCount);

  const payload: ScrapedCreatorPayload = {
    handle,
    displayName: raw.fullName?.trim() || handle,
    avatarUrl: raw.profilePicUrlHD || raw.profilePicUrl || null,
    bio,
    externalUrl: raw.externalUrl ?? null,
    entityType: existing.entityType,
    entityDetails,
    secondaryLanguages: existing.secondaryLanguages,
    primaryMetro: existing.primaryMetro,
    locality,
    primaryNiche: existing.primaryNiche,
    followerCount,
    engagementRate,
    avgReelViews: computeAvgReelViews(raw.latestPosts),
    estMinimumRateUsd: existing.estMinimumRateUsd,
    estMaximumRateUsd: existing.estMaximumRateUsd,
    isVerified: raw.verified ?? false,
    recentPosts,
    daysSinceLastPost: lastPostDate ? daysSince(lastPostDate) : 9999,
    recentSponsorshipCount14d,
  };

  return { ok: true, payload };
}
