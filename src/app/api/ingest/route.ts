/**
 * POST /api/ingest
 *
 * Apify webhook target for "actor run finished" events — distinct from
 * `/api/webhooks/apify-discovery`, which expects scraped items pushed
 * directly in the request body and classifies them with Claude.
 *
 * Apify's default run-finished webhook payload does NOT contain the
 * scraped items — it names the dataset the run wrote to
 * (`resource.defaultDatasetId`). This route reads that id, fetches the
 * dataset from the Apify API, and parses each item with the same
 * deterministic (no-LLM) heuristic parser the `ingest:apify` CLI script
 * uses (`src/lib/ingest/apify-instagram-parser.ts`), so a live webhook run
 * and a manual CLI backfill produce identical results for the same data.
 *
 * Auth: shared-secret header `x-apify-secret`, compared against
 * `process.env.APIFY_WEBHOOK_SECRET` (same secret as the other Apify
 * route, different header name — these are two independently configured
 * Apify webhooks) with a constant-time comparison.
 *
 * Declared assumptions (unaddressed by the originating request):
 *  - `metro` and (optionally) `defaultType` are read from QUERY PARAMS on
 *    the webhook URL (`?metro=DFW&defaultType=local_dj`), not the request
 *    body. Apify's run-finished payload has no field this route could
 *    reasonably read a metro from, and the webhook URL itself is fully
 *    configurable per Apify actor/task — so one webhook per metro (or
 *    per actor, if a scraper is already metro-scoped) is the natural way
 *    to parameterize this. `metro` is required; requests without a
 *    resolvable one are rejected with 400 rather than silently
 *    misattributing rows to a guessed metro.
 *  - `datasetId` is read from `resource.defaultDatasetId` (Apify's
 *    documented run-finished shape) or a top-level `datasetId` in the body
 *    (manual testing convenience, bypassing the need for a real Apify
 *    webhook round trip).
 */

import { timingSafeEqual } from 'crypto';

import { NextResponse, type NextRequest } from 'next/server';

import { fetchApifyDatasetItems } from '@/lib/ingest/apify-client';
import { parseApifyProfileItem, resolveMetroHub, type RawApifyProfileItem } from '@/lib/ingest/apify-instagram-parser';
import { classifyEntityTypesFallbackBatch } from '@/lib/ingest/llm-classifier';
import { getServiceRoleClient } from '@/lib/supabase/service';
import { ENTITY_TYPES, type EntityType } from '@/types/creator';
import { InstagramIngestWorker, type ScrapedCreatorPayload } from '@/workers/ingest-worker';

interface ApifyRunFinishedPayload {
  datasetId?: string;
  resource?: { defaultDatasetId?: string };
}

interface IngestItemError {
  identifier: string;
  error: string;
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

  const { searchParams } = new URL(request.url);

  const metroParam = searchParams.get('metro');
  const metro = metroParam ? resolveMetroHub(metroParam) : null;
  if (!metro) {
    return errorResponse(
      400,
      'INVALID_REQUEST',
      'Missing or unrecognized ?metro= query param. Expected a short code (DFW, DMV, HOU, ATX, NYC/NJ, ATL, CHI) or the full metro_hub value.'
    );
  }

  const defaultTypeParam = searchParams.get('defaultType') ?? 'solo_creator';
  if (!ENTITY_TYPES.includes(defaultTypeParam as EntityType)) {
    return errorResponse(400, 'INVALID_REQUEST', `Invalid defaultType "${defaultTypeParam}". Expected one of: ${ENTITY_TYPES.join(', ')}`);
  }
  const defaultType = defaultTypeParam as EntityType;
  // Set by /api/ingest/discover on the ad-hoc webhook it registers for
  // auto-discovered (unvetted) batches — see requireBioSignal on
  // ParseApifyItemOptions. Manually-configured Apify webhooks pointing here
  // for a human-curated batch omit it, keeping the old defaultType fallback.
  const strict = searchParams.get('strict') === '1';

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

  let rawItems: unknown[];
  try {
    rawItems = await fetchApifyDatasetItems(datasetId, apiToken);
  } catch (err) {
    return errorResponse(502, 'DATASET_FETCH_FAILED', errorMessage(err));
  }

  const worker = new InstagramIngestWorker();
  const payloads: ScrapedCreatorPayload[] = [];
  const parseErrors: IngestItemError[] = [];
  // Rejected under strict mode (not a missing-username case, which has no
  // bio to retry) — worth a harder-case LLM look before giving up. See
  // classifyEntityTypesFallbackBatch.
  const rejectedForFallback: RawApifyProfileItem[] = [];

  for (const raw of rawItems as RawApifyProfileItem[]) {
    const result = parseApifyProfileItem(raw, worker, { metro, defaultType, requireBioSignal: strict });
    if (result.ok) {
      payloads.push(result.payload);
    } else if (strict && raw?.username) {
      rejectedForFallback.push(raw);
    } else {
      parseErrors.push({ identifier: result.identifier, error: result.error });
    }
  }

  if (rejectedForFallback.length > 0) {
    const fallbackResults = await classifyEntityTypesFallbackBatch(
      rejectedForFallback.map((raw) => ({
        handle: raw.username!.trim().replace(/^@/, '').toLowerCase(),
        displayName: raw.fullName ?? '',
        bio: raw.biography ?? '',
      }))
    );

    for (const raw of rejectedForFallback) {
      const handle = raw.username!.trim().replace(/^@/, '').toLowerCase();
      const llmType = fallbackResults.get(handle);
      const retried = llmType
        ? parseApifyProfileItem(raw, worker, { metro, defaultType: llmType, requireBioSignal: false })
        : null;
      if (retried?.ok) {
        payloads.push(retried.payload);
      } else {
        parseErrors.push({
          identifier: handle,
          error:
            fallbackResults.has(handle)
              ? 'no event-industry signal found in bio — skipped (including LLM fallback)'
              : 'no event-industry signal found in bio — skipped (LLM fallback not attempted, run cap reached)',
        });
      }
    }
  }

  const serviceClient = getServiceRoleClient();
  const ingestResult =
    payloads.length > 0
      ? await worker.ingestCreatorBatch(serviceClient, payloads)
      : { totalProcessed: 0, succeeded: 0, failed: 0, errors: [] };

  return NextResponse.json({
    datasetId,
    totalFetched: rawItems.length,
    parsed: payloads.length,
    created: ingestResult.succeeded,
    failed: parseErrors.length + ingestResult.failed,
    errors: [...parseErrors, ...ingestResult.errors.map((e) => ({ identifier: e.identifier, error: e.message }))],
  });
}
