/**
 * GET /api/v1/creators/query
 *
 * Enterprise Programmatic DaaS endpoint — bearer-token authenticated (not a
 * Supabase user session), rate-limited per key, cacheable at the edge.
 *
 * Auth: `Authorization: Bearer pg_live_...`. The raw key is never stored —
 * only its SHA-256 hash is compared against `api_keys.key_hash`, via the
 * service-role client (there is no Supabase session/JWT for an external
 * API caller, so RLS's `authenticated`-only policies don't apply here;
 * this lookup is inherently a privileged, server-only operation).
 *
 * Contact fields (`direct_booking_email`/`direct_booking_phone`) are
 * fetched from `creators` unconditionally in the one query below, but only
 * copied into the JSON response when the resolved key's `contact_access`
 * is true — same "fetch once, shape the response by entitlement" pattern
 * used everywhere else contact data is gated in this codebase.
 */

import { NextResponse, type NextRequest } from 'next/server';

import { checkRateLimit, DEFAULT_ENTERPRISE_LIMIT, type RateLimitResult } from '@/lib/rate-limit';
import { getServiceRoleClient } from '@/lib/supabase/service';
import {
  ENTITY_TYPES,
  METRO_HUBS,
  PRIMARY_NICHES,
  type BookingStatus,
  type EntityType,
  type MetroHub,
  type PrimaryNiche,
  type RepType,
} from '@/types/creator';

const DEFAULT_LIMIT_PARAM = 25;
const MAX_LIMIT_PARAM = 100;

interface ApiKeyRow {
  id: string;
  profile_id: string;
  is_active: boolean;
  rate_limit_rpm: number;
  contact_access: boolean;
}

interface CreatorQueryRow {
  id: string;
  handle: string;
  display_name: string;
  avatar_url: string | null;
  entity_type: EntityType;
  primary_metro: MetroHub;
  primary_niche: PrimaryNiche;
  secondary_languages: string[] | null;
  follower_count: number | null;
  engagement_rate: number | null;
  avg_reel_views: number | null;
  est_minimum_rate_usd: number | null;
  est_maximum_rate_usd: number | null;
  booking_status: BookingStatus;
  deliverability_score: number | null;
  is_verified: boolean;
  rep_type: RepType;
  direct_booking_email: string | null;
  direct_booking_phone: string | null;
}

interface ActiveBlackoutRow {
  creator_id: string;
  brand_name: string;
  category_slug: string;
  blackout_end_date: string;
}

interface DaasCreatorRecord {
  id: string;
  handle: string;
  displayName: string;
  avatarUrl: string | null;
  entityType: EntityType;
  primaryMetro: MetroHub;
  primaryNiche: PrimaryNiche;
  secondaryLanguages: string[];
  followerCount: number | null;
  engagementRate: number | null;
  avgReelViews: number | null;
  estMinimumRateUsd: number | null;
  estMaximumRateUsd: number | null;
  bookingStatus: BookingStatus;
  deliverabilityScore: number | null;
  isVerified: boolean;
  activeBlackouts: { brandName: string; categorySlug: string; endDate: string }[];
  contact?: {
    repType: RepType;
    directBookingEmail: string | null;
    directBookingPhone: string | null;
  };
}

function errorResponse(status: number, error: string, message: string, headers?: Record<string, string>): NextResponse {
  return NextResponse.json({ error, message }, { status, headers });
}

function extractBearerToken(authorizationHeader: string | null): string | null {
  if (!authorizationHeader) return null;
  const token = authorizationHeader.match(/^Bearer\s+(.+)$/i)?.[1];
  return token ? token.trim() : null;
}

async function hashApiKey(rawKey: string): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(rawKey));
  return Array.from(new Uint8Array(digest))
    .map((byte) => byte.toString(16).padStart(2, '0'))
    .join('');
}

function buildRateLimitHeaders(result: RateLimitResult): Record<string, string> {
  const headers: Record<string, string> = {
    'X-RateLimit-Limit': String(result.limit),
    'X-RateLimit-Remaining': String(result.remaining),
  };
  if (!result.success) {
    headers['Retry-After'] = String(Math.max(1, Math.ceil((result.reset - Date.now()) / 1000)));
  }
  return headers;
}

