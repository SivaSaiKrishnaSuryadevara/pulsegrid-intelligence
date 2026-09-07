/** Pure helpers for rendering brand-exclusivity (blackout) data — no React, no I/O. */

/** 'luxury-bridal' -> 'Luxury Bridal' */
export function humanizeSlug(slug: string): string {
  return slug
    .split('-')
    .map((part) => (part ? part.charAt(0).toUpperCase() + part.slice(1) : part))
    .join(' ');
}

/** Whole days remaining until an ISO date-only string (e.g. blackout_end_date), floored at 0. */
export function daysRemaining(endDateIso: string): number {
  const end = new Date(`${endDateIso}T00:00:00.000Z`).getTime();
  return Math.max(0, Math.ceil((end - Date.now()) / 86_400_000));
}
