-- =====================================================================================
-- PulseGrid Intelligence — Additive Migration
-- 003_add_contact_unlock_ledger_and_rpc.sql
--
-- Adds the server-side machinery the Step 5 unlock-contact route needs:
--
--   1. contact_unlocks — a ledger of which profile has spent a credit to
--      reveal which creator's contact info, so re-opening an already-
--      unlocked desk is a free re-reveal instead of spending a credit
--      every time.
--
--   2. unlock_creator_contact(uuid) — a single atomic, idempotent RPC that
--      checks the ledger, conditionally decrements contact_unlocks_remaining,
--      records the unlock, and reports the outcome — safe under concurrent
--      calls (a losing race refunds itself rather than double-charging).
--
--   3. A column-privilege fix. profiles_update_own (001_init.sql) lets a
--      signed-in user UPDATE *any* column on their own row — RLS is
--      row-level, not column-level, so that policy alone doesn't stop
--      someone from calling
--        supabase.from('profiles').update({ contact_unlocks_remaining: 999999 })
--      directly from the browser and granting themselves unlimited unlock
--      credits. This was latent but harmless before credits were actually
--      spent anywhere; Step 5 makes it a real, exploitable gap. Revoking
--      UPDATE on just the two credit/tier columns closes it without
--      touching the existing RLS policy or any other editable field
--      (agency_name, branding_logo_url, primary_hex_color stay editable).
-- =====================================================================================

create table public.contact_unlocks (
  id           uuid primary key default gen_random_uuid(),
  profile_id   uuid not null references public.profiles (id) on delete cascade,
  creator_id   uuid not null references public.creators (id) on delete cascade,
  unlocked_at  timestamptz not null default now(),
  constraint contact_unlocks_unique unique (profile_id, creator_id)
);

comment on table public.contact_unlocks is
  'Ledger of which profile has spent a credit to reveal which creator''s contact info.';

create index idx_contact_unlocks_profile on public.contact_unlocks (profile_id);
create index idx_contact_unlocks_creator on public.contact_unlocks (creator_id);

alter table public.contact_unlocks enable row level security;

create policy "contact_unlocks_select_own"
  on public.contact_unlocks for select
  to authenticated
  using (profile_id = auth.uid());

-- No insert/update/delete policy for regular users — every write happens
-- through unlock_creator_contact() below, which is SECURITY DEFINER.

-- ---------------------------------------------------------------------------------------
-- Close the self-serve-credits gap in profiles_update_own.
-- ---------------------------------------------------------------------------------------
revoke update (contact_unlocks_remaining, subscription_tier) on public.profiles from authenticated;

-- ---------------------------------------------------------------------------------------
-- unlock_creator_contact — the one atomic operation the unlock-contact route calls.
-- Always resolves the caller from auth.uid() internally; never trust a
-- client-supplied profile id for this.
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

  if not exists (select 1 from public.creators where id = target_creator_id) then
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

comment on function public.unlock_creator_contact(uuid) is
  'Atomically spends 1 contact_unlocks_remaining credit (or reports the existing free re-reveal) for target_creator_id. Caller is always auth.uid().';

grant execute on function public.unlock_creator_contact(uuid) to authenticated;
