'use client';

import { useState } from 'react';
import {
  BadgeCheck,
  Clock,
  DollarSign,
  ExternalLink,
  Eye,
  Lock,
  MapPin,
  Play,
  Radar,
  ShieldCheck,
  Sparkles,
  TrendingUp,
  UserCheck,
  UserPlus,
  Users,
  type LucideIcon,
} from 'lucide-react';

import { Avatar } from '@/components/pseo/avatar';
import { ENTITY_TYPE_EMOJI, REP_TYPE_DISPLAY_LABELS, VENUE_SCALE_LABELS } from '@/lib/discover/constants';
import { getAvailabilityBadge } from '@/lib/discover/availability';
import { daysRemaining } from '@/lib/discover/blackout-helpers';
import { cn } from '@/lib/cn';
import { formatCompactNumber, formatPercent, formatRateRange } from '@/lib/format';
import { toDisplayableMediaUrl } from '@/lib/media-proxy';
import { METRO_LABELS } from '@/lib/pseo/directory-config';
import type { CreatorCardModel, MediaProof } from '@/types/creator';

export interface VisualCreatorCardProps {
  creator: CreatorCardModel;
  isOnRoster: boolean;
  onToggleRoster: (creatorId: string) => void;
  /** Opens the full dossier drawer for this creator. */
  onInspect: (creatorId: string) => void;
  onRevealDesk: (creatorId: string) => void;
  /** Agency-level credits remaining, shown on the gated action. */
  creditsRemaining: number;
  isDeskRevealed: boolean;
}

/**
 * A heuristic composite of real signals already on the row (engagement,
 * deliverability, current availability) — not a live LLM call per card
 * render (too slow/costly for a grid of dozens) and not a fabricated
 * number. Disclosed here rather than presented as an opaque black box.
 */
function computeMatchScore(creator: CreatorCardModel): number {
  const engagementComponent = Math.min(1, (creator.engagementRate ?? 0) / 10) * 40;
  const deliverabilityComponent = ((creator.deliverabilityScore ?? 50) / 100) * 40;
  const availabilityComponent = creator.isAvailableNow ? 20 : 8;
  return Math.round(engagementComponent + deliverabilityComponent + availabilityComponent);
}

