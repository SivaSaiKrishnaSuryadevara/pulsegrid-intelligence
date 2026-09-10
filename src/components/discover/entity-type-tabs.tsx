'use client';

import { ENTITY_TYPES, type EntityType } from '@/types/creator';
import { ENTITY_TYPE_DISPLAY_LABELS, ENTITY_TYPE_EMOJI } from '@/lib/discover/constants';
import { cn } from '@/lib/cn';

export interface EntityTypeTabsProps {
  /** Counts keyed by entity type, plus a synthetic 'all' total. */
  counts: Partial<Record<EntityType | 'all', number>>;
  /** Currently-selected entity types — empty array means "All Production". */
  value: EntityType[];
  onChange: (value: EntityType[]) => void;
}

/**
 * Segmented single-select control over an array-valued filter field — a
 * plain button row rather than Radix Tabs, since Tabs assumes exactly one
 * active panel and this drives `FilterCriteria.selectedEntityTypes`
 * (currently always 0-or-1 selection from this control, kept as an array
 * in the shared type so a future multi-select variant needs no shape change).
 */
export function EntityTypeTabs({ counts, value, onChange }: EntityTypeTabsProps) {
  const isAllActive = value.length === 0;

  return (
    <div className="scrollbar-none flex flex-nowrap items-center gap-2 overflow-x-auto pb-1">
      <TabButton
        active={isAllActive}
        label={`All Production (${counts.all ?? 0})`}
        onClick={() => onChange([])}
      />
      {ENTITY_TYPES.map((entityType) => (
        <TabButton
          key={entityType}
          active={value.includes(entityType)}
          label={`${ENTITY_TYPE_EMOJI[entityType]} ${ENTITY_TYPE_DISPLAY_LABELS[entityType]} (${counts[entityType] ?? 0})`}
          onClick={() => onChange(value.includes(entityType) ? [] : [entityType])}
        />
      ))}
    </div>
  );
}

function TabButton({ active, label, onClick }: { active: boolean; label: string; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      className={cn(
        'shrink-0 whitespace-nowrap rounded-xl border px-3.5 py-2 text-xs font-semibold transition-all',
        active
          ? 'border-zinc-200 bg-white text-zinc-900 shadow-sm'
          : 'border-transparent text-zinc-500 hover:border-zinc-200 hover:text-zinc-700'
      )}
    >
      {label}
    </button>
  );
}
