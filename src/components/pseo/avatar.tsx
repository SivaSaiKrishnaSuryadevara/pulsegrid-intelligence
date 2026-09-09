import { toDisplayableMediaUrl } from '@/lib/media-proxy';

interface AvatarProps {
  name: string;
  url: string | null;
  size?: number;
}

/**
 * Renders a creator's avatar, or a deterministic initials fallback when no
 * `avatar_url` is on file. Uses a plain `<img>` rather than `next/image`:
 * this project has no `next.config` remote-pattern allowlist configured yet
 * for third-party avatar hosts (e.g. Instagram's CDN), which `next/image`
 * requires at build time. Instagram-hosted URLs are routed through
 * `/api/media-proxy` (see that route's header comment) — a direct
 * `<img src>` to Instagram's CDN is unconditionally blocked by the browser
 * (Cross-Origin-Resource-Policy: same-origin on their response).
 */
export function Avatar({ name, url, size = 48 }: AvatarProps) {
  const dimension = `${size}px`;

  if (url) {
    return (
      // eslint-disable-next-line @next/next/no-img-element
      <img
        src={toDisplayableMediaUrl(url)}
        alt={name}
        style={{ width: dimension, height: dimension }}
        className="shrink-0 rounded-full object-cover"
      />
    );
  }

  const initials =
    name
      .split(' ')
      .map((part) => part.charAt(0))
      .filter(Boolean)
      .slice(0, 2)
      .join('')
      .toUpperCase() || '★';

  return (
    <div
      style={{ width: dimension, height: dimension }}
      className="flex shrink-0 items-center justify-center rounded-full bg-[#6366F1]/20 font-semibold text-[#a5b4fc]"
      aria-hidden="true"
    >
      {initials}
    </div>
  );
}
