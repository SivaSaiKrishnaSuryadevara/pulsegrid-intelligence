/**
 * Refreshes stale creator telemetry (follower counts, bio, availability,
 * recent-post signals) by re-scraping handles already on file whose
 * `last_refreshed_at` has aged past `--staleDays`. Deliberately does NOT
 * re-derive entity_type/entity_details/primary_metro/primary_niche/
 * secondary_languages/rate range from the fresh scrape — those are
 * classification fields, some originally set by the LLM webhook path
 * (`/api/webhooks/apify-discovery`), and blindly re-running the bio-keyword
 * heuristic parser on every refresh risks silently downgrading a
 * classification a smarter pass already got right. See
 * `parseApifyProfileItemForRefresh` in apify-instagram-parser.ts.
 *
 * Unlike the discovery pipeline (`/api/ingest/discover` -> ad-hoc Apify
 * webhook -> `/api/ingest`), this runs as a single self-contained CLI
 * script: it starts the Apify run AND polls it to completion in-process.
 * That's safe here (no serverless execution-time limit to respect) and
 * avoids standing up a public webhook callback just to refresh a batch —
 * wire this into a scheduler (cron / GitHub Actions) once the cadence
 * itself is proven out; this script is the unit that scheduler would call.
 *
 * A handle that comes back under the MIN_FOLLOWER_COUNT_FOR_INGEST floor
 * (ingest-worker.ts) or doesn't appear in the scrape at all (deleted/
 * private/renamed account) fails validation and is reported, not silently
 * dropped — its last_refreshed_at stays stale, so it's picked up and
 * retried on every subsequent run until someone investigates.
 *
 * Usage:
 *   npm run refresh:stale -- [--staleDays=14] [--limit=100]
 *
 * Requires APIFY_API_TOKEN plus the usual NEXT_PUBLIC_SUPABASE_URL /
 * SUPABASE_SERVICE_ROLE_KEY (see .env.example) — run via `--env-file`
 * (already wired into the `refresh:stale` package.json script).
 */

import { fetchApifyDatasetItems, startApifyActorRun, waitForApifyRunToFinish } from '@/lib/ingest/apify-client';
import { parseApifyProfileItemForRefresh, type RawApifyProfileItem } from '@/lib/ingest/apify-instagram-parser';
import { getServiceRoleClient } from '@/lib/supabase/service';
import type { EntityDetails, EntityType, MetroHub, PrimaryNiche } from '@/types/creator';
import { InstagramIngestWorker, type ScrapedCreatorPayload } from '@/workers/ingest-worker';

const PROFILE_SCRAPER_ACTOR_ID = 'apify/instagram-profile-scraper';
const DEFAULT_STALE_DAYS = 14;
const DEFAULT_LIMIT = 100;

interface CliArgs {
  staleDays: number;
  limit: number;
}

function parseArgs(argv: string[]): CliArgs {
  const flags: Record<string, string> = {};
  for (const arg of argv) {
    const match = arg.match(/^--([a-zA-Z]+)=(.*)$/);
    if (match?.[1] && match[2] !== undefined) {
      flags[match[1]] = match[2];
    }
  }
  return {
    staleDays: flags.staleDays ? Number(flags.staleDays) : DEFAULT_STALE_DAYS,
    limit: flags.limit ? Number(flags.limit) : DEFAULT_LIMIT,
  };
}

interface StaleRow {
  handle: string;
  entity_type: EntityType;
  entity_details: EntityDetails;
  primary_metro: MetroHub;
  primary_niche: PrimaryNiche;
  secondary_languages: string[];
  est_minimum_rate_usd: number | null;
  est_maximum_rate_usd: number | null;
  last_refreshed_at: string;
}

function normalizeUsername(raw: string | null | undefined): string | null {
  const trimmed = raw?.trim().replace(/^@/, '').toLowerCase();
  return trimmed && trimmed.length > 0 ? trimmed : null;
}

