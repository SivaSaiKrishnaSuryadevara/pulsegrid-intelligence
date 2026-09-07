'use client';

import * as Dialog from '@radix-ui/react-dialog';
import * as Tabs from '@radix-ui/react-tabs';
import {
  AlertTriangle,
  BadgeCheck,
  Check,
  Copy,
  DollarSign,
  Eye,
  Lock,
  MapPin,
  ShieldCheck,
  TrendingUp,
  Unlock,
  Users,
  X,
  type LucideIcon,
} from 'lucide-react';
import { useEffect, useState } from 'react';

import { Avatar } from '@/components/pseo/avatar';
import { getAvailabilityBadge } from '@/lib/discover/availability';
import { daysRemaining, humanizeSlug } from '@/lib/discover/blackout-helpers';
import { NICHE_DISPLAY_LABELS } from '@/lib/discover/constants';
import { type BlackoutHistoryEntry, fetchCreatorBlackoutHistory } from '@/lib/discover/queries';
import { formatCompactNumber, formatPercent, formatRateRange } from '@/lib/format';
import { METRO_LABELS } from '@/lib/pseo/directory-config';
import { getBrowserSupabaseClient } from '@/lib/supabase/client';
import type { ContactUnlockPayload, CreatorCardModel, PrimaryNiche, RepType } from '@/types/creator';

export interface CreatorDetailDrawerProps {
  /** `null` closes the drawer — there is no separate `isOpen` prop to keep out of sync with this. */
  creator: CreatorCardModel | null;
  onClose: () => void;
  creditsRemaining: number;
  isDeskRevealed: boolean;
  onUnlock: (creatorId: string) => Promise<ContactUnlockPayload>;
}

const REP_TYPE_LABELS: Record<RepType, string> = {
  DIRECT_MANAGER: 'Direct Manager Desk',
  TALENT_AGENCY: 'Talent Agency Desk',
  SELF_REPRESENTED: 'Self-Represented Desk',
  UNVERIFIED_BIO: 'Unverified Desk',
};

const READINESS_LABELS = ['Stage Emcee', 'Sangeet Host', 'Luxury Bridal', 'Brand Ambassador', 'Choreography'] as const;

/**
 * Only these three map to a real, stored signal (primary_niche). The other
 * two ("Sangeet Host", "Brand Ambassador") have no backing field yet, so
 * they render as unconfirmed rather than a fabricated yes/no.
 */
const NICHE_TO_READINESS_LABEL: Partial<Record<PrimaryNiche, (typeof READINESS_LABELS)[number]>> = {
  STAGE_EMCEE: 'Stage Emcee',
  LUXURY_BRIDAL: 'Luxury Bridal',
  CHOREOGRAPHY: 'Choreography',
};

type UnlockState = 'locked' | 'unlocking' | 'unlocked' | 'error';

