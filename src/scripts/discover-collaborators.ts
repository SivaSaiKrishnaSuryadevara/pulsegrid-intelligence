/**
 * Co-Tagged Network Discovery — finds new candidate handles by looking at
 * who a set of already-verified, high-follower creators tag in their own
 * recent posts (wedding carousels routinely tag the photographer, DJ,
 * decorator, planner — real collaborators, not random hashtag users).
 *
 * Important: `production_entities` does NOT store tagged-account data —
 * `taggedAccounts` is only ever used transiently at ingestion time (for
 * brand-disclosure/blackout detection) and never persisted. So this can't
 * just query the DB for existing tag data; it re-scrapes the source
 * creators fresh via `apify/instagram-profile-scraper` (which returns
 * `latestPosts[].taggedUsers`) to get current tags, then feeds the
 * resulting candidates through the exact same strict-mode pipeline
 * discovery already uses (parseApifyProfileItem + the LLM fallback) —
 * no new classification logic, just a new candidate SOURCE.
 *
 * Metro assignment: a co-tagged candidate has no hashtag to derive metro
 * from (unlike /api/ingest/discover). The fallback used here is the
 * SOURCE creator's own primary_metro — a DJ tagged by a DFW wedding
 * planner is overwhelmingly likely to also serve DFW — with inferLocality
 * (bio-named suburb) still taking priority when the candidate's own bio
 * names a specific city, exactly like every other discovery path.
 *
 * Usage:
 *   npm run discover:collaborators -- [--sourceLimit=15] [--maxFollowers=1000000] [--chunkSize=20]
 *
 * Requires APIFY_API_TOKEN plus the usual Supabase env vars.
 */

import { fetchApifyDatasetItems, startApifyActorRun, waitForApifyRunToFinish } from '@/lib/ingest/apify-client';
import { parseApifyProfileItem, type RawApifyProfileItem } from '@/lib/ingest/apify-instagram-parser';
import { classifyEntityTypesFallbackBatch } from '@/lib/ingest/llm-classifier';
import { getServiceRoleClient } from '@/lib/supabase/service';
import type { MetroHub } from '@/types/creator';
import { InstagramIngestWorker, normalizeHandle, VERTICAL_BRAND_DICTIONARY, type ScrapedCreatorPayload } from '@/workers/ingest-worker';

const PROFILE_SCRAPER_ACTOR_ID = 'apify/instagram-profile-scraper';
const DEFAULT_SOURCE_LIMIT = 15;
const DEFAULT_MAX_FOLLOWERS = 1_000_000;
const DEFAULT_CHUNK_SIZE = 20;
/** Source entity types — "wedding planners, DJs, and event companies" per the request. */
const SOURCE_ENTITY_TYPES = ['event_planner', 'local_dj'] as const;

interface CliArgs {
  sourceLimit: number;
  maxFollowers: number;
  chunkSize: number;
}

function parseArgs(argv: string[]): CliArgs {
  const flags: Record<string, string> = {};
  for (const arg of argv) {
    const match = arg.match(/^--([a-zA-Z]+)=(.*)$/);
    if (match?.[1] && match[2] !== undefined) flags[match[1]] = match[2];
  }
  return {
    sourceLimit: flags.sourceLimit ? Number(flags.sourceLimit) : DEFAULT_SOURCE_LIMIT,
    maxFollowers: flags.maxFollowers ? Number(flags.maxFollowers) : DEFAULT_MAX_FOLLOWERS,
    chunkSize: flags.chunkSize ? Number(flags.chunkSize) : DEFAULT_CHUNK_SIZE,
  };
}

function chunk<T>(items: T[], size: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < items.length; i += size) out.push(items.slice(i, i + size));
  return out;
}

