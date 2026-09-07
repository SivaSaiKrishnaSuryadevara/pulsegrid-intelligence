/** Shared display-formatting helpers for the public-facing pSEO pages. */

export function formatCompactNumber(value: number | null): string {
  if (value === null) {
    return '—';
  }
  return new Intl.NumberFormat('en-US', { notation: 'compact', maximumFractionDigits: 1 }).format(value);
}

export function formatPercent(value: number | null, fractionDigits = 2): string {
  if (value === null) {
    return '—';
  }
  return `${value.toFixed(fractionDigits)}%`;
}
