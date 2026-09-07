import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';

import { Avatar } from '@/components/pseo/avatar';
import { formatCompactNumber, formatPercent } from '@/lib/format';
import { METRO_LABELS, NICHE_LABELS, SITE_NAME, SITE_URL } from '@/lib/pseo/directory-config';
import { getCreatorMediaKit, getVerifiedCreatorHandles, type CreatorMediaKit } from '@/lib/pseo/queries';
import type { BookingStatus, RepType } from '@/types/creator';

interface VerifiedPageProps {
  params: Promise<{ handle: string }>;
}

const REP_TYPE_LABELS: Record<RepType, string> = {
  DIRECT_MANAGER: 'Direct Manager Represented',
  TALENT_AGENCY: 'Talent Agency Represented',
  SELF_REPRESENTED: 'Self-Represented',
  UNVERIFIED_BIO: 'Representation Unverified',
};

// =====================================================================================
// Static generation — pre-render every currently verified handle; new creators added
// between builds still resolve on demand (dynamicParams stays true).
// =====================================================================================

export async function generateStaticParams(): Promise<{ handle: string }[]> {
  const handles = await getVerifiedCreatorHandles();
  return handles.map((record) => ({ handle: record.handle }));
}

export const dynamicParams = true;
export const revalidate = 3600; // 1 hour — metrics/blackouts refresh often enough to warrant this

// =====================================================================================
// Metadata
// =====================================================================================

export async function generateMetadata({ params }: VerifiedPageProps): Promise<Metadata> {
  const { handle } = await params;
  const mediaKit = await getCreatorMediaKit(handle);

  if (!mediaKit) {
    return { title: `Creator Not Found | ${SITE_NAME}` };
  }

  const { creator } = mediaKit;
  const nicheLabel = NICHE_LABELS[creator.primaryNiche].label;
  const metroLabel = METRO_LABELS[creator.primaryMetro].label;
  const title = `${creator.displayName} (@${creator.handle}) — Verified ${nicheLabel} Creator in ${metroLabel} | ${SITE_NAME}`;
  const description = `${creator.displayName} is a ${SITE_NAME}-verified ${nicheLabel.toLowerCase()} creator in ${metroLabel}. See engagement benchmarks, booking availability, and representation details.`;
  const canonicalUrl = `${SITE_URL}/verified/${creator.handle}`;

  return {
    title,
    description,
    alternates: { canonical: canonicalUrl },
    openGraph: {
      title,
      description,
      url: canonicalUrl,
      siteName: SITE_NAME,
      type: 'profile',
      username: creator.handle,
      ...(creator.avatarUrl
        ? { images: [{ url: creator.avatarUrl, width: 400, height: 400, alt: creator.displayName }] }
        : {}),
    },
    twitter: {
      card: 'summary',
      title,
      description,
    },
  };
}

// =====================================================================================
// Structured data
// =====================================================================================

function buildPersonJsonLd(mediaKit: CreatorMediaKit) {
  const { creator } = mediaKit;
  const nicheLabel = NICHE_LABELS[creator.primaryNiche].label;
  const metroLabel = METRO_LABELS[creator.primaryMetro].label;

  return {
    '@context': 'https://schema.org',
    '@type': 'Person',
    name: creator.displayName,
    alternateName: `@${creator.handle}`,
    jobTitle: nicheLabel,
    description: `${SITE_NAME}-verified ${nicheLabel.toLowerCase()} creator based in ${metroLabel}.`,
    ...(creator.avatarUrl ? { image: creator.avatarUrl } : {}),
    url: `${SITE_URL}/verified/${creator.handle}`,
    sameAs: [`https://www.instagram.com/${creator.handle}/`],
    areaServed: { '@type': 'AdministrativeArea', name: metroLabel },
  };
}

// =====================================================================================
// Display helpers
// =====================================================================================

interface TurnaroundBadge {
  icon: string;
  label: string;
}

function getTurnaroundStatus(bookingStatus: BookingStatus, hasActiveBlackout: boolean): TurnaroundBadge {
  if (hasActiveBlackout || bookingStatus === 'blackout_period') {
    return { icon: '🔴', label: 'Active Blackout' };
  }
  if (bookingStatus === 'closed_roster') {
    return { icon: '🔴', label: 'Roster Closed' };
  }
  if (bookingStatus === 'high_demand_lead') {
    return { icon: '🟡', label: 'High Demand' };
  }
  return { icon: '⚡', label: 'Fast Turnaround' };
}

