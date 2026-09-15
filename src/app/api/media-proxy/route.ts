/**
 * GET /api/media-proxy?url=<encoded Instagram CDN URL>
 *
 * Streams an Instagram-hosted image (an avatar via `Avatar`, or a
 * media-proof thumbnail from `entity_details.mediaProofs`) through our own
 * origin.
 *
 * Why this exists: Instagram's CDN (`cdninstagram.com`/`fbcdn.net`) returns
 * a valid 200 for these URLs but sets `Cross-Origin-Resource-Policy:
 * same-origin` — browsers enforce that against the loading page's origin,
 * not the requester, so a direct `<img src="https://scontent-...">` on
 * this app is unconditionally blocked (`ERR_BLOCKED_BY_RESPONSE.NotSameOrigin`)
 * regardless of anything this app's own headers/CSP do. A server-to-server
 * fetch isn't subject to that browser-side enforcement, so proxying through
 * our own route and re-serving under our own origin is the actual fix, not
 * a workaround.
 *
 * No auth check here (a first version required a signed-in session, then
 * this route turned out to also back `Avatar`, which renders on the public,
 * deliberately-crawlable-without-auth pSEO pages — `/directories/[slug]`,
 * `/verified/[handle]` — so gating it broke avatars there). That's fine:
 * the underlying images are already publicly fetchable straight from
 * Instagram's CDN with no auth of any kind, so this proxy isn't protecting
 * anything private. The real safeguard against this becoming an open
 * image-fetching proxy is `isProxiableMediaHost` (src/lib/media-proxy.ts) —
 * `url`'s hostname must end in an allow-listed Instagram/Meta CDN suffix,
 * checked before any fetch happens.
 */

import { NextResponse, type NextRequest } from 'next/server';

import { isProxiableMediaHost } from '@/lib/media-proxy';

export async function GET(request: NextRequest): Promise<NextResponse> {
  const targetUrl = request.nextUrl.searchParams.get('url');
  if (!targetUrl) {
    return NextResponse.json({ error: 'INVALID_REQUEST', message: 'Missing url query param.' }, { status: 400 });
  }

  let parsed: URL;
  try {
    parsed = new URL(targetUrl);
  } catch {
    return NextResponse.json({ error: 'INVALID_REQUEST', message: 'url is not a valid URL.' }, { status: 400 });
  }

  if (parsed.protocol !== 'https:' || !isProxiableMediaHost(parsed.hostname)) {
    return NextResponse.json({ error: 'FORBIDDEN_HOST', message: 'url must be an https Instagram/Meta CDN host.' }, { status: 403 });
  }

  let upstream: Response;
  try {
    upstream = await fetch(parsed.toString());
  } catch (err) {
    return NextResponse.json(
      { error: 'UPSTREAM_FETCH_FAILED', message: err instanceof Error ? err.message : String(err) },
      { status: 502 }
    );
  }

  if (!upstream.ok || !upstream.body) {
    return NextResponse.json({ error: 'UPSTREAM_FETCH_FAILED', message: `Upstream returned ${upstream.status}` }, { status: 502 });
  }

  const contentType = upstream.headers.get('content-type') ?? 'application/octet-stream';
  if (!contentType.startsWith('image/')) {
    return NextResponse.json({ error: 'UNEXPECTED_CONTENT_TYPE', message: contentType }, { status: 502 });
  }

  return new NextResponse(upstream.body, {
    status: 200,
    headers: {
      'Content-Type': contentType,
      // Instagram's own URLs carry a baked-in expiry — confirmed in
      // production to be as short as ~5 days, not the ~1-2 weeks this
      // comment used to assume (see DEFAULT_STALE_DAYS in
      // lib/ingest/stale-refresh.ts, tightened for the same reason).
      // 1hr caching here is still comfortably safe either way.
      'Cache-Control': 'public, max-age=3600, s-maxage=3600',
    },
  });
}
