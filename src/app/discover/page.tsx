'use client';

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { AlertCircle, Building2, Command, Download, LayoutGrid, ListFilter, LogIn, Sparkles, Users } from 'lucide-react';

import { AgencyPassModal, type AgencyPassModalProps } from '@/components/growth/agency-pass-modal';
import { SocialProofBanner } from '@/components/growth/social-proof-banner';
import { CreatorDetailDrawer } from '@/components/discover/creator-detail-drawer';
import { EntityTypeTabs } from '@/components/discover/entity-type-tabs';
import { FilterStrip } from '@/components/discover/filter-strip';
import { GovernanceFooter } from '@/components/discover/governance-footer';
import { RosterActionDock } from '@/components/discover/roster-action-dock';
import { RosterTableView } from '@/components/discover/roster-table-view';
import { VisualCreatorCard } from '@/components/discover/visual-creator-card';
import { DEFAULT_FILTER_CRITERIA } from '@/lib/discover/constants';
import { countActiveFilters, describeActiveFilters, matchesFilters } from '@/lib/discover/filters';
import { fetchAgencyProfile, fetchDiscoveryCreators } from '@/lib/discover/queries';
import { METRO_LABELS } from '@/lib/pseo/directory-config';
import { getBrowserSupabaseClient } from '@/lib/supabase/client';
import { ENTITY_TYPES, type ContactUnlockPayload, type CreatorCardModel, type EntityType, type FilterCriteria } from '@/types/creator';

type LoadState = 'checking-auth' | 'unauthenticated' | 'loading' | 'ready' | 'error';
type ViewMode = 'grid' | 'table';

const SEARCH_INPUT_ID = 'discover-quick-search';

