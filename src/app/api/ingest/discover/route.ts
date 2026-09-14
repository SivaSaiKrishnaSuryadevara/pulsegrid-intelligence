/**
 * POST /api/ingest/discover
 *
 * Stage 1->2 orchestrator for fully-autonomous regional discovery. Apify
 * webhook target for the *hashtag-discovery* task's run-succeeded event
 * (an `apify/instagram-hashtag-scraper` run over regional hashtags like
 * #dfwdesievents) — NOT the same contract as `/api/ingest`, whose dataset is
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
 *  3. Groups the remaining handles by METRO — derived per-post from which
 *     tracked hashtag surfaced it (HASHTAG_TO_METRO below), not from a
 *     single `?metro=` query param applied to the whole batch. This
 *     matters once the underlying schedule tracks hashtags across
 *     multiple regions in one run (DFW + DMV + ATX + HOU + CLT): a single
 *     global metro would mislabel every non-DFW discovery as DFW. `?metro=`
 *     on this route's own URL is now only a FALLBACK default for a post
 *     whose hashtag isn't in the dictionary (typically a generic,
 *     non-regional tag like #desisinusa) — not an override.
 *  4. Caps each metro group at MAX_DISCOVERED_HANDLES_PER_METRO — a
 *     hashtag crawl can return far more authors than is sensible to
 *     enrich (and pay for) in one cycle, and a per-metro cap keeps one
 *     region's hashtag volume from crowding out another's.
 *  5. Starts one NEW `apify/instagram-profile-scraper` run PER metro group
 *     that has new handles, each with its own AD-HOC webhook (via the
 *     `webhooks` param on `startApifyActorRun`) carrying that metro's own
 *     `?metro=` value, pointing back at `/api/ingest`. No persistent
 *     webhook needs to exist in the Apify console for the enrichment
 *     stage; it's wired up dynamically, per invocation, here.
 *
 * Stage 3 (bio-keyword entity-type filtering + upsert into
 * production_entities) is unchanged, existing code — it's just whatever
 * runs when an ad-hoc-webhook-triggered run lands on `/api/ingest`. Per-
 * profile locality detection there (inferLocality in
 * apify-instagram-parser.ts) is a second, more precise line of defense on
 * top of this route's per-hashtag metro guess: a profile whose bio names
 * a specific suburb gets classified from that, regardless of which
 * hashtag or metro fallback surfaced it here.
 *
 * Auth: same shared-secret pattern as `/api/ingest` — `x-apify-secret`
 * header against `process.env.APIFY_WEBHOOK_SECRET`.
 */

import { timingSafeEqual } from 'crypto';

import { NextResponse, type NextRequest } from 'next/server';

import { fetchApifyDatasetItems, startApifyActorRun } from '@/lib/ingest/apify-client';
import { resolveMetroHub } from '@/lib/ingest/apify-instagram-parser';
import { getServiceRoleClient } from '@/lib/supabase/service';
import { ENTITY_TYPES, type EntityType, type MetroHub } from '@/types/creator';

const PROFILE_SCRAPER_ACTOR_ID = 'apify/instagram-profile-scraper';
/**
 * Raised 15 -> 40 for the 2026-09-14 catalog-bootstrap push (~80 ->
 * 250+ target across the 5 hubs). At 15, a single run's hard ceiling was
 * 5 metros x 15 = 75 new creators regardless of how many hashtags fed it
 * — the actual bottleneck for reaching that target quickly, independent
 * of the hashtag/resultsLimit expansion also done in this pass. Left
 * raised as the new standing default rather than reverted after one run;
 * dial back down if weekly Apify cost becomes a concern once the catalog
 * is closer to target size.
 */
const MAX_DISCOVERED_HANDLES_PER_METRO = 40;

/**
 * Tracked regional hashtags -> the metro they mean. Kept here (not in
 * apify-instagram-parser.ts) because this is specifically about which
 * hashtag surfaced a post during DISCOVERY, a different signal from the
 * bio-text suburb matching `inferLocality` does during profile parsing —
 * the two are independent and deliberately not merged into one dictionary.
 * A hashtag not listed here (generic tags like #desisinusa, or one added
 * to the schedule but not yet added here) falls back to this route's own
 * `?metro=` query param default.
 *
 * Replaced the original generic tag set (dfwfoodie, austinevents,
 * houstonevents, dallasblogger, ...) after confirming in production that
 * it was the actual source of the niche dilution: a bar-trivia host and a
 * dance-fitness account both passed entity-type keyword matching with
 * zero South Asian/Desi relevance, because the HASHTAGS themselves were
 * generic local/foodie/events tags, not diaspora-specific ones. Every tag
 * below is high-signal-diaspora by construction; the cultural-relevance
 * gate in apify-instagram-parser.ts (hasCulturalSignal) is the second,
 * independent layer that catches anything that still slips through.
 *
 * National/touring diaspora tags (desievents, southasianweddings,
 * desisinusa, browngirlmag) aren't region-specific enough to map to one
 * metro — they're intentionally left OUT of this dictionary and fall back
 * to this route's own ?metro= default, same as before; a profile whose
 * bio names a specific city still gets corrected by inferLocality
 * regardless of which metro this fallback guesses.
 */
