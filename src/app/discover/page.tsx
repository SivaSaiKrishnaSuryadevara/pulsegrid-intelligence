'use client';

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { AlertCircle, Download, Filter as FilterIcon, LogIn, Users } from 'lucide-react';

import { CreatorDetailDrawer } from '@/components/discover/creator-detail-drawer';
import { FilterSidebar } from '@/components/discover/filter-sidebar';
import { VisualCreatorCard } from '@/components/discover/visual-creator-card';
import { DEFAULT_FILTER_CRITERIA } from '@/lib/discover/constants';
import { countActiveFilters, describeActiveFilters, matchesFilters } from '@/lib/discover/filters';
import { fetchAgencyCreditsRemaining, fetchDiscoveryCreators } from '@/lib/discover/queries';
import { getBrowserSupabaseClient } from '@/lib/supabase/client';
import type { ContactUnlockPayload, CreatorCardModel, FilterCriteria } from '@/types/creator';

type LoadState = 'checking-auth' | 'unauthenticated' | 'loading' | 'ready' | 'error';

export default function DiscoverPage() {
  const [loadState, setLoadState] = useState<LoadState>('checking-auth');
  const [loadErrorMessage, setLoadErrorMessage] = useState<string | null>(null);
  const [allCreators, setAllCreators] = useState<CreatorCardModel[]>([]);
  const [creditsRemaining, setCreditsRemaining] = useState(0);
  const [filters, setFilters] = useState<FilterCriteria>(DEFAULT_FILTER_CRITERIA);
  const [rosterIds, setRosterIds] = useState<Set<string>>(new Set());
  const [revealedDeskIds, setRevealedDeskIds] = useState<Set<string>>(new Set());
  const [isSidebarOpen, setIsSidebarOpen] = useState(false);
  const [inspectingCreatorId, setInspectingCreatorId] = useState<string | null>(null);
  const [isExporting, setIsExporting] = useState(false);
  const [exportError, setExportError] = useState<string | null>(null);

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

        const [creators, credits] = await Promise.all([
          fetchDiscoveryCreators(supabase),
          fetchAgencyCreditsRemaining(supabase, user.id),
        ]);

        if (cancelled) return;
        setAllCreators(creators);
        setCreditsRemaining(credits);
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

  // All filtering happens over the already-fetched in-memory array — no
  // network round-trip per filter change, so the grid updates instantly.
  const filteredCreators = useMemo(
    () => allCreators.filter((creator) => matchesFilters(creator, filters)),
    [allCreators, filters]
  );

  const activeFilterCount = countActiveFilters(filters);
  const activeFilterBadges = useMemo(() => describeActiveFilters(filters), [filters]);

  const inspectingCreator = useMemo(
    () => allCreators.find((creator) => creator.id === inspectingCreatorId) ?? null,
    [allCreators, inspectingCreatorId]
  );

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
    if (creditsRemaining <= 0 || revealedDeskIds.has(creatorId)) {
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
        <p className="mt-2 text-sm text-slate-400">
          The discovery cockpit is available to signed-in agency accounts only.
        </p>
        <Link
          href="/login?next=/discover"
          className="mt-6 inline-flex items-center justify-center rounded-lg bg-[#6366F1] px-5 py-2.5 text-sm font-semibold text-white transition hover:bg-[#5457e5]"
        >
          Sign In
        </Link>
      </FullScreenMessage>
    );
  }

  if (loadState === 'error') {
    return (
      <FullScreenMessage icon={AlertCircle} iconClassName="text-rose-400" title="Couldn't load the discovery grid">
        <p className="mt-2 text-sm text-slate-400">{loadErrorMessage ?? 'Something went wrong fetching creators.'}</p>
      </FullScreenMessage>
    );
  }

  const isLoadingCreators = loadState === 'loading';

  return (
    <div className="flex min-h-screen bg-[#0B0D17] text-slate-100">
      <FilterSidebar
        value={filters}
        onChange={setFilters}
        onReset={handleReset}
        isOpen={isSidebarOpen}
        onClose={() => setIsSidebarOpen(false)}
      />

      <main className="min-w-0 flex-1">
        <div className="sticky top-0 z-10 border-b border-[#1E2337] bg-[#0B0D17]/95 px-4 py-4 backdrop-blur sm:px-6">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="flex items-center gap-3">
              <button
                type="button"
                onClick={() => setIsSidebarOpen(true)}
                className="flex items-center gap-1.5 rounded-lg border border-[#1E2337] px-3 py-1.5 text-xs font-semibold text-slate-300 transition hover:border-[#6366F1] lg:hidden"
              >
                <FilterIcon className="h-3.5 w-3.5" />
                Filters
                {activeFilterCount > 0 && (
                  <span className="rounded-full bg-[#6366F1] px-1.5 py-0.5 text-[10px] font-bold text-white">
                    {activeFilterCount}
                  </span>
                )}
              </button>
              <div>
                <h1 className="text-lg font-semibold text-white">
                  {isLoadingCreators
                    ? 'Loading creators…'
                    : `Showing ${filteredCreators.length} Verified Regional Creators`}
                </h1>
                {activeFilterCount > 0 && (
                  <p className="mt-0.5 text-xs text-slate-500">
                    {activeFilterCount} active filter{activeFilterCount === 1 ? '' : 's'}
                  </p>
                )}
              </div>
            </div>

            <button
              type="button"
              onClick={() => void handleExportRoster()}
              disabled={rosterIds.size === 0 || isExporting}
              className="flex items-center gap-2 rounded-lg bg-[#6366F1] px-4 py-2 text-sm font-semibold text-white transition hover:bg-[#5457e5] disabled:cursor-not-allowed disabled:opacity-40"
            >
              <Download className="h-4 w-4" />
              {isExporting ? 'Exporting…' : 'Export Roster PDF'}
              <span className="rounded-full bg-white/20 px-1.5 py-0.5 text-xs font-bold">{rosterIds.size}</span>
            </button>
          </div>

          {exportError && <p className="mt-3 text-xs text-rose-400">{exportError}</p>}

          {activeFilterBadges.length > 0 && (
            <div className="mt-3 flex flex-wrap gap-1.5">
              {activeFilterBadges.map((badge) => (
                <span
                  key={badge}
                  className="rounded-full border border-[#1E2337] bg-[#131728] px-2.5 py-1 text-xs text-slate-300"
                >
                  {badge}
                </span>
              ))}
            </div>
          )}
        </div>

        <div className="p-4 sm:p-6">
          {isLoadingCreators ? (
            <GridSkeleton />
          ) : filteredCreators.length === 0 ? (
            <EmptyState hasActiveFilters={activeFilterCount > 0} onClearFilters={handleReset} />
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
      </main>

      <CreatorDetailDrawer
        creator={inspectingCreator}
        onClose={() => setInspectingCreatorId(null)}
        creditsRemaining={creditsRemaining}
        isDeskRevealed={inspectingCreatorId !== null && revealedDeskIds.has(inspectingCreatorId)}
        onUnlock={unlockContact}
      />
    </div>
  );
}

// =====================================================================================
// Local presentational helpers
// =====================================================================================

function GridSkeleton() {
  return (
    <div className="grid grid-cols-1 gap-5 sm:grid-cols-2 xl:grid-cols-3">
      {Array.from({ length: 6 }).map((_, index) => (
        <div key={index} className="h-[420px] animate-pulse rounded-2xl border border-[#1E2337] bg-[#131728]" />
      ))}
    </div>
  );
}

function EmptyState({ hasActiveFilters, onClearFilters }: { hasActiveFilters: boolean; onClearFilters: () => void }) {
  return (
    <div className="flex flex-col items-center justify-center rounded-2xl border border-dashed border-[#1E2337] bg-[#131728]/50 py-20 text-center">
      <Users className="h-8 w-8 text-slate-600" />
      <p className="mt-4 text-base font-semibold text-white">No creators match these filters</p>
      <p className="mt-1 max-w-sm text-sm text-slate-500">
        {hasActiveFilters
          ? 'Try widening your metro, niche, or engagement-rate filters.'
          : 'No verified creators are on file yet.'}
      </p>
      {hasActiveFilters && (
        <button
          type="button"
          onClick={onClearFilters}
          className="mt-5 rounded-lg border border-[#1E2337] px-4 py-2 text-sm font-semibold text-slate-300 transition hover:border-[#6366F1] hover:text-white"
        >
          Clear Filters
        </button>
      )}
    </div>
  );
}

function FullScreenMessage({
  icon: Icon,
  iconClassName = 'text-[#6366F1]',
  title,
  children,
}: {
  icon: typeof LogIn;
  iconClassName?: string;
  title: string;
  children?: React.ReactNode;
}) {
  return (
    <div className="flex min-h-screen items-center justify-center bg-[#0B0D17] px-6 text-center text-slate-100">
      <div className="max-w-sm">
        <Icon className={`mx-auto h-8 w-8 ${iconClassName}`} />
        <h1 className="mt-4 text-xl font-semibold text-white">{title}</h1>
        {children}
      </div>
    </div>
  );
}