export default function DiscoverPage() {
  const [loadState, setLoadState] = useState<LoadState>('checking-auth');
  const [loadErrorMessage, setLoadErrorMessage] = useState<string | null>(null);
  const [allCreators, setAllCreators] = useState<CreatorCardModel[]>([]);
  const [creditsRemaining, setCreditsRemaining] = useState(0);
  const [agencyName, setAgencyName] = useState<string | null>(null);
  const [filters, setFilters] = useState<FilterCriteria>(DEFAULT_FILTER_CRITERIA);
  const [rosterIds, setRosterIds] = useState<Set<string>>(new Set());
  const [revealedDeskIds, setRevealedDeskIds] = useState<Set<string>>(new Set());
  const [inspectingCreatorId, setInspectingCreatorId] = useState<string | null>(null);
  const [isExporting, setIsExporting] = useState(false);
  const [exportError, setExportError] = useState<string | null>(null);
  const [viewMode, setViewMode] = useState<ViewMode>('grid');
  const [paywallState, setPaywallState] = useState<{ open: boolean; trigger: AgencyPassModalProps['trigger'] }>({
    open: false,
    trigger: 'manual',
  });

  useEffect(() => {
    let cancelled = false;

    async function load(): Promise<void> {
      try {
        const supabase = getBrowserSupabaseClient();
        const {
          data: { user },
        } = await supabase.auth.getUser();

        if (!user) {
          if (!cancelled) setLoadState('unauthenticated');
          return;
        }

        if (!cancelled) setLoadState('loading');

        const [creators, agencyProfile] = await Promise.all([
          fetchDiscoveryCreators(supabase),
          fetchAgencyProfile(supabase, user.id),
        ]);

        if (cancelled) return;
        setAllCreators(creators);
        setCreditsRemaining(agencyProfile.creditsRemaining);
        setAgencyName(agencyProfile.agencyName);
        setLoadState('ready');
      } catch (err) {
        if (cancelled) return;
        setLoadErrorMessage(err instanceof Error ? err.message : String(err));
        setLoadState('error');
      }
    }

    void load();
    return () => {
      cancelled = true;
    };
  }, []);

  // ⌘K / Ctrl+K focuses the quick-search input in the filter strip, rather
  // than opening a separate command palette — no command-palette lib
  // (cmdk) is installed and nothing in this pass scopes what such a
  // palette would search beyond what the filter strip already covers.
  useEffect(() => {
    function handleKeyDown(event: KeyboardEvent): void {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'k') {
        event.preventDefault();
        document.getElementById(SEARCH_INPUT_ID)?.focus();
      }
    }
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, []);

  // All filtering happens over the already-fetched in-memory array — no
  // network round-trip per filter change, so the grid updates instantly.
  const filteredCreators = useMemo(
    () => allCreators.filter((creator) => matchesFilters(creator, filters)),
    [allCreators, filters]
  );

  // Entity-type tab counts reflect every OTHER active filter dimension
  // (metro, niche, search, ...) so switching tabs shows relevant counts —
  // just not the entity-type dimension itself, which the tabs control.
  const entityTypeCounts = useMemo(() => {
    const criteriaWithoutEntityType: FilterCriteria = { ...filters, selectedEntityTypes: [] };
    const scoped = allCreators.filter((creator) => matchesFilters(creator, criteriaWithoutEntityType));
    const counts: Partial<Record<EntityType | 'all', number>> = { all: scoped.length };
    for (const entityType of ENTITY_TYPES) {
      counts[entityType] = scoped.filter((creator) => creator.entityType === entityType).length;
    }
    return counts;
  }, [allCreators, filters]);

  const activeFilterCount = countActiveFilters(filters);
  const activeFilterBadges = useMemo(() => describeActiveFilters(filters), [filters]);

  // The Dialect chip only ever offers languages some creator in the
  // loaded dataset actually has — never a fixed list that can drift stale
  // or show an option nothing matches.
  const availableLanguages = useMemo(
    () => Array.from(new Set(allCreators.flatMap((creator) => creator.secondaryLanguages))).sort(),
    [allCreators]
  );

  const inspectingCreator = useMemo(
    () => allCreators.find((creator) => creator.id === inspectingCreatorId) ?? null,
    [allCreators, inspectingCreatorId]
  );

  const rosterCreators = useMemo(() => allCreators.filter((creator) => rosterIds.has(creator.id)), [allCreators, rosterIds]);

  function handleReset(): void {
    setFilters(DEFAULT_FILTER_CRITERIA);
  }

  function handleToggleRoster(creatorId: string): void {
    setRosterIds((prev) => {
      const next = new Set(prev);
      if (next.has(creatorId)) {
        next.delete(creatorId);
      } else {
        next.add(creatorId);
      }
      return next;
    });
  }

  function handleInspect(creatorId: string): void {
    setInspectingCreatorId(creatorId);
  }

  /**
   * The one real unlock call — shared by the grid card's "Reveal Desk"
   * button and the drawer's "Unlock Direct Desk" button, so both surfaces
   * always agree on credits/revealed state instead of one being a stale
   * local simulation.
   */
  async function unlockContact(creatorId: string): Promise<ContactUnlockPayload> {
    const response = await fetch(`/api/creators/${creatorId}/unlock-contact`, { method: 'POST' });

    if (response.status === 403) {
      setPaywallState({ open: true, trigger: 'insufficient_credits' });
      return { success: false, creatorId, reason: 'INSUFFICIENT_CREDITS', creditsRemaining };
    }

    if (!response.ok) {
      throw new Error(`Unlock request failed (${response.status})`);
    }

    const payload = (await response.json()) as ContactUnlockPayload;
    if (payload.success) {
      setCreditsRemaining(payload.creditsRemaining);
      setRevealedDeskIds((prev) => new Set(prev).add(creatorId));
    }
    return payload;
  }

  function handleRevealDesk(creatorId: string): void {
    if (revealedDeskIds.has(creatorId)) {
      return;
    }
    if (creditsRemaining <= 0) {
      setPaywallState({ open: true, trigger: 'insufficient_credits' });
      return;
    }
    unlockContact(creatorId).catch((err) => {
      console.error('[discover] reveal desk failed', err);
    });
  }

  async function handleExportRoster(): Promise<void> {
    if (rosterIds.size === 0 || isExporting) {
      return;
    }
    if (creditsRemaining <= 0) {
      setPaywallState({ open: true, trigger: 'export_blocked' });
      return;
    }
    setIsExporting(true);
    setExportError(null);
    try {
      const response = await fetch('/api/export-roster-pdf', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ creatorIds: Array.from(rosterIds) }),
      });

      if (!response.ok) {
        const errorBody = (await response.json().catch(() => null)) as { message?: string } | null;
        throw new Error(errorBody?.message ?? `Export failed (${response.status})`);
      }

      const blob = await response.blob();
      const filenameMatch = response.headers.get('Content-Disposition')?.match(/filename="([^"]+)"/);
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = filenameMatch?.[1] ?? 'talent-roster.pdf';
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      URL.revokeObjectURL(url);
    } catch (err) {
      setExportError(err instanceof Error ? err.message : String(err));
    } finally {
      setIsExporting(false);
    }
  }

  if (loadState === 'checking-auth') {
    return <FullScreenMessage icon={LogIn} title="Loading Discover…" />;
  }

  if (loadState === 'unauthenticated') {
    return (
      <FullScreenMessage icon={LogIn} title="Sign in to open Discover">
        <p className="mt-2 text-sm text-zinc-600">The discovery cockpit is available to signed-in agency accounts only.</p>
        <Link
          href="/login?next=/discover"
          className="mt-6 inline-flex items-center justify-center rounded-xl bg-zinc-900 px-5 py-2.5 text-sm font-semibold text-white shadow-sm transition-all hover:bg-zinc-800"
        >
          Sign In
        </Link>
      </FullScreenMessage>
    );
  }

  if (loadState === 'error') {
    return (
      <FullScreenMessage icon={AlertCircle} iconClassName="text-rose-500" title="Couldn't load the discovery grid">
        <p className="mt-2 text-sm text-zinc-600">{loadErrorMessage ?? 'Something went wrong fetching creators.'}</p>
      </FullScreenMessage>
    );
  }

  const isLoadingCreators = loadState === 'loading';

  return (
    <div className="min-h-screen bg-[#F8F9FA] text-zinc-900">
      <TopNavbar
        agencyName={agencyName}
        creditsRemaining={creditsRemaining}
        onRequestCampaignPass={() => setPaywallState({ open: true, trigger: 'manual' })}
      />

      <main className="mx-auto max-w-[1600px] px-4 py-5 sm:px-6">
        <EntityTypeTabs
          counts={entityTypeCounts}
          value={filters.selectedEntityTypes}
          onChange={(selectedEntityTypes) =>
            setFilters((prev) => ({
              ...prev,
              selectedEntityTypes,
              // secondaryLanguages/entityDetailFilters are each scoped to
              // whichever entity type is selected (it's DJ genre tags vs.
              // dialects depending on isDjSelected in FilterStrip; troupe
              // size, venue scale, and AV spec each only apply to one
              // type). Carrying a stale value across an entity-type change
              // either silently zeroes every result — e.g. a leftover DJ
              // genre tag never matches any real creator's
              // secondaryLanguages once DJ mode turns off — or leaves an
              // "active filter" badge stuck on with no visible control to
              // clear it once that type's chip disappears from the strip.
              secondaryLanguages: [],
              entityDetailFilters: { minTroupeSize: null, venueScaleBracket: null, avSpecIncluded: null },
            }))
          }
        />

        <div className="mt-4">
          <FilterStrip value={filters} onChange={setFilters} onReset={handleReset} availableLanguages={availableLanguages} />
        </div>

        <div className="mt-4">
          <SocialProofBanner />
        </div>

        <div className="mt-5 flex flex-wrap items-center justify-between gap-3">
          <div>
            <h1 className="text-lg font-bold text-zinc-900">
              {isLoadingCreators ? 'Loading production partners…' : buildResultsHeadline(filteredCreators.length, filters)}
            </h1>
            {activeFilterCount > 0 && (
              <p className="mt-0.5 text-xs text-zinc-500">
                {activeFilterCount} active filter{activeFilterCount === 1 ? '' : 's'}
              </p>
            )}
          </div>

          <div className="flex items-center gap-2">
            <div className="flex items-center gap-1 rounded-xl border border-zinc-200 bg-white p-1">
              <ViewToggleButton icon={LayoutGrid} label="Media Grid View" active={viewMode === 'grid'} onClick={() => setViewMode('grid')} />
              <ViewToggleButton icon={ListFilter} label="Agency Table View" active={viewMode === 'table'} onClick={() => setViewMode('table')} />
            </div>
            <button
              type="button"
              onClick={() => void handleExportRoster()}
              disabled={rosterIds.size === 0 || isExporting}
              className="flex items-center gap-2 rounded-xl bg-zinc-900 px-4 py-2 text-sm font-semibold text-white shadow-sm transition-all hover:bg-zinc-800 disabled:cursor-not-allowed disabled:opacity-40"
            >
              <Download className="h-4 w-4" />
              {isExporting ? 'Exporting…' : 'Export Roster PDF'}
              <span className="rounded-full bg-white/15 px-1.5 py-0.5 text-xs font-bold">{rosterIds.size}</span>
            </button>
          </div>
        </div>

        {exportError && <p className="mt-3 text-xs text-rose-600">{exportError}</p>}

        {activeFilterBadges.length > 0 && (
          <div className="mt-3 flex flex-wrap gap-1.5">
            {activeFilterBadges.map((badge) => (
              <span key={badge} className="rounded-full border border-zinc-200 bg-zinc-100 px-2.5 py-1 text-xs text-zinc-800">
                {badge}
              </span>
            ))}
          </div>
        )}

        <div className="mt-5 pb-32">
          {isLoadingCreators ? (
            <GridSkeleton />
          ) : filteredCreators.length === 0 ? (
            <EmptyState hasActiveFilters={activeFilterCount > 0} onClearFilters={handleReset} />
          ) : viewMode === 'table' ? (
            <RosterTableView
              creators={filteredCreators}
              rosterIds={rosterIds}
              onToggleRoster={handleToggleRoster}
              onInspect={handleInspect}
            />
          ) : (
            <div className="grid grid-cols-1 gap-5 sm:grid-cols-2 xl:grid-cols-3">
              {filteredCreators.map((creator) => (
                <VisualCreatorCard
                  key={creator.id}
                  creator={creator}
                  isOnRoster={rosterIds.has(creator.id)}
                  onToggleRoster={handleToggleRoster}
                  onInspect={handleInspect}
                  onRevealDesk={handleRevealDesk}
                  creditsRemaining={creditsRemaining}
                  isDeskRevealed={revealedDeskIds.has(creator.id)}
                />
              ))}
            </div>
          )}
        </div>

        <GovernanceFooter />
      </main>

      <RosterActionDock
        rosterCreators={rosterCreators}
        onClear={() => setRosterIds(new Set())}
        onExport={() => void handleExportRoster()}
        isExporting={isExporting}
      />

      <CreatorDetailDrawer
        creator={inspectingCreator}
        onClose={() => setInspectingCreatorId(null)}
        creditsRemaining={creditsRemaining}
        isDeskRevealed={inspectingCreatorId !== null && revealedDeskIds.has(inspectingCreatorId)}
        onUnlock={unlockContact}
      />

      <AgencyPassModal
        open={paywallState.open}
        onOpenChange={(open) => setPaywallState((prev) => ({ ...prev, open }))}
        trigger={paywallState.trigger}
      />
    </div>
  );
}

