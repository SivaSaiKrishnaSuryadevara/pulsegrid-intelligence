-- =====================================================================================
-- PulseGrid Intelligence — Additive Migration
-- 016_public_discover_read_access.sql
--
-- Makes /discover browsable without an account. Migration 005 deliberately
-- never granted `anon` any table access in `public` — every RLS policy
-- through that point scoped `to authenticated` only, with public reads
-- going through the service-role client in Server Components instead. That
-- was fine for the pSEO pages; it's exactly what was making /discover show
-- "Sign in to open Discover" to every visitor, since its own client-side
-- fetchDiscoveryCreators() runs against the browser's anon-key client.
--
-- NOT a blanket `grant select on production_entities to anon` — that would
-- undo a real, deliberate protection: discover/queries.ts's own
-- DISCOVERY_COLUMNS list already excludes direct_booking_email/
-- direct_booking_phone specifically because the anon key is public
-- (embedded in client JS), so anyone could otherwise bypass the
-- unlock-contact credit paywall with a raw PostgREST call regardless of
-- what columns the app's own query asks for. A column-level GRANT enforces
-- the same restriction at the database layer — the two contact columns
-- stay unreadable by `anon` no matter how the table is queried. Kept in
-- sync with DISCOVERY_COLUMNS by hand; if that list changes, this should
-- too.
--
-- creator_category_blackouts (the other table /discover's client-side
-- fetch touches, for the Exclusivity Radar) has no sensitive columns at
-- all, so it gets a normal full grant.
--
-- Neither table has an `anon` RLS policy at all yet — 001_init.sql's
-- "creators_select_authenticated" / "blackouts_select_authenticated" only
-- ever covered `to authenticated`. RLS default-denies with no matching
-- policy, so without these, the grants above would still return zero
-- rows for an anonymous request. `using (true)` here matches the existing
-- authenticated policies exactly (no per-row restriction) — the whole
-- catalog is meant to be publicly visible; only the two contact columns
-- (handled by the column-level grant, not RLS) stay gated.
-- =====================================================================================

create policy "creators_select_anon"
  on public.production_entities for select
  to anon
  using (true);

create policy "blackouts_select_anon"
  on public.creator_category_blackouts for select
  to anon
  using (true);

grant select (
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
) on public.production_entities to anon;

grant select on public.creator_category_blackouts to anon;
