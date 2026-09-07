/**
 * Supabase data access for the Discover cockpit (`src/app/discover/page.tsx`).
 *
 * Runs client-side (the page is a Client Component, needed for instant
 * filter interaction over an in-memory dataset), which changes the security
 * calculus versus the server-rendered pSEO pages in `src/lib/pseo/queries.ts`:
 * anything selected here lands in the browser's React state, not just
 * rendered HTML. So `direct_booking_email` / `direct_booking_phone` are
 * deliberately left out of the column list entirely — the "Reveal Desk"
 * gate has to stay real even before its backing unlock endpoint exists.
 * `CreatorCardModel` still requires those two fields per its `CreatorProfile`
 * base type, so they're set to `null` here rather than omitted from the
 * object, which is fine: they're simply never populated client-side.
 */

import type { SupabaseClient } from '@supabase/supabase-js';

import type {
  BookingStatus,
  CreatorCardModel,
  MetroHub,
  PrimaryNiche,
  RepType,
} from '@/types/creator';

const DISCOVERY_COLUMNS = [
  'id',
  'handle',
  'display_name',
  'avatar_url',
  'primary_metro',
  'primary_niche',
  'secondary_languages',
  'follower_count',
  'engagement_rate',
  'avg_reel_views',
  'est_minimum_rate_usd',
  'est_maximum_rate_usd',
  'booking_status',
  'lead_time_days',
  'verified_response_hours',
  'rep_type',
  'deliverability_score',
  'is_verified',
  'last_refreshed_at',
  'created_at',
  'updated_at',
].join(', ');

interface DiscoveryCreatorRow {
  id: string;
  handle: string;
  display_name: string;
  avatar_url: string | null;
  primary_metro: MetroHub;
  primary_niche: PrimaryNiche;
  secondary_languages: string[] | null;
  follower_count: number | null;
  engagement_rate: number | null;
  avg_reel_views: number | null;
  est_minimum_rate_usd: number | null;
  est_maximum_rate_usd: number | null;
  booking_status: BookingStatus;
  lead_time_days: number | null;
  verified_response_hours: number | null;
  rep_type: RepType;
  deliverability_score: number | null;
  is_verified: boolean;
  last_refreshed_at: string;
  created_at: string;
  updated_at: string;
}

interface BlackoutRow {
  creator_id: string;
  brand_name: string;
  category_slug: string;
  blackout_end_date: string;
}

export async function fetchDiscoveryCreators(supabase: SupabaseClient): Promise<CreatorCardModel[]> {
  const today = new Date().toISOString().slice(0, 10);

  const [creatorsResult, blackoutsResult] = await Promise.all([
    supabase.from('creators').select(DISCOVERY_COLUMNS).eq('is_verified', true),
    supabase
      .from('creator_category_blackouts')
      .select('creator_id, brand_name, category_slug, blackout_end_date')
      .lte('blackout_start_date', today)
      .gte('blackout_end_date', today),
  ]);

  if (creatorsResult.error) {
    throw new Error(`Failed to load creators: ${creatorsResult.error.message}`);
  }

  const blackoutsByCreator = new Map<string, BlackoutRow[]>();
  if (!blackoutsResult.error) {
    for (const row of (blackoutsResult.data ?? []) as BlackoutRow[]) {
      const bucket = blackoutsByCreator.get(row.creator_id) ?? [];
      bucket.push(row);
      blackoutsByCreator.set(row.creator_id, bucket);
    }
  }

  // supabase-js infers `.select()`'s result shape by parsing the column
  // string as a TS literal type; since DISCOVERY_COLUMNS is built at
  // runtime (not an inline literal), it falls back to an error-shaped
  // generic type here. The `unknown` hop is the fix the compiler itself
  // points to — the actual runtime shape matches DiscoveryCreatorRow.
  return ((creatorsResult.data ?? []) as unknown as DiscoveryCreatorRow[]).map((row) => {
    const activeBlackouts = (blackoutsByCreator.get(row.id) ?? []).map((blackout) => ({
      brandName: blackout.brand_name,
      categorySlug: blackout.category_slug,
      endDate: blackout.blackout_end_date,
    }));

    const card: CreatorCardModel = {
      id: row.id,
      handle: row.handle,
      displayName: row.display_name,
      avatarUrl: row.avatar_url,
      primaryMetro: row.primary_metro,
      primaryNiche: row.primary_niche,
      secondaryLanguages: row.secondary_languages ?? [],
      followerCount: row.follower_count,
      engagementRate: row.engagement_rate,
      avgReelViews: row.avg_reel_views,
      estMinimumRateUsd: row.est_minimum_rate_usd,
      estMaximumRateUsd: row.est_maximum_rate_usd,
      bookingStatus: row.booking_status,
      leadTimeDays: row.lead_time_days,
      verifiedResponseHours: row.verified_response_hours,
      repType: row.rep_type,
      directBookingEmail: null, // deliberately never fetched client-side — see file header
      directBookingPhone: null, // deliberately never fetched client-side — see file header
      deliverabilityScore: row.deliverability_score,
      isVerified: row.is_verified,
      lastRefreshedAt: row.last_refreshed_at,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
      activeBlackouts,
      isAvailableNow: row.booking_status === 'available_immediate' && activeBlackouts.length === 0,
      recentSponsors: activeBlackouts.map((blackout) => blackout.brandName),
    };

    return card;
  });
}

export async function fetchAgencyCreditsRemaining(supabase: SupabaseClient, profileId: string): Promise<number> {
  const { data, error } = await supabase
    .from('profiles')
    .select('contact_unlocks_remaining')
    .eq('id', profileId)
    .maybeSingle();

  if (error || !data) {
    return 0;
  }

  return (data as { contact_unlocks_remaining: number }).contact_unlocks_remaining;
}

// =====================================================================================
// Brand history (Tab 2 of the detail drawer)
// =====================================================================================

export interface BlackoutHistoryEntry {
  id: string;
  brandName: string;
  categorySlug: string;
  startDate: string;
  endDate: string;
  isActive: boolean;
}

interface BlackoutHistoryRow {
  id: string;
  brand_name: string;
  category_slug: string;
  blackout_start_date: string;
  blackout_end_date: string;
}

/**
 * Every blackout window on file for a creator, past and present, newest
 * first. This single query backs both the drawer's "chronological timeline
 * of past brand collaborations" (the full list) and its "active exclusivity"
 * alerts (the subset where `isActive` is true) — there's no separate
 * "history" table, so this is the real data behind both, not two different
 * sources.
 */
export async function fetchCreatorBlackoutHistory(
  supabase: SupabaseClient,
  creatorId: string
): Promise<BlackoutHistoryEntry[]> {
  const today = new Date().toISOString().slice(0, 10);

  const { data, error } = await supabase
    .from('creator_category_blackouts')
    .select('id, brand_name, category_slug, blackout_start_date, blackout_end_date')
    .eq('creator_id', creatorId)
    .order('blackout_start_date', { ascending: false });

  if (error) {
    throw new Error(`Failed to load brand history: ${error.message}`);
  }

  return ((data ?? []) as unknown as BlackoutHistoryRow[]).map((row) => ({
    id: row.id,
    brandName: row.brand_name,
    categorySlug: row.category_slug,
    startDate: row.blackout_start_date,
    endDate: row.blackout_end_date,
    isActive: row.blackout_end_date >= today,
  }));
}