function buildResultsHeadline(count: number, filters: FilterCriteria): string {
  let text = `Showing ${count} Verified Production Partner${count === 1 ? '' : 's'}`;
  const [onlyMetro] = filters.selectedMetros;
  if (filters.selectedMetros.length === 1 && onlyMetro) {
    text += ` in ${METRO_LABELS[onlyMetro].shortLabel} Metro`;
  }
  return text;
}

// =====================================================================================
// Local presentational helpers
// =====================================================================================

function TopNavbar({
  agencyName,
  creditsRemaining,
  onRequestCampaignPass,
}: {
  agencyName: string | null;
  creditsRemaining: number;
  onRequestCampaignPass: () => void;
}) {
  return (
    <div className="sticky top-0 z-30 flex h-14 items-center justify-between border-b border-zinc-200/80 bg-white/80 px-4 backdrop-blur-md sm:px-6">
      <div className="flex items-center gap-2">
        <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-emerald-500">
          <Sparkles className="h-4 w-4 text-white" />
        </div>
        <span className="text-sm font-bold tracking-tight text-zinc-900">
          PULSEGRID<sup className="text-[9px]">™</sup>{' '}
          <span className="hidden font-normal text-zinc-500 sm:inline">| Event Talent &amp; Media Intelligence</span>
        </span>
      </div>

      <div className="flex items-center gap-2">
        <button
          type="button"
          onClick={() => document.getElementById(SEARCH_INPUT_ID)?.focus()}
          className="hidden items-center gap-1.5 rounded-full border border-zinc-200 bg-white px-3 py-1.5 text-xs font-medium text-zinc-500 transition-all hover:border-zinc-400 hover:text-zinc-800 md:flex"
        >
          <Command className="h-3.5 w-3.5" />K Quick search
        </button>
        <span className="hidden items-center gap-1.5 rounded-full border border-zinc-200 bg-white px-3 py-1.5 text-xs font-medium text-zinc-800 sm:flex">
          <Building2 className="h-3.5 w-3.5 text-zinc-500" />
          {agencyName ?? 'Agency Workspace'}
        </span>
        <span className="flex items-center gap-1.5 rounded-full border border-emerald-200 bg-emerald-50 px-3 py-1.5 text-xs font-semibold text-emerald-700">
          <span className="relative flex h-2 w-2">
            <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-500 opacity-75" />
            <span className="relative inline-flex h-2 w-2 rounded-full bg-emerald-500" />
          </span>
          ⚡ {creditsRemaining} Credit{creditsRemaining === 1 ? '' : 's'}
        </span>
        <button
          type="button"
          onClick={onRequestCampaignPass}
          className="rounded-xl bg-zinc-900 px-3.5 py-1.5 text-xs font-semibold text-white shadow-sm transition-all hover:bg-zinc-800"
        >
          Request Agency Campaign Pass
        </button>
      </div>
    </div>
  );
}