/**
 * Never renders the real contact value — only a masked placeholder derived
 * from it (first character of each segment, everything else replaced with
 * bullets). The `blur` class applied at the call site is purely cosmetic on
 * top of this; the true email/phone never reaches the rendered HTML, so
 * there is nothing for a scraper (or "view source") to recover.
 */
function maskContactValue(value: string | null): string {
  if (!value) {
    return 'On file — sign in to reveal';
  }
  if (value.includes('@')) {
    const [local = '', domain = ''] = value.split('@');
    const domainSegments = domain.split('.');
    const tld = domainSegments.pop() ?? '';
    const domainName = domainSegments.join('.');
    const maskedLocal = `${local.charAt(0) || '•'}${'•'.repeat(Math.max(3, local.length - 1))}`;
    const maskedDomain = `${domainName.charAt(0) || '•'}${'•'.repeat(Math.max(3, domainName.length - 1))}`;
    return `${maskedLocal}@${maskedDomain}.${tld}`;
  }
  const visibleTail = value.slice(-2);
  return `${'•'.repeat(Math.max(4, value.length - 2))}${visibleTail}`;
}

// =====================================================================================
// Page
// =====================================================================================

export default async function VerifiedCreatorPage({ params }: VerifiedPageProps) {
  const { handle } = await params;
  const mediaKit = await getCreatorMediaKit(handle);

  if (!mediaKit) {
    notFound();
  }

  const { creator, hasActiveBlackout } = mediaKit;
  const metroLabel = METRO_LABELS[creator.primaryMetro].label;
  const nicheLabel = NICHE_LABELS[creator.primaryNiche].label;
  const turnaround = getTurnaroundStatus(creator.bookingStatus, hasActiveBlackout);
  const jsonLd = buildPersonJsonLd(mediaKit);
  const maskedContact = maskContactValue(creator.directBookingEmail ?? creator.directBookingPhone);

  return (
    <main className="min-h-screen bg-[#0B0D17] text-slate-100">
      <script
        type="application/ld+json"
        // eslint-disable-next-line react/no-danger
        dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd).replace(/</g, '\\u003c') }}
      />

      {/* Header */}
      <header className="border-b border-[#1E2337] bg-gradient-to-b from-[#131728] to-[#0B0D17] px-6 py-14 sm:px-10">
        <div className="mx-auto flex max-w-4xl flex-col items-center text-center">
          <div className="relative">
            <Avatar name={creator.displayName} url={creator.avatarUrl} size={96} />
            <span
              className="absolute -bottom-1 -right-1 flex h-7 w-7 items-center justify-center rounded-full bg-[#6366F1] ring-4 ring-[#0B0D17]"
              aria-label="Verified creator"
              title="Verified creator"
            >
              <CheckIcon className="h-4 w-4 text-white" />
            </span>
          </div>

          <h1 className="mt-5 text-3xl font-bold text-white sm:text-4xl">{creator.displayName}</h1>
          <p className="mt-1 text-slate-400">@{creator.handle}</p>

          <div className="mt-5 flex flex-wrap items-center justify-center gap-2">
            <span className="rounded-full border border-[#1E2337] bg-[#131728] px-3 py-1 text-xs font-medium text-slate-300">
              📍 {metroLabel}
            </span>
            <span className="rounded-full border border-[#1E2337] bg-[#131728] px-3 py-1 text-xs font-medium text-slate-300">
              {nicheLabel}
            </span>
            {creator.secondaryLanguages.map((language) => (
              <span
                key={language}
                className="rounded-full border border-[#6366F1]/30 bg-[#6366F1]/10 px-3 py-1 text-xs font-medium text-[#a5b4fc]"
              >
                {language}
              </span>
            ))}
          </div>
        </div>
      </header>

      {/* Performance metrics */}
      <section className="px-6 py-10 sm:px-10">
        <div className="mx-auto grid max-w-4xl grid-cols-2 gap-4 sm:grid-cols-4">
          <MetricTile label="Followers" value={formatCompactNumber(creator.followerCount)} />
          <MetricTile label="30-Day Avg. Reel Views" value={formatCompactNumber(creator.avgReelViews)} />
          <MetricTile label="Engagement Rate" value={formatPercent(creator.engagementRate)} accent />
          <MetricTile label="Turnaround" value={`${turnaround.icon} ${turnaround.label}`} />
        </div>
      </section>

      {/* Sample reels */}
      <section className="border-t border-[#1E2337] px-6 py-14 sm:px-10">
        <div className="mx-auto max-w-4xl">
          <h2 className="text-xl font-semibold text-white">Representative Reel Performance</h2>
          <p className="mt-1 text-sm text-slate-500">
            Illustrative — reflects {creator.displayName}&apos;s average reel performance rather than three
            individually tracked posts.
          </p>
          <div className="mt-6 grid grid-cols-1 gap-5 sm:grid-cols-3">
            {[0, 1, 2].map((index) => (
              <ReelPreviewCard key={index} avgReelViews={creator.avgReelViews} />
            ))}
          </div>
        </div>
      </section>

      {/* Gated representation card */}
      <section className="border-t border-[#1E2337] px-6 py-14 sm:px-10">
        <div className="mx-auto max-w-2xl rounded-3xl border border-[#1E2337] bg-[#131728] p-8">
          <p className="text-xs font-medium uppercase tracking-wide text-slate-500">Representation</p>
          <p className="mt-2 text-lg font-semibold text-white">{REP_TYPE_LABELS[creator.repType]}</p>

          <div className="mt-6 select-none rounded-2xl border border-dashed border-[#1E2337] bg-[#0B0D17] p-5">
            <p className="text-xs uppercase tracking-wide text-slate-500">Booking Contact</p>
            <p className="mt-2 truncate font-mono text-lg text-slate-300 blur-[3px]" aria-hidden="true">
              {maskedContact}
            </p>
          </div>

          <Link
            href={`/sign-in?next=${encodeURIComponent(`/verified/${creator.handle}`)}`}
            className="mt-6 inline-flex w-full items-center justify-center rounded-full bg-[#6366F1] px-6 py-3 text-center text-sm font-semibold text-white transition hover:bg-[#5457e5]"
          >
            Sign In to Reveal Direct Booking Desk &amp; 90-Day Conflict Radar
          </Link>
        </div>
      </section>
    </main>
  );
}

