-- =====================================================================================
-- PulseGrid Intelligence — Additive Migration
-- 005_grant_schema_privileges.sql
--
-- A fresh Supabase project normally gets default table/sequence/function
-- GRANT statements for anon/authenticated/service_role applied
-- automatically as part of project creation, before any user migration
-- ever runs. That bootstrap did not happen on pulsegrid-prod: even
-- service_role — whose whole purpose is unrestricted, RLS-bypassing
-- backend access — was returning `42501 permission denied for table
-- creators`, with Postgres's own hint naming the exact missing grant
-- (`GRANT SELECT ON public.creators TO service_role`). BYPASSRLS only
-- skips row-level security policy evaluation; it does not substitute for
-- baseline table-level privileges, which is what was actually missing.
--
-- This grants the standard Supabase default privilege set:
--
--   - service_role: full privileges on every table/sequence/function in
--     `public`. This is the role src/lib/supabase/service.ts and every
--     Route Handler's elevated-privilege reads/writes run as — it is
--     meant to be unrestricted.
--
--   - authenticated: table-level SELECT/INSERT/UPDATE/DELETE, with RLS
--     (already defined across 001-004) doing the real per-row gating —
--     the standard "broad grant, RLS narrows" model those policies were
--     written against. This does not widen what an authenticated user can
--     actually do; it supplies the table-level precondition RLS policies
--     assume already exists.
--
--   - anon: deliberately NOT granted table access here. Every RLS policy
--     across 001-004 scopes access `to authenticated` only — anon reads of
--     public content go through the service-role client in Server
--     Components (src/lib/supabase/service.ts) by design (see that file's
--     own comments). Granting anon broad table access would be a real
--     widening of the intended security surface, not a fix for a gap.
--     anon does get function EXECUTE, matching Postgres's own default
--     (EXECUTE is granted to PUBLIC by default unless revoked) — every
--     SECURITY DEFINER function already gates on auth.uid() internally,
--     so this does not bypass anything.
--
-- ALTER DEFAULT PRIVILEGES ensures any table/sequence/function added by a
-- future migration inherits these grants automatically, so this class of
-- gap cannot recur on the next `create table`.
-- =====================================================================================

grant usage on schema public to anon, authenticated, service_role;

grant select, insert, update, delete on all tables in schema public to authenticated;
grant all privileges on all tables in schema public to service_role;

grant usage, select on all sequences in schema public to authenticated, service_role;

grant execute on all functions in schema public to anon, authenticated, service_role;

alter default privileges in schema public grant select, insert, update, delete on tables to authenticated;
alter default privileges in schema public grant all privileges on tables to service_role;
alter default privileges in schema public grant usage, select on sequences to authenticated, service_role;
alter default privileges in schema public grant execute on functions to anon, authenticated, service_role;