const HASHTAG_TO_METRO: Record<string, MetroHub> = {
  // DFW
  dallasdesi: 'DFW_TEXAS',
  dfwdesi: 'DFW_TEXAS',
  dallasindianweddings: 'DFW_TEXAS',
  dallasdesievents: 'DFW_TEXAS',
  texastelugu: 'DFW_TEXAS',
  dfwindiandjs: 'DFW_TEXAS',
  friscodesi: 'DFW_TEXAS',
  planodesi: 'DFW_TEXAS',
  // DMV
  dmvdesi: 'DMV_NOVA',
  novadesi: 'DMV_NOVA',
  dcweddingsdesi: 'DMV_NOVA',
  dmvbhangra: 'DMV_NOVA',
  dmveventsdesi: 'DMV_NOVA',
  novadesievents: 'DMV_NOVA',
  dmvindiandj: 'DMV_NOVA',
  dcbhangra: 'DMV_NOVA',
  fairfaxdesi: 'DMV_NOVA',
  // Austin
  austindesi: 'AUSTIN_TX',
  atxdesi: 'AUSTIN_TX',
  austinindianweddings: 'AUSTIN_TX',
  austindesievents: 'AUSTIN_TX',
  atxindiandjs: 'AUSTIN_TX',
  // Houston
  houstondesi: 'HOUSTON_TX',
  houstondesievents: 'HOUSTON_TX',
  houstonindianweddings: 'HOUSTON_TX',
  sugarlanddesi: 'HOUSTON_TX',
  houstonbhangra: 'HOUSTON_TX',
  // Carolinas
  charlottedesi: 'CLT_CAROLINAS',
  raleighdesi: 'CLT_CAROLINAS',
  carydesi: 'CLT_CAROLINAS',
  carolinadesi: 'CLT_CAROLINAS',
  charlottedesievents: 'CLT_CAROLINAS',
  carydesievents: 'CLT_CAROLINAS',
  raleighindiandjs: 'CLT_CAROLINAS',
};

interface ApifyRunFinishedPayload {
  datasetId?: string;
  resource?: { defaultDatasetId?: string };
}

interface HashtagPostItem {
  ownerUsername?: string | null;
  /** e.g. "https://www.instagram.com/explore/tags/dfwdesievents/" — the only field in the scraper's output that says which tracked hashtag surfaced this post (`hashtags` is the post's OWN caption tags, unrelated). Used both to derive metro (HASHTAG_TO_METRO) and to keep MAX_DISCOVERED_HANDLES_PER_METRO from being dominated by whichever hashtag the actor happens to write to the dataset first. */
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
 * last across a 5-hashtag run and every one of its authors fell past the
 * cap, so zero of them ever reached profile enrichment. Round-robin
 * guarantees every tracked hashtag gets a fair share before any one
 * hashtag gets a second pick.
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

