'use client';

import { FileDown, X } from 'lucide-react';

import { formatCompactNumber, formatRateRange } from '@/lib/format';
import type { CreatorCardModel, EntityType } from '@/types/creator';

export interface RosterActionDockProps {
  rosterCreators: CreatorCardModel[];
  onClear: () => void;
  onExport: () => void;
  isExporting: boolean;
}

/** Compact singular/plural pair for the dock's selection breakdown — deliberately shorter than ENTITY_TYPE_DISPLAY_LABELS. */
const ENTITY_TYPE_COUNT_LABELS: Record<EntityType, [singular: string, plural: string]> = {
  solo_creator: ['Creator', 'Creators'],
  stage_emcee: ['Stage Emcee', 'Stage Emcees'],
  dance_troupe: ['Dance Troupe', 'Dance Troupes'],
  local_dj: ['DJ', 'DJs'],
  event_planner: ['Event Planner', 'Event Planners'],
};

function describeSelection(rosterCreators: CreatorCardModel[]): string {
  const counts = new Map<EntityType, number>();
  for (const creator of rosterCreators) {
    counts.set(creator.entityType, (counts.get(creator.entityType) ?? 0) + 1);
  }
  const parts = Array.from(counts.entries()).map(([entityType, count]) => {
    const [singular, plural] = ENTITY_TYPE_COUNT_LABELS[entityType];
    return `${count} ${count === 1 ? singular : plural}`;
  });
  return `${parts.join(' • ')} Selected`;
}

export function RosterActionDock({ rosterCreators, onClear, onExport, isExporting }: RosterActionDockProps) {
  if (rosterCreators.length === 0) {
    return null;
  }

  const totalReach = rosterCreators.reduce((sum, c) => sum + (c.followerCount ?? 0), 0);
  const minBudget = rosterCreators.reduce((sum, c) => sum + (c.estMinimumRateUsd ?? 0), 0);
  const maxBudget = rosterCreators.reduce((sum, c) => sum + (c.estMaximumRateUsd ?? c.estMinimumRateUsd ?? 0), 0);

  return (
    <div className="fixed bottom-6 left-1/2 z-40 w-[95%] max-w-4xl -translate-x-1/2">
      <div className="flex flex-col gap-3 rounded-2xl border border-zinc-200/80 bg-white/80 p-5 shadow-2xl backdrop-blur-md sm:flex-row sm:items-center sm:justify-between">
        <div className="min-w-0">
          <p className="truncate text-sm font-bold text-zinc-900">{describeSelection(rosterCreators)}</p>
          <p className="mt-0.5 font-mono text-xs tracking-tight text-zinc-600">
            Reach {formatCompactNumber(totalReach)} · Budget {formatRateRange(minBudget || null, maxBudget || null)}
          </p>
        </div>
        <div className="flex shrink-0 items-center gap-2">
          <button
            type="button"
            onClick={onClear}
            className="flex items-center gap-1.5 rounded-xl border border-zinc-200 px-3.5 py-2.5 text-xs font-semibold text-zinc-700 transition-all hover:border-zinc-400 hover:text-zinc-900"
          >
            <X className="h-3.5 w-3.5" />
            Clear All
          </button>
          <button
            type="button"
            onClick={onExport}
            disabled={isExporting}
            className="flex items-center gap-1.5 rounded-xl bg-zinc-900 px-4 py-2.5 text-xs font-semibold text-white shadow-sm transition-all hover:bg-zinc-800 disabled:cursor-not-allowed disabled:opacity-50"
          >
            <FileDown className="h-3.5 w-3.5" />
            {isExporting ? 'Exporting…' : '📄 Export Executive Production & Talent Roster PDF'}
          </button>
        </div>
      </div>
    </div>
  );
}
