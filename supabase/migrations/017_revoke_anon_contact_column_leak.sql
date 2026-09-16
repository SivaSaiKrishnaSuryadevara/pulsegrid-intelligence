-- =====================================================================================
-- PulseGrid Intelligence — URGENT Additive Migration
-- 017_revoke_anon_contact_column_leak.sql
--
-- Live, active data leak, confirmed in production and unrelated to
-- anything in this session's other work: `anon` (the public key embedded
-- in every browser bundle — no auth required to use it) currently has
-- unrestricted SELECT on production_entities, direct_booking_email and
-- direct_booking_phone included. Anyone can read every creator's direct
-- contact info via a raw PostgREST call, completely bypassing the
-- unlock-contact credit paywall (POST /api/creators/[id]/unlock-contact),
-- without ever touching the app UI. No migration in this repo granted
-- this — the live database has drifted from tracked migration history,
-- almost certainly via a change made directly in the Supabase Dashboard.
--
-- UPDATE: the first version of this migration (`revoke ... from anon`)
-- was confirmed live NOT to close the leak — re-tested after it ran and
-- the columns were still readable. Root cause: `REVOKE ... FROM anon`
-- only undoes a privilege granted directly to `anon`. Postgres's `PUBLIC`
-- pseudo-role is implicitly inherited by every role, `anon` included — if
-- the original (untracked) grant was made `TO public` rather than
-- specifically `TO anon`, a role-targeted revoke never touches it. That
-- fits every symptom observed: full access to every column with no
-- migration in this repo ever granting `anon` directly. Revoking from
-- `public` explicitly closes that path regardless of which role the
-- original grant actually targeted.
--
-- Every other column stays exactly as accessible as it was; this does not
-- touch primary_metro/follower_count/etc. Run this BEFORE 016 (or in
-- either order — they don't depend on each other, but this one is the
-- urgent one). Safe to re-run — REVOKE on a privilege that's already
-- absent is a no-op, not an error.
-- =====================================================================================

revoke select (direct_booking_email, direct_booking_phone) on public.production_entities from anon;
revoke select (direct_booking_email, direct_booking_phone) on public.production_entities from public;

-- Force PostgREST to drop its cached role/privilege info immediately
-- rather than waiting for its next periodic reload — a raw GRANT/REVOKE
-- via SQL doesn't get the same automatic reload Dashboard-made changes do.
notify pgrst, 'reload schema';
