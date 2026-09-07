'use client';

import { useEffect, useState, type ReactNode } from 'react';
import { Filter, RotateCcw, Search, ShieldAlert, X } from 'lucide-react';

import {
  AVAILABILITY_MODE_OPTIONS,
  ENGAGEMENT_RATE_BOUNDS,
  LANGUAGE_OPTIONS,
  NICHE_DISPLAY_LABELS,
} from '@/lib/discover/constants';
import { countActiveFilters } from '@/lib/discover/filters';
import { METRO_LABELS } from '@/lib/pseo/directory-config';
import { METRO_HUBS, PRIMARY_NICHES, type FilterCriteria, type MetroHub, type PrimaryNiche } from '@/types/creator';

export interface FilterSidebarProps {
  value: FilterCriteria;
  onChange: (next: FilterCriteria) => void;
  onReset: () => void;
  /** Mobile drawer visibility — the sidebar is always visible/sticky at `lg` and up. */
  isOpen: boolean;
  onClose: () => void;
}

const SEARCH_DEBOUNCE_MS = 250;

function useDebouncedValue<T>(value: T, delayMs: number): T {
  const [debounced, setDebounced] = useState(value);

  useEffect(() => {
    const timer = setTimeout(() => setDebounced(value), delayMs);
    return () => clearTimeout(timer);
  }, [value, delayMs]);

  return debounced;
}

