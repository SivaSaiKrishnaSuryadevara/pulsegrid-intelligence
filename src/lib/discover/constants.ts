/** Static configuration for the Discover cockpit — filter options, bounds, and defaults. */

import type { AvailabilityFilter, FilterCriteria, PrimaryNiche } from '@/types/creator';

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
  selectedMetros: [],
  selectedNiches: [],
  secondaryLanguages: [],
  minER: ENGAGEMENT_RATE_BOUNDS.min,
  maxER: ENGAGEMENT_RATE_BOUNDS.max,
  hideConflicts: false,
  availabilityFilter: 'all',
};
