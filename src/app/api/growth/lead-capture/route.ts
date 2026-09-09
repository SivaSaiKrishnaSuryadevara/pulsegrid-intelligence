/**
 * POST /api/growth/lead-capture
 *
 * Backs the AgencyPassModal's email-capture path (Step 7). No payment
 * processor is integrated this pass — this just queues a `growth_leads`
 * row (migration 006, `production_needs` added in 007) for manual sales
 * follow-up.
 */

import { NextResponse, type NextRequest } from 'next/server';

import { getServiceRoleClient } from '@/lib/supabase/service';

type ProductionNeeds = 'stage_talent' | 'creator_media_flight' | 'full_bundle';
const PRODUCTION_NEEDS_VALUES: readonly ProductionNeeds[] = ['stage_talent', 'creator_media_flight', 'full_bundle'];

interface LeadCaptureRequestBody {
  workEmail?: string;
  tierInterest?: 'campaign_pass' | 'agency_pro';
  productionNeeds?: ProductionNeeds;
}

function errorResponse(status: number, error: string, message: string): NextResponse {
  return NextResponse.json({ error, message }, { status });
}

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export async function POST(request: NextRequest): Promise<NextResponse> {
  let body: LeadCaptureRequestBody;
  try {
    body = (await request.json()) as LeadCaptureRequestBody;
  } catch {
    return errorResponse(400, 'INVALID_JSON', 'Request body must be valid JSON.');
  }

  const workEmail = body.workEmail?.trim().toLowerCase();
  if (!workEmail || !EMAIL_RE.test(workEmail)) {
    return errorResponse(400, 'INVALID_REQUEST', 'A valid workEmail is required.');
  }

  const tierInterest = body.tierInterest === 'campaign_pass' || body.tierInterest === 'agency_pro' ? body.tierInterest : null;
  const productionNeeds = body.productionNeeds && PRODUCTION_NEEDS_VALUES.includes(body.productionNeeds) ? body.productionNeeds : null;

  const serviceClient = getServiceRoleClient();
  const { error } = await serviceClient
    .from('growth_leads')
    .insert({ work_email: workEmail, tier_interest: tierInterest, production_needs: productionNeeds });

  if (error) {
    return errorResponse(500, 'INSERT_FAILED', error.message);
  }

  return NextResponse.json({ success: true }, { status: 200 });
}
