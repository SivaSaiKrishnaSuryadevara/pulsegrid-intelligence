/**
 * Refreshes stale creator telemetry (follower counts, bio, availability,
 * recent-post signals) by re-scraping handles already on file whose
 * `last_refreshed_at` has aged past `--staleDays`. Deliberately does NOT
 * re-derive entity_type/entity_details/primary_metro/primary_niche/
 * secondary_languages/rate range from the fresh scrape — see the module
 * doc on `src/lib/ingest/stale-refresh.ts` for why.
 *
 * Unlike the production cadence (`/api/cron/refresh-stale` -> ad-hoc Apify
 * webhook -> `/api/webhooks/apify-refresh`), this runs as a single
 * self-contained CLI script: it starts the Apify run AND polls it to
 * completion in-process. That's safe here (no serverless execution-time
 * limit to respect) and makes this the right tool for an ad-hoc/manual
 * run where a human is watching the output — the cron route can't poll
 * like this without risking a function timeout, which is why it's built
 * as a separate start/ad-hoc-webhook pair instead of calling this script.
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
import type { RawApifyProfileItem } from '@/lib/ingest/apify-instagram-parser';
import { getServiceRoleClient } from '@/lib/supabase/service';
import { buildRefreshPayloads, DEFAULT_REFRESH_BATCH_LIMIT, DEFAULT_STALE_DAYS, PROFILE_SCRAPER_ACTOR_ID, queryStaleCreators } from '@/lib/ingest/stale-refresh';
import { InstagramIngestWorker } from '@/workers/ingest-worker';

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
    limit: flags.limit ? Number(flags.limit) : DEFAULT_REFRESH_BATCH_LIMIT,
  };
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

  const supabase = getServiceRoleClient();

  console.log(`Finding creators last refreshed more than ${args.staleDays} day(s) ago (limit=${args.limit})...`);
  const staleRows = await queryStaleCreators(supabase, { staleDays: args.staleDays, limit: args.limit });

  if (staleRows.length === 0) {
    console.log('Nothing stale to refresh.');
    return;
  }

  const handles = staleRows.map((row) => row.handle);
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
  const { payloads, errors: parseErrors } = buildRefreshPayloads(rawItems, staleRows, worker);

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
  // skipFollowerFloor: these handles are already in production_entities —
  // re-applying the new-candidate quality floor on every refresh would
  // permanently strand any already-vetted profile whose follower count
  // dips below it (see MIN_FOLLOWER_COUNT_FOR_INGEST's doc comment).
  const result = await worker.ingestCreatorBatch(supabase, payloads, { skipFollowerFloor: true });
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