/** Badge copy per entity type — literal examples from spec where given, sensible fallbacks otherwise. */
function getEntityBadgeLabel(creator: CreatorCardModel): string {
  const emoji = ENTITY_TYPE_EMOJI[creator.entityType];
  switch (creator.entityDetails.kind) {
    case 'stage_emcee':
      return `${emoji} Live Stage Host`;
    case 'local_dj':
      return `${emoji} Festival DJ`;
    case 'dance_troupe':
      return creator.entityDetails.troupeSize
        ? `${emoji} ${creator.entityDetails.troupeSize}-Dancer Troupe`
        : `${emoji} Dance Troupe`;
    case 'event_planner':
      return `${emoji} Event Planner`;
    case 'solo_creator':
    default:
      return `${emoji} Content Creator`;
  }
}

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
  const matchScore = computeMatchScore(creator);
  const mediaProofs = creator.entityDetails.mediaProofs ?? [];

  return (
    <article className="flex flex-col space-y-3.5 rounded-2xl border border-zinc-200/90 bg-white p-5 shadow-sm transition-all hover:border-zinc-300 hover:shadow-md">
      {/* Header */}
      <div className="flex items-start justify-between gap-3">
        <div className="flex min-w-0 flex-1 items-start gap-3">
          <div className="relative shrink-0">
            <Avatar name={creator.displayName} url={creator.avatarUrl} size={44} />
            {creator.isVerified && (
              <span className="absolute -bottom-1 -right-1 flex h-4 w-4 items-center justify-center rounded-full bg-emerald-500 ring-2 ring-white">
                <BadgeCheck className="h-3 w-3 text-white" strokeWidth={2.5} />
              </span>
            )}
          </div>
          <div className="min-w-0 flex-1">
            <p className="truncate font-bold text-zinc-900">{creator.displayName}</p>
            <p className="truncate text-sm font-medium text-zinc-600">@{creator.handle}</p>
            <div className="mt-2 flex flex-wrap items-center gap-1.5">
              <span className="inline-flex items-center gap-1 rounded-full border border-zinc-200 bg-zinc-100 px-2.5 py-0.5 text-xs text-zinc-800">
                <MapPin className="h-3 w-3" />
                {metroMeta.shortLabel}
              </span>
              <span className="inline-flex items-center gap-1 rounded-full border border-zinc-200 bg-zinc-100 px-2.5 py-0.5 text-xs text-zinc-800">
                {getEntityBadgeLabel(creator)}
              </span>
            </div>
          </div>
        </div>

        <div className="flex shrink-0 flex-col items-end gap-2">
          <span className="inline-flex items-center gap-1 rounded-full border border-emerald-200 bg-emerald-50 px-2.5 py-1 text-[11px] font-semibold text-emerald-700">
            <Sparkles className="h-3 w-3" />
            {matchScore}% Match
          </span>
          <button
            type="button"
            onClick={() => onToggleRoster(creator.id)}
            aria-pressed={isOnRoster}
            aria-label={isOnRoster ? 'Remove from roster' : 'Add to roster'}
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
        </div>
      </div>

      {/* Availability chip */}
      <span
        className={cn(
          'inline-flex w-fit items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-semibold',
          availability.toneClasses
        )}
      >
        <availability.Icon className="h-3.5 w-3.5" />
        {availability.label}
      </span>

      {/* Media strip — real thumbnails when a scrape produced entityDetails.mediaProofs
          (see src/lib/ingest/apify-instagram-parser.ts); otherwise falls back to the
          gradient placeholder, surfacing the aggregate avg_reel_views rather than
          three invented per-tile numbers. */}
      <div className="grid grid-cols-3 gap-1.5">
        {mediaProofs.length > 0
          ? mediaProofs.map((proof) => <MediaProofTile key={proof.shortCode} proof={proof} />)
          : [0, 1, 2].map((index) => (
              <div
                key={index}
                className="group relative aspect-[4/5] overflow-hidden rounded-xl border border-zinc-200/80 bg-gradient-to-br from-zinc-100 to-zinc-200"
              >
                <div className="relative flex h-full items-center justify-center">
                  <span className="flex h-8 w-8 items-center justify-center rounded-full bg-white/90 shadow-sm ring-1 ring-zinc-200/80 transition-all duration-200 ease-out group-hover:scale-110 group-hover:bg-zinc-900 group-hover:ring-zinc-900">
                    <Play className="h-3.5 w-3.5 fill-zinc-700 text-zinc-700 transition-colors group-hover:fill-white group-hover:text-white" />
                  </span>
                </div>

                <div className="absolute bottom-1.5 left-1.5 flex items-center gap-1 rounded-md bg-white/90 px-2 py-0.5 font-mono text-[11px] font-medium tracking-tight text-zinc-800 shadow-sm">
                  <Play className="h-2.5 w-2.5 fill-zinc-700 text-zinc-700" />
                  {creator.entityDetails.kind === 'local_dj' ? 'Live Set' : formatCompactNumber(creator.avgReelViews)}
                </div>
              </div>
            ))}
      </div>

      {/* Telemetry — per entity type */}
      <div className="grid grid-cols-2 gap-3 text-sm">
        <EntityTelemetry creator={creator} />
      </div>

      {/* Deliverability badge */}
      <span className="inline-flex w-fit flex-wrap items-center gap-1.5 rounded-full border border-zinc-200 bg-zinc-100 px-2.5 py-1 text-[11px] font-medium text-zinc-800">
        <ShieldCheck className="h-3.5 w-3.5 text-emerald-600" />
        {creator.deliverabilityScore !== null ? `${creator.deliverabilityScore}% Deliverability` : 'Deliverability Pending'}
        <span className="text-zinc-400">•</span>
        {REP_TYPE_DISPLAY_LABELS[creator.repType]}
      </span>

      {/* Active exclusivity-hold warning */}
      {primaryConflict && (
        <div className="flex items-center gap-2 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs font-medium text-amber-900">
          <span aria-hidden="true">⚠️</span>
          <span>
            Exclusivity Alert: Active <strong>{primaryConflict.categorySlug}</strong> blackout with{' '}
            <strong>{primaryConflict.brandName}</strong> · {daysRemaining(primaryConflict.endDate)} days remaining
          </span>
        </div>
      )}

      {/* Action bar */}
      <div className="flex items-center gap-2 border-t border-zinc-200 pt-3.5">
        <button
          type="button"
          onClick={() => onInspect(creator.id)}
          className="flex flex-1 items-center justify-center gap-1.5 rounded-xl border border-zinc-200 px-4 py-2.5 text-xs font-semibold text-zinc-700 transition-all hover:border-zinc-400 hover:text-zinc-900"
        >
          <Radar className="h-3.5 w-3.5" />
          Inspect Full Dossier →
        </button>
        <button
          type="button"
          onClick={() => onRevealDesk(creator.id)}
          disabled={!canReveal}
          className="flex flex-1 items-center justify-center gap-1.5 rounded-xl bg-zinc-900 px-4 py-2.5 text-xs font-semibold text-white shadow-sm transition-all hover:bg-zinc-800 disabled:cursor-not-allowed disabled:opacity-50"
        >
          <Lock className="h-3.5 w-3.5" />
          {isDeskRevealed ? 'Desk Revealed' : `⚡ Reveal Desk & Booking Brief`}
        </button>
      </div>
    </article>
  );
}

