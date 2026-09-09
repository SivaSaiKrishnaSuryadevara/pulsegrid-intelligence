'use client';

import { Radar, UserCheck, UserPlus } from 'lucide-react';

import { Avatar } from '@/components/pseo/avatar';
import { getAvailabilityBadge } from '@/lib/discover/availability';
import { ENTITY_TYPE_DISPLAY_LABELS, ENTITY_TYPE_EMOJI } from '@/lib/discover/constants';
import { cn } from '@/lib/cn';
import { formatCompactNumber, formatPercent, formatRateRange } from '@/lib/format';
import { METRO_LABELS } from '@/lib/pseo/directory-config';
import type { CreatorCardModel } from '@/types/creator';

export interface RosterTableViewProps {
  creators: CreatorCardModel[];
  rosterIds: Set<string>;
  onToggleRoster: (creatorId: string) => void;
  onInspect: (creatorId: string) => void;
}

export function RosterTableView({ creators, rosterIds, onToggleRoster, onInspect }: RosterTableViewProps) {
  return (
    <div className="overflow-x-auto rounded-2xl border border-zinc-200/90 bg-white shadow-sm">
      <table className="w-full min-w-[860px] border-collapse text-sm">
        <thead>
          <tr className="border-b border-zinc-200 text-left text-[10px] font-semibold uppercase tracking-wider text-zinc-500">
            <th className="px-4 py-3">Talent</th>
            <th className="px-4 py-3">Metro</th>
            <th className="px-4 py-3">Reach</th>
            <th className="px-4 py-3">Engagement</th>
            <th className="px-4 py-3">Est. Rate</th>
            <th className="px-4 py-3">Status</th>
            <th className="px-4 py-3 text-right">Actions</th>
          </tr>
        </thead>
        <tbody>
          {creators.map((creator) => {
            const availability = getAvailabilityBadge(creator);
            const isOnRoster = rosterIds.has(creator.id);
            return (
              <tr key={creator.id} className="border-b border-zinc-100 last:border-0 hover:bg-zinc-50">
                <td className="px-4 py-3">
                  <div className="flex items-center gap-2.5">
                    <Avatar name={creator.displayName} url={creator.avatarUrl} size={32} />
                    <div className="min-w-0">
                      <p className="truncate text-sm font-bold text-zinc-900">{creator.displayName}</p>
                      <p className="truncate text-xs text-zinc-500">
                        {ENTITY_TYPE_EMOJI[creator.entityType]} {ENTITY_TYPE_DISPLAY_LABELS[creator.entityType]}
                      </p>
                    </div>
                  </div>
                </td>
                <td className="px-4 py-3 text-xs font-medium text-zinc-600">{METRO_LABELS[creator.primaryMetro].shortLabel}</td>
                <td className="px-4 py-3 font-mono text-xs font-semibold tracking-tight text-zinc-900">
                  {formatCompactNumber(creator.followerCount)}
                </td>
                <td className="px-4 py-3 font-mono text-xs font-semibold tracking-tight text-emerald-700">
                  {formatPercent(creator.engagementRate)}
                </td>
                <td className="px-4 py-3 font-mono text-xs font-semibold tracking-tight text-zinc-900">
                  {formatRateRange(creator.estMinimumRateUsd, creator.estMaximumRateUsd)}
                </td>
                <td className="px-4 py-3">
                  <span className={cn('inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-semibold', availability.toneClasses)}>
                    {availability.label}
                  </span>
                </td>
                <td className="px-4 py-3">
                  <div className="flex items-center justify-end gap-1.5">
                    <button
                      type="button"
                      onClick={() => onToggleRoster(creator.id)}
                      aria-pressed={isOnRoster}
                      title={isOnRoster ? 'On Roster' : 'Add to Roster'}
                      className={cn(
                        'flex h-7 w-7 items-center justify-center rounded-full border transition-all',
                        isOnRoster
                          ? 'border-emerald-200 bg-emerald-50 text-emerald-700'
                          : 'border-zinc-200 text-zinc-500 hover:border-zinc-400 hover:text-zinc-900'
                      )}
                    >
                      {isOnRoster ? <UserCheck className="h-3.5 w-3.5" /> : <UserPlus className="h-3.5 w-3.5" />}
                    </button>
                    <button
                      type="button"
                      onClick={() => onInspect(creator.id)}
                      title="Inspect Full Dossier"
                      className="flex h-7 w-7 items-center justify-center rounded-full border border-zinc-200 text-zinc-500 transition-all hover:border-zinc-400 hover:text-zinc-900"
                    >
                      <Radar className="h-3.5 w-3.5" />
                    </button>
                  </div>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