export function CreatorDetailDrawer({
  creator,
  onClose,
  creditsRemaining,
  isDeskRevealed,
  onUnlock,
}: CreatorDetailDrawerProps) {
  const [activeTab, setActiveTab] = useState('telemetry');
  const [unlockState, setUnlockState] = useState<UnlockState>('locked');
  const [unlockError, setUnlockError] = useState<string | null>(null);
  const [revealedContact, setRevealedContact] = useState<Extract<ContactUnlockPayload, { success: true }>['contact'] | null>(
    null
  );
  const [blackoutHistory, setBlackoutHistory] = useState<BlackoutHistoryEntry[]>([]);
  const [historyLoadError, setHistoryLoadError] = useState<string | null>(null);

  const creatorId = creator?.id ?? null;

  // Reset per-creator state whenever the inspected creator changes (the
  // drawer itself may stay mounted if the user jumps straight from one
  // card's "Inspect" to another's without closing it first).
  useEffect(() => {
    setActiveTab('telemetry');
    setUnlockError(null);
    setRevealedContact(null);
    setBlackoutHistory([]);
    setHistoryLoadError(null);
    setUnlockState(isDeskRevealed ? 'unlocking' : 'locked');
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [creatorId]);

  // If this creator was already unlocked elsewhere (e.g. the grid card's
  // own Reveal Desk button), fetch the real contact immediately — the RPC
  // is idempotent, so this costs no credit.
  useEffect(() => {
    if (!creatorId || !isDeskRevealed || revealedContact) {
      return;
    }
    let cancelled = false;
    setUnlockState('unlocking');
    onUnlock(creatorId)
      .then((payload) => {
        if (cancelled) return;
        if (payload.success) {
          setRevealedContact(payload.contact);
          setUnlockState('unlocked');
        } else {
          setUnlockError(describeUnlockFailure(payload.reason));
          setUnlockState('error');
        }
      })
      .catch((err) => {
        if (cancelled) return;
        setUnlockError(err instanceof Error ? err.message : String(err));
        setUnlockState('error');
      });
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [creatorId, isDeskRevealed]);

  // Brand history is fetched fresh each time a creator is inspected — it's
  // detail-view-only data, not part of the lightweight grid dataset.
  useEffect(() => {
    if (!creatorId) return;
    let cancelled = false;
    setHistoryLoadError(null);
    fetchCreatorBlackoutHistory(getBrowserSupabaseClient(), creatorId)
      .then((entries) => {
        if (!cancelled) setBlackoutHistory(entries);
      })
      .catch((err) => {
        if (!cancelled) setHistoryLoadError(err instanceof Error ? err.message : String(err));
      });
    return () => {
      cancelled = true;
    };
  }, [creatorId]);

  async function handleUnlockClick(): Promise<void> {
    if (!creatorId || unlockState === 'unlocking' || unlockState === 'unlocked') return;
    setUnlockState('unlocking');
    setUnlockError(null);
    try {
      const payload = await onUnlock(creatorId);
      if (payload.success) {
        setRevealedContact(payload.contact);
        setUnlockState('unlocked');
      } else {
        setUnlockError(describeUnlockFailure(payload.reason));
        setUnlockState('error');
      }
    } catch (err) {
      setUnlockError(err instanceof Error ? err.message : String(err));
      setUnlockState('error');
    }
  }

  return (
    <Dialog.Root open={creator !== null} onOpenChange={(open) => !open && onClose()}>
      <Dialog.Portal>
        <Dialog.Overlay
          className="fixed inset-0 z-40 bg-black/60 transition-opacity data-[state=closed]:opacity-0 data-[state=open]:opacity-100"
        />
        <Dialog.Content
          className="fixed inset-y-0 right-0 z-50 flex w-full max-w-md flex-col overflow-y-auto border-l border-[#1E2337] bg-[#0B0D17] text-slate-100 shadow-2xl transition-transform duration-300 ease-out data-[state=closed]:translate-x-full data-[state=open]:translate-x-0 sm:max-w-lg"
        >
          {creator && (
            <>
              <Dialog.Title className="sr-only">{creator.displayName} creator intelligence</Dialog.Title>
              <Dialog.Description className="sr-only">
                Detailed audience telemetry, brand history, and representation details for {creator.displayName}.
              </Dialog.Description>

              <DrawerHeader creator={creator} onClose={onClose} />

              <Tabs.Root value={activeTab} onValueChange={setActiveTab} className="flex flex-1 flex-col">
                <Tabs.List className="flex border-b border-[#1E2337] px-4">
                  <TabTrigger value="telemetry" label="Telemetry" />
                  <TabTrigger value="history" label="Brand History" />
                  <TabTrigger value="desk" label="Talent Desk" />
                </Tabs.List>

                <Tabs.Content value="telemetry" className="flex-1 space-y-6 p-4">
                  <TelemetryTab creator={creator} />
                </Tabs.Content>

                <Tabs.Content value="history" className="flex-1 space-y-4 p-4">
                  <BrandHistoryTab entries={blackoutHistory} loadError={historyLoadError} />
                </Tabs.Content>

                <Tabs.Content value="desk" className="flex-1 space-y-4 p-4">
                  <TalentDeskTab
                    creator={creator}
                    creditsRemaining={creditsRemaining}
                    unlockState={unlockState}
                    unlockError={unlockError}
                    revealedContact={revealedContact}
                    onUnlockClick={handleUnlockClick}
                  />
                </Tabs.Content>
              </Tabs.Root>
            </>
          )}
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}

function describeUnlockFailure(reason: Extract<ContactUnlockPayload, { success: false }>['reason']): string {
  switch (reason) {
    case 'INSUFFICIENT_CREDITS':
      return 'No unlock credits remaining — upgrade tier or purchase an unlock pack.';
    case 'ALREADY_UNLOCKED':
      return 'This desk is already unlocked.';
    case 'CREATOR_NOT_FOUND':
      return 'This creator could not be found.';
    default:
      return 'Unlock failed.';
  }
}

// =====================================================================================
// Header
// =====================================================================================

function DrawerHeader({ creator, onClose }: { creator: CreatorCardModel; onClose: () => void }) {
  const availability = getAvailabilityBadge(creator);
  const metroLabel = METRO_LABELS[creator.primaryMetro].label;
  const nicheLabel = NICHE_DISPLAY_LABELS[creator.primaryNiche];

  return (
    <div className="border-b border-[#1E2337] p-4">
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-start gap-3">
          <div className="relative shrink-0">
            <Avatar name={creator.displayName} url={creator.avatarUrl} size={56} />
            {creator.isVerified && (
              <span className="absolute -bottom-1 -right-1 flex h-5 w-5 items-center justify-center rounded-full bg-[#6366F1] ring-2 ring-[#0B0D17]">
                <BadgeCheck className="h-3 w-3 text-white" strokeWidth={2.5} />
              </span>
            )}
          </div>
          <div className="min-w-0">
            <p className="truncate text-lg font-semibold text-white">{creator.displayName}</p>
            <p className="truncate text-sm text-slate-400">@{creator.handle}</p>
            <div className="mt-2 flex flex-wrap items-center gap-1.5">
              <span className="inline-flex items-center gap-1 rounded-full border border-[#1E2337] bg-[#131728] px-2 py-0.5 text-[11px] font-medium text-slate-300">
                <MapPin className="h-3 w-3" />
                {metroLabel}
              </span>
              <span className="rounded-full border border-[#1E2337] bg-[#131728] px-2 py-0.5 text-[11px] font-medium text-slate-300">
                {nicheLabel}
              </span>
            </div>
          </div>
        </div>
        <Dialog.Close asChild>
          <button
            type="button"
            onClick={onClose}
            className="shrink-0 rounded-full p-1.5 text-slate-400 transition hover:bg-[#131728] hover:text-white"
            aria-label="Close intelligence drawer"
          >
            <X className="h-4 w-4" />
          </button>
        </Dialog.Close>
      </div>

      <span
        className={`mt-4 inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-semibold ${availability.toneClasses}`}
      >
        <availability.Icon className="h-3.5 w-3.5" />
        {availability.label}
      </span>
    </div>
  );
}

function TabTrigger({ value, label }: { value: string; label: string }) {
  return (
    <Tabs.Trigger
      value={value}
      className="flex-1 border-b-2 border-transparent px-3 py-3 text-xs font-semibold text-slate-500 transition hover:text-slate-300 data-[state=active]:border-[#6366F1] data-[state=active]:text-white"
    >
      {label}
    </Tabs.Trigger>
  );
}

// =====================================================================================
// Tab 1 — Audience & Performance Telemetry
// =====================================================================================

function TelemetryTab({ creator }: { creator: CreatorCardModel }) {
  const metroLabel = METRO_LABELS[creator.primaryMetro].shortLabel;

  return (
    <>
      <section>
        <h3 className="mb-3 text-xs font-semibold uppercase tracking-wide text-slate-500">
          Audience &amp; Performance Telemetry
        </h3>
        <div className="grid grid-cols-2 gap-3">
          <DrawerMetric icon={Users} label="Followers" value={formatCompactNumber(creator.followerCount)} />
          <DrawerMetric icon={TrendingUp} label="Engagement Rate" value={formatPercent(creator.engagementRate)} accent />
          <DrawerMetric icon={Eye} label="30-Day Avg. Reel Views" value={formatCompactNumber(creator.avgReelViews)} />
          <DrawerMetric
            icon={DollarSign}
            label="Est. Rate Bounds"
            value={formatRateRange(creator.estMinimumRateUsd, creator.estMaximumRateUsd)}
          />
        </div>
      </section>

      <section>
        <h3 className="mb-3 text-xs font-semibold uppercase tracking-wide text-slate-500">Audience Metro Distribution</h3>
        <div className="rounded-xl border border-[#1E2337] bg-[#131728] p-3">
          <div className="mb-1 flex items-center justify-between text-xs">
            <span className="text-slate-300">{metroLabel}</span>
            <span className="font-semibold text-[#a5b4fc]">100%</span>
          </div>
          <div className="h-2 w-full overflow-hidden rounded-full bg-[#1E2337]">
            <div className="h-full rounded-full bg-[#6366F1]" style={{ width: '100%' }} />
          </div>
          <p className="mt-2 text-[11px] text-slate-600">
            Reflects verified primary metro. Multi-city audience breakdown isn&apos;t ingested yet.
          </p>
        </div>
      </section>

      <section>
        <h3 className="mb-3 text-xs font-semibold uppercase tracking-wide text-slate-500">
          Event &amp; Cultural Readiness
        </h3>
        <div className="flex flex-wrap gap-1.5">
          {READINESS_LABELS.map((label) => {
            const isConfirmed = NICHE_TO_READINESS_LABEL[creator.primaryNiche] === label;
            return (
              <span
                key={label}
                className={`inline-flex items-center gap-1 rounded-full border px-2.5 py-1 text-xs font-medium ${
                  isConfirmed
                    ? 'border-emerald-500/30 bg-emerald-500/10 text-emerald-300'
                    : 'border-[#1E2337] bg-[#131728] text-slate-600'
                }`}
              >
                {isConfirmed && <BadgeCheck className="h-3 w-3" />}
                {label}
              </span>
            );
          })}
        </div>
        <p className="mt-2 text-[11px] text-slate-600">Confirmed via primary niche; other tags pending additional signal.</p>
      </section>

      <section>
        <h3 className="mb-3 text-xs font-semibold uppercase tracking-wide text-slate-500">Verified Language / Dialect</h3>
        {creator.secondaryLanguages.length > 0 ? (
          <div className="flex flex-wrap gap-1.5">
            {creator.secondaryLanguages.map((language) => (
              <span
                key={language}
                className="rounded-full border border-[#6366F1]/30 bg-[#6366F1]/10 px-2.5 py-1 text-xs font-medium text-[#a5b4fc]"
              >
                {language}
              </span>
            ))}
          </div>
        ) : (
          <p className="text-xs text-slate-600">No additional languages on file.</p>
        )}
      </section>
    </>
  );
}

function DrawerMetric({
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
    <div className="rounded-xl border border-[#1E2337] bg-[#131728] p-3">
      <div className="flex items-center gap-1.5 text-slate-500">
        <Icon className="h-3.5 w-3.5" />
        <p className="text-[10px] uppercase tracking-wide">{label}</p>
      </div>
      <p className={`mt-1.5 text-lg font-bold ${accent ? 'text-[#a5b4fc]' : 'text-white'}`}>{value}</p>
    </div>
  );
}

// =====================================================================================
// Tab 2 — Brand History & Exclusivity Radar
// =====================================================================================

function BrandHistoryTab({ entries, loadError }: { entries: BlackoutHistoryEntry[]; loadError: string | null }) {
  const activeEntries = entries.filter((entry) => entry.isActive);

  return (
    <>
      {activeEntries.length > 0 && (
        <section>
          <h3 className="mb-3 text-xs font-semibold uppercase tracking-wide text-slate-500">Exclusivity Radar</h3>
          <div className="space-y-2">
            {activeEntries.map((entry) => (
              <div
                key={entry.id}
                className="flex items-start gap-2 rounded-xl border border-rose-500/30 bg-rose-500/10 p-3 text-xs text-rose-300"
              >
                <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
                <span>
                  🔴 Active Exclusivity: <strong>{humanizeSlug(entry.categorySlug)}</strong> — {entry.brandName} —{' '}
                  {daysRemaining(entry.endDate)} days remaining
                </span>
              </div>
            ))}
          </div>
        </section>
      )}

      <section>
        <h3 className="mb-3 text-xs font-semibold uppercase tracking-wide text-slate-500">Brand Collaboration Timeline</h3>
        {loadError && <p className="text-xs text-rose-400">{loadError}</p>}
        {!loadError && entries.length === 0 && (
          <p className="text-xs text-slate-600">No brand collaborations on file for this creator yet.</p>
        )}
        {entries.length > 0 && (
          <ol className="space-y-3 border-l border-[#1E2337] pl-4">
            {entries.map((entry) => (
              <li key={entry.id} className="relative">
                <span
                  className={`absolute -left-[21px] top-1 h-2.5 w-2.5 rounded-full ${
                    entry.isActive ? 'bg-rose-400' : 'bg-slate-600'
                  }`}
                />
                <p className="text-sm font-medium text-slate-200">
                  {entry.brandName} <span className="text-slate-500">· {humanizeSlug(entry.categorySlug)}</span>
                </p>
                <p className="text-[11px] text-slate-500">
                  {entry.startDate} – {entry.endDate}
                  {entry.isActive && ' · active'}
                </p>
              </li>
            ))}
          </ol>
        )}
      </section>
    </>
  );
}

// =====================================================================================
// Tab 3 — Verified Talent Desk & Representation
// =====================================================================================

function TalentDeskTab({
  creator,
  creditsRemaining,
  unlockState,
  unlockError,
  revealedContact,
  onUnlockClick,
}: {
  creator: CreatorCardModel;
  creditsRemaining: number;
  unlockState: UnlockState;
  unlockError: string | null;
  revealedContact: Extract<ContactUnlockPayload, { success: true }>['contact'] | null;
  onUnlockClick: () => void;
}) {
  if (unlockState === 'unlocked' && revealedContact) {
    return (
      <section className="space-y-4">
        <div className="flex items-center gap-2 rounded-xl border border-emerald-500/30 bg-emerald-500/10 p-3 text-xs text-emerald-300">
          <Unlock className="h-4 w-4" />
          Desk unlocked — representation details below are live.
        </div>

        <ContactRow label="Email" value={revealedContact.directBookingEmail} />
        <ContactRow label="Phone" value={revealedContact.directBookingPhone} />

        <div className="rounded-xl border border-[#1E2337] bg-[#131728] p-3">
          <p className="text-[10px] uppercase tracking-wide text-slate-500">Representation</p>
          <p className="mt-1 text-sm font-semibold text-white">{REP_TYPE_LABELS[revealedContact.repType]}</p>
        </div>

        <DeliverabilityBadge score={revealedContact.deliverabilityScore} repType={revealedContact.repType} />
      </section>
    );
  }

  return (
    <section className="space-y-4">
      <div className="rounded-xl border border-dashed border-[#1E2337] bg-[#131728] p-4">
        <p className="text-[10px] uppercase tracking-wide text-slate-500">Booking Contact</p>
        <p className="mt-2 select-none font-mono text-sm text-slate-400 blur-[3px]" aria-hidden="true">
          b•••••@agency.com
        </p>
        <p className="mt-1 select-none font-mono text-sm text-slate-400 blur-[3px]" aria-hidden="true">
          +1 (•••) •••-••••
        </p>
      </div>

      <DeliverabilityBadge score={creator.deliverabilityScore} repType={creator.repType} />

      {unlockState === 'error' && unlockError && (
        <p className="rounded-lg border border-rose-500/30 bg-rose-500/10 p-2.5 text-xs text-rose-300">{unlockError}</p>
      )}

      <button
        type="button"
        onClick={onUnlockClick}
        disabled={unlockState === 'unlocking' || creditsRemaining <= 0}
        className="flex w-full items-center justify-center gap-2 rounded-lg bg-[#6366F1] px-4 py-3 text-sm font-semibold text-white transition hover:bg-[#5457e5] disabled:cursor-not-allowed disabled:opacity-50"
      >
        <Lock className="h-4 w-4" />
        {unlockState === 'unlocking'
          ? 'Unlocking…'
          : creditsRemaining <= 0
            ? 'No Credits Remaining'
            : 'Unlock Direct Desk (Spends 1 Credit)'}
      </button>
      <p className="text-center text-[11px] text-slate-600">{creditsRemaining} unlock credit{creditsRemaining === 1 ? '' : 's'} remaining</p>
    </section>
  );
}

function DeliverabilityBadge({ score, repType }: { score: number | null; repType: RepType }) {
  return (
    <span className="inline-flex flex-wrap items-center gap-1.5 rounded-full border border-[#1E2337] bg-[#0B0D17] px-2.5 py-1 text-[11px] font-medium text-slate-300">
      <ShieldCheck className="h-3.5 w-3.5 text-emerald-400" />
      {score !== null ? `${score}% SMTP Validated` : 'Deliverability Pending'}
      <span className="text-slate-600">•</span>
      {REP_TYPE_LABELS[repType]}
    </span>
  );
}

function ContactRow({ label, value }: { label: string; value: string | null }) {
  const [copied, setCopied] = useState(false);

  async function handleCopy(): Promise<void> {
    if (!value) return;
    try {
      await navigator.clipboard.writeText(value);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      // Clipboard API can be unavailable (permissions, insecure context) —
      // the button simply won't show the "copied" confirmation.
    }
  }

  return (
    <div className="flex items-center justify-between gap-2 rounded-xl border border-[#1E2337] bg-[#131728] p-3">
      <div className="min-w-0">
        <p className="text-[10px] uppercase tracking-wide text-slate-500">{label}</p>
        <p className="mt-1 truncate text-sm font-medium text-white">{value ?? 'Not on file'}</p>
      </div>
      {value && (
        <button
          type="button"
          onClick={handleCopy}
          aria-label={`Copy ${label.toLowerCase()}`}
          className="shrink-0 rounded-lg border border-[#1E2337] p-2 text-slate-400 transition hover:border-[#6366F1] hover:text-white"
        >
          {copied ? <Check className="h-3.5 w-3.5 text-emerald-400" /> : <Copy className="h-3.5 w-3.5" />}
        </button>
      )}
    </div>
  );
}
