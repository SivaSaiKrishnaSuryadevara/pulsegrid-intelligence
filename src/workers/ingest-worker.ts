/**
 * PulseGrid Intelligence — Instagram Ingestion Worker
 *
 * Normalizes raw scraped Instagram profile/post data into PulseGrid's
 * domain shape and writes it into Supabase (`creators`,
 * `creator_category_blackouts`, `event_enterprises`).
 *
 * Design notes:
 *  - Bulk upserts are attempted first for throughput; any chunk that fails
 *    falls back to per-row upserts so a single bad record never blocks the
 *    rest of a batch, and so failures can be reported per-handle.
 *  - `deliverability_score` / `verified_response_hours` are only written
 *    when a scrape actually produced a fresh reading for them. Because
 *    PostgREST builds one INSERT per distinct column-set in a batch, rows
 *    with and without those hints are grouped separately before upserting
 *    — otherwise a row missing the hint would silently upsert `NULL` over a
 *    previously computed value instead of leaving it untouched.
 *  - Blackout windows are refreshed via delete-then-insert per
 *    (creator, brand, category) rather than a DB-level upsert, since
 *    `creator_category_blackouts` has no unique constraint to conflict on
 *    (a new sponsored post for the same brand/category is treated as
 *    resetting the exclusivity clock, which is the correct product
 *    behavior). If per-row round trips become a bottleneck at scale, the
 *    natural next step is a `upsert_blackout_window` RPC.
 */

import type { SupabaseClient } from '@supabase/supabase-js';
import {
  METRO_HUBS,
  PRIMARY_NICHES,
  ENTERPRISE_TYPES,
  type MetroHub,
  type PrimaryNiche,
  type BookingStatus,
  type RepType,
  type EnterpriseType,
} from '../types/creator';

// =====================================================================================
// Constants
// =====================================================================================

const BLACKOUT_WINDOW_DAYS = 60;
const BATCH_CHUNK_SIZE = 500;
const WRITE_CONCURRENCY = 10;

// =====================================================================================
// Worker-local input/output types
// =====================================================================================

export interface ScrapedPost {
  caption: string;
  /** ISO date only, `YYYY-MM-DD`. */
  postDate: string;
  taggedAccounts: string[];
}

export interface ScrapedCreatorPayload {
  handle: string;
  displayName: string;
  avatarUrl?: string | null;
  bio: string;
  externalUrl?: string | null;
  primaryMetro: MetroHub;
  primaryNiche: PrimaryNiche;
  secondaryLanguages?: string[];
  followerCount?: number | null;
  engagementRate?: number | null;
  avgReelViews?: number | null;
  estMinimumRateUsd?: number | null;
  estMaximumRateUsd?: number | null;
  /** Freshly computed deliverability reading from this scrape, if any. */
  deliverabilityScoreHint?: number | null;
  /** Freshly measured response-time reading from this scrape, if any. */
  verifiedResponseHoursHint?: number | null;
  isVerified?: boolean;
  recentPosts: ScrapedPost[];
  daysSinceLastPost: number;
  recentSponsorshipCount14d: number;
}

export interface ScrapedEnterprisePayload {
  businessName: string;
  instagramHandle: string;
  metroHub: MetroHub;
  enterpriseType: EnterpriseType;
  bio?: string | null;
  externalUrl?: string | null;
  publicEmail?: string | null;
  phoneNumber?: string | null;
  ticketingUrl?: string | null;
  frequentVenues?: string[];
}

export type LinkHubPlatform = 'linktree' | 'beacons' | 'eventbrite' | 'sulekha';

export interface BioParseResult {
  email: string | null;
  phone: string | null;
  whatsapp: string | null;
  linkHub: { platform: LinkHubPlatform; url: string } | null;
  repType: RepType;
}

export type DisclosureType =
  | 'hashtag_ad'
  | 'hashtag_sponsored'
  | 'paid_partnership'
  | 'collab'
  | 'hashtag_partner';

export interface BrandDisclosureResult {
  isCommercial: boolean;
  brandName?: string;
  categorySlug?: string;
  disclosureType?: DisclosureType;
}

export interface AvailabilityEvaluation {
  bookingStatus: BookingStatus;
  leadTimeDays: number;
}

export interface IngestRowError {
  /** The scraped record's natural key (handle / instagram handle). */
  identifier: string;
  stage: 'validation' | 'upsert' | 'blackout_window';
  message: string;
}

