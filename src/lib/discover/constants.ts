/** Static configuration for the Discover cockpit — filter options, bounds, and defaults. */

import type { AvailabilityFilter, EntityType, EventPlannerDetails, FilterCriteria, MetroHub, PrimaryNiche, RepType } from '@/types/creator';

/**
 * The 5 hubs the Metro Hub filter chip actually offers, with the exact
 * display copy this cockpit uses (deliberately distinct from
 * `METRO_LABELS` in `src/lib/pseo/directory-config.ts`, whose copy is
 * tuned for public SEO page titles, not a filter chip). Narrower than the
 * full `METRO_HUBS` enum on purpose — TRI_STATE_NY_NJ/ATLANTA_GA/
 * CHICAGO_IL stay valid, filterable-by-search values and keep their pSEO
 * directory pages, they're just not offered as a Metro Hub chip option
 * (matching how `LAUNCH_METROS` already treats CHICAGO_IL as enum-valid
 * but not launched).
 */
export const PRIMARY_METRO_FILTER_OPTIONS: { metro: MetroHub; label: string }[] = [
  { metro: 'DFW_TEXAS', label: 'Dallas–Fort Worth (DFW)' },
  { metro: 'AUSTIN_TX', label: 'Austin (ATX)' },
  { metro: 'HOUSTON_TX', label: 'Houston (HOU)' },
  { metro: 'DMV_NOVA', label: 'Washington DC / MD / VA (DMV)' },
  { metro: 'CLT_CAROLINAS', label: 'Carolinas (CLT / Triangle)' },
];

/** Shared across the creator card, detail drawer, and filter strip's Desk Status chip. */
export const REP_TYPE_DISPLAY_LABELS: Record<RepType, string> = {
  DIRECT_MANAGER: 'Direct Manager Desk',
  TALENT_AGENCY: 'Talent Agency Desk',
  SELF_REPRESENTED: 'Self-Represented Desk',
  UNVERIFIED_BIO: 'Unverified Desk',
};

/**
 * Plain, internal-facing niche labels for the agency-facing cockpit — kept
 * deliberately distinct from `NICHE_LABELS` in `src/lib/pseo/directory-config.ts`,
 * whose SEO-flavored copy ("Bollywood Nightlife", "Telugu Emcees") is tuned
 * for public search pages, not a filter chip.
 */
export const NICHE_DISPLAY_LABELS: Record<PrimaryNiche, string> = {
  CULTURAL_EVENTS: 'Cultural Events',
  NIGHTLIFE: 'Nightlife',
  LUXURY_BRIDAL: 'Luxury Bridal',
  STAGE_EMCEE: 'Stage Emcee',
  FOOD_DINING: 'Food & Dining',
  CHOREOGRAPHY: 'Choreography',
};

export const ENTITY_TYPE_DISPLAY_LABELS: Record<EntityType, string> = {
  solo_creator: 'Solo Creator',
  stage_emcee: 'Stage Emcee',
  dance_troupe: 'Dance Troupe',
  local_dj: 'DJ & Sound',
  event_planner: 'Event Planner',
};

export const ENTITY_TYPE_EMOJI: Record<EntityType, string> = {
  solo_creator: '🎤',
  stage_emcee: '🎤',
  dance_troupe: '💃',
  local_dj: '🎧',
  event_planner: '🏛️',
};

/**
 * Shown by the filter strip's dialect/genre chip instead of `LANGUAGE_OPTIONS`
 * when `local_dj` is the (or one of the) selected entity type(s) — same
 * underlying `FilterCriteria.secondaryLanguages` field, matched against
 * `entityDetails.genreTags` instead of `secondaryLanguages` for DJ rows (see
 * `matchesFilters`). Placeholder list — edit freely before shipping.
 */
export const DJ_GENRE_TAG_OPTIONS: readonly string[] = [
  'Tollywood Mass',
  'Bollywood',
  'Bhangra / Punjabi',
  'EDM',
  'Hip-Hop / Top 40',
  'Garba / Raas',
  'Sufi / Qawwali',
  'Afrobeats',
];

export const VENUE_SCALE_LABELS: Record<EventPlannerDetails['venueScaleBracket'], string> = {
  boutique: 'Boutique 100–500',
  mid_scale: 'Mid-Scale 500–2,000',
  grand: 'Festival 2,000–10,000+',
};

export const LANGUAGE_OPTIONS: readonly string[] = [
  'Telugu',
  'Hindi',
  'Punjabi',
  'Tamil',
  'Gujarati',
  'Urdu',
  'Malayalam',
  'Kannada',
  'English',
];

export const ENGAGEMENT_RATE_BOUNDS = { min: 1, max: 15, step: 0.1 } as const;

export interface AvailabilityModeOption {
  value: AvailabilityFilter;
  label: string;
  helperText: string | null;
}

export const AVAILABILITY_MODE_OPTIONS: AvailabilityModeOption[] = [
  { value: 'all', label: 'All Statuses', helperText: null },
  { value: 'immediate_only', label: '⚡ Fast Turnaround Only', helperText: '< 48 hrs typical response' },
  { value: 'exclude_closed', label: 'Exclude Closed / Overbooked', helperText: null },
];

export const DEFAULT_FILTER_CRITERIA: FilterCriteria = {
  searchQuery: '',
  selectedEntityTypes: [],
  selectedMetros: [],
  selectedNiches: [],
  selectedRepTypes: [],
  secondaryLanguages: [],
  // null, not ENGAGEMENT_RATE_BOUNDS.min — a non-null default silently
  // hid every real small-vendor account under 1% engagement (confirmed:
  // 3 of 16 legitimate discovered entities) with no visible "active
  // filter" indicator, since the count check only fires when min exceeds
  // the bound. The slider still visually rests at the bound (see
  // `value.minER ?? ENGAGEMENT_RATE_BOUNDS.min` in filter-strip.tsx) —
  // this only changes what's true before a user touches it.
  minER: null,
  maxER: ENGAGEMENT_RATE_BOUNDS.max,
  hideConflicts: false,
  availabilityFilter: 'all',
  entityDetailFilters: {
    minTroupeSize: null,
    venueScaleBracket: null,
    avSpecIncluded: null,
  },
};