function ViewToggleButton({
  icon: Icon,
  label,
  active,
  onClick,
}: {
  icon: typeof LayoutGrid;
  label: string;
  active: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      title={label}
      className={`flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-xs font-semibold transition-all ${
        active ? 'bg-emerald-50 text-emerald-700' : 'text-zinc-500 hover:text-zinc-700'
      }`}
    >
      <Icon className="h-3.5 w-3.5" />
    </button>
  );
}

function GridSkeleton() {
  return (
    <div className="grid grid-cols-1 gap-5 sm:grid-cols-2 xl:grid-cols-3">
      {Array.from({ length: 6 }).map((_, index) => (
        <div key={index} className="h-[420px] animate-pulse rounded-2xl border border-zinc-200 bg-zinc-100" />
      ))}
    </div>
  );
}

function EmptyState({ hasActiveFilters, onClearFilters }: { hasActiveFilters: boolean; onClearFilters: () => void }) {
  return (
    <div className="flex flex-col items-center justify-center rounded-2xl border border-dashed border-zinc-300 bg-zinc-50 py-20 text-center">
      <Users className="h-8 w-8 text-zinc-400" />
      <p className="mt-4 text-base font-bold text-zinc-900">No production partners match these filters</p>
      <p className="mt-1 max-w-sm text-sm text-zinc-500">
        {hasActiveFilters
          ? 'Try widening your metro, niche, or engagement-rate filters.'
          : 'No verified production partners are on file yet.'}
      </p>
      {hasActiveFilters && (
        <button
          type="button"
          onClick={onClearFilters}
          className="mt-5 rounded-xl border border-zinc-200 px-4 py-2 text-sm font-semibold text-zinc-700 transition-all hover:border-zinc-400 hover:text-zinc-900"
        >
          Clear Filters
        </button>
      )}
    </div>
  );
}

function FullScreenMessage({
  icon: Icon,
  iconClassName = 'text-emerald-600',
  title,
  children,
}: {
  icon: typeof LogIn;
  iconClassName?: string;
  title: string;
  children?: React.ReactNode;
}) {
  return (
    <div className="flex min-h-screen items-center justify-center bg-[#F8F9FA] px-6 text-center text-zinc-900">
      <div className="max-w-sm">
        <Icon className={`mx-auto h-8 w-8 ${iconClassName}`} />
        <h1 className="mt-4 text-xl font-bold text-zinc-900">{title}</h1>
        {children}
      </div>
    </div>
  );
}