export interface IngestBatchResult {
  totalProcessed: number;
  succeeded: number;
  failed: number;
  errors: IngestRowError[];
}

interface CreatorUpsertRow {
  handle: string;
  display_name: string;
  avatar_url: string | null;
  primary_metro: MetroHub;
  primary_niche: PrimaryNiche;
  secondary_languages: string[];
  follower_count: number | null;
  engagement_rate: number | null;
  avg_reel_views: number | null;
  est_minimum_rate_usd: number | null;
  est_maximum_rate_usd: number | null;
  booking_status: BookingStatus;
  lead_time_days: number;
  rep_type: RepType;
  direct_booking_email: string | null;
  direct_booking_phone: string | null;
  is_verified: boolean;
  last_refreshed_at: string;
  deliverability_score?: number;
  verified_response_hours?: number;
}

interface EnterpriseUpsertRow {
  business_name: string;
  instagram_handle: string;
  metro_hub: MetroHub;
  enterprise_type: EnterpriseType;
  public_email: string | null;
  phone_number: string | null;
  ticketing_url: string | null;
  frequent_venues: string[];
}

interface BlackoutInsertRow {
  creator_id: string;
  brand_name: string;
  category_slug: string;
  blackout_start_date: string;
  blackout_end_date: string;
}

// =====================================================================================
// Regex / lookup tables
// =====================================================================================

const DIRECT_EMAIL_RE = /[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/;

/**
 * TLD is deliberately restricted to a known list rather than any
 * `[a-zA-Z]{2,}` word. Bracket markers (`[at]`/`[dot]`) are unambiguous on
 * their own, but the bare-word "at"/"dot" fallback below needs this
 * whitelist — without it, ordinary sentences like "look at this dot on my
 * dress" parse as a bogus "look@this.on".
 */
const COMMON_EMAIL_TLDS = [
  'com', 'net', 'org', 'co', 'io', 'us', 'info', 'biz', 'me',
  'agency', 'studio', 'mgmt', 'email', 'live', 'tv', 'app',
];

/**
 * Matches `local [at]/(at)/{at}/at domain [dot]/(dot)/{dot}/dot tld` as one
 * anchored sequence — local/domain/tld must sit immediately adjacent to
 * their at/dot marker (only whitespace between). This is deliberately
 * NOT a blind "replace every ' at '/' dot ' in the text" pass: that would
 * also corrupt ordinary English containing the words "at" or "dot"
 * elsewhere in the bio before the real obfuscated address is reached.
 */
const OBFUSCATED_EMAIL_RE = new RegExp(
  `([a-zA-Z0-9._%+-]+)\\s*(?:\\[at\\]|\\(at\\)|\\{at\\}|\\bat\\b)\\s*([a-zA-Z0-9-]+)\\s*(?:\\[dot\\]|\\(dot\\)|\\{dot\\}|\\bdot\\b)\\s*(${COMMON_EMAIL_TLDS.join('|')})\\b`,
  'i'
);
const EMAIL_TRAILING_PUNCTUATION_RE = /[.,;:!?)\]]+$/;

const WHATSAPP_RE = /whats\s*app[^0-9+]{0,12}(\+?\d[\d\s().-]{7,}\d)/i;
const GENERIC_PHONE_RE = /(\+?\d[\d\s().-]{7,}\d)/;

const LINK_HUB_PATTERNS: { platform: LinkHubPlatform; re: RegExp }[] = [
  { platform: 'linktree', re: /(?:https?:\/\/)?(?:www\.)?linktr\.ee\/[\w.-]+/i },
  { platform: 'beacons', re: /(?:https?:\/\/)?(?:www\.)?beacons\.ai\/[\w.-]+/i },
  { platform: 'eventbrite', re: /(?:https?:\/\/)?(?:www\.)?eventbrite\.com\/[\w\-/]+/i },
  { platform: 'sulekha', re: /(?:https?:\/\/)?(?:www\.)?sulekha\.com\/[\w\-/]+/i },
];

/**
 * Agency-style inboxes serve many clients (`booking@`, `talent@`, or a
 * domain that is itself an agency brand) and map to TALENT_AGENCY.
 * `mgmt@` / `management@` / `manager@` read as a single dedicated
 * personal manager and map to DIRECT_MANAGER.
 */
