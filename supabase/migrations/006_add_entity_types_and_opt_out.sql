-- =====================================================================================
-- PulseGrid Intelligence — Additive Migration
-- 006_add_entity_types_and_opt_out.sql
--
-- Expands the platform from solo Instagram creators into a 5-entity-type
-- "Event Production OS": solo_creator, stage_emcee, dance_troupe, local_dj,
-- event_planner. `creators` is renamed to `production_entities` — a plain
-- ALTER TABLE RENAME preserves every FK, index, RLS policy, and trigger by
-- OID, so `creator_category_blackouts`, `promoter_creator_bookings`,
-- `committee_submissions`, and `contact_unlocks` keep working with zero
-- data migration. Only application code that hardcodes the string
-- 'creators' (table name or PostgREST embedded-relation name) needs to
-- change — see the accompanying app-layer diff.
--
-- Also adds two small service-role-only queues: `opt_out_requests` (Step 8
-- self-serve delisting requests) and `growth_leads` (Step 7 paywall modal's
-- email-capture path). Neither is exposed to `anon`/`authenticated` via RLS
-- — only the service-role API routes that own them can read/write.
-- =====================================================================================

alter table public.creators rename to production_entities;

comment on table public.production_entities is
  'Verified production-entity directory: solo creators, emcees, dance troupes, DJs, and event planners.';

create type public.entity_type as enum (
  'solo_creator',
  'stage_emcee',
  'dance_troupe',
  'local_dj',
  'event_planner'
);

alter table public.production_entities
  add column entity_type public.entity_type not null default 'solo_creator',
  add column entity_details jsonb not null default '{}'::jsonb;

comment on column public.production_entities.entity_type is
  'Which kind of production entity this row represents.';
comment on column public.production_entities.entity_details is
  'Type-specific fields (troupe size/style, DJ AV spec, planner venue scale, ...), shaped per entity_type. Validated at the app/ingest layer (see src/types/creator.ts EntityDetails), not by a DB constraint.';

-- btree only — entity_details filtering happens client-side over the
-- already-fetched in-memory array (matches the existing matchesFilters()
-- pattern in src/lib/discover/filters.ts). Add a GIN index on
-- entity_details later if server-side jsonb filtering is ever introduced.
create index idx_production_entities_entity_type on public.production_entities (entity_type);

-- ---------------------------------------------------------------------------------------
-- opt_out_requests — manual-ops queue for the self-serve delisting form (Step 8).
-- No automated delisting in this pass; ops reviews and actions requests by hand.
-- ---------------------------------------------------------------------------------------
create table public.opt_out_requests (
  id            uuid primary key default gen_random_uuid(),
  handle        text not null,
  email         text not null,
  requested_at  timestamptz not null default now(),
  processed_at  timestamptz
);

comment on table public.opt_out_requests is
  'Manual-ops queue: handle/email opt-out requests submitted via /opt-out. No automated delisting in this pass.';

create index idx_opt_out_requests_processed on public.opt_out_requests (processed_at);

alter table public.opt_out_requests enable row level security;
-- Deliberately no policies — default-deny for anon and authenticated alike.
-- Only the service-role client (POST /api/opt-out) can read/write.

-- ---------------------------------------------------------------------------------------
-- growth_leads — email capture from the AgencyPassModal paywall (Step 7). No payment
-- processor is wired up this pass; this just queues interest for manual follow-up.
-- ---------------------------------------------------------------------------------------
create table public.growth_leads (
  id             uuid primary key default gen_random_uuid(),
  work_email     text not null,
  tier_interest  text,
  created_at     timestamptz not null default now()
);

comment on table public.growth_leads is
  'Email-capture leads from the Agency Pass paywall modal. No payment processor is integrated yet — manual sales follow-up only.';

alter table public.growth_leads enable row level security;
-- Deliberately no policies — default-deny for anon and authenticated alike.
-- Only the service-role client (POST /api/growth/lead-capture) can read/write.

-- ---------------------------------------------------------------------------------------
-- Fix unlock_creator_contact() (migration 003) — its body hardcodes
-- `public.creators` in a plain `select ... from` (line 82 of 003), and
-- unlike FKs/indexes/RLS policies/triggers, a plpgsql function body is
-- NOT re-bound by the table rename above: it re-resolves that identifier
-- by name on every call, so left unfixed this RPC starts throwing
-- `relation "public.creators" does not exist` on the very next unlock
-- request. Re-declaring the function is a no-op for its ledger/grant/RLS
-- setup — only the body changes (creators -> production_entities).
-- ---------------------------------------------------------------------------------------
create or replace function public.unlock_creator_contact(target_creator_id uuid)
returns table (
  outcome text,               -- 'unlocked' | 'already_unlocked' | 'insufficient_credits' | 'creator_not_found' | 'unauthenticated'
  credits_remaining integer
)
language plpgsql
security definer
set search_path = public
as $$
declare
  caller_id uuid := auth.uid();
  remaining integer;
begin
  if caller_id is null then
    return query select 'unauthenticated'::text, null::integer;
    return;
  end if;

  if not exists (select 1 from public.production_entities where id = target_creator_id) then
    return query select 'creator_not_found'::text, null::integer;
    return;
  end if;

  if exists (
    select 1 from public.contact_unlocks
    where profile_id = caller_id and creator_id = target_creator_id
  ) then
    select p.contact_unlocks_remaining into remaining from public.profiles p where p.id = caller_id;
    return query select 'already_unlocked'::text, remaining;
    return;
  end if;

  update public.profiles
    set contact_unlocks_remaining = contact_unlocks_remaining - 1
    where id = caller_id and contact_unlocks_remaining > 0
    returning contact_unlocks_remaining into remaining;

  if remaining is null then
    select p.contact_unlocks_remaining into remaining from public.profiles p where p.id = caller_id;
    return query select 'insufficient_credits'::text, remaining;
    return;
  end if;

  begin
    insert into public.contact_unlocks (profile_id, creator_id) values (caller_id, target_creator_id);
  exception when unique_violation then
    -- Lost a race with a concurrent unlock request for the same creator —
    -- refund the credit just spent and report the unlock that won instead
    -- of double-charging.
    update public.profiles
      set contact_unlocks_remaining = contact_unlocks_remaining + 1
      where id = caller_id
      returning contact_unlocks_remaining into remaining;
    return query select 'already_unlocked'::text, remaining;
    return;
  end;

  return query select 'unlocked'::text, remaining;
end;
$$;

-- =======================================================================================
-- END OF 006_add_entity_types_and_opt_out.sql
-- =======================================================================================
