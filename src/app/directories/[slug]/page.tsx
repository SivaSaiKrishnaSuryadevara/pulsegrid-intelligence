import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';

import { Avatar } from '@/components/pseo/avatar';
import { formatCompactNumber, formatPercent } from '@/lib/format';
import {
  SITE_NAME,
  SITE_URL,
  getAllDirectoryConfigs,
  getDirectoryConfigBySlug,
  getSiblingDirectoryConfigs,
  type DirectoryPageConfig,
} from '@/lib/pseo/directory-config';
import { getDirectoryPageData } from '@/lib/pseo/queries';
import type { BookingStatus, CreatorProfile, EnterpriseType, EventEnterprise } from '@/types/creator';

interface DirectoryPageProps {
  params: Promise<{ slug: string }>;
}

const ENTERPRISE_TYPE_LABELS: Record<EnterpriseType, string> = {
  NIGHTLIFE_PROMOTER: 'Nightlife Promoter',
  CONVENTION_BOARD: 'Convention Board',
  WEDDING_PRODUCER: 'Wedding Producer',
  CONCERT_ORGANIZER: 'Concert Organizer',
};

const BOOKING_STATUS_LABELS: Record<BookingStatus, string> = {
  available_immediate: 'Available Now',
  high_demand_lead: 'High Demand',
  blackout_period: 'In Blackout',
  closed_roster: 'Roster Closed',
};

// =====================================================================================
// Static generation — the directory universe is a fixed, curated combinatorial set
// (see src/lib/pseo/directory-config.ts), so every valid slug is pre-rendered at build
// time and anything outside that set 404s rather than attempting an on-demand render.
// =====================================================================================

export function generateStaticParams(): { slug: string }[] {
  return getAllDirectoryConfigs().map((config) => ({ slug: config.slug }));
}

export const dynamicParams = false;
export const revalidate = 21600; // 6 hours — rosters/promoters change slowly enough for this cadence

// =====================================================================================
// Metadata
// =====================================================================================

export async function generateMetadata({ params }: DirectoryPageProps): Promise<Metadata> {
  const { slug } = await params;
  const config = getDirectoryConfigBySlug(slug);

  if (!config) {
    return { title: `Directory Not Found | ${SITE_NAME}` };
  }

  const title = `${config.nicheLabel} Talent & Promoters in ${config.metroLabel} | ${SITE_NAME}`;
  const description = `Browse verified ${config.nicheLabel.toLowerCase()} creators and event promoters in ${config.metroLabel}. Engagement benchmarks, booking availability, and vetted contacts for PR agencies and event planners.`;
  const canonicalUrl = `${SITE_URL}/directories/${config.slug}`;

  return {
    title,
    description,
    alternates: { canonical: canonicalUrl },
    openGraph: {
      title,
      description,
      url: canonicalUrl,
      siteName: SITE_NAME,
      type: 'website',
      locale: 'en_US',
    },
    twitter: {
      card: 'summary_large_image',
      title,
      description,
    },
  };
}

// =====================================================================================
// Structured data
// =====================================================================================

function buildItemListJsonLd(config: DirectoryPageConfig, enterprises: EventEnterprise[]) {
  return {
    '@context': 'https://schema.org',
    '@type': 'ItemList',
    name: `${config.nicheLabel} Promoters & Organizers in ${config.metroLabel}`,
    description: `Verified ${config.nicheLabel.toLowerCase()} event promoters and organizers in ${config.metroLabel}, curated by ${SITE_NAME}.`,
    numberOfItems: enterprises.length,
    itemListElement: enterprises.map((enterprise, index) => ({
      '@type': 'ListItem',
      position: index + 1,
      item: {
        '@type': 'Organization',
        name: enterprise.businessName,
        url: `${SITE_URL}/directories/${config.slug}`,
        sameAs: [`https://www.instagram.com/${enterprise.instagramHandle}/`],
      },
    })),
  };
}

// =====================================================================================
// Page
// =====================================================================================

