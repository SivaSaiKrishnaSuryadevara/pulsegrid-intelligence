/** Pure filter-matching logic for the Discover cockpit — no React, no I/O, easy to unit test. */

import { METRO_LABELS } from '@/lib/pseo/directory-config';
import type { CreatorCardModel, FilterCriteria } from '@/types/creator';
import {
  ENGAGEMENT_RATE_BOUNDS,
  ENTITY_TYPE_DISPLAY_LABELS,
  NICHE_DISPLAY_LABELS,
  REP_TYPE_DISPLAY_LABELS,
  VENUE_SCALE_LABELS,
} from './constants';

/** True if `creator` satisfies every active dimension of `criteria`. */
export function matchesFilters(creator: CreatorCardModel, criteria: FilterCriteria): boolean {
  const query = criteria.searchQuery.trim().toLowerCase();
  if (query) {
    const haystack = `${creator.displayName} ${creator.handle}`.toLowerCase();
    if (!haystack.includes(query)) {
      return false;
    }
  }

  if (criteria.selectedEntityTypes.length > 0 && !criteria.selectedEntityTypes.includes(creator.entityType)) {
    return false;
  }

  if (criteria.selectedMetros.length > 0 && !criteria.selectedMetros.includes(creator.primaryMetro)) {
    return false;
  }

  if (criteria.selectedNiches.length > 0 && !criteria.selectedNiches.includes(creator.primaryNiche)) {
    return false;
  }

  if (criteria.selectedRepTypes.length > 0 && !criteria.selectedRepTypes.includes(creator.repType)) {
    return false;
  }

  if (criteria.secondaryLanguages.length > 0) {
    // The dialect/genre chip doubles as the DJ genre-tag filter (same
    // FilterCriteria field, different comparison target) — see
    // DJ_GENRE_TAG_OPTIONS in constants.ts.
    const tags =
      creator.entityDetails.kind === 'local_dj' ? creator.entityDetails.genreTags : creator.secondaryLanguages;
    const matchesRequestedTag = criteria.secondaryLanguages.some((tag) => tags.includes(tag));
    if (!matchesRequestedTag) {
      return false;
    }
  }

  if (
    criteria.entityDetailFilters.minTroupeSize !== null &&
    creator.entityDetails.kind === 'dance_troupe' &&
    creator.entityDetails.troupeSize < criteria.entityDetailFilters.minTroupeSize
  ) {
    return false;
  }

  if (
    criteria.entityDetailFilters.venueScaleBracket !== null &&
    creator.entityDetails.kind === 'event_planner' &&
    creator.entityDetails.venueScaleBracket !== criteria.entityDetailFilters.venueScaleBracket
  ) {
    return false;
  }

  if (criteria.entityDetailFilters.avSpecIncluded !== null && creator.entityDetails.kind === 'local_dj') {
    const hasFullRig = Boolean(creator.entityDetails.avSpecNotes);
    if (hasFullRig !== criteria.entityDetailFilters.avSpecIncluded) {
      return false;
    }
  }

  const engagementRate = creator.engagementRate ?? 0;
  if (criteria.minER !== null && engagementRate < criteria.minER) {
    return false;
  }
  if (criteria.maxER !== null && engagementRate > criteria.maxER) {
    return false;
  }

  if (criteria.availabilityFilter === 'immediate_only' && creator.bookingStatus !== 'available_immediate') {
    return false;
  }
  if (criteria.availabilityFilter === 'exclude_closed' && creator.bookingStatus === 'closed_roster') {
    return false;
  }

  if (criteria.hideConflicts && creator.activeBlackouts.length > 0) {
    return false;
  }

  return true;
}

/** How many filter dimensions are currently non-default — drives the sidebar/header badge. */
export function countActiveFilters(criteria: FilterCriteria): number {
  let count = 0;
  if (criteria.searchQuery.trim().length > 0) count += 1;
  count += criteria.selectedEntityTypes.length;
  count += criteria.selectedMetros.length;
  count += criteria.selectedNiches.length;
  count += criteria.selectedRepTypes.length;
  count += criteria.secondaryLanguages.length;
  if (criteria.minER !== null && criteria.minER > ENGAGEMENT_RATE_BOUNDS.min) count += 1;
  if (criteria.maxER !== null && criteria.maxER < ENGAGEMENT_RATE_BOUNDS.max) count += 1;
  if (criteria.availabilityFilter !== 'all') count += 1;
  if (criteria.hideConflicts) count += 1;
  if (criteria.entityDetailFilters.minTroupeSize !== null) count += 1;
  if (criteria.entityDetailFilters.venueScaleBracket !== null) count += 1;
  if (criteria.entityDetailFilters.avSpecIncluded !== null) count += 1;
  return count;
}

/** Short human-readable labels for each active filter dimension — used for header badges. */
export function describeActiveFilters(criteria: FilterCriteria): string[] {
  const badges: string[] = [];

  const query = criteria.searchQuery.trim();
  if (query) badges.push(`"${query}"`);

  for (const entityType of criteria.selectedEntityTypes) {
    badges.push(ENTITY_TYPE_DISPLAY_LABELS[entityType]);
  }
  for (const metro of criteria.selectedMetros) {
    badges.push(METRO_LABELS[metro].shortLabel);
  }
  for (const niche of criteria.selectedNiches) {
    badges.push(NICHE_DISPLAY_LABELS[niche]);
  }
  for (const repType of criteria.selectedRepTypes) {
    badges.push(REP_TYPE_DISPLAY_LABELS[repType]);
  }
  for (const language of criteria.secondaryLanguages) {
    badges.push(language);
  }

  const minER = criteria.minER ?? ENGAGEMENT_RATE_BOUNDS.min;
  const maxER = criteria.maxER ?? ENGAGEMENT_RATE_BOUNDS.max;
  if (minER > ENGAGEMENT_RATE_BOUNDS.min || maxER < ENGAGEMENT_RATE_BOUNDS.max) {
    badges.push(`ER ${minER.toFixed(1)}–${maxER.toFixed(1)}%`);
  }

  if (criteria.availabilityFilter === 'immediate_only') badges.push('Fast Turnaround Only');
  if (criteria.availabilityFilter === 'exclude_closed') badges.push('Excl. Closed/Overbooked');
  if (criteria.hideConflicts) badges.push('No Active Conflicts');

  if (criteria.entityDetailFilters.minTroupeSize !== null) {
    badges.push(`${criteria.entityDetailFilters.minTroupeSize}+ Dancers`);
  }
  if (criteria.entityDetailFilters.venueScaleBracket !== null) {
    badges.push(VENUE_SCALE_LABELS[criteria.entityDetailFilters.venueScaleBracket]);
  }
  if (criteria.entityDetailFilters.avSpecIncluded !== null) {
    badges.push(criteria.entityDetailFilters.avSpecIncluded ? 'Full Sound + Lighting' : 'Console Only');
  }

  return badges;
}