async function main(): Promise<void> {
  const args = parseArgs(process.argv.slice(2));
  if (!Number.isFinite(args.sourceLimit) || args.sourceLimit <= 0) {
    console.error(`Invalid --sourceLimit="${args.sourceLimit}".`);
    process.exitCode = 1;
    return;
  }
  if (!Number.isFinite(args.chunkSize) || args.chunkSize <= 0) {
    console.error(`Invalid --chunkSize="${args.chunkSize}".`);
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

  // -----------------------------------------------------------------------
  // Stage 1: pick source creators — top N by follower count among event
  // planners / DJs, the entity types most likely to routinely tag real
  // vendor collaborators in their post carousels.
  // -----------------------------------------------------------------------
  console.log(`Selecting top ${args.sourceLimit} source creator(s) (${SOURCE_ENTITY_TYPES.join(', ')}) by follower count...`);
  const { data: sourceRows, error: sourceError } = await supabase
    .from('production_entities')
    .select('handle, primary_metro, follower_count')
    .in('entity_type', SOURCE_ENTITY_TYPES)
    .order('follower_count', { ascending: false, nullsFirst: false })
    .limit(args.sourceLimit);

  if (sourceError) {
    console.error(`Failed querying source creators: ${sourceError.message}`);
    process.exitCode = 1;
    return;
  }

  const sources = (sourceRows ?? []) as { handle: string; primary_metro: MetroHub; follower_count: number | null }[];
  if (sources.length === 0) {
    console.log('No source creators found — nothing to extract tags from.');
    return;
  }
  console.log(
    `  ${sources.length} source(s): ${sources.map((s) => `${s.handle} (${s.follower_count ?? '?'})`).join(', ')}`
  );

  // -----------------------------------------------------------------------
  // Stage 2: re-scrape the sources fresh to read their current
  // latestPosts[].taggedUsers — this data is never persisted, see header.
  // -----------------------------------------------------------------------
  console.log(`\nScraping ${sources.length} source profile(s) for tagged collaborators...`);
  const sourceHandles = sources.map((s) => s.handle);
  const sourceMetroByHandle = new Map(sources.map((s) => [s.handle, s.primary_metro]));

  const sourceRun = await startApifyActorRun(PROFILE_SCRAPER_ACTOR_ID, { usernames: sourceHandles }, apiToken);
  console.log(`  run started: ${sourceRun.runId}`);
  const sourceDatasetId = await waitForApifyRunToFinish(sourceRun.runId, apiToken, {
    onPoll: (status) => console.log(`  run status: ${status}`),
  });
  const sourceItems = (await fetchApifyDatasetItems(sourceDatasetId, apiToken)) as RawApifyProfileItem[];
  console.log(`  scraped ${sourceItems.length} source profile(s)`);

  // -----------------------------------------------------------------------
  // Stage 3: extract + dedupe tagged handles, carrying forward which
  // source (and therefore which fallback metro) first surfaced each one.
  // -----------------------------------------------------------------------
  const candidateMetro = new Map<string, MetroHub>();
  for (const item of sourceItems) {
    const sourceHandle = normalizeHandle(item.username ?? '');
    const fallbackMetro = sourceMetroByHandle.get(sourceHandle);
    if (!fallbackMetro) continue;
    for (const post of item.latestPosts ?? []) {
      for (const tagged of post.taggedUsers ?? []) {
        const handle = tagged.username ? normalizeHandle(tagged.username) : null;
        if (!handle || candidateMetro.has(handle)) continue;
        candidateMetro.set(handle, fallbackMetro);
      }
    }
  }
  const preFilterCount = candidateMetro.size;
  console.log(`\nExtracted ${preFilterCount} unique tagged handle(s) before filtering.`);

  // -----------------------------------------------------------------------
  // Stage 4: filter — drop source handles themselves, known brand
  // accounts, and anything already on file. (No standing purge/reject
  // blocklist exists yet in this codebase — flagging that as a gap, not
  // silently skipping it: a handle deleted for dilution earlier could in
  // principle be re-suggested here. The cultural/entity/follower gates
  // below would still correctly re-reject it, just at the cost of a
  // redundant scrape.)
  // -----------------------------------------------------------------------
  for (const sourceHandle of sourceHandles) candidateMetro.delete(sourceHandle);
  for (const brandHandle of Object.keys(VERTICAL_BRAND_DICTIONARY)) candidateMetro.delete(brandHandle);

  const { data: existingRows, error: existingError } = await supabase
    .from('production_entities')
    .select('handle')
    .in('handle', Array.from(candidateMetro.keys()));
  if (existingError) {
    console.error(`Failed checking existing handles: ${existingError.message}`);
    process.exitCode = 1;
    return;
  }
  for (const row of (existingRows ?? []) as { handle: string }[]) candidateMetro.delete(row.handle);

  const candidates = Array.from(candidateMetro.entries());
  console.log(`Candidate pool after filtering (excl. sources, known brands, already-on-file): ${candidates.length}`);
  if (candidates.length === 0) {
    console.log('\nNothing new to enrich.');
    return;
  }

  // -----------------------------------------------------------------------
  // Stage 5: enrich in chunks — sequential, not concurrent, to respect
  // Apify's per-account concurrent-run limit (already hit once this
  // session running 5 metro dispatches at once).
  // -----------------------------------------------------------------------
  const worker = new InstagramIngestWorker();
  let totalScraped = 0;
  let totalIngested = 0;
  let totalRejectedCulture = 0;
  let totalRejectedFollowers = 0;
  let totalOtherErrors = 0;

  const chunks = chunk(candidates, args.chunkSize);
  console.log(`\nEnriching ${candidates.length} candidate(s) in ${chunks.length} chunk(s) of up to ${args.chunkSize}...`);

  for (const [chunkIndex, candidateChunk] of chunks.entries()) {
    const handles = candidateChunk.map(([h]) => h);
    console.log(`\n--- Chunk ${chunkIndex + 1}/${chunks.length} (${handles.length} handle(s)) ---`);

    const run = await startApifyActorRun(PROFILE_SCRAPER_ACTOR_ID, { usernames: handles }, apiToken);
    const datasetId = await waitForApifyRunToFinish(run.runId, apiToken, {
      onPoll: (status) => console.log(`  run status: ${status}`),
    });
    const rawItems = (await fetchApifyDatasetItems(datasetId, apiToken)) as RawApifyProfileItem[];
    totalScraped += rawItems.length;
    console.log(`  scraped ${rawItems.length}`);

    const payloads: ScrapedCreatorPayload[] = [];
    const rejectedForFallback: RawApifyProfileItem[] = [];

    for (const raw of rawItems) {
      const handle = raw.username ? normalizeHandle(raw.username) : null;
      const metro = handle ? candidateMetro.get(handle) : undefined;
      if (!metro) continue; // scraped item doesn't match a requested candidate

      if ((raw.followersCount ?? 0) > args.maxFollowers) {
        console.log(`  [skip] ${handle}: ${raw.followersCount} followers exceeds --maxFollowers=${args.maxFollowers}`);
        continue;
      }

      const result = parseApifyProfileItem(raw, worker, { metro, defaultType: 'solo_creator', requireBioSignal: true });
      if (result.ok) {
        payloads.push(result.payload);
      } else if (raw.username) {
        rejectedForFallback.push(raw);
      } else {
        totalOtherErrors += 1;
      }
    }

    if (rejectedForFallback.length > 0) {
      const fallbackResults = await classifyEntityTypesFallbackBatch(
        rejectedForFallback.map((raw) => ({
          handle: normalizeHandle(raw.username ?? ''),
          displayName: raw.fullName ?? '',
          bio: raw.biography ?? '',
        }))
      );
      for (const raw of rejectedForFallback) {
        const handle = normalizeHandle(raw.username ?? '');
        const metro = candidateMetro.get(handle);
        const llmType = fallbackResults.get(handle);
        const retried = llmType && metro ? parseApifyProfileItem(raw, worker, { metro, defaultType: llmType, requireBioSignal: false }) : null;
        if (retried?.ok) {
          payloads.push(retried.payload);
        } else {
          totalRejectedCulture += 1;
          console.log(`  [reject] ${handle}: no event-industry + South Asian/Desi cultural signal (deterministic + LLM)`);
        }
      }
    }

    if (payloads.length > 0) {
      const result = await worker.ingestCreatorBatch(supabase, payloads);
      totalIngested += result.succeeded;
      totalRejectedFollowers += result.errors.filter((e) => e.message.includes('followerCount must be at least')).length;
      for (const err of result.errors) console.log(`  [${err.stage}] ${err.identifier}: ${err.message}`);
      console.log(`  chunk ingested: ${result.succeeded}/${payloads.length}`);
    } else {
      console.log('  nothing in this chunk passed the gates.');
    }
  }

  console.log('\n=== SUMMARY ===');
  console.log(`Source creators scraped: ${sources.length}`);
  console.log(`Unique tagged handles found (pre-filter): ${preFilterCount}`);
  console.log(`Candidate pool after filtering: ${candidates.length}`);
  console.log(`Candidates scraped: ${totalScraped}`);
  console.log(`Rejected — no cultural/entity signal: ${totalRejectedCulture}`);
  console.log(`Rejected — under follower floor: ${totalRejectedFollowers}`);
  console.log(`Other errors: ${totalOtherErrors}`);
  console.log(`Newly ingested: ${totalIngested}`);
}

main().catch((err) => {
  console.error('discover-collaborators script crashed:', err);
  process.exitCode = 1;
});
