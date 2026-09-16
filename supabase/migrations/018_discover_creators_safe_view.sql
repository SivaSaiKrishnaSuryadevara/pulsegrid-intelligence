-- =====================================================================================
-- PulseGrid Intelligence — URGENT Additive Migration
-- 018_discover_creators_safe_view.sql
--
-- Supersedes 017's approach. Root cause finally confirmed: `anon` (and/or
-- `public`) held a TABLE-LEVEL `GRANT SELECT` on production_entities from
-- outside tracked migration history. A table-level grant covers every
-- column including ones added later; a column-level REVOKE only removes a
-- column-level grant entry and does nothing to a separate table-level one
-- still in effect — which is exactly why 017's `revoke select (...) from
-- anon/public` never closed the leak, confirmed live even after a full
-- project restart. information_schema.column_privileges (what 017's
-- diagnosis checked) doesn't surface this at all; only
-- information_schema.table_privileges would have.
--
-- Fix: stop trying to carve exceptions out of table-level access entirely.
-- Revoke it outright, and expose a view that simply never selects the two
-- sensitive columns in the first place — nothing to leak by construction,
-- regardless of what table-level grants exist or get added later.
--
-- View security semantics: deliberately NOT `security_invoker` (Postgres
-- 15+'s option to run a view as the querying role) — that would require
-- `anon` to hold its own privilege on the view's underlying columns again,
-- defeating the point. Left as the classic/default view mode: the
-- underlying query runs with THIS MIGRATION's (owner) table privileges,
-- while RLS policies scoped `to <role>` still evaluate against the real
-- invoking session role regardless of view ownership — so
-- `creators_select_anon`/`creators_select_authenticated` (both `using
-- (true)`) still correctly govern row visibility through the view.
-- =====================================================================================

revoke all on public.production_entities from anon, public;

-- The RLS policy that granted anon row-visibility on the base table is now
-- moot for anon specifically (no table-level privilege left for it to
-- apply to) — the view is what governs anon access going forward. Left in
-- place rather than dropped: harmless (a policy with no underlying grant
-- to gate is simply never reached), and it's what makes RLS correctly
-- pass anon through the view per the note above.

create or replace view public.discover_creators as
select
  id,
  handle,
  display_name,
  avatar_url,
  entity_type,
  entity_details,
  primary_metro,
  primary_niche,
  secondary_languages,
  follower_count,
  engagement_rate,
  avg_reel_views,
  est_minimum_rate_usd,
  est_maximum_rate_usd,
  booking_status,
  lead_time_days,
  verified_response_hours,
  rep_type,
  deliverability_score,
  public_link_url,
  bio,
  locality,
  is_verified,
  last_refreshed_at,
  created_at,
  updated_at
from public.production_entities;

comment on view public.discover_creators is
  'Public-safe read surface for /discover — every production_entities column except direct_booking_email/direct_booking_phone. Exists so those two columns can never be exposed via anon/public access regardless of what table-level grants exist on the base table.';

-- authenticated also needs this: /discover's query now points at this view
-- for both anonymous and signed-in visitors (they already ran the same
-- column-restricted query client-side, just against the base table
-- before), so a logged-in user needs the same view access, not just anon.
grant select on public.discover_creators to anon, authenticated;
