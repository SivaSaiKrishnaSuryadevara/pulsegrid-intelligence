import type { Metadata } from 'next';

import { SITE_NAME, SITE_URL } from '@/lib/pseo/directory-config';

import './globals.css';

export const metadata: Metadata = {
  metadataBase: new URL(SITE_URL),
  title: {
    default: SITE_NAME,
    template: `%s | ${SITE_NAME}`,
  },
  description: 'Verified creator intelligence, event-organizer directory, and automated client-pitching platform.',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