// =====================================================================================
// Local helpers
// =====================================================================================

/**
 * Real thumbnail, routed through /api/media-proxy — a direct <img src> to
 * Instagram's CDN is unconditionally blocked by the browser
 * (Cross-Origin-Resource-Policy: same-origin on their response; see that
 * route's header comment). Falls back to the gradient placeholder look if
 * even the proxied fetch fails (truly expired URL, network hiccup, ...).
 *
 * The tile is a real link to the original Instagram post
 * (instagram.com/p/<shortCode>/, which resolves for photo and video/reel
 * posts alike) — we only have a static `displayUrl` thumbnail, not a video
 * file, so there's no in-app player to build; "will it play" is honestly
 * answered by sending the click to the one place that can actually play
 * it. The center icon reflects that: Play only when this post genuinely
 * has a play count (i.e. is a video/reel — `proof.playCount !== null`),
 * otherwise an external-link glyph, so a photo tile doesn't visually
 * promise playback it can't deliver.
 */
function MediaProofTile({ proof }: { proof: MediaProof }) {
  const [failed, setFailed] = useState(false);
  const isVideo = proof.playCount !== null;
  const CenterIcon = isVideo ? Play : ExternalLink;

  return (
    <a
      href={`https://www.instagram.com/p/${proof.shortCode}/`}
      target="_blank"
      rel="noopener noreferrer"
      className="group relative block aspect-[4/5] overflow-hidden rounded-xl border border-zinc-200/80 bg-zinc-100"
    >
      {failed ? (
        <div className="absolute inset-0 bg-gradient-to-br from-zinc-100 to-zinc-200 transition-transform duration-300 ease-out group-hover:scale-105" />
      ) : (
        // eslint-disable-next-line @next/next/no-img-element -- proxied external image; no remote-pattern allowlist is configured for next/image (see src/components/pseo/avatar.tsx)
        <img
          src={toDisplayableMediaUrl(proof.displayUrl)}
          alt=""
          onError={() => setFailed(true)}
          className="absolute inset-0 h-full w-full object-cover transition-transform duration-300 ease-out group-hover:scale-105"
        />
      )}
      <div className="relative flex h-full items-center justify-center">
        <span className="flex h-8 w-8 items-center justify-center rounded-full bg-white/90 shadow-sm ring-1 ring-zinc-200/80 transition-all duration-200 ease-out group-hover:scale-110 group-hover:bg-zinc-900 group-hover:ring-zinc-900">
          <CenterIcon className="h-3.5 w-3.5 fill-zinc-700 text-zinc-700 transition-colors group-hover:fill-white group-hover:text-white" />
        </span>
      </div>
      <div className="absolute bottom-1.5 left-1.5 flex items-center gap-1 rounded-md bg-white/90 px-2 py-0.5 font-mono text-[11px] font-medium tracking-tight text-zinc-800 shadow-sm">
        <CenterIcon className="h-2.5 w-2.5 fill-zinc-700 text-zinc-700" />
        {isVideo ? formatCompactNumber(proof.playCount) : 'Photo'}
      </div>
    </a>
  );
}

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
      <Icon className="h-3.5 w-3.5 shrink-0 text-zinc-500" />
      <div className="min-w-0">
        <p className="truncate text-[10px] font-semibold uppercase tracking-wider text-zinc-500">{label}</p>
        <p
          className={cn(
            'truncate font-mono text-sm font-semibold tracking-tight',
            accent ? 'text-emerald-700' : 'text-zinc-900'
          )}
        >
          {value}
        </p>
      </div>
    </div>
  );
}

