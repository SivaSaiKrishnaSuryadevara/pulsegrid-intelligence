/**
 * GET /api/cron/refresh-stale
 *
 * Vercel Cron target — see vercel.json (every 2 days, 03:00 UTC). Finds
 * creators whose `last_refreshed_at` has aged past the staleness cutoff
 * and starts an `apify/instagram-profile-scraper` run over their handles,
 * with an ad-hoc webhook attached pointing back at
 * `/api/webhooks/apify-refresh` — the actual re-ingest happens there, once
 * Apify calls back with a finished dataset.
 *
 * Deliberately does NOT wait for the scrape to finish: an Apify profile
 * scrape routinely runs past typical serverless function time limits
 * regardless of batch size, so this route only ever does two fast things
 * (a DB query, an Apify "start run" API call) and returns — the same
 * kickoff/ad-hoc-webhook split `/api/ingest/discover` already uses for
 * discovery. The synchronous start-and-poll approach in `npm run
 * refresh:stale` (the CLI script) stays for ad-hoc/manual runs only, where
 * a human is watching output and there's no request timeout to respect.
 *
 * Auth: Vercel's documented cron pattern — `Authorization: Bearer
 * <CRON_SECRET>`, which Vercel attaches automatically to its own
 * cron-triggered requests once `CRON_SECRET` is set as a project env var.
 */

import { timingSafeEqual } from 'crypto';

import { NextResponse, type NextRequest } from 'next/server';

import { startApifyActorRun } from '@/lib/ingest/apify-client';
import { DEFAULT_REFRESH_BATCH_LIMIT, DEFAULT_STALE_DAYS, PROFILE_SCRAPER_ACTOR_ID, queryStaleCreators } from '@/lib/ingest/stale-refresh';
import { SITE_URL } from '@/lib/pseo/directory-config';
import { getServiceRoleClient } from '@/lib/supabase/service';

function errorResponse(status: number, error: string, message: string): NextResponse {
  return NextResponse.json({ error, message }, { status });
}

function isAuthorized(request: NextRequest): boolean {
  const expected = process.env.CRON_SECRET;
  if (!expected) return false;

  const authHeader = request.headers.get('authorization') ?? '';
  const provided = authHeader.startsWith('Bearer ') ? authHeader.slice('Bearer '.length) : '';
  if (!provided) return false;

  const expectedBuf = Buffer.from(expected);
  const providedBuf = Buffer.from(provided);
  if (expectedBuf.length !== providedBuf.length) return false;
  return timingSafeEqual(expectedBuf, providedBuf);
}

function errorMessage(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}

export async function GET(request: NextRequest): Promise<NextResponse> {
  if (!isAuthorized(request)) {
    return errorResponse(401, 'UNAUTHORIZED', 'Missing or invalid Authorization bearer token.');
  }

  const apiToken = process.env.APIFY_API_TOKEN;
  if (!apiToken) {
    return errorResponse(500, 'CONFIGURATION_ERROR', 'Missing APIFY_API_TOKEN environment variable.');
  }
  const webhookSecret = process.env.APIFY_WEBHOOK_SECRET;
  if (!webhookSecret) {
    return errorResponse(500, 'CONFIGURATION_ERROR', 'Missing APIFY_WEBHOOK_SECRET environment variable.');
  }

  const supabase = getServiceRoleClient();

  let staleRows;
  try {
    staleRows = await queryStaleCreators(supabase, { staleDays: DEFAULT_STALE_DAYS, limit: DEFAULT_REFRESH_BATCH_LIMIT });
  } catch (err) {
    return errorResponse(500, 'QUERY_FAILED', errorMessage(err));
  }

  if (staleRows.length === 0) {
    return NextResponse.json({ staleFound: 0, refreshRunId: null, message: 'Nothing stale to refresh.' });
  }

  const handles = staleRows.map((row) => row.handle);

  try {
    const run = await startApifyActorRun(PROFILE_SCRAPER_ACTOR_ID, { usernames: handles }, apiToken, [
      {
        eventTypes: ['ACTOR.RUN.SUCCEEDED'],
        // SITE_URL, not request.nextUrl.origin — confirmed live that
        // Vercel Cron invokes this route via a per-deployment
        // *.vercel.app alias that sits behind Vercel's own Deployment
        // Protection wall (every call Apify made back to that origin
        // 401'd with "Protected deployment", not this route's own
        // x-apify-secret check). The stable custom domain isn't
        // protected — /api/ingest/discover's persistent webhook already
        // proves that path works, hardcoded the same way when it was
        // created.
        requestUrl: `${SITE_URL}/api/webhooks/apify-refresh`,
        headersTemplate: JSON.stringify({ 'x-apify-secret': webhookSecret }),
      },
    ]);

    return NextResponse.json({
      staleFound: staleRows.length,
      handles,
      refreshRunId: run.runId,
      refreshDatasetId: run.datasetId,
    });
  } catch (err) {
    return errorResponse(502, 'REFRESH_START_FAILED', errorMessage(err));
  }
}
