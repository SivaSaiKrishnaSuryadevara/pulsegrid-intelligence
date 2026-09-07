'use client';

import {
  BadgeCheck,
  DollarSign,
  Eye,
  Lock,
  MapPin,
  Play,
  Radar,
  ShieldCheck,
  TrendingUp,
  UserCheck,
  UserPlus,
  Users,
  type LucideIcon,
} from 'lucide-react';

import { Avatar } from '@/components/pseo/avatar';
import { EXCLUSIVITY_TONE, getAvailabilityBadge } from '@/lib/discover/availability';
import { daysRemaining } from '@/lib/discover/blackout-helpers';
import { formatCompactNumber, formatPercent, formatRateRange } from '@/lib/format';
import { METRO_LABELS } from '@/lib/pseo/directory-config';
import type { CreatorCardModel, RepType } from '@/types/creator';

export interface VisualCreatorCardProps {
  creator: CreatorCardModel;
  isOnRoster: boolean;
  onToggleRoster: (creatorId: string) => void;
  /** Will open the Step 5 detail drawer for this creator. */
  onInspect: (creatorId: string) => void;
  onRevealDesk: (creatorId: string) => void;
  /** Agency-level credits remaining, shown on the gated action. */
  creditsRemaining: number;
  isDeskRevealed: boolean;
}

const REP_TYPE_LABELS: Record<RepType, string> = {
  DIRECT_MANAGER: 'Direct Manager Desk',
  TALENT_AGENCY: 'Talent Agency Desk',
  SELF_REPRESENTED: 'Self-Represented Desk',
  UNVERIFIED_BIO: 'Unverified Desk',
};

