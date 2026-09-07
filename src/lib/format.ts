/** Shared display-formatting helpers used across the pSEO pages and the Discover cockpit. */

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

/** `formatRateRange(500, 1500)` -> "$500–1.5K"; a single bound collapses to one value. */
export function formatRateRange(minUsd: number | null, maxUsd: number | null): string {
  if (minUsd === null && maxUsd === null) {
    return '—';
  }
  const format = (n: number) => `$${formatCompactNumber(n)}`;
  if (minUsd !== null && maxUsd !== null) {
    return minUsd === maxUsd ? format(minUsd) : `${format(minUsd)}–${format(maxUsd)}`;
  }
  return format((minUsd ?? maxUsd) as number);
}
