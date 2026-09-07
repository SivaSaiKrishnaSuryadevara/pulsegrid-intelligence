/**
 * POST /api/export-roster-pdf
 *
 * Renders a white-label talent-roster PDF for a set of creators the caller
 * selected in the Discover cockpit. Contact info is never included — this
 * export is a pitch deck (metrics, cultural fit, availability), not a
 * booking-contact leak; that stays behind /api/creators/[id]/unlock-contact.
 *
 * @react-pdf/renderer depends on Node APIs (Buffer, fontkit, streams), so
 * this route is pinned to the Node.js runtime rather than Edge.
 */

import { createElement, type ReactElement } from 'react';

import { renderToBuffer, type DocumentProps } from '@react-pdf/renderer';
import { NextResponse, type NextRequest } from 'next/server';

import { ClientPitchSheet, type PitchSheetCreator } from '@/components/pdf/client-pitch-sheet';
import { daysRemaining, humanizeSlug } from '@/lib/discover/blackout-helpers';
import { NICHE_DISPLAY_LABELS } from '@/lib/discover/constants';
import { METRO_LABELS } from '@/lib/pseo/directory-config';
import { getServerSupabaseClient } from '@/lib/supabase/server';
import { getServiceRoleClient } from '@/lib/supabase/service';
import type { BookingStatus, MetroHub, PrimaryNiche, RepType } from '@/types/creator';

export const runtime = 'nodejs';

const MAX_ROSTER_SIZE = 40;

interface ExportRosterRequestBody {
  creatorIds: string[];
  clientName?: string;
  campaignTitle?: string;
}

interface CreatorExportRow {
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
  rep_type: RepType;
}

interface ActiveBlackoutRow {
  creator_id: string;
  brand_name: string;
  category_slug: string;
  blackout_end_date: string;
}

interface AgencyProfileRow {
  agency_name: string | null;
  branding_logo_url: string | null;
  primary_hex_color: string | null;
}

const AVAILABILITY_LABELS: Record<BookingStatus, string> = {
  available_immediate: 'Fast Turnaround',
  high_demand_lead: 'High Demand',
  blackout_period: 'Active Conflict',
  closed_roster: 'Roster Closed',
};

const REP_TYPE_EXPORT_LABELS: Record<RepType, string> = {
  DIRECT_MANAGER: 'Direct manager desk',
  TALENT_AGENCY: 'Talent agency desk',
  SELF_REPRESENTED: 'Self-represented',
  UNVERIFIED_BIO: 'Representation unverified',
};

function buildCulturalFitBullets(row: CreatorExportRow): string[] {
  const bullets: string[] = [`Primary niche: ${NICHE_DISPLAY_LABELS[row.primary_niche]}`];
  if (row.secondary_languages && row.secondary_languages.length > 0) {
    bullets.push(`Fluent: ${row.secondary_languages.join(', ')}`);
  }
  bullets.push(REP_TYPE_EXPORT_LABELS[row.rep_type]);
  return bullets;
}