export default async function DirectoryPage({ params }: DirectoryPageProps) {
  const { slug } = await params;
  const config = getDirectoryConfigBySlug(slug);

  if (!config) {
    notFound();
  }

  const { enterprises, creators } = await getDirectoryPageData(config);
  const jsonLd = buildItemListJsonLd(config, enterprises);

  return (
    <main className="min-h-screen bg-[#0B0D17] text-slate-100">
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd).replace(/</g, '\\u003c') }}
      />

      {/* Hero */}
      <section className="border-b border-[#1E2337] bg-gradient-to-b from-[#131728] to-[#0B0D17] px-6 py-16 sm:px-10 lg:px-16">
        <div className="mx-auto max-w-6xl">
          <div className="flex flex-wrap items-center gap-2 text-xs font-medium uppercase tracking-wide text-slate-400">
            <span className="rounded-full border border-[#1E2337] bg-[#131728] px-3 py-1">{config.metroShortLabel}</span>
            <span className="rounded-full border border-[#1E2337] bg-[#131728] px-3 py-1">{config.nicheLabel}</span>
            <span className="rounded-full border border-[#6366F1]/40 bg-[#6366F1]/10 px-3 py-1 text-[#a5b4fc]">
              Verified Directory
            </span>
          </div>
          <h1 className="mt-6 max-w-3xl text-4xl font-bold tracking-tight text-white sm:text-5xl">
            Verified {config.nicheLabel} Talent &amp; Promoters in {config.metroLabel}
          </h1>
          <p className="mt-4 max-w-2xl text-lg text-slate-400">
            {config.nicheDescription}. Built for PR agencies and event planners who need vetted contacts, real
            engagement benchmarks, and booking availability — not cold DMs.
          </p>
        </div>
      </section>

      {/* Promoters / organizers grid */}
      <section className="px-6 py-14 sm:px-10 lg:px-16">
        <div className="mx-auto max-w-6xl">
          <h2 className="text-2xl font-semibold text-white">Event Promoters &amp; Organizers</h2>
          <p className="mt-2 text-sm text-slate-400">
            Verified {config.metroLabel} businesses running {config.nicheLabel.toLowerCase()} programming.
          </p>

          {enterprises.length > 0 ? (
            <div className="mt-8 grid grid-cols-1 gap-5 md:grid-cols-2">
              {enterprises.map((enterprise) => (
                <EnterpriseCard key={enterprise.id} enterprise={enterprise} />
              ))}
            </div>
          ) : (
            <DirectoryEmptyState config={config} kind="promoters" />
          )}
        </div>
      </section>

      {/* Creator preview roster */}
      <section className="border-t border-[#1E2337] px-6 py-14 sm:px-10 lg:px-16">
        <div className="mx-auto max-w-6xl">
          <h2 className="text-2xl font-semibold text-white">Verified Creators</h2>
          <p className="mt-2 text-sm text-slate-400">
            A preview of {config.nicheLabel.toLowerCase()} creators active in {config.metroLabel}.
          </p>

          {creators.length > 0 ? (
            <div className="mt-8 grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-3">
              {creators.map((creator) => (
                <CreatorPreviewCard key={creator.id} creator={creator} />
              ))}
            </div>
          ) : (
            <DirectoryEmptyState config={config} kind="creators" />
          )}
        </div>
      </section>

      {/* Conversion banner */}
      <section className="border-t border-[#1E2337] bg-gradient-to-b from-[#0B0D17] to-[#131728] px-6 py-16 sm:px-10 lg:px-16">
        <div className="mx-auto max-w-4xl rounded-3xl border border-[#6366F1]/30 bg-[#131728] p-10 text-center">
          <h2 className="text-2xl font-bold text-white sm:text-3xl">
            Unlock the Full {config.metroLabel} Discovery Grid
          </h2>
          <p className="mx-auto mt-3 max-w-xl text-slate-400">
            Sign in to see every verified {config.nicheLabel.toLowerCase()} creator and promoter in{' '}
            {config.metroLabel}, run 90-day brand-conflict checks, and reveal direct booking contacts.
          </p>
          <div className="mt-8 flex flex-wrap items-center justify-center gap-3">
            <Link
              href={`/sign-up?directory=${config.slug}`}
              className="rounded-full bg-[#6366F1] px-6 py-3 text-sm font-semibold text-white transition hover:bg-[#5457e5]"
            >
              Access Full Directory
            </Link>
            <Link
              href="/sign-in"
              className="rounded-full border border-[#1E2337] px-6 py-3 text-sm font-semibold text-slate-300 transition hover:border-[#6366F1] hover:text-white"
            >
              Sign In
            </Link>
          </div>
        </div>
      </section>
    </main>
  );
}

