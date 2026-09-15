/**
 * Tagless Anchor & Collaborator Graph Crawler — a second candidate SOURCE
 * alongside hashtag discovery (`/api/ingest/discover`) and co-tagged
 * network discovery (`discover-collaborators.ts`). Where those two start
 * from a hashtag or from our own top on-file creators, this one starts
 * from a curated list of regional promoter/showcase ANCHOR accounts — the
 * pages that book and repost the actual talent circuit in each metro —
 * and reads who those accounts credit or tag, since a promoter's own
 * content is where real working vendors surface even when the vendor
 * never used a tracked hashtag themselves (hence "tagless").
 *
 * Extraction is richer than the co-tagged script's taggedUsers-only pass:
 *  - `coauthorProducers` on Collab-format Reels/carousels (a joint-credit
 *    field distinct from taggedUsers — see apify-instagram-parser.ts).
 *  - `taggedUsers` (same field the co-tagged script already reads).
 *  - `@handle` mentions inside post captions (regex over caption text).
 *  - `@handle` mentions inside the anchor's own bio (promoters routinely
 *    list a house DJ/decorator/photographer inline, e.g.
 *    "Dance Instructor: @tej.dance").
 *
 * Candidates are then filtered for an external bio link pointing at a
 * ticketing/marketplace platform (eventbrite.com, sulekha.com,
 * tickethungama.com) — a promoter or ticketing operation itself, not an
 * individual bookable vendor — before routing through the same
 * strict-mode enrichment pipeline every other discovery path uses
 * (parseApifyProfileItem + hasCulturalSignal() + the LLM fallback +
 * InstagramIngestWorker's MIN_FOLLOWER_COUNT_FOR_INGEST floor).
 *
 * Usage:
 *   npm run crawl:network -- [--metro=ATX] [--maxFollowers=1000000] [--chunkSize=20]
 *   (omit --metro to crawl all 5 anchor metros)
 *
 * Requires APIFY_API_TOKEN plus the usual Supabase env vars.
 */

import { fetchApifyDatasetItems, startApifyActorRun, waitForApifyRunToFinish } from '@/lib/ingest/apify-client';
import {
  hasConflictingInternationalLocation,
  hasUsResidencySignal,
  parseApifyProfileItem,
  resolveMetroHub,
  type RawApifyProfileItem,
} from '@/lib/ingest/apify-instagram-parser';
import { classifyEntityTypesFallbackBatch } from '@/lib/ingest/llm-classifier';
import { getServiceRoleClient } from '@/lib/supabase/service';
import type { MetroHub } from '@/types/creator';
import { InstagramIngestWorker, normalizeHandle, VERTICAL_BRAND_DICTIONARY, type ScrapedCreatorPayload } from '@/workers/ingest-worker';

const PROFILE_SCRAPER_ACTOR_ID = 'apify/instagram-profile-scraper';
const DEFAULT_MAX_FOLLOWERS = 1_000_000;
const DEFAULT_CHUNK_SIZE = 20;

/**
 * Regional promoter/showcase accounts per metro — the actual circuit
 * pages that book and repost real vendors, given directly rather than
 * derived from anything already on file (unlike discover-collaborators.ts,
 * this doesn't require any creators to already exist in a metro, so it
 * works as a bootstrap source for thin metros too).
 */
const ANCHOR_SEEDS_BY_METRO: Record<MetroHub, string[]> = {
  AUSTIN_TX: ['renegade.entertainments', 'austindesievents', 'rapchikevents', 'kiraakentertainments', 'austin_ammayilu'],
  DFW_TEXAS: ['dallasdesievents', 'funasiadallas', 'radiocaravan'],
  DMV_NOVA: ['dmvdesi', 'novadesievents', 'desieventsdmv'],
  HOUSTON_TX: ['houstondesievents', 'desiatxhouston'],
  CLT_CAROLINAS: ['charlottedesievents', 'carolinadesi'],
  // No anchor seeds curated yet for these metros — left empty rather than
  // guessed, so this crawler simply contributes nothing there until real
  // seeds are supplied (the same "don't fabricate" stance the rest of the
  // ingest pipeline takes with data).
  TRI_STATE_NY_NJ: [],
  ATLANTA_GA: [],
  CHICAGO_IL: [],
};

/** Ticketing/marketplace platforms — a candidate whose bio links here is the promoter/box-office side of the business, not an individual bookable vendor. */
const TRANSACTIONAL_LINK_DOMAINS = ['eventbrite.com', 'sulekha.com', 'tickethungama.com'];