export async function POST(request: NextRequest): Promise<NextResponse> {
  let body: ExportRosterRequestBody;
  try {
    body = (await request.json()) as ExportRosterRequestBody;
  } catch {
    return NextResponse.json({ error: 'INVALID_REQUEST', message: 'Request body must be JSON.' }, { status: 400 });
  }

  if (!Array.isArray(body.creatorIds) || body.creatorIds.length === 0) {
    return NextResponse.json(
      { error: 'INVALID_REQUEST', message: 'creatorIds must be a non-empty array.' },
      { status: 400 }
    );
  }
  if (body.creatorIds.length > MAX_ROSTER_SIZE) {
    return NextResponse.json(
      { error: 'INVALID_REQUEST', message: `A single export is limited to ${MAX_ROSTER_SIZE} creators.` },
      { status: 400 }
    );
  }

  let supabase;
  try {
    supabase = await getServerSupabaseClient();
  } catch (err) {
    return NextResponse.json(
      { error: 'CONFIGURATION_ERROR', message: err instanceof Error ? err.message : String(err) },
      { status: 500 }
    );
  }

  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser();

  if (authError || !user) {
    return NextResponse.json({ error: 'UNAUTHENTICATED', message: 'Sign in to export a roster.' }, { status: 401 });
  }

  const serviceClient = getServiceRoleClient();

  const [profileResult, creatorsResult] = await Promise.all([
    serviceClient.from('profiles').select('agency_name, branding_logo_url, primary_hex_color').eq('id', user.id).maybeSingle(),
    serviceClient
      .from('creators')
      .select(
        'id, handle, display_name, avatar_url, primary_metro, primary_niche, secondary_languages, follower_count, engagement_rate, avg_reel_views, est_minimum_rate_usd, est_maximum_rate_usd, booking_status, rep_type'
      )
      .in('id', body.creatorIds),
  ]);

  if (creatorsResult.error) {
    return NextResponse.json({ error: 'QUERY_FAILED', message: creatorsResult.error.message }, { status: 500 });
  }

  const creatorRows = (creatorsResult.data ?? []) as unknown as CreatorExportRow[];
  if (creatorRows.length === 0) {
    return NextResponse.json(
      { error: 'NOT_FOUND', message: 'None of the requested creators were found.' },
      { status: 404 }
    );
  }

  const today = new Date().toISOString().slice(0, 10);
  const { data: blackoutRows } = await serviceClient
    .from('creator_category_blackouts')
    .select('creator_id, brand_name, category_slug, blackout_end_date')
    .in(
      'creator_id',
      creatorRows.map((row) => row.id)
    )
    .lte('blackout_start_date', today)
    .gte('blackout_end_date', today);

  const activeBlackoutByCreator = new Map<string, ActiveBlackoutRow>();
  for (const row of (blackoutRows ?? []) as unknown as ActiveBlackoutRow[]) {
    if (!activeBlackoutByCreator.has(row.creator_id)) {
      activeBlackoutByCreator.set(row.creator_id, row);
    }
  }

  const pitchCreators: PitchSheetCreator[] = creatorRows.map((row) => {
    const activeBlackout = activeBlackoutByCreator.get(row.id) ?? null;
    return {
      id: row.id,
      displayName: row.display_name,
      handle: row.handle,
      avatarUrl: row.avatar_url,
      metroLabel: METRO_LABELS[row.primary_metro].shortLabel,
      languages: row.secondary_languages ?? [],
      followerCount: row.follower_count,
      engagementRate: row.engagement_rate,
      avgReelViews: row.avg_reel_views,
      estMinimumRateUsd: row.est_minimum_rate_usd,
      estMaximumRateUsd: row.est_maximum_rate_usd,
      culturalFitBullets: buildCulturalFitBullets(row),
      availabilityLabel: AVAILABILITY_LABELS[row.booking_status],
      activeExclusivity: activeBlackout
        ? {
            brandName: activeBlackout.brand_name,
            categorySlug: humanizeSlug(activeBlackout.category_slug),
            daysRemaining: daysRemaining(activeBlackout.blackout_end_date),
          }
        : null,
    };
  });

  const profile = profileResult.data as AgencyProfileRow | null;
  const agencyName = profile?.agency_name?.trim() || 'PulseGrid Verified Talent';
  const clientName = body.clientName?.trim() || 'Valued Client';
  const campaignTitle = body.campaignTitle?.trim() || 'Talent Roster';
  const generatedDateLabel = new Date().toLocaleDateString('en-US', {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  });

  let pdfBuffer: Buffer;
  try {
    // ClientPitchSheet's own prop type isn't `DocumentProps` (it wraps a
    // <Document> rather than being one), so renderToBuffer's stricter
    // element type needs this cast — safe, since it unconditionally
    // renders a <Document> as its root.
    const pitchDocument = createElement(ClientPitchSheet, {
      agencyName,
      agencyLogoUrl: profile?.branding_logo_url ?? null,
      clientName,
      campaignTitle,
      generatedDateLabel,
      creators: pitchCreators,
    }) as unknown as ReactElement<DocumentProps>;

    pdfBuffer = await renderToBuffer(pitchDocument);
  } catch (err) {
    return NextResponse.json(
      { error: 'PDF_RENDER_FAILED', message: err instanceof Error ? err.message : String(err) },
      { status: 500 }
    );
  }

  const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
  // Buffer's newer generic typing doesn't structurally satisfy the DOM
  // lib's BodyInit union; a plain Uint8Array view over the same bytes does.
  const pdfBytes = new Uint8Array(pdfBuffer);

  return new NextResponse(pdfBytes, {
    status: 200,
    headers: {
      'Content-Type': 'application/pdf',
      'Content-Disposition': `attachment; filename="talent-roster-${timestamp}.pdf"`,
      'Content-Length': String(pdfBuffer.length),
    },
  });
}