  // Fallback default only now — see the HASHTAG_TO_METRO header note.
  // Still required to be a resolvable value when provided at all, so a
  // typo'd query param fails loudly rather than silently defaulting.
  const metroParam = searchParams.get('metro');
  const fallbackMetro = metroParam ? resolveMetroHub(metroParam) : 'DFW_TEXAS';
  if (metroParam && !fallbackMetro) {
    return errorResponse(
      400,
      'INVALID_REQUEST',
      'Unrecognized ?metro= query param. Expected a short code (DFW, DMV, HOU, ATX, CLT, NYC/NJ, ATL, CHI) or the full metro_hub value.'
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
  // Fetch the hashtag-scrape dataset and extract unique authors, grouped
  // by metro (derived per-post from its hashtag) and, within each metro,
  // by the specific hashtag (for fairness — see selectFairlyAcrossHashtags).
  // ---------------------------------------------------------------------
  let rawPosts: unknown[];
  try {
    rawPosts = await fetchApifyDatasetItems(datasetId, apiToken);
  } catch (err) {
    return errorResponse(502, 'DATASET_FETCH_FAILED', errorMessage(err));
  }

  const handlesByMetroThenHashtag = new Map<MetroHub, Map<string, string[]>>();
  const seenHandles = new Set<string>();
  for (const item of rawPosts as HashtagPostItem[]) {
    const username = item?.ownerUsername?.trim().toLowerCase();
    if (!username) continue;
    if (seenHandles.has(username)) continue;
    seenHandles.add(username);

    const tag = extractHashtagLabel(item.inputUrl);
    const metro = HASHTAG_TO_METRO[tag] ?? fallbackMetro ?? 'DFW_TEXAS';

    const hashtagGroups = handlesByMetroThenHashtag.get(metro) ?? new Map<string, string[]>();
    const group = hashtagGroups.get(tag) ?? [];
    group.push(username);
    hashtagGroups.set(tag, group);
    handlesByMetroThenHashtag.set(metro, hashtagGroups);
  }
  const discoveredHandles = seenHandles;

  // ---------------------------------------------------------------------
  // Drop handles already on file (discovery, not a refresh job — see
  // header note), then cap each metro group — fairly across that metro's
  // own hashtags, not by a flat prefix slice.
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

  const newHandlesByMetro = new Map<MetroHub, string[]>();
  for (const [metro, hashtagGroups] of handlesByMetroThenHashtag.entries()) {
    const filteredGroups = new Map(
      Array.from(hashtagGroups.entries()).map(([tag, handles]) => [tag, handles.filter((h) => !existingHandles.has(h))])
    );
    const selected = selectFairlyAcrossHashtags(filteredGroups, MAX_DISCOVERED_HANDLES_PER_METRO);
    if (selected.length > 0) newHandlesByMetro.set(metro, selected);
  }

  if (newHandlesByMetro.size === 0) {
    return NextResponse.json({
      datasetId,
      postsScanned: rawPosts.length,
      uniqueAuthorsFound: discoveredHandles.size,
      alreadyOnFile: existingHandles.size,
      metrosEnriching: 0,
      enrichmentRuns: [],
    });
  }

  // ---------------------------------------------------------------------
  // Stage 2: start one profile-enrichment run PER metro group, each with
  // its own ad-hoc webhook wired directly to /api/ingest?metro=<that
  // metro> — this is what actually prevents the Austin/Houston/DMV/CLT
  // mislabeling-as-DFW problem described in the header note.
  // ---------------------------------------------------------------------
  const secret = process.env.APIFY_WEBHOOK_SECRET;
  if (!secret) {
    return errorResponse(500, 'CONFIGURATION_ERROR', 'Missing APIFY_WEBHOOK_SECRET environment variable.');
  }

  // Dispatched in parallel, not one-metro-at-a-time — sequential awaits
  // here multiply this route's response latency by the number of metro
  // groups in the batch, which is exactly what pushed a real production
  // run past Apify's webhook retry timeout (doNotRetry: false on the
  // persistent webhook) and caused it to redeliver, duplicating the
  // enrichment run for whichever metros hadn't finished dispatching yet
  // (confirmed: Austin and DFW both got double-dispatched in a live run
  // before this fix). The dedup-against-existing-handles lookup earlier
  // in this route still makes a genuine retry safe either way — this is
  // about not wasting Apify usage on redundant scrapes, not correctness.
  const metroEntries = Array.from(newHandlesByMetro.entries());
  const dispatchResults = await Promise.allSettled(
    metroEntries.map(([metro, handles]) =>
      startApifyActorRun(PROFILE_SCRAPER_ACTOR_ID, { usernames: handles }, apiToken, [
        {
          eventTypes: ['ACTOR.RUN.SUCCEEDED'],
          // strict=1: these handles are unvetted (anyone who used a tracked
          // hashtag once), so a bio with no event-industry signal should be
          // skipped rather than defaulted into defaultTypeParam — see
          // requireBioSignal in apify-instagram-parser.ts.
          requestUrl: `${origin}/api/ingest?metro=${encodeURIComponent(metro)}&defaultType=${encodeURIComponent(defaultTypeParam)}&strict=1`,
          headersTemplate: JSON.stringify({ 'x-apify-secret': secret }),
        },
      ])
    )
  );

  const enrichmentRuns: { metro: MetroHub; handleCount: number; runId: string }[] = [];
  const enrichmentErrors: { metro: MetroHub; error: string }[] = [];

  dispatchResults.forEach((result, index) => {
    const entry = metroEntries[index];
    if (!entry) return;
    const [metro, handles] = entry;
    if (result.status === 'fulfilled') {
      enrichmentRuns.push({ metro, handleCount: handles.length, runId: result.value.runId });
    } else {
      enrichmentErrors.push({ metro, error: errorMessage(result.reason) });
    }
  });

  return NextResponse.json({
    datasetId,
    postsScanned: rawPosts.length,
    uniqueAuthorsFound: discoveredHandles.size,
    alreadyOnFile: existingHandles.size,
    metrosEnriching: enrichmentRuns.length,
    enrichmentRuns,
    enrichmentErrors: enrichmentErrors.length > 0 ? enrichmentErrors : undefined,
  });
}