export function VisualCreatorCard({
  creator,
  isOnRoster,
  onToggleRoster,
  onInspect,
  onRevealDesk,
  creditsRemaining,
  isDeskRevealed,
}: VisualCreatorCardProps) {
  const availability = getAvailabilityBadge(creator);
  const metroMeta = METRO_LABELS[creator.primaryMetro];
  const [primaryConflict] = creator.activeBlackouts;
  const canReveal = !isDeskRevealed && creditsRemaining > 0;

  return (
    <article className="flex flex-col overflow-hidden rounded-2xl border border-[#1E2337] bg-[#131728] transition-all ease-out hover:border-slate-700/80">
      {/* Header */}
      <div className="flex items-start gap-3 p-4">
        <div className="relative shrink-0">
          <Avatar name={creator.displayName} url={creator.avatarUrl} size={44} />
          {creator.isVerified && (
            <span className="absolute -bottom-1 -right-1 flex h-4 w-4 items-center justify-center rounded-full bg-[#6366F1] shadow-[0_0_0_1px_rgba(99,102,241,0.5)] ring-2 ring-[#131728]">
              <BadgeCheck className="h-3 w-3 text-white" strokeWidth={2.5} />
            </span>
          )}
        </div>
        <div className="min-w-0 flex-1">
          <p className="truncate font-semibold text-white">{creator.displayName}</p>
          <p className="truncate text-sm text-slate-400">@{creator.handle}</p>
          <div className="mt-2 flex flex-wrap items-center gap-1.5">
            <span className="inline-flex items-center gap-1 rounded-full border border-[#1E2337] bg-[#0B0D17] px-2 py-0.5 text-[11px] font-medium text-slate-300">
              <MapPin className="h-3 w-3" />
              {metroMeta.shortLabel}
            </span>
            {creator.secondaryLanguages.slice(0, 2).map((language) => (
              <span
                key={language}
                className="rounded-full border border-[#6366F1]/30 bg-[#6366F1]/10 px-2 py-0.5 text-[11px] font-medium text-[#a5b4fc]"
              >
                {language}
              </span>
            ))}
            {creator.secondaryLanguages.length > 2 && (
              <span className="text-[11px] text-slate-500">+{creator.secondaryLanguages.length - 2}</span>
            )}
          </div>
        </div>
      </div>

      {/* Availability chip */}
      <div className="px-4">
        <span
          className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-semibold ${availability.toneClasses}`}
        >
          <availability.Icon className="h-3.5 w-3.5" />
          {availability.label}
        </span>
      </div>

      {/* Media strip — no per-reel data model exists yet (no thumbnails, no
          individual view counts), so all three tiles surface the creator's
          real aggregate avg_reel_views rather than three invented numbers. */}
      <div className="mt-3 grid grid-cols-3 gap-1.5 px-4">
        {[0, 1, 2].map((index) => (
          <div
            key={index}
            className="group relative aspect-[9/16] overflow-hidden rounded-lg bg-gradient-to-br from-[#1E2337] via-[#161a2c] to-[#0B0D17] ring-1 ring-inset ring-white/[0.03] transition duration-200 ease-out hover:ring-white/10"
          >
            <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_30%_20%,rgba(99,102,241,0.16),transparent_55%)]" />

            <div className="flex h-full items-center justify-center">
              <span className="flex h-8 w-8 items-center justify-center rounded-full bg-black/40 ring-1 ring-white/10 backdrop-blur-sm transition duration-200 ease-out group-hover:scale-110 group-hover:bg-[#6366F1]/80 group-hover:ring-[#6366F1]/50">
                <Play className="h-3.5 w-3.5 fill-white text-white" />
              </span>
            </div>

            <div className="absolute bottom-1.5 left-1.5 flex items-center gap-0.5 rounded-md bg-black/60 px-1.5 py-0.5 text-[10px] font-semibold text-white backdrop-blur-sm">
              <Play className="h-2.5 w-2.5 fill-white text-white" />
              {formatCompactNumber(creator.avgReelViews)}
            </div>
          </div>
        ))}
      </div>

      {/* Telemetry */}
      <div className="mt-4 grid grid-cols-2 gap-3 px-4 text-sm">
        <Metric icon={Users} label="Followers" value={formatCompactNumber(creator.followerCount)} />
        <Metric icon={TrendingUp} label="Engagement" value={formatPercent(creator.engagementRate)} accent />
        <Metric icon={Eye} label="Avg. Reel Views" value={formatCompactNumber(creator.avgReelViews)} />
        <Metric
          icon={DollarSign}
          label="Est. Rate / Reel"
          value={formatRateRange(creator.estMinimumRateUsd, creator.estMaximumRateUsd)}
        />
      </div>

      {/* Deliverability badge */}
      <div className="mt-4 px-4">
        <span className="inline-flex flex-wrap items-center gap-1.5 rounded-full border border-[#1E2337] bg-[#0B0D17] px-2.5 py-1 text-[11px] font-medium text-slate-300">
          <ShieldCheck className="h-3.5 w-3.5 text-emerald-400" />
          {creator.deliverabilityScore !== null ? `${creator.deliverabilityScore}% Deliverability` : 'Deliverability Pending'}
          <span className="text-slate-600">•</span>
          {REP_TYPE_LABELS[creator.repType]}
        </span>
      </div>

      {/* Active exclusivity-hold warning */}
      {primaryConflict && (
        <div className={`mx-4 mt-3 flex items-start gap-2 rounded-lg p-2.5 text-xs ${EXCLUSIVITY_TONE}`}>
          <span aria-hidden="true">⚠️</span>
          <span>
            Exclusivity Hold: <strong>{primaryConflict.brandName}</strong> · {daysRemaining(primaryConflict.endDate)} days
            left
          </span>
        </div>
      )}

      {/* Action bar */}
      <div className="mt-4 flex items-center gap-2 border-t border-[#1E2337] p-3">
        <button
          type="button"
          onClick={() => onToggleRoster(creator.id)}
          aria-pressed={isOnRoster}
          className={`flex flex-1 items-center justify-center gap-1.5 rounded-lg px-3 py-2 text-xs font-semibold transition ease-out ${
            isOnRoster
              ? 'bg-[#6366F1] text-white hover:bg-[#5457e5]'
              : 'border border-[#1E2337] text-slate-300 hover:border-[#6366F1] hover:text-white'
          }`}
        >
          {isOnRoster ? <UserCheck className="h-3.5 w-3.5" /> : <UserPlus className="h-3.5 w-3.5" />}
          {isOnRoster ? 'On Roster' : 'Quick Pitch'}
        </button>
        <button
          type="button"
          onClick={() => onInspect(creator.id)}
          className="flex items-center justify-center gap-1.5 rounded-lg border border-[#1E2337] px-3 py-2 text-xs font-semibold text-slate-300 transition ease-out hover:border-[#6366F1] hover:text-white"
        >
          <Radar className="h-3.5 w-3.5" />
          Inspect
        </button>
      </div>

      {/* Gated reveal-desk action */}
      <div className="border-t border-[#1E2337] p-3">
        <button
          type="button"
          onClick={() => onRevealDesk(creator.id)}
          disabled={!canReveal}
          className="flex w-full items-center justify-center gap-1.5 rounded-lg bg-[#0B0D17] px-3 py-2 text-xs font-semibold text-[#a5b4fc] transition ease-out hover:bg-[#1E2337] disabled:cursor-not-allowed disabled:opacity-50"
        >
          <Lock className="h-3.5 w-3.5" />
          {isDeskRevealed ? 'Desk Revealed' : `Reveal Desk (${creditsRemaining} left)`}
        </button>
      </div>
    </article>
  );
}

// =====================================================================================
// Local helpers
// =====================================================================================

function Metric({
  icon: Icon,
  label,
  value,
  accent = false,
}: {
  icon: LucideIcon;
  label: string;
  value: string;
  accent?: boolean;
}) {
  return (
    <div className="flex items-center gap-2">
      <Icon className="h-3.5 w-3.5 shrink-0 text-slate-500" />
      <div className="min-w-0">
        <p className="truncate text-[10px] uppercase tracking-wide text-slate-500">{label}</p>
        <p className={`truncate text-sm font-semibold ${accent ? 'text-[#a5b4fc]' : 'text-white'}`}>{value}</p>
      </div>
    </div>
  );
}

