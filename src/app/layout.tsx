import type { Metadata } from 'next';

import { SITE_NAME, SITE_URL } from '@/lib/pseo/directory-config';

import './globals.css';

/**
 * `metadataBase` is evaluated at module scope during the build, so a
 * malformed NEXT_PUBLIC_SITE_URL (e.g. a placeholder like
 * "https://<your-project-slug>.vercel.app" pasted verbatim into a
 * deployment's env vars instead of the real domain) would otherwise throw
 * `TypeError: Invalid URL` and fail the entire production build. Falling
 * back to the real production domain keeps that one bad env var from
 * taking down every route.
 */
function resolveMetadataBase(url: string): URL {
  try {
    return new URL(url);
  } catch {
    console.error(`[layout] NEXT_PUBLIC_SITE_URL="${url}" is not a valid URL — falling back to https://www.pulsegridos.com`);
    return new URL('https://www.pulsegridos.com');
  }
}

export const metadata: Metadata = {
  metadataBase: resolveMetadataBase(SITE_URL),
  title: {
    default: SITE_NAME,
    template: `%s | ${SITE_NAME}`,
  },
  description:
    'The Event Production & Cultural Media Intelligence OS — verified South Asian event-vendor directory and regional creator campaign platform.',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