/** `@handle` mentions in free text (captions, bios) — Instagram handles are letters/digits/./_ , 1-30 chars. */
const MENTION_PATTERN = /@([a-zA-Z0-9](?:[a-zA-Z0-9._]{0,28}[a-zA-Z0-9])?)/g;

function extractMentions(text: string | null | undefined): string[] {
  if (!text) return [];
  return Array.from(text.matchAll(MENTION_PATTERN), (m) => m[1]).filter((h): h is string => Boolean(h));
}

function hasTransactionalLink(externalUrl: string | null | undefined): boolean {
  if (!externalUrl) return false;
  const lower = externalUrl.toLowerCase();
  return TRANSACTIONAL_LINK_DOMAINS.some((domain) => lower.includes(domain));
}

interface CliArgs {
  metro: MetroHub | null;
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
    // Accepts either a short code (ATX) or the full enum value (AUSTIN_TX) —
    // same convention as every other --metro= flag in this ingest pipeline.
    metro: flags.metro ? resolveMetroHub(flags.metro) : null,
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
  const rawMetroArg = process.argv.slice(2).find((a) => a.startsWith('--metro='))?.split('=')[1];
  if (rawMetroArg && !resolveMetroHub(rawMetroArg)) {
    console.error(`Invalid --metro="${rawMetroArg}". Valid short codes: DFW, DMV, ATX, HOU, CLT (or the full enum value).`);
    process.exitCode = 1;
    return;
  }
  const args = parseArgs(process.argv.slice(2));
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

  const metrosToRun = (args.metro ? [args.metro] : (Object.keys(ANCHOR_SEEDS_BY_METRO) as MetroHub[])).filter(
    (metro) => ANCHOR_SEEDS_BY_METRO[metro].length > 0
  );

  // -----------------------------------------------------------------------
  // Stage 1: scrape every anchor seed across the selected metro(s) in one
  // batch run — anchors are a fixed, curated list (not DB-sourced), so
  // there's no query stage here unlike discover-collaborators.ts.
  // -----------------------------------------------------------------------
  const anchorMetroByHandle = new Map<string, MetroHub>();
  for (const metro of metrosToRun) {
    for (const handle of ANCHOR_SEEDS_BY_METRO[metro]) anchorMetroByHandle.set(normalizeHandle(handle), metro);
  }
  const anchorHandles = Array.from(anchorMetroByHandle.keys());
  console.log(`Crawling ${anchorHandles.length} anchor seed(s) across ${metrosToRun.length} metro(s): ${metrosToRun.join(', ')}`);

  const anchorRun = await startApifyActorRun(PROFILE_SCRAPER_ACTOR_ID, { usernames: anchorHandles }, apiToken);
  console.log(`  run started: ${anchorRun.runId}`);
  const anchorDatasetId = await waitForApifyRunToFinish(anchorRun.runId, apiToken, {
    onPoll: (status) => console.log(`  run status: ${status}`),
  });
  const anchorItems = (await fetchApifyDatasetItems(anchorDatasetId, apiToken)) as RawApifyProfileItem[];
  console.log(`  scraped ${anchorItems.length} anchor profile(s)`);

  // -----------------------------------------------------------------------
  // Stage 2: extract candidates — coauthorProducers + taggedUsers per post,
  // @mentions in captions, @mentions in the anchor's own bio.
  // -----------------------------------------------------------------------
  const candidateMetro = new Map<string, MetroHub>();
  const candidateSourceCount = { coauthor: 0, tagged: 0, captionMention: 0, bioMention: 0 };

