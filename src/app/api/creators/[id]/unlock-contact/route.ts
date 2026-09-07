/**
 * POST /api/creators/[id]/unlock-contact
 *
 * Spends 1 of the caller's `contact_unlocks_remaining` credits (or reports
 * a free re-reveal if they've already unlocked this creator) and returns
 * the creator's direct booking contact.
 *
 * The actual credit spend is delegated to the `unlock_creator_contact`
 * Postgres RPC (see `supabase/migrations/003_add_contact_unlock_ledger_and_rpc.sql`)
 * — that's what makes the decrement atomic and idempotent, not anything in
 * this handler. This handler's job is: verify the session, call the RPC,
 * then — once the RPC confirms the caller is allowed to see it — fetch the
 * actual contact fields via the service-role client, exactly as specified.
 */

import { NextResponse, type NextRequest } from 'next/server';

import { getServerSupabaseClient } from '@/lib/supabase/server';
import { getServiceRoleClient } from '@/lib/supabase/service';
import type { ContactUnlockPayload, RepType } from '@/types/creator';

interface RouteContext {
  params: Promise<{ id: string }>;
}

type UnlockOutcome = 'unlocked' | 'already_unlocked' | 'insufficient_credits' | 'creator_not_found' | 'unauthenticated';

interface UnlockRpcRow {
  outcome: UnlockOutcome;
  credits_remaining: number | null;
}

interface CreatorContactRow {
  direct_booking_email: string | null;
  direct_booking_phone: string | null;
  rep_type: RepType;
  deliverability_score: number | null;
}

export async function POST(_request: NextRequest, { params }: RouteContext): Promise<NextResponse> {
  const { id: creatorId } = await params;

  if (!creatorId) {
    return NextResponse.json({ error: 'INVALID_REQUEST', message: 'Missing creator id.' }, { status: 400 });
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
    return NextResponse.json({ error: 'UNAUTHENTICATED', message: 'Sign in to unlock a booking desk.' }, { status: 401 });
  }

  // Called through the *session-bound* client so auth.uid() inside the RPC
  // resolves to this real user — the function never trusts a client-
  // supplied profile id, so this is what actually makes the spend safe.
  const { data: rpcData, error: rpcError } = await supabase
    .rpc('unlock_creator_contact', { target_creator_id: creatorId })
    .single();

  if (rpcError || !rpcData) {
    return NextResponse.json(
      { error: 'UNLOCK_FAILED', message: rpcError?.message ?? 'Unlock failed unexpectedly.' },
      { status: 500 }
    );
  }

  const rpcResult = rpcData as UnlockRpcRow;

  if (rpcResult.outcome === 'unauthenticated') {
    return NextResponse.json({ error: 'UNAUTHENTICATED', message: 'Sign in to unlock a booking desk.' }, { status: 401 });
  }

  if (rpcResult.outcome === 'creator_not_found') {
    const payload: ContactUnlockPayload = {
      success: false,
      creatorId,
      reason: 'CREATOR_NOT_FOUND',
      creditsRemaining: rpcResult.credits_remaining ?? 0,
    };
    return NextResponse.json(payload, { status: 404 });
  }

  if (rpcResult.outcome === 'insufficient_credits') {
    return NextResponse.json(
      { error: 'INSUFFICIENT_CREDITS', message: 'Upgrade tier or purchase unlock pack' },
      { status: 403 }
    );
  }

  // outcome is 'unlocked' or 'already_unlocked' from here — the caller is
  // entitled to see the contact. Fetch the real fields via the service-role
  // client, as specified, rather than trusting anything already in scope.
  const serviceClient = getServiceRoleClient();
  const { data: creatorRow, error: creatorError } = await serviceClient
    .from('creators')
    .select('direct_booking_email, direct_booking_phone, rep_type, deliverability_score')
    .eq('id', creatorId)
    .maybeSingle();

  if (creatorError || !creatorRow) {
    const payload: ContactUnlockPayload = {
      success: false,
      creatorId,
      reason: 'CREATOR_NOT_FOUND',
      creditsRemaining: rpcResult.credits_remaining ?? 0,
    };
    return NextResponse.json(payload, { status: 404 });
  }

  const contact = creatorRow as CreatorContactRow;

  const payload: ContactUnlockPayload = {
    success: true,
    creatorId,
    unlockedAt: new Date().toISOString(),
    creditsRemaining: rpcResult.credits_remaining ?? 0,
    contact: {
      repType: contact.rep_type,
      directBookingEmail: contact.direct_booking_email,
      directBookingPhone: contact.direct_booking_phone,
      deliverabilityScore: contact.deliverability_score,
    },
  };

  return NextResponse.json(payload, { status: 200 });
}
