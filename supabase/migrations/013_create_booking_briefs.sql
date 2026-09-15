-- =====================================================================================
-- PulseGrid Intelligence — Additive Migration
-- 013_create_booking_briefs.sql
--
-- Zero-friction event intake for the private beta: a planner submits a
-- booking brief (event date, metro, talent category, optionally a specific
-- creator handle they already have in mind) without needing an authenticated
-- agency account first. Deliberately a public anon-INSERT table, not routed
-- through a service-role API endpoint like `concierge_requests` — the whole
-- point of "zero-friction" here is a form that can post straight to
-- Supabase with no backend round-trip.
--
-- RLS: anon may INSERT (check (true) — no per-row restriction needed, this
-- is intake, not user-owned data) but there is no SELECT/UPDATE/DELETE
-- policy for anon or authenticated, so submitted briefs are only readable
-- by the service-role client, same default-deny-unless-granted posture
-- already used for `concierge_requests`/`opt_out_requests`/`growth_leads`.
-- =====================================================================================

create table if not exists public.booking_briefs (
  id                     uuid primary key default gen_random_uuid(),
  created_at             timestamptz default timezone('utc'::text, now()) not null,
  planner_name           text not null,
  contact_email          text not null,
  contact_phone          text,
  event_date             date not null,
  metro                  text not null,
  venue                  text,
  talent_category        text not null,
  dialects               text[],
  budget_range           text,
  notes                  text,
  target_creator_handle  text,
  status                 text default 'pending'
);

comment on table public.booking_briefs is
  'Zero-friction event intake for the private beta — anonymous planner-submitted booking briefs, optionally tied to a specific creator handle.';

alter table public.booking_briefs enable row level security;

create policy "Allow anonymous intake inserts" on public.booking_briefs
  for insert to anon with check (true);
