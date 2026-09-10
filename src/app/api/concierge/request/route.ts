/**
 * POST /api/concierge/request
 *
 * Backs the Talent Desk tab's "Concierge Hand-off" fallback
 * (ConciergeRequestModal): when a creator's desk is unlocked but no direct
 * email/phone was on file, this is the CTA that replaces the dead end.
 * Queues a `concierge_requests` row (migration 009) for PulseGrid's own
 * production desk to manually route — not the same thing as
 * `/api/growth/lead-capture` (top-of-funnel subscription interest, no
 * creator context).
 *
 * Requires an authenticated agency session (the drawer this is reached
 * from is already behind /login) — the session-bound client resolves the
 * caller so `requester_profile_id` reflects a real profile rather than a
 * client-supplied id, then the actual insert runs via the service-role
 * client since `concierge_requests` has no RLS policies for
 * `authenticated` (see the migration).
 */

import { NextResponse, type NextRequest } from 'next/server';

import { getServerSupabaseClient } from '@/lib/supabase/server';
import { getServiceRoleClient } from '@/lib/supabase/service';

interface ConciergeRequestBody {
  creatorId?: string;
  creatorHandle?: string;
  creatorDisplayName?: string;
  requesterEmail?: string;
  requesterPhone?: string;
  eventDate?: string;
  venue?: string;
  budget?: string;
  riderNotes?: string;
}

function errorResponse(status: number, error: string, message: string): NextResponse {
  return NextResponse.json({ error, message }, { status });
}

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export async function POST(request: NextRequest): Promise<NextResponse> {
  let supabase;
  try {
    supabase = await getServerSupabaseClient();
  } catch (err) {
    return errorResponse(500, 'CONFIGURATION_ERROR', err instanceof Error ? err.message : String(err));
  }

  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser();

  if (authError || !user) {
    return errorResponse(401, 'UNAUTHENTICATED', 'Sign in to request a concierge introduction.');
  }

  let body: ConciergeRequestBody;
  try {
    body = (await request.json()) as ConciergeRequestBody;
  } catch {
    return errorResponse(400, 'INVALID_JSON', 'Request body must be valid JSON.');
  }

  const creatorId = body.creatorId?.trim();
  const creatorHandle = body.creatorHandle?.trim();
  const creatorDisplayName = body.creatorDisplayName?.trim();
  if (!creatorId || !creatorHandle || !creatorDisplayName) {
    return errorResponse(400, 'INVALID_REQUEST', 'creatorId, creatorHandle, and creatorDisplayName are required.');
  }

  const requesterEmail = body.requesterEmail?.trim().toLowerCase();
  if (!requesterEmail || !EMAIL_RE.test(requesterEmail)) {
    return errorResponse(400, 'INVALID_REQUEST', 'A valid requesterEmail is required.');
  }

  const serviceClient = getServiceRoleClient();
  const { error } = await serviceClient.from('concierge_requests').insert({
    creator_id: creatorId,
    creator_handle: creatorHandle,
    creator_display_name: creatorDisplayName,
    requester_profile_id: user.id,
    requester_email: requesterEmail,
    requester_phone: body.requesterPhone?.trim() || null,
    event_date_note: body.eventDate?.trim() || null,
    venue_note: body.venue?.trim() || null,
    budget_note: body.budget?.trim() || null,
    rider_notes: body.riderNotes?.trim() || null,
  });

  if (error) {
    return errorResponse(500, 'INSERT_FAILED', error.message);
  }

  return NextResponse.json({ success: true }, { status: 200 });
}
