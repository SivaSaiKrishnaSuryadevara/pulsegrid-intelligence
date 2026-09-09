/**
 * Shared allowlist + URL-building for `/api/media-proxy` (see that route's
 * header comment for why it exists — Instagram's CDN sets
 * `Cross-Origin-Resource-Policy: same-origin`, which unconditionally blocks
 * a direct `<img src="https://scontent-...">` on any other origin,
 * regardless of anything this app's own headers do). Used by the route
 * itself (to validate `url`) and by every component that renders a
 * potentially-Instagram-hosted image (`Avatar`, the creator card's media
 * strip), so the allowlist has exactly one definition.
 */

const ALLOWED_HOST_SUFFIXES = ['.cdninstagram.com', '.fbcdn.net'];

export function isProxiableMediaHost(hostname: string): boolean {
  return ALLOWED_HOST_SUFFIXES.some((suffix) => hostname.endsWith(suffix));
}

/**
 * Returns the URL to actually put in `src`: proxied if it's a
 * CORP-blocked host we know how to fetch server-side, unchanged otherwise
 * (e.g. an already-same-origin URL, or a future host that isn't
 * Instagram/Meta and doesn't have this problem).
 */
export function toDisplayableMediaUrl(rawUrl: string): string {
  let parsed: URL;
  try {
    parsed = new URL(rawUrl);
  } catch {
    return rawUrl;
  }
  if (parsed.protocol !== 'https:' || !isProxiableMediaHost(parsed.hostname)) {
    return rawUrl;
  }
  return `/api/media-proxy?url=${encodeURIComponent(rawUrl)}`;
}