  for (const item of anchorItems) {
    const anchorHandle = normalizeHandle(item.username ?? '');
    const fallbackMetro = anchorMetroByHandle.get(anchorHandle);
    if (!fallbackMetro) continue;

    for (const mention of extractMentions(item.biography)) {
      const handle = normalizeHandle(mention);
      if (!candidateMetro.has(handle)) candidateMetro.set(handle, fallbackMetro);
      candidateSourceCount.bioMention += 1;
    }

    for (const post of item.latestPosts ?? []) {
      for (const coauthor of post.coauthorProducers ?? []) {
        const handle = coauthor.username ? normalizeHandle(coauthor.username) : null;
        if (!handle) continue;
        if (!candidateMetro.has(handle)) candidateMetro.set(handle, fallbackMetro);
        candidateSourceCount.coauthor += 1;
      }
      for (const tagged of post.taggedUsers ?? []) {
        const handle = tagged.username ? normalizeHandle(tagged.username) : null;
        if (!handle) continue;
        if (!candidateMetro.has(handle)) candidateMetro.set(handle, fallbackMetro);
        candidateSourceCount.tagged += 1;
      }
      for (const mention of extractMentions(post.caption)) {
        const handle = normalizeHandle(mention);
        if (!candidateMetro.has(handle)) candidateMetro.set(handle, fallbackMetro);
        candidateSourceCount.captionMention += 1;
      }
    }
  }
  const preFilterCount = candidateMetro.size;
  console.log(
    `\nExtracted ${preFilterCount} unique candidate handle(s) before filtering ` +
      `(raw mentions — coauthor: ${candidateSourceCount.coauthor}, tagged: ${candidateSourceCount.tagged}, ` +
      `caption @: ${candidateSourceCount.captionMention}, bio @: ${candidateSourceCount.bioMention}).`
  );

  // -----------------------------------------------------------------------
  // Stage 3: filter — drop anchors themselves, known brand accounts, and
  // anything already on file.
  // -----------------------------------------------------------------------
  for (const anchorHandle of anchorHandles) candidateMetro.delete(anchorHandle);
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
  console.log(`Candidate pool after filtering (excl. anchors, known brands, already-on-file): ${candidates.length}`);
  if (candidates.length === 0) {
    console.log('\nNothing new to enrich.');
    return;
  }

  // -----------------------------------------------------------------------
  // Stage 4: enrich in chunks — sequential, not concurrent, to respect
  // Apify's per-account concurrent-run limit.
  // -----------------------------------------------------------------------
  const worker = new InstagramIngestWorker();
  let totalScraped = 0;
  let totalIngested = 0;
  let totalRejectedCulture = 0;
  let totalRejectedFollowers = 0;
  let totalRejectedTransactionalLink = 0;
  let totalRejectedInternationalLocation = 0;
  let totalRejectedNoUsSignal = 0;
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

      if (hasTransactionalLink(raw.externalUrl)) {
        console.log(`  [reject] ${handle}: bio links a ticketing/marketplace platform (${raw.externalUrl}) — promoter/box-office, not a vendor`);
        totalRejectedTransactionalLink += 1;
        continue;
      }

      // A tagged-network candidate has no metro of its own the way a
      // hashtag-discovered candidate does — without this check its metro
      // would be silently inherited from whichever anchor tagged it,
      // regardless of where the candidate actually lives or works. Caught
      // in practice: an established India-based film choreographer with no
      // US location in their own bio got labeled AUSTIN_TX purely because
      // an Austin anchor tagged them.
      const locationSignalText = `${raw.fullName ?? ''}\n${raw.biography ?? ''}`;
      if (hasConflictingInternationalLocation(locationSignalText)) {
        console.log(`  [reject] ${handle}: bio names an international (non-US) location with no offsetting US signal — not a local metro candidate`);
        totalRejectedInternationalLocation += 1;
        continue;
      }
      if (!hasUsResidencySignal(locationSignalText)) {
        console.log(`  [reject] ${handle}: no US residency/location signal in bio — can't confirm local metro relevance, won't inherit anchor's metro blindly`);
        totalRejectedNoUsSignal += 1;
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
  console.log(`Anchor seeds crawled: ${anchorHandles.length}`);
  console.log(`Unique candidate handles found (pre-filter): ${preFilterCount}`);
  console.log(`Candidate pool after filtering: ${candidates.length}`);
  console.log(`Candidates scraped: ${totalScraped}`);
  console.log(`Rejected — transactional/ticketing bio link: ${totalRejectedTransactionalLink}`);
  console.log(`Rejected — conflicting international location: ${totalRejectedInternationalLocation}`);
  console.log(`Rejected — no US residency signal: ${totalRejectedNoUsSignal}`);
  console.log(`Rejected — no cultural/entity signal: ${totalRejectedCulture}`);
  console.log(`Rejected — under follower floor: ${totalRejectedFollowers}`);
  console.log(`Other errors: ${totalOtherErrors}`);
  console.log(`Newly ingested: ${totalIngested}`);
}

main().catch((err) => {
  console.error('crawl-network-graph script crashed:', err);
  process.exitCode = 1;
});