export function FilterSidebar({ value, onChange, onReset, isOpen, onClose }: FilterSidebarProps) {
  const [searchInput, setSearchInput] = useState(value.searchQuery);
  const debouncedSearch = useDebouncedValue(searchInput, SEARCH_DEBOUNCE_MS);
  const activeFilterCount = countActiveFilters(value);

  // Keep the local input buffer in sync if the query changes from outside
  // (e.g. "Reset All", or a future "clear this filter" chip).
  useEffect(() => {
    setSearchInput(value.searchQuery);
  }, [value.searchQuery]);

  useEffect(() => {
    if (debouncedSearch !== value.searchQuery) {
      onChange({ ...value, searchQuery: debouncedSearch });
    }
    // Only the debounced value should re-trigger this — `value`/`onChange`
    // changing on every keystroke would defeat the debounce.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [debouncedSearch]);

  function toggleMetro(metro: MetroHub): void {
    const next = value.selectedMetros.includes(metro)
      ? value.selectedMetros.filter((m) => m !== metro)
      : [...value.selectedMetros, metro];
    onChange({ ...value, selectedMetros: next });
  }

  function toggleNiche(niche: PrimaryNiche): void {
    const next = value.selectedNiches.includes(niche)
      ? value.selectedNiches.filter((n) => n !== niche)
      : [...value.selectedNiches, niche];
    onChange({ ...value, selectedNiches: next });
  }

  function toggleLanguage(language: string): void {
    const next = value.secondaryLanguages.includes(language)
      ? value.secondaryLanguages.filter((l) => l !== language)
      : [...value.secondaryLanguages, language];
    onChange({ ...value, secondaryLanguages: next });
  }

  return (
    <>
      {isOpen && (
        <button
          type="button"
          aria-label="Close filters"
          onClick={onClose}
          className="fixed inset-0 z-40 bg-black/60 lg:hidden"
        />
      )}

      <aside
        className={`fixed inset-y-0 left-0 z-50 flex w-[300px] flex-col overflow-y-auto border-r border-[#1E2337] bg-[#0B0D17] transition-transform duration-200 ease-out lg:sticky lg:top-14 lg:z-0 lg:h-[calc(100vh-3.5rem)] lg:translate-x-0 ${
          isOpen ? 'translate-x-0' : '-translate-x-full'
        }`}
      >
        <div className="flex items-center justify-between border-b border-[#1E2337] px-4 py-4">
          <div className="flex items-center gap-2">
            <Filter className="h-4 w-4 text-[#6366F1]" />
            <h2 className="text-sm font-semibold text-white">Filters</h2>
            {activeFilterCount > 0 && (
              <span className="rounded-full bg-[#6366F1] px-1.5 py-0.5 text-[10px] font-bold text-white">
                {activeFilterCount}
              </span>
            )}
          </div>
          <button
            type="button"
            onClick={onClose}
            className="text-slate-400 hover:text-white lg:hidden"
            aria-label="Close filters"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="flex-1 space-y-6 px-4 py-5">
          <div>
            <label
              htmlFor="creator-search"
              className="mb-2 block text-xs font-semibold uppercase tracking-wide text-slate-500"
            >
              Search
            </label>
            <div className="relative">
              <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-500" />
              <input
                id="creator-search"
                type="text"
                value={searchInput}
                onChange={(event) => setSearchInput(event.target.value)}
                placeholder="Name or @handle…"
                className="w-full rounded-lg border border-[#1E2337] bg-[#131728] py-2 pl-9 pr-3 text-sm text-white placeholder:text-slate-500 focus:border-[#6366F1] focus:outline-none focus:ring-1 focus:ring-[#6366F1]"
              />
            </div>
          </div>

          <FilterSection title="Metro Hub">
            <div className="flex flex-wrap gap-2">
              {METRO_HUBS.map((metro) => (
                <ChipButton
                  key={metro}
                  label={METRO_LABELS[metro].shortLabel}
                  isActive={value.selectedMetros.includes(metro)}
                  onClick={() => toggleMetro(metro)}
                />
              ))}
            </div>
          </FilterSection>

          <FilterSection title="Primary Niche">
            <div className="flex flex-wrap gap-2">
              {PRIMARY_NICHES.map((niche) => (
                <ChipButton
                  key={niche}
                  label={NICHE_DISPLAY_LABELS[niche]}
                  isActive={value.selectedNiches.includes(niche)}
                  onClick={() => toggleNiche(niche)}
                />
              ))}
            </div>
          </FilterSection>

          <FilterSection title="Language / Dialect">
            <div className="flex flex-wrap gap-2">
              {LANGUAGE_OPTIONS.map((language) => (
                <ChipButton
                  key={language}
                  label={language}
                  isActive={value.secondaryLanguages.includes(language)}
                  onClick={() => toggleLanguage(language)}
                />
              ))}
            </div>
          </FilterSection>

          <FilterSection title="Engagement Rate">
            <EngagementRateSlider
              min={value.minER ?? ENGAGEMENT_RATE_BOUNDS.min}
              max={value.maxER ?? ENGAGEMENT_RATE_BOUNDS.max}
              onChange={(min, max) => onChange({ ...value, minER: min, maxER: max })}
            />
          </FilterSection>

          <FilterSection title="Availability Mode">
            <div className="space-y-2">
              {AVAILABILITY_MODE_OPTIONS.map((option) => (
                <label
                  key={option.value}
                  className="flex cursor-pointer items-start gap-2 rounded-lg border border-[#1E2337] bg-[#131728] p-2.5 text-xs transition ease-out hover:border-[#6366F1]/50"
                >
                  <input
                    type="radio"
                    name="availability-mode"
                    value={option.value}
                    checked={value.availabilityFilter === option.value}
                    onChange={() => onChange({ ...value, availabilityFilter: option.value })}
                    className="mt-0.5 h-3.5 w-3.5 accent-[#6366F1]"
                  />
                  <span>
                    <span className="block font-medium text-slate-200">{option.label}</span>
                    {option.helperText && (
                      <span className="mt-0.5 block text-[11px] text-slate-500">{option.helperText}</span>
                    )}
                  </span>
                </label>
              ))}
            </div>
          </FilterSection>

          <div className="flex items-start justify-between gap-3 rounded-lg border border-[#1E2337] bg-[#131728] p-3">
            <div className="flex items-start gap-2">
              <ShieldAlert className="mt-0.5 h-4 w-4 shrink-0 text-rose-400" />
              <div>
                <p className="text-xs font-semibold text-slate-200">Hide Active 90-Day Competitor Conflicts</p>
                <p className="mt-0.5 text-[11px] text-slate-500">
                  Removes creators currently under a brand exclusivity hold.
                </p>
              </div>
            </div>
            <ToggleSwitch
              checked={value.hideConflicts}
              onChange={(checked) => onChange({ ...value, hideConflicts: checked })}
            />
          </div>
        </div>

        <div className="border-t border-[#1E2337] p-4">
          <button
            type="button"
            onClick={onReset}
            disabled={activeFilterCount === 0}
            className="flex w-full items-center justify-center gap-2 rounded-lg border border-[#1E2337] px-3 py-2 text-xs font-semibold text-slate-300 transition ease-out hover:border-[#6366F1] hover:text-white disabled:cursor-not-allowed disabled:opacity-40"
          >
            <RotateCcw className="h-3.5 w-3.5" />
            Reset All
          </button>
        </div>
      </aside>
    </>
  );
}

// =====================================================================================
// Local presentational helpers
// =====================================================================================

function FilterSection({ title, children }: { title: string; children: ReactNode }) {
  return (
    <div>
      <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-500">{title}</h3>
      {children}
    </div>
  );
}

function ChipButton({ label, isActive, onClick }: { label: string; isActive: boolean; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={isActive}
      className={`rounded-full border px-3 py-1.5 text-xs font-medium transition ease-out ${
        isActive
          ? 'border-[#6366F1]/70 bg-[#6366F1]/15 text-[#a5b4fc] shadow-[0_0_10px_rgba(99,102,241,0.35)]'
          : 'border-[#1E2337] bg-[#131728] text-slate-400 hover:border-[#6366F1]/50 hover:text-slate-200'
      }`}
    >
      {label}
    </button>
  );
}

function ToggleSwitch({ checked, onChange }: { checked: boolean; onChange: (checked: boolean) => void }) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      onClick={() => onChange(!checked)}
      className={`relative h-5 w-9 shrink-0 rounded-full transition-colors ease-out ${checked ? 'bg-[#6366F1]' : 'bg-[#1E2337]'}`}
    >
      <span
        className={`absolute top-0.5 h-4 w-4 rounded-full bg-white transition-transform ease-out ${
          checked ? 'translate-x-4' : 'translate-x-0.5'
        }`}
      />
    </button>
  );
}

