/**
 * Supabase data access for PulseGrid's public programmatic-SEO surface
 * (`/directories/[slug]`, `/verified/[handle]`, `sitemap.ts`).
 *
 * Every export here is defensive by design: these routes are the site's
 * search-crawlable front door, so a transient Supabase outage or a missing
 * env var should degrade a page to an honest empty state (or drop the
 * dynamic URLs from the sitemap) rather than 500 the whole route. Errors
 * are logged, never thrown, past this module's boundary.
 *
 * These functions intentionally return only what the public pages are
 * allowed to render. `direct_booking_email` / `direct_booking_phone` are
 * fetched as part of the creator row (the media-kit page needs to know
 * *whether* contact info exists in order to mask it), but nothing in this
 * module — or the pages built on it — ever prints the raw value into
 * rendered output. See `src/lib/supabase/service.ts` for why a service-role
 * client is used here at all.
 */

import { getServiceRoleClient } from '@/lib/supabase/service';
import type {
  BookingStatus,
  CreatorProfile,
  EnterpriseType,
  EventEnterprise,
  MetroHub,
  PrimaryNiche,
  RepType,
} from '@/types/creator';
import type { DirectoryPageConfig } from './directory-config';

// =====================================================================================
// Row shapes (snake_case, matching the Postgres tables directly)
// =====================================================================================

interface CreatorRow {
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
  direct_booking_email: string | null;
  direct_booking_phone: string | null;
  deliverability_score: number | null;
  is_verified: boolean;
  last_refreshed_at: string;
  created_at: string;
  updated_at: string;
}

interface EnterpriseRow {
  id: string;
  business_name: string;
  instagram_handle: string;
  metro_hub: MetroHub;
  enterprise_type: EnterpriseType;
  public_email: string | null;
  phone_number: string | null;
  ticketing_url: string | null;
  frequent_venues: string[] | null;
  created_at: string;
  updated_at: string;
}

function mapCreatorRow(row: CreatorRow): CreatorProfile {
  return {
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
    directBookingEmail: row.direct_booking_email,
    directBookingPhone: row.direct_booking_phone,
    deliverabilityScore: row.deliverability_score,
    isVerified: row.is_verified,
    lastRefreshedAt: row.last_refreshed_at,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function mapEnterpriseRow(row: EnterpriseRow): EventEnterprise {
  return {
    id: row.id,
    businessName: row.business_name,
    instagramHandle: row.instagram_handle,
    metroHub: row.metro_hub,
    enterpriseType: row.enterprise_type,
    publicEmail: row.public_email,
    phoneNumber: row.phone_number,
    ticketingUrl: row.ticketing_url,
    frequentVenues: row.frequent_venues ?? [],
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function logQueryError(scope: string, message: string): void {
  console.error(`[pseo] ${scope}: ${message}`);
}

// =====================================================================================
// Directory page ( /directories/[slug] )
// =====================================================================================

const DIRECTORY_ENTERPRISE_LIMIT = 12;
const DIRECTORY_CREATOR_LIMIT = 9;

export interface DirectoryPageData {
  enterprises: EventEnterprise[];
  creators: CreatorProfile[];
}

export async function getDirectoryPageData(config: DirectoryPageConfig): Promise<DirectoryPageData> {
  const empty: DirectoryPageData = { enterprises: [], creators: [] };

  try {
    const supabase = getServiceRoleClient();

    let enterprisesQuery = supabase
      .from('event_enterprises')
      .select('*')
      .eq('metro_hub', config.metro)
      .order('business_name', { ascending: true })
      .limit(DIRECTORY_ENTERPRISE_LIMIT);
    if (config.relatedEnterpriseTypes.length > 0) {
      enterprisesQuery = enterprisesQuery.in('enterprise_type', config.relatedEnterpriseTypes);
    }

    let creatorsQuery = supabase
      .from('creators')
      .select('*')
      .eq('primary_metro', config.metro)
      .eq('primary_niche', config.niche)
      .eq('is_verified', true)
      .order('engagement_rate', { ascending: false, nullsFirst: false })
      .limit(DIRECTORY_CREATOR_LIMIT);
    if (config.languageFilter) {
      creatorsQuery = creatorsQuery.contains('secondary_languages', [config.languageFilter]);
    }

    const [enterprisesResult, creatorsResult] = await Promise.all([enterprisesQuery, creatorsQuery]);

    if (enterprisesResult.error) {
      logQueryError(`directory[${config.slug}] enterprises`, enterprisesResult.error.message);
    }
    if (creatorsResult.error) {
      logQueryError(`directory[${config.slug}] creators`, creatorsResult.error.message);
    }

    return {
      enterprises: ((enterprisesResult.data ?? []) as EnterpriseRow[]).map(mapEnterpriseRow),
      creators: ((creatorsResult.data ?? []) as CreatorRow[]).map(mapCreatorRow),
    };
  } catch (err) {
    logQueryError(`directory[${config.slug}]`, err instanceof Error ? err.message : String(err));
    return empty;
  }
}

// =====================================================================================
// Verified creator media kit ( /verified/[handle] )
// =====================================================================================

export interface CreatorMediaKit {
  creator: CreatorProfile;
  hasActiveBlackout: boolean;
  activeBlackoutBrands: string[];
}

export async function getCreatorMediaKit(handle: string): Promise<CreatorMediaKit | null> {
  const normalizedHandle = handle.trim().toLowerCase().replace(/^@/, '');
  if (!normalizedHandle) {
    return null;
  }

  try {
    const supabase = getServiceRoleClient();

    const { data: creatorRow, error: creatorError } = await supabase
      .from('creators')
      .select('*')
      .eq('handle', normalizedHandle)
      .eq('is_verified', true)
      .maybeSingle();

    if (creatorError) {
      logQueryError(`verified[${normalizedHandle}] creator`, creatorError.message);
      return null;
    }
    if (!creatorRow) {
      return null;
    }

    const creator = mapCreatorRow(creatorRow as CreatorRow);
    const today = new Date().toISOString().slice(0, 10);

    const { data: blackoutRows, error: blackoutError } = await supabase
      .from('creator_category_blackouts')
      .select('brand_name, blackout_start_date, blackout_end_date')
      .eq('creator_id', creator.id)
      .lte('blackout_start_date', today)
      .gte('blackout_end_date', today);

    if (blackoutError) {
      logQueryError(`verified[${normalizedHandle}] blackouts`, blackoutError.message);
    }

    const activeBlackoutBrands = ((blackoutRows ?? []) as { brand_name: string }[]).map((r) => r.brand_name);

    return { creator, hasActiveBlackout: activeBlackoutBrands.length > 0, activeBlackoutBrands };
  } catch (err) {
    logQueryError(`verified[${normalizedHandle}]`, err instanceof Error ? err.message : String(err));
    return null;
  }
}

// =====================================================================================
// Sitemap support
// =====================================================================================

export interface VerifiedHandleRecord {
  handle: string;
  updatedAt: string;
}

export async function getVerifiedCreatorHandles(): Promise<VerifiedHandleRecord[]> {
  try {
    const supabase = getServiceRoleClient();

    const { data, error } = await supabase
      .from('creators')
      .select('handle, updated_at')
      .eq('is_verified', true)
      .order('handle', { ascending: true });

    if (error) {
      logQueryError('verified handle list', error.message);
      return [];
    }

    return ((data ?? []) as { handle: string; updated_at: string }[]).map((row) => ({
      handle: row.handle,
      updatedAt: row.updated_at,
    }));
  } catch (err) {
    logQueryError('verified handle list', err instanceof Error ? err.message : String(err));
    return [];
  }
}
