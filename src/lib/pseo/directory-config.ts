/**
 * Programmatic-SEO directory configuration.
 *
 * This is the single source of truth for how metro_hub / primary_niche
 * enum values map to URL slugs and display copy. `src/app/directories/[slug]/page.tsx`,
 * `src/app/sitemap.ts`, and (indirectly, via generateStaticParams) the build
 * pipeline all read from `getAllDirectoryConfigs()` / `getDirectoryConfigBySlug()`
 * so the set of pages Next.js pre-renders and the set of URLs the sitemap
 * advertises can never drift apart.
 */

import type { EnterpriseType, MetroHub, PrimaryNiche } from '@/types/creator';

export const SITE_NAME = 'PulseGrid Intelligence';
export const SITE_URL = 'https://pulsegrid.io';

// =====================================================================================
// Full label dictionaries (cover every enum value, used generically across the app —
// e.g. rendering a creator's primaryMetro badge outside the directory pages).
// =====================================================================================

interface MetroLabel {
  label: string;
  shortLabel: string;
}

export const METRO_LABELS: Record<MetroHub, MetroLabel> = {
  DFW_TEXAS: { label: 'Dallas–Fort Worth, Texas', shortLabel: 'DFW' },
  DMV_NOVA: { label: 'Washington D.C., Maryland & Northern Virginia', shortLabel: 'DMV' },
  AUSTIN_TX: { label: 'Austin, Texas', shortLabel: 'ATX' },
  HOUSTON_TX: { label: 'Houston, Texas', shortLabel: 'HOU' },
  TRI_STATE_NY_NJ: { label: 'New York City & the Tri-State Area', shortLabel: 'NYC/NJ' },
  ATLANTA_GA: { label: 'Atlanta, Georgia', shortLabel: 'ATL' },
  CHICAGO_IL: { label: 'Chicago, Illinois', shortLabel: 'CHI' },
};

interface NicheLabel {
  label: string;
  description: string;
  relatedEnterpriseTypes: EnterpriseType[];
  /** When set, the directory page additionally filters creators to those listing this language. */
  languageFilter?: string;
}

export const NICHE_LABELS: Record<PrimaryNiche, NicheLabel> = {
  CULTURAL_EVENTS: {
    label: 'Desi Cultural Events',
    description: 'South Asian cultural festivals, community programming, and heritage celebrations',
    relatedEnterpriseTypes: ['CONVENTION_BOARD', 'CONCERT_ORGANIZER'],
  },
  NIGHTLIFE: {
    label: 'Bollywood Nightlife',
    description: 'Bollywood-driven nightlife promoters, club nights, and DJ-led events',
    relatedEnterpriseTypes: ['NIGHTLIFE_PROMOTER'],
  },
  LUXURY_BRIDAL: {
    label: 'Luxury Bridal',
    description: 'High-end South Asian wedding and bridal experience specialists',
    relatedEnterpriseTypes: ['WEDDING_PRODUCER'],
  },
  STAGE_EMCEE: {
    label: 'Telugu Emcees',
    description: 'Telugu-fluent stage hosts and emcees for weddings, galas, and community events',
    relatedEnterpriseTypes: ['WEDDING_PRODUCER', 'CONVENTION_BOARD', 'CONCERT_ORGANIZER'],
    languageFilter: 'Telugu',
  },
  FOOD_DINING: {
    label: 'Food & Dining',
    description: 'Restaurant openings, culinary pop-ups, and dining experience creators',
    relatedEnterpriseTypes: ['CONVENTION_BOARD'],
  },
  CHOREOGRAPHY: {
    label: 'Cultural Choreography',
    description: 'Choreographers and dance troupes for sangeets, showcases, and stage productions',
    relatedEnterpriseTypes: ['WEDDING_PRODUCER', 'CONCERT_ORGANIZER'],
  },
};

// =====================================================================================
// Launch-hub subsets — the curated combinatorial universe programmatic SEO pages exist
// for. Deliberately smaller than the full enum: not every metro/niche has a launch page.
// =====================================================================================

interface LaunchHub {
  slug: string;
  metro: MetroHub;
}

export const LAUNCH_METROS: LaunchHub[] = [
  { slug: 'dallas-tx', metro: 'DFW_TEXAS' },
  { slug: 'dmv-nova', metro: 'DMV_NOVA' },
  { slug: 'austin-tx', metro: 'AUSTIN_TX' },
  { slug: 'houston-tx', metro: 'HOUSTON_TX' },
  { slug: 'tri-state-ny-nj', metro: 'TRI_STATE_NY_NJ' },
  { slug: 'atlanta-ga', metro: 'ATLANTA_GA' },
];

interface LaunchNiche {
  slug: string;
  niche: PrimaryNiche;
}

export const LAUNCH_NICHES: LaunchNiche[] = [
  { slug: 'desi-events', niche: 'CULTURAL_EVENTS' },
  { slug: 'telugu-emcees', niche: 'STAGE_EMCEE' },
  { slug: 'bollywood-nightlife', niche: 'NIGHTLIFE' },
  { slug: 'luxury-bridal', niche: 'LUXURY_BRIDAL' },
  { slug: 'cultural-choreography', niche: 'CHOREOGRAPHY' },
];

// =====================================================================================
// Directory page configs — the {niche} x {metro} cartesian product
// =====================================================================================

export interface DirectoryPageConfig {
  slug: string;
  niche: PrimaryNiche;
  nicheSlug: string;
  nicheLabel: string;
  nicheDescription: string;
  relatedEnterpriseTypes: EnterpriseType[];
  languageFilter?: string;
  metro: MetroHub;
  metroSlug: string;
  metroLabel: string;
  metroShortLabel: string;
}

function buildDirectoryConfig(nicheHub: LaunchNiche, metroHub: LaunchHub): DirectoryPageConfig {
  const nicheMeta = NICHE_LABELS[nicheHub.niche];
  const metroMeta = METRO_LABELS[metroHub.metro];

  return {
    slug: `${nicheHub.slug}-${metroHub.slug}`,
    niche: nicheHub.niche,
    nicheSlug: nicheHub.slug,
    nicheLabel: nicheMeta.label,
    nicheDescription: nicheMeta.description,
    relatedEnterpriseTypes: nicheMeta.relatedEnterpriseTypes,
    languageFilter: nicheMeta.languageFilter,
    metro: metroHub.metro,
    metroSlug: metroHub.slug,
    metroLabel: metroMeta.label,
    metroShortLabel: metroMeta.shortLabel,
  };
}

let cachedConfigs: DirectoryPageConfig[] | null = null;

/** Every launch-niche × launch-metro combination PulseGrid pre-renders a directory page for. */
export function getAllDirectoryConfigs(): DirectoryPageConfig[] {
  if (cachedConfigs) {
    return cachedConfigs;
  }
  cachedConfigs = LAUNCH_NICHES.flatMap((nicheHub) =>
    LAUNCH_METROS.map((metroHub) => buildDirectoryConfig(nicheHub, metroHub))
  );
  return cachedConfigs;
}

export function getDirectoryConfigBySlug(slug: string): DirectoryPageConfig | undefined {
  return getAllDirectoryConfigs().find((config) => config.slug === slug);
}

/** Sibling pages for the same niche across other launch metros — used for internal linking on thin/empty-state pages. */
export function getSiblingDirectoryConfigs(config: DirectoryPageConfig, limit = 3): DirectoryPageConfig[] {
  return getAllDirectoryConfigs()
    .filter((candidate) => candidate.niche === config.niche && candidate.slug !== config.slug)
    .slice(0, limit);
}