async function main(): Promise<void> {
  const args = parseArgs(process.argv.slice(2));

  if (!Number.isFinite(args.staleDays) || args.staleDays <= 0) {
    console.error(`Invalid --staleDays="${args.staleDays}". Expected a positive number.`);
    process.exitCode = 1;
    return;
  }
  if (!Number.isFinite(args.limit) || args.limit <= 0) {
    console.error(`Invalid --limit="${args.limit}". Expected a positive number.`);
    process.exitCode = 1;
    return;
  }

  const apiToken = process.env.APIFY_API_TOKEN;
  if (!apiToken) {
    console.error('Missing APIFY_API_TOKEN environment variable (see .env.example).');
    process.exitCode = 1;
    return;
  }

  const cutoffIso = new Date(Date.now() - args.staleDays * 86_400_000).toISOString();
  const supabase = getServiceRoleClient();

  console.log(`Finding creators last refreshed before ${cutoffIso} (staleDays=${args.staleDays}, limit=${args.limit})...`);
  const { data: staleRows, error: queryError } = await supabase
    .from('production_entities')
    .select(
      'handle, entity_type, entity_details, primary_metro, primary_niche, secondary_languages, est_minimum_rate_usd, est_maximum_rate_usd, last_refreshed_at'
    )
    .lt('last_refreshed_at', cutoffIso)
    .order('last_refreshed_at', { ascending: true })
    .limit(args.limit);

  if (queryError) {
    console.error(`Failed querying stale creators: ${queryError.message}`);
    process.exitCode = 1;
    return;
  }

  const rows = (staleRows ?? []) as StaleRow[];
  if (rows.length === 0) {
    console.log('Nothing stale to refresh.');
    return;
  }

  const classificationByHandle = new Map<string, StaleRow>(rows.map((row) => [row.handle, row]));
  const handles = rows.map((row) => row.handle);
  console.log(`  found ${handles.length} stale creator(s): ${handles.join(', ')}`);

  console.log(`\nStarting ${PROFILE_SCRAPER_ACTOR_ID} run for ${handles.length} handle(s)...`);
  const run = await startApifyActorRun(PROFILE_SCRAPER_ACTOR_ID, { usernames: handles }, apiToken);
  console.log(`  run started: ${run.runId}`);

  const datasetId = await waitForApifyRunToFinish(run.runId, apiToken, {
    onPoll: (status) => console.log(`  run status: ${status}`),
  });
  console.log(`  run succeeded, dataset ${datasetId}`);

  const rawItems = (await fetchApifyDatasetItems(datasetId, apiToken)) as RawApifyProfileItem[];
  console.log(`  fetched ${rawItems.length} scraped profile(s)`);

  const worker = new InstagramIngestWorker();
  const payloads: ScrapedCreatorPayload[] = [];
  const parseErrors: { identifier: string; error: string }[] = [];
  const scrapedHandles = new Set<string>();

  for (const raw of rawItems) {
    const handle = normalizeUsername(raw?.username);
    if (handle) scrapedHandles.add(handle);

    const existing = handle ? classificationByHandle.get(handle) : undefined;
    if (!existing) {
      parseErrors.push({
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
    });
    if (result.ok) {
      payloads.push(result.payload);
    } else {
      parseErrors.push({ identifier: result.identifier, error: result.error });
    }
  }

  for (const handle of handles) {
    if (!scrapedHandles.has(handle)) {
      parseErrors.push({
        identifier: handle,
        error: 'not present in scrape results — account may be deleted, private, or renamed',
      });
    }
  }

  console.log(`  parsed ${payloads.length} refreshable profile(s), ${parseErrors.length} skipped`);
  for (const err of parseErrors) {
    console.log(`  [skip] ${err.identifier}: ${err.error}`);
  }

  if (payloads.length === 0) {
    console.log('\nNothing to refresh.');
    process.exitCode = parseErrors.length > 0 ? 1 : 0;
    return;
  }

  console.log(`\nRefreshing ${payloads.length} creator(s) in production_entities...`);
  const result = await worker.ingestCreatorBatch(supabase, payloads);
  console.log(`  succeeded: ${result.succeeded}/${result.totalProcessed}`);
  for (const err of result.errors) {
    console.log(`  [${err.stage}] ${err.identifier}: ${err.message}`);
  }

  if (result.failed > 0 || parseErrors.length > 0) {
    console.error(`\n${result.failed + parseErrors.length} record(s) failed — see above.`);
    process.exitCode = 1;
    return;
  }

  console.log('\nRefresh complete.');
}

main().catch((err) => {
  console.error('refresh-stale-creators script crashed:', err);
  process.exitCode = 1;
});