function parseIntParam(raw: string | null, fallback: number, min: number, max: number): number {
  if (raw === null) return fallback;
  const parsed = Number.parseInt(raw, 10);
  if (!Number.isFinite(parsed)) return fallback;
  return Math.min(max, Math.max(min, parsed));
}

function parseFloatParam(raw: string | null): number | null {
  if (raw === null) return null;
  const parsed = Number.parseFloat(raw);
  return Number.isFinite(parsed) ? parsed : null;
}

export async function GET(request: NextRequest): Promise<NextResponse> {
  // ---------------------------------------------------------------------
  // Auth
  // ---------------------------------------------------------------------
  const rawKey = extractBearerToken(request.headers.get('authorization'));

  if (!rawKey || !rawKey.startsWith('pg_live_')) {
    return errorResponse(401, 'UNAUTHORIZED', 'Missing or malformed Authorization header. Expected: Bearer pg_live_...');
  }

  const keyHash = await hashApiKey(rawKey);
  const serviceClient = getServiceRoleClient();

  const { data: apiKeyData, error: apiKeyError } = await serviceClient
    .from('api_keys')
    .select('id, profile_id, is_active, rate_limit_rpm, contact_access')
    .eq('key_hash', keyHash)
    .maybeSingle();

  if (apiKeyError) {
    return errorResponse(500, 'LOOKUP_FAILED', apiKeyError.message);
  }

  const apiKey = apiKeyData as ApiKeyRow | null;
  if (!apiKey || !apiKey.is_active) {
    return errorResponse(401, 'INVALID_API_KEY', 'API key is invalid or inactive.');
  }

  // ---------------------------------------------------------------------
  // Rate limit
  // ---------------------------------------------------------------------
  const rateLimitResult = await checkRateLimit(keyHash, apiKey.rate_limit_rpm || DEFAULT_ENTERPRISE_LIMIT);
  if (!rateLimitResult.success) {
    return errorResponse(429, 'RATE_LIMITED', 'Rate limit exceeded.', buildRateLimitHeaders(rateLimitResult));
  }

  // ---------------------------------------------------------------------
  // Query params
  // ---------------------------------------------------------------------
  const { searchParams } = new URL(request.url);

  const metroParam = searchParams.get('metro');
  if (metroParam && !METRO_HUBS.includes(metroParam as MetroHub)) {
    return errorResponse(400, 'INVALID_REQUEST', `metro must be one of: ${METRO_HUBS.join(', ')}`);
  }
  const nicheParam = searchParams.get('niche');
  if (nicheParam && !PRIMARY_NICHES.includes(nicheParam as PrimaryNiche)) {
    return errorResponse(400, 'INVALID_REQUEST', `niche must be one of: ${PRIMARY_NICHES.join(', ')}`);
  }
  const entityTypeParam = searchParams.get('entity_type');
  if (entityTypeParam && !ENTITY_TYPES.includes(entityTypeParam as EntityType)) {
    return errorResponse(400, 'INVALID_REQUEST', `entity_type must be one of: ${ENTITY_TYPES.join(', ')}`);
  }

  const languageParam = searchParams.get('language');
  const minEr = parseFloatParam(searchParams.get('min_er'));
  const maxEr = parseFloatParam(searchParams.get('max_er'));
  const availableOnly = searchParams.get('available_only') === 'true' || searchParams.get('available_only') === '1';
  const limit = parseIntParam(searchParams.get('limit'), DEFAULT_LIMIT_PARAM, 1, MAX_LIMIT_PARAM);
  const offset = parseIntParam(searchParams.get('offset'), 0, 0, Number.MAX_SAFE_INTEGER);

  // ---------------------------------------------------------------------
  // Query creators
  // ---------------------------------------------------------------------
  let query = serviceClient
    .from('production_entities')
    .select(
      'id, handle, display_name, avatar_url, entity_type, primary_metro, primary_niche, secondary_languages, follower_count, engagement_rate, avg_reel_views, est_minimum_rate_usd, est_maximum_rate_usd, booking_status, deliverability_score, is_verified, rep_type, direct_booking_email, direct_booking_phone',
      { count: 'exact' }
    )
    .order('handle', { ascending: true })
    .range(offset, offset + limit - 1);

  if (metroParam) query = query.eq('primary_metro', metroParam);
  if (nicheParam) query = query.eq('primary_niche', nicheParam);
  if (entityTypeParam) query = query.eq('entity_type', entityTypeParam);
  if (languageParam) query = query.contains('secondary_languages', [languageParam]);
  if (minEr !== null) query = query.gte('engagement_rate', minEr);
  if (maxEr !== null) query = query.lte('engagement_rate', maxEr);
  if (availableOnly) query = query.eq('booking_status', 'available_immediate');

  const { data, error: queryError, count } = await query;

  if (queryError) {
    return errorResponse(500, 'QUERY_FAILED', queryError.message, buildRateLimitHeaders(rateLimitResult));
  }

  const creatorRows = (data ?? []) as unknown as CreatorQueryRow[];
  const creatorIds = creatorRows.map((row) => row.id);

  // ---------------------------------------------------------------------
  // Active blackouts
  // ---------------------------------------------------------------------
  const today = new Date().toISOString().slice(0, 10);
  const blackoutsByCreator = new Map<string, { brandName: string; categorySlug: string; endDate: string }[]>();

  if (creatorIds.length > 0) {
    const { data: blackoutData } = await serviceClient
      .from('creator_category_blackouts')
      .select('creator_id, brand_name, category_slug, blackout_end_date')
      .in('creator_id', creatorIds)
      .lte('blackout_start_date', today)
      .gte('blackout_end_date', today);

    for (const row of (blackoutData ?? []) as unknown as ActiveBlackoutRow[]) {
      const bucket = blackoutsByCreator.get(row.creator_id) ?? [];
      bucket.push({ brandName: row.brand_name, categorySlug: row.category_slug, endDate: row.blackout_end_date });
      blackoutsByCreator.set(row.creator_id, bucket);
    }
  }

  // ---------------------------------------------------------------------
  // Shape response
  // ---------------------------------------------------------------------
  const records: DaasCreatorRecord[] = creatorRows.map((row) => {
    const record: DaasCreatorRecord = {
      id: row.id,
      handle: row.handle,
      displayName: row.display_name,
      avatarUrl: row.avatar_url,
      entityType: row.entity_type,
      primaryMetro: row.primary_metro,
      primaryNiche: row.primary_niche,
      secondaryLanguages: row.secondary_languages ?? [],
      followerCount: row.follower_count,
      engagementRate: row.engagement_rate,
      avgReelViews: row.avg_reel_views,
      estMinimumRateUsd: row.est_minimum_rate_usd,
      estMaximumRateUsd: row.est_maximum_rate_usd,
      bookingStatus: row.booking_status,
      deliverabilityScore: row.deliverability_score,
      isVerified: row.is_verified,
      activeBlackouts: blackoutsByCreator.get(row.id) ?? [],
    };

    if (apiKey.contact_access) {
      record.contact = {
        repType: row.rep_type,
        directBookingEmail: row.direct_booking_email,
        directBookingPhone: row.direct_booking_phone,
      };
    }

    return record;
  });

  const total = count ?? records.length;

  // Best-effort usage tracking — never block or fail the response on this.
  void serviceClient.from('api_keys').update({ last_used_at: new Date().toISOString() }).eq('id', apiKey.id);

  return NextResponse.json(
    {
      data: records,
      pagination: {
        limit,
        offset,
        total,
        hasMore: offset + records.length < total,
      },
    },
    {
      status: 200,
      headers: {
        'Content-Type': 'application/json',
        'Cache-Control': 'public, s-maxage=60, stale-while-revalidate=300',
        ...buildRateLimitHeaders(rateLimitResult),
      },
    }
  );
}
