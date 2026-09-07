-- =====================================================================================
-- PulseGrid Intelligence — Additive Migration
-- 004_add_committee_scoring_and_daas_api_key_scopes.sql
--
-- Step 6 (Committee Scoring Workspace & Enterprise DaaS API) needs three
-- additive schema changes:
--
--   1. committee_submissions.role_applied_for — the audition-scoring board
--      displays "role applied for" (e.g. "Main Stage Emcee") per
--      submission; no column existed to store it.
--
--   2. committee_votes score columns widened from smallint (whole numbers
--      1-5) to numeric(2,1), plus a half-step CHECK constraint. The board's
--      rating sliders move in 0.5 increments (1.0-5.0) — smallint cannot
--      represent 4.5. The original `between 1 and 5` range checks remain
--      valid as-is after the type change (untyped literals coerce fine
--      against numeric), so only the new half-step constraints are added.
--
--   3. api_keys.contact_access — the DaaS query endpoint strips private
--      contact columns unless the caller's key has this enabled. Same
--      pattern as migration 003's finding: api_keys_update_own (001_init.sql)
--      is a row-level policy, so without a column-privilege lock, any key
--      owner could self-grant contact_access (or a higher rate_limit_rpm)
--      via a plain client-side update the moment this column exists. Both
--      are revoked from authenticated up front, before the column is ever
--      exposed to a client. is_active is deliberately left self-editable —
--      letting a caller deactivate their own (possibly leaked) key is
--      standard, desirable self-service key management.
-- =====================================================================================

alter table public.committee_submissions
  add column if not exists role_applied_for text;

alter table public.committee_votes
  alter column dialect_fit_score type numeric(2,1) using dialect_fit_score::numeric(2,1),
  alter column stage_presence_score type numeric(2,1) using stage_presence_score::numeric(2,1),
  alter column delivery_score type numeric(2,1) using delivery_score::numeric(2,1);

alter table public.committee_votes
  add constraint committee_votes_dialect_fit_score_half_step_chk check (mod(dialect_fit_score * 2, 1) = 0),
  add constraint committee_votes_stage_presence_score_half_step_chk check (mod(stage_presence_score * 2, 1) = 0),
  add constraint committee_votes_delivery_score_half_step_chk check (mod(delivery_score * 2, 1) = 0);

alter table public.api_keys
  add column if not exists contact_access boolean not null default false;

comment on column public.api_keys.contact_access is
  'Enterprise DaaS entitlement: when true, /api/v1/creators/query includes direct_booking_email/phone in results for this key.';

revoke update (contact_access, rate_limit_rpm) on public.api_keys from authenticated;
