'use client';

import * as Popover from '@radix-ui/react-popover';
import * as Slider from '@radix-ui/react-slider';
import { ChevronDown, RotateCcw, Search, ShieldAlert } from 'lucide-react';
import { useEffect, useState, type ReactNode } from 'react';

import { cn } from '@/lib/cn';
import {
  AVAILABILITY_MODE_OPTIONS,
  DJ_GENRE_TAG_OPTIONS,
  ENGAGEMENT_RATE_BOUNDS,
  LANGUAGE_OPTIONS,
  NICHE_DISPLAY_LABELS,
  REP_TYPE_DISPLAY_LABELS,
  VENUE_SCALE_LABELS,
} from '@/lib/discover/constants';
import { countActiveFilters } from '@/lib/discover/filters';
import { METRO_LABELS } from '@/lib/pseo/directory-config';
import {
  METRO_HUBS,
  PRIMARY_NICHES,
  REP_TYPES,
  type EventPlannerDetails,
  type FilterCriteria,
  type MetroHub,
  type PrimaryNiche,
  type RepType,
} from '@/types/creator';

export interface FilterStripProps {
  value: FilterCriteria;
  onChange: (next: FilterCriteria) => void;
  onReset: () => void;
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

export function FilterStrip({ value, onChange, onReset }: FilterStripProps) {
  const [searchInput, setSearchInput] = useState(value.searchQuery);
  const debouncedSearch = useDebouncedValue(searchInput, SEARCH_DEBOUNCE_MS);
  const activeFilterCount = countActiveFilters(value);
  const isDjSelected = value.selectedEntityTypes.includes('local_dj');
  const isTroupeSelected = value.selectedEntityTypes.includes('dance_troupe');
  const isPlannerSelected = value.selectedEntityTypes.includes('event_planner');

  useEffect(() => {
    setSearchInput(value.searchQuery);
  }, [value.searchQuery]);

  useEffect(() => {
    if (debouncedSearch !== value.searchQuery) {
      onChange({ ...value, searchQuery: debouncedSearch });
    }
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

  function toggleRepType(repType: RepType): void {
    const next = value.selectedRepTypes.includes(repType)
      ? value.selectedRepTypes.filter((r) => r !== repType)
      : [...value.selectedRepTypes, repType];
    onChange({ ...value, selectedRepTypes: next });
  }

  function toggleDialectTag(tag: string): void {
    const next = value.secondaryLanguages.includes(tag)
      ? value.secondaryLanguages.filter((l) => l !== tag)
      : [...value.secondaryLanguages, tag];
    onChange({ ...value, secondaryLanguages: next });
  }

  return (
    <div className="flex flex-wrap items-center gap-2 overflow-x-auto pb-1">
      <div className="relative shrink-0">
        <Search className="pointer-events-none absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-zinc-500" />
        <input
          id="discover-quick-search"
          type="text"
          value={searchInput}
          onChange={(event) => setSearchInput(event.target.value)}
          placeholder="⌘K Quick search handles, dialects, metros, genres…"
          className="w-64 rounded-xl border border-zinc-200 bg-white py-2 pl-8 pr-3 text-xs text-zinc-900 placeholder:text-zinc-500 focus:border-emerald-500 focus:outline-none"
        />
      </div>

      <FilterChip label="📍 Metro Hub" activeCount={value.selectedMetros.length}>
        <ChipList>
          {METRO_HUBS.map((metro) => (
            <CheckOption
              key={metro}
              label={METRO_LABELS[metro].shortLabel}
              checked={value.selectedMetros.includes(metro)}
              onToggle={() => toggleMetro(metro)}
            />
          ))}
        </ChipList>
      </FilterChip>

      <FilterChip label={isDjSelected ? '🗣️ Genre' : '🗣️ Dialect / Genre'} activeCount={value.secondaryLanguages.length}>
        <ChipList>
          {(isDjSelected ? DJ_GENRE_TAG_OPTIONS : LANGUAGE_OPTIONS).map((tag) => (
            <CheckOption
              key={tag}
              label={tag}
              checked={value.secondaryLanguages.includes(tag)}
              onToggle={() => toggleDialectTag(tag)}
            />
          ))}
        </ChipList>
      </FilterChip>

      <FilterChip label="🎯 Core Specialty" activeCount={value.selectedNiches.length}>
        <ChipList>
          {PRIMARY_NICHES.map((niche) => (
            <CheckOption
              key={niche}
              label={NICHE_DISPLAY_LABELS[niche]}
              checked={value.selectedNiches.includes(niche)}
              onToggle={() => toggleNiche(niche)}
            />
          ))}
        </ChipList>
      </FilterChip>

      <FilterChip label="⚡ Desk Status" activeCount={value.selectedRepTypes.length}>
        <ChipList>
          {REP_TYPES.map((repType) => (
            <CheckOption
              key={repType}
              label={REP_TYPE_DISPLAY_LABELS[repType]}
              checked={value.selectedRepTypes.includes(repType)}
              onToggle={() => toggleRepType(repType)}
            />
          ))}
        </ChipList>
      </FilterChip>

      {isTroupeSelected && (
        <FilterChip label="💃 Troupe Size" activeCount={value.entityDetailFilters.minTroupeSize !== null ? 1 : 0}>
          <ChipList>
            {[5, 10, 25].map((min) => (
              <CheckOption
                key={min}
                label={min === 25 ? '25–50+ Dancers' : min === 10 ? '10–25 Dancers' : '5–10 Dancers'}
                checked={value.entityDetailFilters.minTroupeSize === min}
                onToggle={() =>
                  onChange({
                    ...value,
                    entityDetailFilters: {
                      ...value.entityDetailFilters,
                      minTroupeSize: value.entityDetailFilters.minTroupeSize === min ? null : min,
                    },
                  })
                }
              />
            ))}
          </ChipList>
        </FilterChip>
      )}

      {isDjSelected && (
        <FilterChip label="🎧 AV Spec" activeCount={value.entityDetailFilters.avSpecIncluded !== null ? 1 : 0}>
          <ChipList>
            <CheckOption
              label="Full Sound + Stage Lighting Included"
              checked={value.entityDetailFilters.avSpecIncluded === true}
              onToggle={() =>
                onChange({
                  ...value,
                  entityDetailFilters: {
                    ...value.entityDetailFilters,
                    avSpecIncluded: value.entityDetailFilters.avSpecIncluded === true ? null : true,
                  },
                })
              }
            />
            <CheckOption
              label="Console Only"
              checked={value.entityDetailFilters.avSpecIncluded === false}
              onToggle={() =>
                onChange({
                  ...value,
                  entityDetailFilters: {
                    ...value.entityDetailFilters,
                    avSpecIncluded: value.entityDetailFilters.avSpecIncluded === false ? null : false,
                  },
                })
              }
            />
          </ChipList>
        </FilterChip>
      )}

      {isPlannerSelected && (
        <FilterChip label="🏛️ Venue Scale" activeCount={value.entityDetailFilters.venueScaleBracket !== null ? 1 : 0}>
          <ChipList>
            {(Object.keys(VENUE_SCALE_LABELS) as EventPlannerDetails['venueScaleBracket'][]).map((bracket) => (
              <CheckOption
                key={bracket}
                label={VENUE_SCALE_LABELS[bracket]}
                checked={value.entityDetailFilters.venueScaleBracket === bracket}
                onToggle={() =>
                  onChange({
                    ...value,
                    entityDetailFilters: {
                      ...value.entityDetailFilters,
                      venueScaleBracket: value.entityDetailFilters.venueScaleBracket === bracket ? null : bracket,
                    },
                  })
                }
              />
            ))}
          </ChipList>
        </FilterChip>
      )}

      <FilterChip
        label="Engagement Rate"
        activeCount={
          (value.minER !== null && value.minER > ENGAGEMENT_RATE_BOUNDS.min ? 1 : 0) +
          (value.maxER !== null && value.maxER < ENGAGEMENT_RATE_BOUNDS.max ? 1 : 0)
        }
      >
        <div className="w-56 p-1">
          <EngagementRateSlider
            min={value.minER ?? ENGAGEMENT_RATE_BOUNDS.min}
            max={value.maxER ?? ENGAGEMENT_RATE_BOUNDS.max}
            onChange={(min, max) => onChange({ ...value, minER: min, maxER: max })}
          />
        </div>
      </FilterChip>

      <FilterChip label="Availability" activeCount={value.availabilityFilter !== 'all' ? 1 : 0}>
        <div className="w-64 space-y-1.5 p-1">
          {AVAILABILITY_MODE_OPTIONS.map((option) => (
            <label
              key={option.value}
              className="flex cursor-pointer items-start gap-2 rounded-lg border border-zinc-200 bg-white p-2.5 text-xs transition-all hover:border-emerald-500/50"
            >
              <input
                type="radio"
                name="availability-mode"
                value={option.value}
                checked={value.availabilityFilter === option.value}
                onChange={() => onChange({ ...value, availabilityFilter: option.value })}
                className="mt-0.5 h-3.5 w-3.5 accent-emerald-500"
              />
              <span>
                <span className="block font-medium text-zinc-800">{option.label}</span>
                {option.helperText && <span className="mt-0.5 block text-[11px] text-zinc-500">{option.helperText}</span>}
              </span>
            </label>
          ))}
          <label className="flex cursor-pointer items-start gap-2 rounded-lg border border-zinc-200 bg-white p-2.5 text-xs transition-all hover:border-emerald-500/50">
            <ShieldAlert className="mt-0.5 h-3.5 w-3.5 shrink-0 text-rose-600" />
            <span className="flex-1">
              <span className="block font-medium text-zinc-800">Hide Active Conflicts</span>
              <span className="mt-0.5 block text-[11px] text-zinc-500">Removes creators under a brand exclusivity hold.</span>
            </span>
            <input
              type="checkbox"
              checked={value.hideConflicts}
              onChange={(event) => onChange({ ...value, hideConflicts: event.target.checked })}
              className="mt-0.5 h-3.5 w-3.5 accent-emerald-500"
            />
          </label>
        </div>
      </FilterChip>

      <button
        type="button"
        onClick={onReset}
        disabled={activeFilterCount === 0}
        className="ml-auto flex shrink-0 items-center gap-1.5 rounded-xl border border-zinc-200 px-3 py-2 text-xs font-semibold text-zinc-500 transition-all hover:border-zinc-400 hover:text-zinc-900 disabled:cursor-not-allowed disabled:opacity-40"
      >
        <RotateCcw className="h-3.5 w-3.5" />
        Reset All
      </button>
    </div>
  );
}

// =====================================================================================
// Local presentational helpers
// =====================================================================================

function FilterChip({ label, activeCount, children }: { label: string; activeCount: number; children: ReactNode }) {
  return (
    <Popover.Root>
      <Popover.Trigger asChild>
        <button
          type="button"
          className={cn(
            'flex shrink-0 items-center gap-1.5 whitespace-nowrap rounded-xl border px-3.5 py-2 text-xs font-semibold transition-all',
            activeCount > 0
              ? 'border-emerald-200 bg-emerald-50 text-emerald-700'
              : 'border-zinc-200 bg-white text-zinc-700 hover:border-zinc-400'
          )}
        >
          {label}
          {activeCount > 0 && (
            <span className="rounded-full bg-emerald-500 px-1.5 text-[10px] font-bold text-white">{activeCount}</span>
          )}
          <ChevronDown className="h-3 w-3" />
        </button>
      </Popover.Trigger>
      <Popover.Portal>
        <Popover.Content
          sideOffset={8}
          align="start"
          className="z-50 max-h-[60vh] overflow-y-auto rounded-2xl border border-zinc-200 bg-white p-3 shadow-xl data-[state=open]:animate-in data-[state=open]:fade-in data-[state=open]:zoom-in-95"
        >
          {children}
        </Popover.Content>
      </Popover.Portal>
    </Popover.Root>
  );
}

function ChipList({ children }: { children: ReactNode }) {
  return <div className="flex w-56 flex-col gap-1">{children}</div>;
}

function CheckOption({ label, checked, onToggle }: { label: string; checked: boolean; onToggle: () => void }) {
  return (
    <button
      type="button"
      onClick={onToggle}
      aria-pressed={checked}
      className={cn(
        'flex items-center justify-between rounded-lg px-2.5 py-1.5 text-left text-xs transition-all',
        checked ? 'bg-emerald-50 text-emerald-700' : 'text-zinc-700 hover:bg-zinc-200'
      )}
    >
      {label}
      {checked && <span className="h-1.5 w-1.5 rounded-full bg-emerald-500" />}
    </button>
  );
}

function EngagementRateSlider({ min, max, onChange }: { min: number; max: number; onChange: (min: number, max: number) => void }) {
  const { min: floor, max: ceiling, step } = ENGAGEMENT_RATE_BOUNDS;

  return (
    <div>
      <div className="mb-3 flex items-center justify-between text-xs font-semibold text-emerald-700">
        <span>{min.toFixed(1)}%</span>
        <span>{max.toFixed(1)}%</span>
      </div>
      <Slider.Root
        className="relative flex h-5 w-full touch-none items-center"
        min={floor}
        max={ceiling}
        step={step}
        minStepsBetweenThumbs={1}
        value={[min, max]}
        onValueChange={([nextMin, nextMax]) => {
          if (nextMin === undefined || nextMax === undefined) return;
          onChange(nextMin, nextMax);
        }}
      >
        <Slider.Track className="relative h-1 grow rounded-full bg-zinc-200">
          <Slider.Range className="absolute h-full rounded-full bg-emerald-500" />
        </Slider.Track>
        <Slider.Thumb
          className="block h-4 w-4 rounded-full bg-emerald-500 shadow focus:outline-none focus-visible:ring-2 focus-visible:ring-emerald-300"
          aria-label="Minimum engagement rate"
        />
        <Slider.Thumb
          className="block h-4 w-4 rounded-full bg-emerald-500 shadow focus:outline-none focus-visible:ring-2 focus-visible:ring-emerald-300"
          aria-label="Maximum engagement rate"
        />
      </Slider.Root>
      <div className="mt-1 flex justify-between text-[10px] text-zinc-600">
        <span>{floor.toFixed(1)}%</span>
        <span>{ceiling.toFixed(1)}%</span>
      </div>
    </div>
  );
}
