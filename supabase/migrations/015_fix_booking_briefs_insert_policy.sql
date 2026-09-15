-- =====================================================================================
-- PulseGrid Intelligence — Additive Migration
-- 015_fix_booking_briefs_insert_policy.sql
--
-- A live anon-key insert against booking_briefs still failed with "new row
-- violates row-level security policy" even after 014 granted anon the
-- underlying table privilege — meaning 013's policy itself never actually
-- took effect as written (most likely the multi-statement SQL Editor run
-- didn't fully apply every statement). Rather than guess why, this drops
-- and recreates the policy idempotently so the end state is guaranteed
-- correct regardless of whatever happened during 013's execution.
-- =====================================================================================

drop policy if exists "Allow anonymous intake inserts" on public.booking_briefs;

create policy "Allow anonymous intake inserts" on public.booking_briefs
  for insert
  to anon
  with check (true);
