/**
 * Shared logic for refreshing already-ingested creators' time-sensitive
 * telemetry (follower count, bio, availability) without touching their
 * classification (entity type/details, metro, niche, languages, rate
 * range) — some of those fields were set by the smarter LLM path
 * (`/api/webhooks/apify-discovery`), so refresh must never re-derive them
 * from a fresh bio scan (see `parseApifyProfileItemForRefresh`).
 *
 * Two callers share this module rather than duplicating it:
 *  - `npm run refresh:stale` (src/scripts/refresh-stale-creators.ts): a
 *    single synchronous CLI run that starts the Apify run AND polls it to
 *    completion in-process — safe there, no request timeout to respect.
 *  - The production cadence (`/api/cron/refresh-stale` +
 *    `/api/webhooks/apify-refresh`): a start-run/ad-hoc-webhook split,
 *    because an Apify scrape routinely runs past a serverless function's
 *    time budget — the same reason `/api/ingest/discover` already avoids
 *    polling for the discovery pipeline.
 */

import type { SupabaseClient } from '@supabase/supabase-js';

import { parseApifyProfileItemForRefresh, type RawApifyProfileItem } from './apify-instagram-parser';
import type { EntityDetails, EntityType, MetroHub, PrimaryNiche } from '@/types/creator';
import { InstagramIngestWorker, type ScrapedCreatorPayload } from '@/workers/ingest-worker';

export const PROFILE_SCRAPER_ACTOR_ID = 'apify/instagram-profile-scraper';
export const DEFAULT_STALE_DAYS = 14;
export const DEFAULT_REFRESH_BATCH_LIMIT = 100;

export interface StaleCreatorRow {
  handle: string;
  entity_type: EntityType;
  entity_details: EntityDetails;
  primary_metro: MetroHub;
  primary_niche: PrimaryNiche;
  secondary_languages: string[];
  est_minimum_rate_usd: number | null;
  est_maximum_rate_usd: number | null;
  locality: string | null;
  last_refreshed_at: string;
}

const STALE_ROW_COLUMNS =
  'handle, entity_type, entity_details, primary_metro, primary_niche, secondary_languages, est_minimum_rate_usd, est_maximum_rate_usd, locality, last_refreshed_at';

/** Rows whose `last_refreshed_at` is older than `staleDays`, oldest first, capped at `limit`. */
export async function queryStaleCreators(
  supabase: SupabaseClient,
  opts: { staleDays?: number; limit?: number } = {}
): Promise<StaleCreatorRow[]> {
  const staleDays = opts.staleDays ?? DEFAULT_STALE_DAYS;
  const limit = opts.limit ?? DEFAULT_REFRESH_BATCH_LIMIT;
  const cutoffIso = new Date(Date.now() - staleDays * 86_400_000).toISOString();

  const { data, error } = await supabase
    .from('production_entities')
    .select(STALE_ROW_COLUMNS)
    .lt('last_refreshed_at', cutoffIso)
    .order('last_refreshed_at', { ascending: true })
    .limit(limit);

  if (error) {
    throw new Error(`Failed querying stale creators: ${error.message}`);
  }
  return (data ?? []) as unknown as StaleCreatorRow[];
}

/** Classification rows for a known set of handles, regardless of staleness — used by the webhook consumer, which already knows which handles it asked Apify to scrape. */
export async function queryClassificationByHandles(
  supabase: SupabaseClient,
  handles: string[]
): Promise<StaleCreatorRow[]> {
  if (handles.length === 0) return [];

  const { data, error } = await supabase.from('production_entities').select(STALE_ROW_COLUMNS).in('handle', handles);

  if (error) {
    throw new Error(`Failed querying classification for scraped handles: ${error.message}`);
  }
  return (data ?? []) as unknown as StaleCreatorRow[];
}

export function normalizeUsername(raw: string | null | undefined): string | null {
  const trimmed = raw?.trim().replace(/^@/, '').toLowerCase();
  return trimmed && trimmed.length > 0 ? trimmed : null;
}

export interface RefreshParseOutcome {
  payloads: ScrapedCreatorPayload[];
  errors: { identifier: string; error: string }[];
}

/**
 * Merges freshly-scraped raw items with each handle's pinned classification
 * (from `knownRows`) into ingestable payloads. A handle present in
 * `knownRows` but absent from `rawItems` is reported as an error (account
 * likely deleted/private/renamed) rather than silently dropped, so its
 * `last_refreshed_at` stays untouched and it's retried next cycle.
 */
export function buildRefreshPayloads(
  rawItems: RawApifyProfileItem[],
  knownRows: StaleCreatorRow[],
  worker: InstagramIngestWorker
): RefreshParseOutcome {
  const classificationByHandle = new Map(knownRows.map((row) => [row.handle, row]));
  const payloads: ScrapedCreatorPayload[] = [];
  const errors: { identifier: string; error: string }[] = [];
  const scrapedHandles = new Set<string>();

  for (const raw of rawItems) {
    const handle = normalizeUsername(raw?.username);
    if (handle) scrapedHandles.add(handle);

    const existing = handle ? classificationByHandle.get(handle) : undefined;
    if (!existing) {
      errors.push({
        identifier: handle ?? '(missing username)',
        error: 'scraped handle does not match any requested stale creator — skipped',
      });
      continue;
    }

    const result = parseApifyProfileItemForRefresh(raw, worker, {
      entityType: existing.entity_type,
      entityDetails: existing.entity_details,
      primaryMetro: existing.primary_metro,
      primaryNiche: existing.primary_niche,
      secondaryLanguages: existing.secondary_languages,
      estMinimumRateUsd: existing.est_minimum_rate_usd,
      estMaximumRateUsd: existing.est_maximum_rate_usd,
      locality: existing.locality,
    });
    if (result.ok) {
      payloads.push(result.payload);
    } else {
      errors.push({ identifier: result.identifier, error: result.error });
    }
  }

  for (const row of knownRows) {
    if (!scrapedHandles.has(row.handle)) {
      errors.push({
        identifier: row.handle,
        error: 'not present in scrape results — account may be deleted, private, or renamed',
      });
    }
  }

  return { payloads, errors };
}
