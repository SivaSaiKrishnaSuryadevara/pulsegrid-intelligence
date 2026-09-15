import { Analytics } from '@vercel/analytics/next';
import type { Metadata } from 'next';
import { Playfair_Display } from 'next/font/google';

import { SITE_NAME, SITE_URL } from '@/lib/pseo/directory-config';

import './globals.css';

/**
 * Self-hosted via next/font (no runtime Google Fonts request, no layout
 * shift) — exposed as the --font-playfair CSS variable, which globals.css
 * maps onto Tailwind's `font-serif` utility so every editorial heading
 * just uses `font-serif` rather than a bespoke class name.
 */
const playfairDisplay = Playfair_Display({
  subsets: ['latin'],
  weight: ['500', '600', '700'],
  style: ['normal', 'italic'],
  variable: '--font-playfair',
  display: 'swap',
});

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
    <html lang="en" className={playfairDisplay.variable}>
      <body>
        {children}
        <Analytics />
      </body>
    </html>
  );
}