function EngagementRateSlider({
  min,
  max,
  onChange,
}: {
  min: number;
  max: number;
  onChange: (min: number, max: number) => void;
}) {
  const { min: floor, max: ceiling, step } = ENGAGEMENT_RATE_BOUNDS;

  function handleMinChange(next: number): void {
    onChange(Math.min(next, max), max);
  }

  function handleMaxChange(next: number): void {
    onChange(min, Math.max(next, min));
  }

  const minPercent = ((min - floor) / (ceiling - floor)) * 100;
  const maxPercent = ((max - floor) / (ceiling - floor)) * 100;
  const thumbClasses =
    '[&::-webkit-slider-thumb]:pointer-events-auto [&::-webkit-slider-thumb]:h-4 [&::-webkit-slider-thumb]:w-4 ' +
    '[&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:rounded-full [&::-webkit-slider-thumb]:bg-[#6366F1] ' +
    '[&::-webkit-slider-thumb]:shadow [&::-moz-range-thumb]:pointer-events-auto [&::-moz-range-thumb]:h-4 ' +
    '[&::-moz-range-thumb]:w-4 [&::-moz-range-thumb]:rounded-full [&::-moz-range-thumb]:border-0 [&::-moz-range-thumb]:bg-[#6366F1]';

  return (
    <div>
      <div className="mb-3 flex items-center justify-between text-xs font-semibold text-[#a5b4fc]">
        <span>{min.toFixed(1)}%</span>
        <span>{max.toFixed(1)}%</span>
      </div>
      <div className="relative h-5">
        <div className="absolute top-1/2 h-1 w-full -translate-y-1/2 rounded-full bg-[#1E2337]" />
        <div
          className="absolute top-1/2 h-1 -translate-y-1/2 rounded-full bg-[#6366F1]"
          style={{ left: `${minPercent}%`, right: `${100 - maxPercent}%` }}
        />
        <input
          type="range"
          min={floor}
          max={ceiling}
          step={step}
          value={min}
          onChange={(event) => handleMinChange(Number(event.target.value))}
          aria-label="Minimum engagement rate"
          className={`pointer-events-none absolute top-0 h-5 w-full appearance-none bg-transparent ${thumbClasses}`}
        />
        <input
          type="range"
          min={floor}
          max={ceiling}
          step={step}
          value={max}
          onChange={(event) => handleMaxChange(Number(event.target.value))}
          aria-label="Maximum engagement rate"
          className={`pointer-events-none absolute top-0 h-5 w-full appearance-none bg-transparent ${thumbClasses}`}
        />
      </div>
      <div className="mt-1 flex justify-between text-[10px] text-slate-600">
        <span>{floor.toFixed(1)}%</span>
        <span>{ceiling.toFixed(1)}%</span>
      </div>
    </div>
  );
}
