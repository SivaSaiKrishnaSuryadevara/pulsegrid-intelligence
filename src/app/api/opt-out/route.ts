/**
 * POST /api/opt-out
 *
 * Queues a creator/DJ/studio's self-serve delisting request. This is a
 * manual-ops queue, not an automated delisting pipeline — the row lands in
 * `opt_out_requests` (migration 006) for a human to action within 24 hours;
 * nothing here deletes or hides a `production_entities` row automatically.
 */

import { NextResponse, type NextRequest } from 'next/server';

import { getServiceRoleClient } from '@/lib/supabase/service';

interface OptOutRequestBody {
  handle?: string;
  email?: string;
}

function errorResponse(status: number, error: string, message: string): NextResponse {
  return NextResponse.json({ error, message }, { status });
}

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export async function POST(request: NextRequest): Promise<NextResponse> {
  let body: OptOutRequestBody;
  try {
    body = (await request.json()) as OptOutRequestBody;
  } catch {
    return errorResponse(400, 'INVALID_JSON', 'Request body must be valid JSON.');
  }

  const handle = body.handle?.trim().replace(/^@/, '');
  const email = body.email?.trim().toLowerCase();

  if (!handle) {
    return errorResponse(400, 'INVALID_REQUEST', 'handle is required.');
  }
  if (!email || !EMAIL_RE.test(email)) {
    return errorResponse(400, 'INVALID_REQUEST', 'A valid email is required.');
  }

  const serviceClient = getServiceRoleClient();
  const { error } = await serviceClient.from('opt_out_requests').insert({ handle, email });

  if (error) {
    return errorResponse(500, 'INSERT_FAILED', error.message);
  }

  return NextResponse.json({ success: true }, { status: 200 });
}