/**
 * Per-entity-type telemetry. Rows scraped through the Apify webhook without
 * full `entityDetails` (see that route's header note) carry only `{ kind }`
 * — every optional field below falls back to an explicit "—"/"Pending"
 * rather than silently rendering `undefined`.
 */
function EntityTelemetry({ creator }: { creator: CreatorCardModel }) {
  const details = creator.entityDetails;

  if (details.kind === 'local_dj') {
    return (
      <>
        <Metric icon={Users} label="Max Capacity" value={details.maxCapacity ? formatCompactNumber(details.maxCapacity) : '—'} />
        <Metric icon={Clock} label="Set Length" value={details.setLengthMinutes ? `${details.setLengthMinutes} min` : '—'} />
        <Metric icon={TrendingUp} label="Sound Rig" value={details.avSpecNotes ? 'Full Rig Incl.' : 'Console Only'} accent />
        <Metric icon={DollarSign} label="Booking Rate" value={formatRateRange(creator.estMinimumRateUsd, creator.estMaximumRateUsd)} />
      </>
    );
  }

  if (details.kind === 'dance_troupe') {
    return (
      <>
        <Metric icon={Users} label="Performers" value={details.troupeSize ? String(details.troupeSize) : '—'} />
        <Metric icon={Sparkles} label="Style" value={details.style || '—'} accent />
        <Metric icon={ShieldCheck} label="Stage Rider" value={details.stageRiderNotes ? 'On File' : 'Pending'} />
        <Metric icon={DollarSign} label="Honorarium" value={formatRateRange(creator.estMinimumRateUsd, creator.estMaximumRateUsd)} />
      </>
    );
  }

  if (details.kind === 'event_planner') {
    return (
      <>
        <Metric
          icon={ShieldCheck}
          label="Permit Rating"
          value={details.permitRating != null ? `${details.permitRating}%` : 'Pending'}
          accent
        />
        <Metric icon={Users} label="Venue Scale" value={VENUE_SCALE_LABELS[details.venueScaleBracket]} />
        <Metric icon={DollarSign} label="Est. Budget" value={formatRateRange(creator.estMinimumRateUsd, creator.estMaximumRateUsd)} />
        <Metric icon={Eye} label="Portfolio" value={details.portfolioUrl ? 'View →' : 'Pending'} />
      </>
    );
  }

  // solo_creator / stage_emcee
  return (
    <>
      <Metric icon={Users} label="Reach" value={formatCompactNumber(creator.followerCount)} />
      <Metric icon={TrendingUp} label="Engagement" value={formatPercent(creator.engagementRate)} accent />
      <Metric icon={Eye} label="Avg Reel Velocity" value={formatCompactNumber(creator.avgReelViews)} />
      <Metric icon={DollarSign} label="Est. Rate" value={formatRateRange(creator.estMinimumRateUsd, creator.estMaximumRateUsd)} />
    </>
  );
}