const AGENCY_EMAIL_PATTERNS: RegExp[] = [/^booking@/i, /^talent@/i, /agency[a-z0-9-]*\.[a-z.]+$/i, /@[^@]*agency/i];
const MANAGER_EMAIL_PATTERNS: RegExp[] = [/^mgmt@/i, /^management@/i, /^manager@/i];
const BIO_MANAGED_BY_RE = /(represented|managed) by|talent agency|booking agency/i;
const BIO_AGENCY_KEYWORD_RE = /agency/i;

const FTC_DISCLOSURE_PATTERNS: { type: DisclosureType; re: RegExp }[] = [
  { type: 'paid_partnership', re: /paid partnership (?:with|w\/)\s*@?([\w.]+)/i },
  { type: 'collab', re: /collab(?:oration)? with\s*@?([\w.]+)/i },
  { type: 'hashtag_ad', re: /#ad\b/i },
  { type: 'hashtag_sponsored', re: /#sponsored\b/i },
  { type: 'hashtag_partner', re: /#partner\b/i },
];

/**
 * Built-in vertical dictionary used to disambiguate a genuine sponsor brand
 * from an ordinarily-tagged creator peer. Keyed by normalized (lowercase,
 * no leading `@`) Instagram handle.
 */
const VERTICAL_BRAND_DICTIONARY: Record<string, { brandName: string; categorySlug: string }> = {
  davidsbridal: { brandName: "David's Bridal", categorySlug: 'luxury-bridal' },
  zolaweddings: { brandName: 'Zola', categorySlug: 'luxury-bridal' },
  theknot: { brandName: 'The Knot', categorySlug: 'luxury-bridal' },
  bhldn: { brandName: 'BHLDN', categorySlug: 'luxury-bridal' },
  kayjewelers: { brandName: 'Kay Jewelers', categorySlug: 'jewelry' },
  zalesjewelers: { brandName: 'Zales', categorySlug: 'jewelry' },
  pandora: { brandName: 'Pandora', categorySlug: 'jewelry' },
  bluenile: { brandName: 'Blue Nile', categorySlug: 'jewelry' },
  tmobile: { brandName: 'T-Mobile', categorySlug: 'telecom' },
  verizon: { brandName: 'Verizon', categorySlug: 'telecom' },
  att: { brandName: 'AT&T', categorySlug: 'telecom' },
  boostmobile: { brandName: 'Boost Mobile', categorySlug: 'telecom' },
  doordash: { brandName: 'DoorDash', categorySlug: 'food-dining' },
  ubereats: { brandName: 'Uber Eats', categorySlug: 'food-dining' },
  grubhub: { brandName: 'Grubhub', categorySlug: 'food-dining' },
  postmates: { brandName: 'Postmates', categorySlug: 'food-dining' },
  redbull: { brandName: 'Red Bull', categorySlug: 'nightlife' },
  ketelone: { brandName: 'Ketel One', categorySlug: 'nightlife' },
  livenation: { brandName: 'Live Nation', categorySlug: 'nightlife' },
  tacobell: { brandName: 'Taco Bell', categorySlug: 'food-dining' },
  target: { brandName: 'Target', categorySlug: 'consumer-retail' },
  walmart: { brandName: 'Walmart', categorySlug: 'consumer-retail' },
  sephora: { brandName: 'Sephora', categorySlug: 'consumer-retail' },
  ulta: { brandName: 'Ulta Beauty', categorySlug: 'consumer-retail' },
  amazonfashion: { brandName: 'Amazon Fashion', categorySlug: 'consumer-retail' },
  americanexpress: { brandName: 'American Express', categorySlug: 'consumer-retail' },
};

// =====================================================================================
// Small pure helpers
// =====================================================================================

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

function normalizeHandle(handle: string): string {
  return handle.trim().replace(/^@/, '').toLowerCase();
}

function humanizeHandle(handle: string): string {
  const clean = handle.replace(/[._-]+/g, ' ').trim();
  return clean.length > 0 ? clean.charAt(0).toUpperCase() + clean.slice(1) : handle;
}

function isValidDateOnly(value: string): boolean {
  return /^\d{4}-\d{2}-\d{2}$/.test(value) && !Number.isNaN(new Date(`${value}T00:00:00.000Z`).getTime());
}

function addDaysToDateString(dateStr: string, days: number): string {
  if (!isValidDateOnly(dateStr)) {
    throw new Error(`invalid date "${dateStr}"; expected YYYY-MM-DD`);
  }
  const date = new Date(`${dateStr}T00:00:00.000Z`);
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}

function chunk<T>(items: T[], size: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < items.length; i += size) {
    out.push(items.slice(i, i + size));
  }
  return out;
}

/** Bounded-concurrency map that never rejects — failures land in the settled result. */
async function mapWithConcurrency<T, R>(
  items: T[],
  limit: number,
  fn: (item: T, index: number) => Promise<R>
): Promise<PromiseSettledResult<R>[]> {
  const results: PromiseSettledResult<R>[] = new Array(items.length);
  let cursor = 0;

  async function worker(): Promise<void> {
    while (cursor < items.length) {
      const current = cursor++;
      // Safe: `current` was just claimed under the `cursor < items.length` guard above.
      const item = items[current] as T;
      try {
        const value = await fn(item, current);
        results[current] = { status: 'fulfilled', value };
      } catch (reason) {
        results[current] = { status: 'rejected', reason };
      }
    }
  }

  const workerCount = Math.max(1, Math.min(limit, items.length));
  await Promise.all(Array.from({ length: workerCount }, () => worker()));
  return results;
}

function errorMessage(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}

function normalizePhoneToE164(raw: string): string | null {
  const hasPlus = raw.trim().startsWith('+');
  const digits = raw.replace(/[^\d]/g, '');
  if (hasPlus) {
    return digits.length >= 8 && digits.length <= 15 ? `+${digits}` : null;
  }
  if (digits.length === 10) return `+1${digits}`;
  if (digits.length === 11 && digits.startsWith('1')) return `+${digits}`;
  return digits.length >= 8 && digits.length <= 15 ? `+${digits}` : null;
}

function cleanEmail(raw: string): string {
  return raw.replace(EMAIL_TRAILING_PUNCTUATION_RE, '').toLowerCase();
}

function extractEmail(text: string): string | null {
  const direct = text.match(DIRECT_EMAIL_RE);
  if (direct) {
    return cleanEmail(direct[0]);
  }
  const obfuscated = text.match(OBFUSCATED_EMAIL_RE);
  if (obfuscated) {
    const [, local, domain, tld] = obfuscated;
    if (local && domain && tld) {
      return cleanEmail(`${local}@${domain}.${tld}`);
    }
  }
  return null;
}

function extractPhones(text: string): { phone: string | null; whatsapp: string | null } {
  const whatsappCapture = text.match(WHATSAPP_RE)?.[1];
  const whatsapp = whatsappCapture ? normalizePhoneToE164(whatsappCapture) : null;

  const genericCapture = text.match(GENERIC_PHONE_RE)?.[1];
  const phone = genericCapture ? normalizePhoneToE164(genericCapture) : null;

  return { phone, whatsapp };
}

function detectLinkHub(rawBio: string, externalUrl?: string): { platform: LinkHubPlatform; url: string } | null {
  const haystacks = [externalUrl, rawBio].filter((v): v is string => Boolean(v && v.trim().length > 0));
  for (const text of haystacks) {
    for (const { platform, re } of LINK_HUB_PATTERNS) {
      const match = text.match(re);
      if (match) {
        const url = match[0].startsWith('http') ? match[0] : `https://${match[0]}`;
        return { platform, url };
      }
    }
  }
  return null;
}

function classifyRepType(email: string | null, bio: string): RepType {
  if (email) {
    if (AGENCY_EMAIL_PATTERNS.some((re) => re.test(email))) return 'TALENT_AGENCY';
    if (MANAGER_EMAIL_PATTERNS.some((re) => re.test(email))) return 'DIRECT_MANAGER';
    // A dedicated business inbox exists but doesn't read as a third-party rep.
    return 'SELF_REPRESENTED';
  }
  if (BIO_MANAGED_BY_RE.test(bio)) {
    return BIO_AGENCY_KEYWORD_RE.test(bio) ? 'TALENT_AGENCY' : 'DIRECT_MANAGER';
  }
  return 'UNVERIFIED_BIO';
}

// =====================================================================================
// Worker
// =====================================================================================

export class InstagramIngestWorker {
  // -----------------------------------------------------------------------------------
  // Bio parsing
  // -----------------------------------------------------------------------------------

  parseBioMetadata(rawBio: string, externalUrl?: string): BioParseResult {
    if (typeof rawBio !== 'string') {
      throw new TypeError('rawBio must be a string');
    }

    const email = extractEmail(rawBio);
    const { phone, whatsapp } = extractPhones(rawBio);
    const linkHub = detectLinkHub(rawBio, externalUrl);
    const repType = classifyRepType(email, rawBio);

    return { email, phone, whatsapp, linkHub, repType };
  }

  // -----------------------------------------------------------------------------------
  // Brand disclosure / FTC compliance parsing
  // -----------------------------------------------------------------------------------

  detectBrandDisclosures(postCaption: string, taggedAccounts: string[]): BrandDisclosureResult {
    if (typeof postCaption !== 'string') {
      throw new TypeError('postCaption must be a string');
    }
    if (!Array.isArray(taggedAccounts)) {
      throw new TypeError('taggedAccounts must be an array of handles');
    }

    let disclosureType: DisclosureType | undefined;
    let capturedHandle: string | null = null;

    for (const { type, re } of FTC_DISCLOSURE_PATTERNS) {
      const match = postCaption.match(re);
      if (match) {
        disclosureType = type;
        if (match[1]) capturedHandle = normalizeHandle(match[1]);
        break;
      }
    }

    if (!disclosureType) {
      return { isCommercial: false };
    }

    // Prefer the handle captured directly out of "paid partnership with @x" /
    // "collab with @x" — it's the most specific signal available.
    if (capturedHandle) {
      const dictHit = VERTICAL_BRAND_DICTIONARY[capturedHandle];
      if (dictHit) {
        return {
          isCommercial: true,
          brandName: dictHit.brandName,
          categorySlug: dictHit.categorySlug,
          disclosureType,
        };
      }
      return { isCommercial: true, brandName: humanizeHandle(capturedHandle), disclosureType };
    }

    // Hashtag-only disclosure (#ad / #sponsored / #partner) — disambiguate the
    // sponsor from ordinary tagged peers using the vertical dictionary.
    for (const tagged of taggedAccounts) {
      const dictHit = VERTICAL_BRAND_DICTIONARY[normalizeHandle(tagged)];
      if (dictHit) {
        return {
          isCommercial: true,
          brandName: dictHit.brandName,
          categorySlug: dictHit.categorySlug,
          disclosureType,
        };
      }
    }

    // Known-commercial post, but we can't confidently attribute a sponsor.
    return { isCommercial: true, disclosureType };
  }

  // -----------------------------------------------------------------------------------
  // Availability
  // -----------------------------------------------------------------------------------

  evaluateAvailability(recentSponsorshipCount14d: number, daysSinceLastPost: number): AvailabilityEvaluation {
    if (!Number.isFinite(recentSponsorshipCount14d) || recentSponsorshipCount14d < 0) {
      throw new RangeError('recentSponsorshipCount14d must be a non-negative finite number');
    }
    if (!Number.isFinite(daysSinceLastPost) || daysSinceLastPost < 0) {
      throw new RangeError('daysSinceLastPost must be a non-negative finite number');
    }

    if (recentSponsorshipCount14d >= 3) {
      return { bookingStatus: 'high_demand_lead', leadTimeDays: 21 };
    }
    if (daysSinceLastPost > 45) {
      return { bookingStatus: 'closed_roster', leadTimeDays: 0 };
    }
    return { bookingStatus: 'available_immediate', leadTimeDays: 7 };
  }

  // -----------------------------------------------------------------------------------
  // Creator ingestion
  // -----------------------------------------------------------------------------------

  async ingestCreatorBatch(
    supabaseClient: SupabaseClient,
    payload: ScrapedCreatorPayload[]
  ): Promise<IngestBatchResult> {
    if (!Array.isArray(payload) || payload.length === 0) {
      return { totalProcessed: 0, succeeded: 0, failed: 0, errors: [] };
    }

    const errors: IngestRowError[] = [];
    const validRows: { source: ScrapedCreatorPayload; row: CreatorUpsertRow }[] = [];

    for (const item of payload) {
      const identifier = item?.handle ?? '(missing handle)';
      const problems = this.validateScrapedCreatorPayload(item);
      if (problems.length > 0) {
        errors.push({ identifier, stage: 'validation', message: problems.join('; ') });
        continue;
      }
      try {
        const parsedBio = this.parseBioMetadata(item.bio, item.externalUrl ?? undefined);
        const availability = this.evaluateAvailability(item.recentSponsorshipCount14d, item.daysSinceLastPost);
        const row = this.buildCreatorUpsertRow(item, parsedBio, availability);
        validRows.push({ source: item, row });
      } catch (err) {
        errors.push({ identifier, stage: 'validation', message: errorMessage(err) });
      }
    }

    const idByHandle = await this.upsertCreatorRows(
      supabaseClient,
      validRows.map((v) => v.row),
      errors
    );

    const blackoutTasks: { handle: string; row: BlackoutInsertRow }[] = [];
    for (const { source: item } of validRows) {
      const creatorId = idByHandle.get(normalizeHandle(item.handle));
      if (!creatorId) continue; // this handle's upsert failed upstream; already recorded

      for (const post of item.recentPosts) {
        let disclosure: BrandDisclosureResult;
        try {
          disclosure = this.detectBrandDisclosures(post.caption, post.taggedAccounts);
        } catch (err) {
          errors.push({
            identifier: item.handle,
            stage: 'blackout_window',
            message: `failed parsing post caption: ${errorMessage(err)}`,
          });
          continue;
        }
        if (!disclosure.isCommercial || !disclosure.brandName) continue;

        try {
          blackoutTasks.push({
            handle: item.handle,
            row: {
              creator_id: creatorId,
              brand_name: disclosure.brandName,
              category_slug: disclosure.categorySlug ?? 'uncategorized',
              blackout_start_date: post.postDate,
              blackout_end_date: addDaysToDateString(post.postDate, BLACKOUT_WINDOW_DAYS),
            },
          });
        } catch (err) {
          errors.push({ identifier: item.handle, stage: 'blackout_window', message: errorMessage(err) });
        }
      }
    }

    if (blackoutTasks.length > 0) {
      const settled = await mapWithConcurrency(blackoutTasks, WRITE_CONCURRENCY, (task) =>
        this.upsertBlackoutWindow(supabaseClient, task.row)
      );
      settled.forEach((result, index) => {
        const task = blackoutTasks[index];
        if (result.status === 'rejected' && task) {
          errors.push({ identifier: task.handle, stage: 'blackout_window', message: errorMessage(result.reason) });
        }
      });
    }

    const failedIdentifiers = new Set(errors.map((e) => e.identifier));
    return {
      totalProcessed: payload.length,
      succeeded: payload.length - failedIdentifiers.size,
      failed: failedIdentifiers.size,
      errors,
    };
  }

  // -----------------------------------------------------------------------------------
  // Enterprise (event organizer) ingestion
  // -----------------------------------------------------------------------------------

  async ingestEnterpriseBatch(
    supabaseClient: SupabaseClient,
    payload: ScrapedEnterprisePayload[]
  ): Promise<IngestBatchResult> {
    if (!Array.isArray(payload) || payload.length === 0) {
      return { totalProcessed: 0, succeeded: 0, failed: 0, errors: [] };
    }

    const errors: IngestRowError[] = [];
    const rows: EnterpriseUpsertRow[] = [];

    for (const item of payload) {
      const identifier = item?.instagramHandle ?? '(missing handle)';
      const problems = this.validateScrapedEnterprisePayload(item);
      if (problems.length > 0) {
        errors.push({ identifier, stage: 'validation', message: problems.join('; ') });
        continue;
      }
      rows.push(this.buildEnterpriseUpsertRow(item));
    }

    for (const batch of chunk(rows, BATCH_CHUNK_SIZE)) {
      const { error } = await supabaseClient.from('event_enterprises').upsert(batch, { onConflict: 'instagram_handle' });

      if (!error) continue;

      const settled = await mapWithConcurrency(batch, WRITE_CONCURRENCY, async (row) => {
        const { error: rowError } = await supabaseClient
          .from('event_enterprises')
          .upsert(row, { onConflict: 'instagram_handle' });
        if (rowError) throw new Error(rowError.message);
      });

      settled.forEach((result, index) => {
        const row = batch[index];
        if (result.status === 'rejected' && row) {
          errors.push({ identifier: row.instagram_handle, stage: 'upsert', message: errorMessage(result.reason) });
        }
      });
    }

    const failedIdentifiers = new Set(errors.map((e) => e.identifier));
    return {
      totalProcessed: payload.length,
      succeeded: payload.length - failedIdentifiers.size,
      failed: failedIdentifiers.size,
      errors,
    };
  }

  // -----------------------------------------------------------------------------------
  // Validation
  // -----------------------------------------------------------------------------------

  private validateScrapedCreatorPayload(payload: ScrapedCreatorPayload): string[] {
    const problems: string[] = [];

    if (!payload || typeof payload !== 'object') {
      return ['payload must be an object'];
    }
    if (!payload.handle || !payload.handle.trim()) {
      problems.push('handle is required');
    }
    if (!payload.displayName || !payload.displayName.trim()) {
      problems.push('displayName is required');
    }
    if (typeof payload.bio !== 'string') {
      problems.push('bio is required (use an empty string if none was scraped)');
    }
    if (!METRO_HUBS.includes(payload.primaryMetro)) {
      problems.push(`primaryMetro "${String(payload.primaryMetro)}" is not a recognized metro_hub`);
    }
    if (!PRIMARY_NICHES.includes(payload.primaryNiche)) {
      problems.push(`primaryNiche "${String(payload.primaryNiche)}" is not a recognized primary_niche`);
    }
    if (payload.engagementRate != null && (payload.engagementRate < 0 || payload.engagementRate > 100)) {
      problems.push('engagementRate must be between 0 and 100');
    }
    if (
      payload.estMinimumRateUsd != null &&
      payload.estMaximumRateUsd != null &&
      payload.estMaximumRateUsd < payload.estMinimumRateUsd
    ) {
      problems.push('estMaximumRateUsd cannot be less than estMinimumRateUsd');
    }
    if (!Number.isFinite(payload.daysSinceLastPost) || payload.daysSinceLastPost < 0) {
      problems.push('daysSinceLastPost must be a non-negative number');
    }
    if (!Number.isFinite(payload.recentSponsorshipCount14d) || payload.recentSponsorshipCount14d < 0) {
      problems.push('recentSponsorshipCount14d must be a non-negative number');
    }
    if (!Array.isArray(payload.recentPosts)) {
      problems.push('recentPosts must be an array');
    } else {
      payload.recentPosts.forEach((post, index) => {
        if (!post || typeof post.caption !== 'string') {
          problems.push(`recentPosts[${index}].caption must be a string`);
        }
        if (!post || !isValidDateOnly(post.postDate)) {
          problems.push(`recentPosts[${index}].postDate must be an ISO date string (YYYY-MM-DD)`);
        }
        if (!post || !Array.isArray(post.taggedAccounts)) {
          problems.push(`recentPosts[${index}].taggedAccounts must be an array`);
        }
      });
    }

    return problems;
  }

  private validateScrapedEnterprisePayload(payload: ScrapedEnterprisePayload): string[] {
    const problems: string[] = [];

    if (!payload || typeof payload !== 'object') {
      return ['payload must be an object'];
    }
    if (!payload.businessName || !payload.businessName.trim()) {
      problems.push('businessName is required');
    }
    if (!payload.instagramHandle || !payload.instagramHandle.trim()) {
      problems.push('instagramHandle is required');
    }
    if (!METRO_HUBS.includes(payload.metroHub)) {
      problems.push(`metroHub "${String(payload.metroHub)}" is not a recognized metro_hub`);
    }
    if (!ENTERPRISE_TYPES.includes(payload.enterpriseType)) {
      problems.push(`enterpriseType "${String(payload.enterpriseType)}" is not a recognized enterprise_type`);
    }

    return problems;
  }

  // -----------------------------------------------------------------------------------
  // Row builders
  // -----------------------------------------------------------------------------------

  private buildCreatorUpsertRow(
    payload: ScrapedCreatorPayload,
    parsedBio: BioParseResult,
    availability: AvailabilityEvaluation
  ): CreatorUpsertRow {
    const row: CreatorUpsertRow = {
      handle: normalizeHandle(payload.handle),
      display_name: payload.displayName.trim(),
      avatar_url: payload.avatarUrl ?? null,
      primary_metro: payload.primaryMetro,
      primary_niche: payload.primaryNiche,
      secondary_languages: payload.secondaryLanguages ?? [],
      follower_count: payload.followerCount ?? null,
      engagement_rate: payload.engagementRate ?? null,
      avg_reel_views: payload.avgReelViews ?? null,
      est_minimum_rate_usd: payload.estMinimumRateUsd ?? null,
      est_maximum_rate_usd: payload.estMaximumRateUsd ?? null,
      booking_status: availability.bookingStatus,
      lead_time_days: availability.leadTimeDays,
      rep_type: parsedBio.repType,
      direct_booking_email: parsedBio.email,
      direct_booking_phone: parsedBio.phone ?? parsedBio.whatsapp,
      is_verified: payload.isVerified ?? false,
      last_refreshed_at: new Date().toISOString(),
    };

    // Omit (never null) these two keys unless this scrape produced a fresh
    // reading — see the class-level design note on why omission matters.
    if (typeof payload.deliverabilityScoreHint === 'number') {
      row.deliverability_score = clamp(Math.round(payload.deliverabilityScoreHint), 0, 100);
    }
    if (typeof payload.verifiedResponseHoursHint === 'number') {
      row.verified_response_hours = Math.max(0, Math.round(payload.verifiedResponseHoursHint));
    }

    return row;
  }

  private buildEnterpriseUpsertRow(payload: ScrapedEnterprisePayload): EnterpriseUpsertRow {
    const parsedContact = payload.bio ? this.parseBioMetadata(payload.bio, payload.externalUrl ?? undefined) : null;

    return {
      business_name: payload.businessName.trim(),
      instagram_handle: normalizeHandle(payload.instagramHandle),
      metro_hub: payload.metroHub,
      enterprise_type: payload.enterpriseType,
      public_email: payload.publicEmail ?? parsedContact?.email ?? null,
      phone_number: payload.phoneNumber ?? parsedContact?.phone ?? parsedContact?.whatsapp ?? null,
      ticketing_url: payload.ticketingUrl ?? null,
      frequent_venues: payload.frequentVenues ?? [],
    };
  }

  // -----------------------------------------------------------------------------------
  // Database writes
  // -----------------------------------------------------------------------------------

  /**
   * Groups rows by which optional metric keys they carry (so every PostgREST
   * batch has a uniform column set), then bulk-upserts each group with a
   * per-row fallback on failure. Returns a handle → id map for rows that
   * ultimately succeeded, so the caller can attach blackout windows.
   */
  private async upsertCreatorRows(
    supabaseClient: SupabaseClient,
    rows: CreatorUpsertRow[],
    errors: IngestRowError[]
  ): Promise<Map<string, string>> {
    const idByHandle = new Map<string, string>();
    if (rows.length === 0) return idByHandle;

    const groups = new Map<string, CreatorUpsertRow[]>();
    for (const row of rows) {
      const key = `${'deliverability_score' in row ? 1 : 0}${'verified_response_hours' in row ? 1 : 0}`;
      const bucket = groups.get(key) ?? [];
      bucket.push(row);
      groups.set(key, bucket);
    }

    for (const group of groups.values()) {
      for (const batch of chunk(group, BATCH_CHUNK_SIZE)) {
        const { data, error } = await supabaseClient
          .from('creators')
          .upsert(batch, { onConflict: 'handle' })
          .select('id, handle');

        if (!error && data) {
          for (const record of data as { id: string; handle: string }[]) {
            idByHandle.set(record.handle, record.id);
          }
          continue;
        }

        // Bulk write for this chunk failed — isolate the bad row(s) by
        // retrying one at a time instead of dropping the whole chunk.
        const settled = await mapWithConcurrency(batch, WRITE_CONCURRENCY, async (row) => {
          const { data: rowData, error: rowError } = await supabaseClient
            .from('creators')
            .upsert(row, { onConflict: 'handle' })
            .select('id, handle')
            .single();
          if (rowError) throw new Error(rowError.message);
          return rowData as { id: string; handle: string };
        });

        settled.forEach((result, index) => {
          const row = batch[index];
          if (result.status === 'fulfilled') {
            idByHandle.set(result.value.handle, result.value.id);
          } else if (row) {
            errors.push({ identifier: row.handle, stage: 'upsert', message: errorMessage(result.reason) });
          }
        });
      }
    }

    return idByHandle;
  }

  /**
   * Refreshes a single (creator, brand, category) exclusivity window:
   * clears any prior window for that triple, then inserts the new one.
   */
  private async upsertBlackoutWindow(supabaseClient: SupabaseClient, row: BlackoutInsertRow): Promise<void> {
    const { error: deleteError } = await supabaseClient
      .from('creator_category_blackouts')
      .delete()
      .eq('creator_id', row.creator_id)
      .eq('brand_name', row.brand_name)
      .eq('category_slug', row.category_slug);

    if (deleteError) {
      throw new Error(`failed clearing prior blackout window: ${deleteError.message}`);
    }

    const { error: insertError } = await supabaseClient.from('creator_category_blackouts').insert(row);

    if (insertError) {
      throw new Error(`failed inserting blackout window: ${insertError.message}`);
    }
  }
}
