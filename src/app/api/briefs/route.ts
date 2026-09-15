/**
 * POST /api/briefs
 *
 * Zero-friction event intake for the private beta (booking-brief-modal.tsx).
 * Deliberately unauthenticated — the whole point is a planner can submit a
 * brief before ever creating an agency account. Writes via the service-role
 * client (not the anon-key RLS-gated insert from migration 013/014/015,
 * which stays available as an independent direct-embed capability) so this
 * route can also fire the internal notification in the same request.
 *
 * Distinct from `/api/concierge/request` (an authenticated agency's
 * per-creator "unlock desk" follow-up, tied to a real profile) — this is
 * the top-of-funnel intake path, reachable with no session at all.
 */

import { NextResponse, type NextRequest } from 'next/server';
import { Resend } from 'resend';

import { DIALECT_OPTIONS, TALENT_CATEGORY_OPTIONS } from '@/lib/booking-briefs/constants';
import { getServiceRoleClient } from '@/lib/supabase/service';
import { METRO_HUBS, type MetroHub } from '@/types/creator';

interface BookingBriefBody {
  plannerName?: string;
  contactEmail?: string;
  contactPhone?: string;
  eventDate?: string;
  metro?: string;
  venue?: string;
  talentCategory?: string;
  dialects?: string[];
  budgetRange?: string;
  notes?: string;
  targetCreatorHandle?: string;
}

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const DATE_ONLY_RE = /^\d{4}-\d{2}-\d{2}$/;

const NOTIFICATION_FROM_ADDRESS = 'PulseGrid Talent Desk <briefs@pulsegridos.com>';
const FALLBACK_NOTIFICATION_EMAIL = 'krishnacq20@gmail.com';

function errorResponse(status: number, error: string, message: string): NextResponse {
  return NextResponse.json({ error, message }, { status });
}

function errorMessage(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}

export async function POST(request: NextRequest): Promise<NextResponse> {
  let body: BookingBriefBody;
  try {
    body = (await request.json()) as BookingBriefBody;
  } catch {
    return errorResponse(400, 'INVALID_JSON', 'Request body must be valid JSON.');
  }

  const plannerName = body.plannerName?.trim();
  const contactEmail = body.contactEmail?.trim().toLowerCase();
  const eventDate = body.eventDate?.trim();
  const metro = body.metro?.trim();
  const talentCategory = body.talentCategory?.trim();

  if (!plannerName) return errorResponse(400, 'INVALID_REQUEST', 'plannerName is required.');
  if (!contactEmail || !EMAIL_RE.test(contactEmail)) {
    return errorResponse(400, 'INVALID_REQUEST', 'A valid contactEmail is required.');
  }
  if (!eventDate || !DATE_ONLY_RE.test(eventDate) || Number.isNaN(Date.parse(eventDate))) {
    return errorResponse(400, 'INVALID_REQUEST', 'eventDate is required and must be an ISO date (YYYY-MM-DD).');
  }
  if (!metro || !METRO_HUBS.includes(metro as MetroHub)) {
    return errorResponse(400, 'INVALID_REQUEST', `metro is required and must be one of: ${METRO_HUBS.join(', ')}`);
  }
  if (!talentCategory || !TALENT_CATEGORY_OPTIONS.includes(talentCategory as (typeof TALENT_CATEGORY_OPTIONS)[number])) {
    return errorResponse(400, 'INVALID_REQUEST', `talentCategory is required and must be one of: ${TALENT_CATEGORY_OPTIONS.join(', ')}`);
  }

  const dialects = Array.isArray(body.dialects) ? body.dialects.filter((d) => DIALECT_OPTIONS.includes(d as (typeof DIALECT_OPTIONS)[number])) : [];

  const supabase = getServiceRoleClient();
  const { data, error } = await supabase
    .from('booking_briefs')
    .insert({
      planner_name: plannerName,
      contact_email: contactEmail,
      contact_phone: body.contactPhone?.trim() || null,
      event_date: eventDate,
      metro,
      venue: body.venue?.trim() || null,
      talent_category: talentCategory,
      dialects: dialects.length > 0 ? dialects : null,
      budget_range: body.budgetRange?.trim() || null,
      notes: body.notes?.trim() || null,
      target_creator_handle: body.targetCreatorHandle?.trim() || null,
    })
    .select('id')
    .single();

  if (error || !data) {
    return errorResponse(500, 'INSERT_FAILED', error?.message ?? 'Unknown insert failure.');
  }

  await sendBriefNotification({ ...body, plannerName, contactEmail, eventDate, metro, talentCategory, dialects, briefId: data.id as string });

  return NextResponse.json({ success: true, briefId: data.id }, { status: 201 });
}

async function sendBriefNotification(brief: {
  plannerName: string;
  contactEmail: string;
  contactPhone?: string;
  eventDate: string;
  metro: string;
  venue?: string;
  talentCategory: string;
  dialects: string[];
  budgetRange?: string;
  notes?: string;
  targetCreatorHandle?: string;
  briefId: string;
}): Promise<void> {
  const subject = `[PulseGrid Brief] ${brief.metro} • ${brief.talentCategory} (${brief.eventDate})`;
  const lines = [
    `New booking brief — id ${brief.briefId}`,
    '',
    `Planner: ${brief.plannerName}`,
    `Email: ${brief.contactEmail}`,
    brief.contactPhone ? `Phone: ${brief.contactPhone}` : null,
    '',
    `Event date: ${brief.eventDate}`,
    `Metro: ${brief.metro}`,
    brief.venue ? `Venue: ${brief.venue}` : null,
    `Talent category: ${brief.talentCategory}`,
    brief.targetCreatorHandle ? `Target creator: @${brief.targetCreatorHandle}` : 'Target creator: none specified (generic inquiry)',
    brief.dialects.length > 0 ? `Dialects / traditions: ${brief.dialects.join(', ')}` : null,
    brief.budgetRange ? `Budget range: ${brief.budgetRange}` : null,
    brief.notes ? `\nNotes:\n${brief.notes}` : null,
  ].filter((line): line is string => line !== null);
  const text = lines.join('\n');

  const apiKey = process.env.RESEND_API_KEY;
  const recipient = process.env.NOTIFICATION_EMAIL || FALLBACK_NOTIFICATION_EMAIL;

  if (!apiKey) {
    // Fallback logger — keeps local dev and any deploy without Resend
    // configured yet from silently losing every submitted brief.
    console.log(`[booking-brief notification -> ${recipient}] ${subject}\n${text}`);
    return;
  }

  try {
    const resend = new Resend(apiKey);
    const { data, error } = await resend.emails.send({
      from: NOTIFICATION_FROM_ADDRESS,
      to: recipient,
      subject,
      text,
    });
    if (error) {
      console.error('[Resend Error]:', error);
    } else {
      console.log('[Resend Success]: Email sent id:', data?.id);
    }
  } catch (err) {
    // Never let a notification failure fail the actual brief submission —
    // the row is already committed at this point; the desk can still see it
    // via the DB even if the email alert didn't go out.
    console.error(`[booking-brief notification] unexpected error sending for brief ${brief.briefId}:`, errorMessage(err));
  }
}