// =====================================================================================
// Presentational subcomponents
// =====================================================================================

function MetricTile({ label, value, accent = false }: { label: string; value: string; accent?: boolean }) {
  return (
    <div className="rounded-2xl border border-[#1E2337] bg-[#131728] p-5 text-center">
      <p className="text-xs uppercase tracking-wide text-slate-500">{label}</p>
      <p className={`mt-2 text-xl font-bold ${accent ? 'text-[#a5b4fc]' : 'text-white'}`}>{value}</p>
    </div>
  );
}

function ReelPreviewCard({ avgReelViews }: { avgReelViews: number | null }) {
  return (
    <div className="overflow-hidden rounded-2xl border border-[#1E2337] bg-[#131728]">
      <div className="flex aspect-[9/16] items-center justify-center bg-gradient-to-br from-[#1E2337] to-[#131728]">
        <PlayIcon className="h-10 w-10 text-[#6366F1]" />
      </div>
      <div className="p-3 text-center">
        <p className="text-sm font-semibold text-white">{formatCompactNumber(avgReelViews)} views</p>
        <p className="text-xs text-slate-500">Est. avg. performance</p>
      </div>
    </div>
  );
}

function CheckIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 20 20" fill="currentColor" className={className} aria-hidden="true">
      <path
        fillRule="evenodd"
        d="M16.704 5.29a1 1 0 010 1.415l-7.09 7.09a1 1 0 01-1.415 0L4.296 9.89a1 1 0 111.415-1.415l3.198 3.198 6.382-6.382a1 1 0 011.413 0z"
        clipRule="evenodd"
      />
    </svg>
  );
}

function PlayIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="currentColor" className={className} aria-hidden="true">
      <path d="M8 5.14v13.72a1 1 0 001.5.87l11-6.86a1 1 0 000-1.72l-11-6.86A1 1 0 008 5.14z" />
    </svg>
  );
}
