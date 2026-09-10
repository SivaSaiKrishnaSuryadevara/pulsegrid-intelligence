/**
 * POST /api/webhooks/apify-refresh
 *
 * Apify ad-hoc webhook target for the run `/api/cron/refresh-stale` starts
 * — fetches the finished dataset and re-ingests each handle's TELEMETRY
 * only (follower count, bio, availability signals), pinning classification
 * (entity type/details, metro, niche, languages, rate range) to whatever's
 * already on file for that handle. See the module doc on
 * `src/lib/ingest/stale-refresh.ts` for why refresh never re-derives
 * classification from a fresh bio scan.
 *
 * The webhook payload carries no handle list, only a dataset id — the DB
 * is the source of truth for which of the scraped handles are ones this
 * refresh cycle actually cares about and what their pinned classification
 * is, looked up by the usernames the dataset itself contains.
 *
 * Auth: same shared-secret pattern as the other two Apify webhook routes —
 * `x-apify-secret` header against `process.env.APIFY_WEBHOOK_SECRET`.
 */

import { timingSafeEqual } from 'crypto';

import { NextResponse, type NextRequest } from 'next/server';

import { fetchApifyDatasetItems } from '@/lib/ingest/apify-client';
import type { RawApifyProfileItem } from '@/lib/ingest/apify-instagram-parser';
import { buildRefreshPayloads, normalizeUsername, queryClassificationByHandles } from '@/lib/ingest/stale-refresh';
import { getServiceRoleClient } from '@/lib/supabase/service';
import { InstagramIngestWorker } from '@/workers/ingest-worker';

interface ApifyRunFinishedPayload {
  datasetId?: string;
  resource?: { defaultDatasetId?: string };
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

  let rawItems: RawApifyProfileItem[];
  try {
    rawItems = (await fetchApifyDatasetItems(datasetId, apiToken)) as RawApifyProfileItem[];
  } catch (err) {
    return errorResponse(502, 'DATASET_FETCH_FAILED', errorMessage(err));
  }

  const scrapedHandles = rawItems.map((item) => normalizeUsername(item?.username)).filter((h): h is string => Boolean(h));

  const supabase = getServiceRoleClient();

  let knownRows;
  try {
    knownRows = await queryClassificationByHandles(supabase, scrapedHandles);
  } catch (err) {
    return errorResponse(500, 'QUERY_FAILED', errorMessage(err));
  }

  const worker = new InstagramIngestWorker();
  const { payloads, errors: parseErrors } = buildRefreshPayloads(rawItems, knownRows, worker);

  const ingestResult =
    payloads.length > 0
      ? await worker.ingestCreatorBatch(supabase, payloads)
      : { totalProcessed: 0, succeeded: 0, failed: 0, errors: [] };

  return NextResponse.json({
    datasetId,
    totalFetched: rawItems.length,
    refreshed: ingestResult.succeeded,
    failed: parseErrors.length + ingestResult.failed,
    errors: [...parseErrors, ...ingestResult.errors.map((e) => ({ identifier: e.identifier, error: e.message }))],
  });
}
