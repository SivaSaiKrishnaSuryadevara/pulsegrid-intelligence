/**
 * Bulk-imports an already-finished Apify `apify/instagram-profile-scraper`
 * dataset run into `production_entities`, using the deterministic (no-LLM)
 * heuristic parser in `src/lib/ingest/apify-instagram-parser.ts` — the same
 * parser the `/api/ingest` webhook route uses, so a CLI backfill and a live
 * webhook run produce identical results for the same raw data.
 *
 * Usage:
 *   npm run ingest:apify -- --datasetId=<APIFY_DATASET_ID> --metro=DFW [--defaultType=solo_creator]
 *
 * Flags:
 *   --datasetId   Required. The Apify dataset ID to pull items from.
 *   --metro       Required. A metro short code (DFW, DMV, HOU, ATX, NYC/NJ,
 *                 ATL, CHI) or the full metro_hub enum value.
 *   --defaultType Optional. Fallback entity type when no bio keyword
 *                 matches (see inferEntityType). Defaults to solo_creator.
 *
 * Requires APIFY_API_TOKEN plus the usual NEXT_PUBLIC_SUPABASE_URL /
 * SUPABASE_SERVICE_ROLE_KEY (see .env.example) — run via `--env-file`
 * (already wired into the `ingest:apify` package.json script) so these
 * load from `.env.local`, matching the existing seed scripts.
 */

import { fetchApifyDatasetItems } from '@/lib/ingest/apify-client';
import { parseApifyProfileItem, resolveMetroHub, type RawApifyProfileItem } from '@/lib/ingest/apify-instagram-parser';
import { getServiceRoleClient } from '@/lib/supabase/service';
import { ENTITY_TYPES, type EntityType } from '@/types/creator';
import { InstagramIngestWorker, type ScrapedCreatorPayload } from '@/workers/ingest-worker';

interface CliArgs {
  datasetId: string;
  metro: string;
  defaultType: string;
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
    datasetId: flags.datasetId ?? '',
    metro: flags.metro ?? '',
    defaultType: flags.defaultType ?? 'solo_creator',
  };
}

async function main(): Promise<void> {
  const args = parseArgs(process.argv.slice(2));

  if (!args.datasetId) {
    console.error('Missing required flag: --datasetId=<APIFY_DATASET_ID>');
    process.exitCode = 1;
    return;
  }

  const metro = resolveMetroHub(args.metro);
  if (!metro) {
    console.error(
      `Missing or unrecognized --metro="${args.metro}". Expected one of DFW, DMV, HOU, ATX, NYC/NJ, ATL, CHI (or the full metro_hub enum value).`
    );
    process.exitCode = 1;
    return;
  }

  if (!ENTITY_TYPES.includes(args.defaultType as EntityType)) {
    console.error(`Invalid --defaultType="${args.defaultType}". Expected one of: ${ENTITY_TYPES.join(', ')}`);
    process.exitCode = 1;
    return;
  }
  const defaultType = args.defaultType as EntityType;

  const apiToken = process.env.APIFY_API_TOKEN;
  if (!apiToken) {
    console.error('Missing APIFY_API_TOKEN environment variable (see .env.example).');
    process.exitCode = 1;
    return;
  }

  console.log(`Fetching dataset ${args.datasetId} from Apify...`);
  const rawItems = await fetchApifyDatasetItems(args.datasetId, apiToken);
  console.log(`  fetched ${rawItems.length} item(s)`);

  const worker = new InstagramIngestWorker();
  const payloads: ScrapedCreatorPayload[] = [];
  const parseErrors: { identifier: string; error: string }[] = [];

  for (const raw of rawItems as RawApifyProfileItem[]) {
    const result = parseApifyProfileItem(raw, worker, { metro, defaultType });
    if (result.ok) {
      payloads.push(result.payload);
    } else {
      parseErrors.push({ identifier: result.identifier, error: result.error });
    }
  }

  console.log(`  parsed ${payloads.length} valid profile(s), ${parseErrors.length} skipped`);
  for (const err of parseErrors) {
    console.log(`  [parse] ${err.identifier}: ${err.error}`);
  }

  if (payloads.length === 0) {
    console.log('\nNothing to ingest.');
    process.exitCode = parseErrors.length > 0 ? 1 : 0;
    return;
  }

  const supabase = getServiceRoleClient();
  console.log(`\nIngesting ${payloads.length} profile(s) into production_entities...`);
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

  console.log('\nIngest complete.');
}

main().catch((err) => {
  console.error('Apify ingest script crashed:', err);
  process.exitCode = 1;
});
