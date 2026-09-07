/** Pure filter-matching logic for the Discover cockpit — no React, no I/O, easy to unit test. */

import { METRO_LABELS } from '@/lib/pseo/directory-config';
import type { CreatorCardModel, FilterCriteria } from '@/types/creator';
import { ENGAGEMENT_RATE_BOUNDS, NICHE_DISPLAY_LABELS } from './constants';

/** True if `creator` satisfies every active dimension of `criteria`. */
export function matchesFilters(creator: CreatorCardModel, criteria: FilterCriteria): boolean {
  const query = criteria.searchQuery.trim().toLowerCase();
  if (query) {
    const haystack = `${creator.displayName} ${creator.handle}`.toLowerCase();
    if (!haystack.includes(query)) {
      return false;
    }
  }

  if (criteria.selectedMetros.length > 0 && !criteria.selectedMetros.includes(creator.primaryMetro)) {
    return false;
  }

  if (criteria.selectedNiches.length > 0 && !criteria.selectedNiches.includes(creator.primaryNiche)) {
    return false;
  }

  if (criteria.secondaryLanguages.length > 0) {
    const speaksRequestedLanguage = criteria.secondaryLanguages.some((language) =>
      creator.secondaryLanguages.includes(language)
    );
    if (!speaksRequestedLanguage) {
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
  count += criteria.selectedMetros.length;
  count += criteria.selectedNiches.length;
  count += criteria.secondaryLanguages.length;
  if (criteria.minER !== null && criteria.minER > ENGAGEMENT_RATE_BOUNDS.min) count += 1;
  if (criteria.maxER !== null && criteria.maxER < ENGAGEMENT_RATE_BOUNDS.max) count += 1;
  if (criteria.availabilityFilter !== 'all') count += 1;
  if (criteria.hideConflicts) count += 1;
  return count;
}

/** Short human-readable labels for each active filter dimension — used for header badges. */
export function describeActiveFilters(criteria: FilterCriteria): string[] {
  const badges: string[] = [];

  const query = criteria.searchQuery.trim();
  if (query) badges.push(`"${query}"`);

  for (const metro of criteria.selectedMetros) {
    badges.push(METRO_LABELS[metro].shortLabel);
  }
  for (const niche of criteria.selectedNiches) {
    badges.push(NICHE_DISPLAY_LABELS[niche]);
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

  return badges;
}