// =====================================================================================
// Presentational subcomponents
// =====================================================================================

function EnterpriseCard({ enterprise }: { enterprise: EventEnterprise }) {
  return (
    <div className="rounded-2xl border border-[#1E2337] bg-[#131728] p-6 transition hover:border-[#6366F1]/50">
      <div className="flex items-start justify-between gap-4">
        <div className="min-w-0">
          <h3 className="truncate text-lg font-semibold text-white">{enterprise.businessName}</h3>
          <p className="mt-1 text-sm text-slate-400">{ENTERPRISE_TYPE_LABELS[enterprise.enterpriseType]}</p>
        </div>
        <a
          href={`https://www.instagram.com/${enterprise.instagramHandle}/`}
          target="_blank"
          rel="noopener noreferrer"
          className="shrink-0 rounded-full border border-[#1E2337] px-3 py-1 text-xs font-medium text-slate-300 transition hover:border-[#6366F1] hover:text-[#a5b4fc]"
        >
          @{enterprise.instagramHandle}
        </a>
      </div>

      {enterprise.frequentVenues.length > 0 && (
        <div className="mt-4 flex flex-wrap gap-2">
          {enterprise.frequentVenues.slice(0, 4).map((venue) => (
            <span key={venue} className="rounded-full bg-[#0B0D17] px-2.5 py-1 text-xs text-slate-400">
              {venue}
            </span>
          ))}
        </div>
      )}

      {enterprise.ticketingUrl && (
        <a
          href={enterprise.ticketingUrl}
          target="_blank"
          rel="noopener noreferrer"
          className="mt-4 inline-flex text-sm font-medium text-[#818cf8] hover:text-[#a5b4fc]"
        >
          View ticketing →
        </a>
      )}
    </div>
  );
}

function CreatorPreviewCard({ creator }: { creator: CreatorProfile }) {
  return (
    <Link
      href={`/verified/${creator.handle}`}
      className="group block rounded-2xl border border-[#1E2337] bg-[#131728] p-6 transition hover:border-[#6366F1]/50"
    >
      <div className="flex items-center gap-3">
        <Avatar name={creator.displayName} url={creator.avatarUrl} size={48} />
        <div className="min-w-0">
          <p className="truncate font-semibold text-white">{creator.displayName}</p>
          <p className="truncate text-sm text-slate-400">@{creator.handle}</p>
        </div>
      </div>

      <dl className="mt-5 grid grid-cols-2 gap-3 text-sm">
        <div>
          <dt className="text-slate-500">Engagement</dt>
          <dd className="font-semibold text-[#a5b4fc]">{formatPercent(creator.engagementRate)}</dd>
        </div>
        <div>
          <dt className="text-slate-500">Avg. Reel Views</dt>
          <dd className="font-semibold text-white">{formatCompactNumber(creator.avgReelViews)}</dd>
        </div>
      </dl>

      <span className="mt-5 inline-block rounded-full border border-[#1E2337] px-2.5 py-1 text-xs font-medium text-slate-400 transition group-hover:border-[#6366F1] group-hover:text-[#a5b4fc]">
        {BOOKING_STATUS_LABELS[creator.bookingStatus]}
      </span>
    </Link>
  );
}

function DirectoryEmptyState({ config, kind }: { config: DirectoryPageConfig; kind: 'promoters' | 'creators' }) {
  const siblings = getSiblingDirectoryConfigs(config);
  const subject = kind === 'promoters' ? 'promoters and organizers' : 'creators';

  return (
    <div className="mt-8 rounded-2xl border border-dashed border-[#1E2337] bg-[#131728]/60 p-10 text-center">
      <p className="text-slate-300">
        We&apos;re actively verifying {config.nicheLabel.toLowerCase()} {subject} in {config.metroLabel}. New
        listings are added weekly.
      </p>
      {siblings.length > 0 && (
        <div className="mt-6 flex flex-wrap items-center justify-center gap-3">
          <span className="text-sm text-slate-500">Explore {config.nicheLabel} in other hubs:</span>
          {siblings.map((sibling) => (
            <Link
              key={sibling.slug}
              href={`/directories/${sibling.slug}`}
              className="rounded-full border border-[#1E2337] px-3 py-1 text-sm text-[#a5b4fc] transition hover:border-[#6366F1]"
            >
              {sibling.metroShortLabel}
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
