/**
 * Shared option lists for the booking-brief intake pipeline — one source of
 * truth for both `booking-brief-modal.tsx` (renders these as select/chip
 * options) and `/api/briefs` (validates submitted values against the same
 * lists), so the two can never drift out of sync.
 */

export const TALENT_CATEGORY_OPTIONS = [
  'Baraat DJ & Sound',
  'Cultural Dance Troupe',
  'Stage Emcee',
  'Event Planner',
  'Content Creator',
] as const;
export type TalentCategory = (typeof TALENT_CATEGORY_OPTIONS)[number];

export const DIALECT_OPTIONS = ['Hindi', 'Telugu', 'Punjabi', 'Gujarati', 'Tamil', 'Fusion/General'] as const;
export type DialectOption = (typeof DIALECT_OPTIONS)[number];

export const BUDGET_RANGE_OPTIONS = ['Under $2k', '$2k–$4k', '$4k–$7k', '$7k+'] as const;
export type BudgetRange = (typeof BUDGET_RANGE_OPTIONS)[number];
