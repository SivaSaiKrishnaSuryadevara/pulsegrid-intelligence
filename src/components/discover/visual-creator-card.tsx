'use client';

import { useState } from 'react';
import { BadgeCheck, CheckCircle2, UserCheck, UserPlus } from 'lucide-react';

import { getAvailabilityBadge } from '@/lib/discover/availability';
import { daysRemaining } from '@/lib/discover/blackout-helpers';
import { getSpecialtyLabel } from '@/lib/discover/specialty';
import { cn } from '@/lib/cn';
import { formatCompactNumber } from '@/lib/format';
import { toDisplayableMediaUrl } from '@/lib/media-proxy';
import type { CreatorCardModel } from '@/types/creator';

export interface VisualCreatorCardProps {
  creator: CreatorCardModel;
  isOnRoster: boolean;
  onToggleRoster: (creatorId: string) => void;
  /** Opens the full dossier drawer — the card's one decisive action; desk unlock now lives entirely inside the drawer. */
  onInspect: (creatorId: string) => void;
  isDeskRevealed: boolean;
}

function getMonogram(name: string): string {
  return (
    name
      .split(' ')
      .map((part) => part.charAt(0))
      .filter(Boolean)
      .slice(0, 2)
      .join('')
      .toUpperCase() || '★'
  );
}

export function VisualCreatorCard({ creator, isOnRoster, onToggleRoster, onInspect, isDeskRevealed }: VisualCreatorCardProps) {
  const [coverFailed, setCoverFailed] = useState(false);
  const availability = getAvailabilityBadge(creator);
  const [primaryConflict] = creator.activeBlackouts;
  const dialects = creator.secondaryLanguages.slice(0, 3);

  // Three-tier cover: a real post thumbnail (best signal), else their real
  // profile photo, else the monogram backdrop — never a grey "Photo" placeholder.
  const [coverProof] = creator.entityDetails.mediaProofs ?? [];
  const coverImageUrl = !coverFailed ? (coverProof?.displayUrl ?? creator.avatarUrl ?? null) : null;

  return (
    <article
      onClick={() => onInspect(creator.id)}
      className="group flex cursor-pointer flex-col overflow-hidden rounded-2xl border border-[#DDD5C7] bg-[#EDE7DC] transition-all duration-300 hover:-translate-y-1 hover:border-[#BA5D2C]/40 hover:shadow-xl hover:shadow-stone-900/10"
    >
      {/* Cover media */}
      <div className="relative aspect-[4/5] w-full shrink-0 overflow-hidden sm:aspect-[16/10]">
        {coverImageUrl ? (
          // eslint-disable-next-line @next/next/no-img-element -- proxied external image; no remote-pattern allowlist configured for Instagram's CDN (see Avatar component)
          <img
            src={toDisplayableMediaUrl(coverImageUrl)}
            alt=""
            onError={() => setCoverFailed(true)}
            className="absolute inset-0 h-full w-full object-cover transition-transform duration-500 ease-out group-hover:scale-105"
          />
        ) : (
          <div className="absolute inset-0 flex items-center justify-center bg-gradient-to-br from-[#E5DCC9] via-[#EDE7DC] to-[#DDD5C7]">
            <span className="font-sans text-6xl font-semibold tracking-tight text-[#BA5D2C]/60">{getMonogram(creator.displayName)}</span>
          </div>
        )}
        <div className="absolute inset-0 bg-gradient-to-t from-[#1D1714]/70 via-transparent to-transparent" />

        <button
          type="button"
          onClick={(event) => {
            event.stopPropagation();
            onToggleRoster(creator.id);
          }}
          aria-pressed={isOnRoster}
          aria-label={isOnRoster ? 'Remove from roster' : 'Add to roster'}
          title={isOnRoster ? 'On Roster' : 'Add to Roster'}
          className={cn(
            'absolute left-3 top-3 flex h-8 w-8 items-center justify-center rounded-full border backdrop-blur-sm transition-all',
            isOnRoster
              ? 'border-[#E5C378]/50 bg-[#E5C378]/25 text-[#3D2E0F]'
              : 'border-white/25 bg-black/25 text-white/85 hover:border-white/40 hover:text-white'
          )}
        >
          {isOnRoster ? <UserCheck className="h-3.5 w-3.5" /> : <UserPlus className="h-3.5 w-3.5" />}
        </button>
      </div>

      <div className="flex flex-1 flex-col gap-3.5 p-5">
        {/* Header */}
        <div className="min-w-0">
          <div className="flex items-center gap-1.5">
            <h3 className="truncate font-sans text-lg font-semibold tracking-tight text-[#1D1714]">{creator.displayName}</h3>
            {creator.isVerified && <BadgeCheck className="h-4 w-4 shrink-0 text-[#BA5D2C]" strokeWidth={2.25} />}
          </div>
          <p className="truncate text-sm text-[#7A6E65]">@{creator.handle}</p>
        </div>

        {/* Specialty + dialects */}
        <div className="flex flex-wrap items-center gap-1.5">
          <span className="rounded-full border border-[#BA5D2C]/30 bg-[#BA5D2C]/10 px-2.5 py-1 text-xs font-medium text-[#BA5D2C]">
            {getSpecialtyLabel(creator)}
          </span>
          {dialects.length > 0 && (
            <span className="rounded-full border border-[#DDD5C7] bg-[#F7F4EE] px-2.5 py-1 text-xs text-[#7A6E65]">
              {dialects.join(' • ')}
            </span>
          )}
          {isDeskRevealed && (
            <span className="inline-flex items-center gap-1 rounded-full border border-emerald-700/25 bg-emerald-700/10 px-2.5 py-1 text-xs font-medium text-emerald-800">
              <CheckCircle2 className="h-3 w-3" />
              Unlocked
            </span>
          )}
        </div>

        {/* Reach + availability */}
        <div className="flex items-center justify-between">
          <span className="font-mono text-sm font-semibold tracking-tight text-[#1D1714]">
            {formatCompactNumber(creator.followerCount)} <span className="font-sans font-normal text-[#7A6E65]">Reach</span>
          </span>
          <span className={cn('inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-semibold', availability.toneClasses)}>
            <availability.Icon className="h-3.5 w-3.5" />
            {availability.label}
          </span>
        </div>

        {primaryConflict && (
          <div className="flex items-center gap-2 rounded-lg border border-[#BA5D2C]/25 bg-[#BA5D2C]/5 px-3 py-2 text-xs font-medium text-[#8A431A]">
            <span aria-hidden="true">⚠️</span>
            <span>
              Exclusivity Hold: <strong>{primaryConflict.brandName}</strong> · {daysRemaining(primaryConflict.endDate)}d remaining
            </span>
          </div>
        )}

        <button
          type="button"
          onClick={(event) => {
            event.stopPropagation();
            onInspect(creator.id);
          }}
          className="mt-auto flex w-full items-center justify-center gap-1.5 rounded-xl bg-[#1D1714] px-4 py-2.5 text-xs font-semibold text-[#F7F4EE] transition-all group-hover:bg-[#322822]"
        >
          View Talent Dossier
        </button>
      </div>
    </article>
  );
}
