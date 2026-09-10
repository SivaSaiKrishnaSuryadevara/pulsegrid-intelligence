-- =====================================================================================
-- PulseGrid Intelligence — Additive Migration
-- 009_add_concierge_requests.sql
--
-- Backs the Talent Desk tab's "Concierge Hand-off" fallback
-- (creator-detail-drawer.tsx): when a creator's desk is unlocked but no
-- direct email/phone could be extracted at ingestion (no dead giveaway in
-- the bio — common for creators under private/agency representation), the
-- drawer offers "Request Introduction & Availability" instead of a dead
-- end. That submits a booking inquiry here for PulseGrid's own production
-- desk to manually route within 24 hours.
--
-- Deliberately a separate table from `growth_leads` (top-of-funnel
-- subscription-tier interest, no creator context) and `opt_out_requests`
-- (removal requests): this is a live booking inquiry tied to one specific
-- creator, submitted by an already-authenticated agency user.
-- =====================================================================================

create table public.concierge_requests (
  id                    uuid primary key default gen_random_uuid(),
  creator_id            uuid references public.production_entities(id) on delete set null,
  -- Denormalized so the request stays readable even if the creator row is
  -- later removed/renamed — matches "on delete set null" above.
  creator_handle        text not null,
  creator_display_name  text not null,
  requester_profile_id  uuid references public.profiles(id) on delete set null,
  requester_email       text not null,
  requester_phone       text,
  event_date_note       text,
  venue_note            text,
  budget_note           text,
  rider_notes           text,
  status                text not null default 'new' check (status in ('new', 'in_progress', 'closed')),
  created_at            timestamptz not null default now(),
  processed_at          timestamptz
);

comment on table public.concierge_requests is
  'Manual-ops queue: booking-inquiry hand-offs submitted via the Talent Desk tab''s Concierge fallback when a creator has no direct contact on file.';

create index idx_concierge_requests_status on public.concierge_requests (status);
create index idx_concierge_requests_creator on public.concierge_requests (creator_id);

alter table public.concierge_requests enable row level security;
-- Deliberately no policies — default-deny for anon and authenticated alike.
-- Only the service-role client (POST /api/concierge/request) can read/write.
