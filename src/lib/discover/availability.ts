/**
 * Shared "availability chip" logic — used by `visual-creator-card.tsx` and
 * `creator-detail-drawer.tsx` so the grid and the drawer never disagree
 * about what state a creator is in.
 */

import { AlertTriangle, Clock, Zap, type LucideIcon } from 'lucide-react';

import { humanizeSlug } from './blackout-helpers';
import type { CreatorCardModel } from '@/types/creator';

export interface AvailabilityBadge {
  Icon: LucideIcon;
  label: string;
  toneClasses: string;
}

export const EMERALD_TONE = 'bg-emerald-50 text-emerald-700 ring-1 ring-inset ring-emerald-200';
export const AMBER_TONE = 'bg-amber-50 text-amber-800 ring-1 ring-inset ring-amber-200';
export const ROSE_TONE = 'bg-rose-50 text-rose-700 ring-1 ring-inset ring-rose-200';

/** Distinct from AMBER_TONE — used for the detailed exclusivity-hold callout (brand + days), not the compact status chip. */
export const EXCLUSIVITY_TONE = 'border border-amber-200 bg-amber-50 text-amber-900';

export function getAvailabilityBadge(creator: CreatorCardModel): AvailabilityBadge {
  const [firstConflict] = creator.activeBlackouts;
  if (firstConflict) {
    return {
      Icon: AlertTriangle,
      label: `Active Conflict: ${humanizeSlug(firstConflict.categorySlug)}`,
      toneClasses: ROSE_TONE,
    };
  }
  if (creator.bookingStatus === 'blackout_period') {
    return { Icon: AlertTriangle, label: 'Active Conflict', toneClasses: ROSE_TONE };
  }
  if (creator.bookingStatus === 'closed_roster') {
    return { Icon: AlertTriangle, label: 'Roster Closed', toneClasses: ROSE_TONE };
  }
  if (creator.bookingStatus === 'high_demand_lead') {
    return { Icon: Clock, label: 'High Demand (2-3 wks lead)', toneClasses: AMBER_TONE };
  }
  return { Icon: Zap, label: 'Fast Turnaround (< 48 hrs)', toneClasses: EMERALD_TONE };
}
