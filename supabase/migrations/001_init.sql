-- =====================================================================================
-- PulseGrid Intelligence — Initial Schema Migration
-- 001_init.sql
--
-- Verified creator intelligence, event-organizer directory, and automated
-- client-pitching platform.
--
-- Target: Supabase PostgreSQL (Postgres 15+), RLS-first design, @supabase/ssr auth.
-- Safe to paste directly into the Supabase SQL Editor and run top to bottom.
-- =====================================================================================

-- -------------------------------------------------------------------------------------
-- 0. EXTENSIONS
-- -------------------------------------------------------------------------------------
create extension if not exists "pgcrypto";   -- gen_random_uuid()

-- -------------------------------------------------------------------------------------
-- 1. ENUM TYPES
-- -------------------------------------------------------------------------------------

create type public.metro_hub as enum (
  'DFW_TEXAS',
  'DMV_NOVA',
  'AUSTIN_TX',
  'HOUSTON_TX',
  'TRI_STATE_NY_NJ',
  'ATLANTA_GA',
  'CHICAGO_IL'
);

create type public.primary_niche as enum (
  'CULTURAL_EVENTS',
  'NIGHTLIFE',
  'LUXURY_BRIDAL',
  'STAGE_EMCEE',
  'FOOD_DINING',
  'CHOREOGRAPHY'
);

create type public.booking_status as enum (
  'available_immediate',
  'high_demand_lead',
  'blackout_period',
  'closed_roster'
);

create type public.rep_type as enum (
  'DIRECT_MANAGER',
  'TALENT_AGENCY',
  'SELF_REPRESENTED',
  'UNVERIFIED_BIO'
);

create type public.enterprise_type as enum (
  'NIGHTLIFE_PROMOTER',
  'CONVENTION_BOARD',
  'WEDDING_PRODUCER',
  'CONCERT_ORGANIZER'
);

create type public.committee_role as enum (
  'CHAIR',
  'REVIEWER',
  'GUEST_OBSERVER'
);

create type public.talent_stage_status as enum (
  'SUBMITTED',
  'SHORTLISTED',
  'APPROVED_FOR_BOOKING',
  'REJECTED'
);

create type public.subscription_tier as enum (
  'FREE_TRIAL',
  'STARTER',
  'AGENCY_PRO',
  'ENTERPRISE_DAAS'
);

-- -------------------------------------------------------------------------------------
-- 2. UTILITY: updated_at trigger function
-- -------------------------------------------------------------------------------------

create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

-- =======================================================================================
-- 3. TABLES
-- =======================================================================================

-- ---------------------------------------------------------------------------------------
-- 3.1 profiles — extends auth.users, one row per platform user (agency rep / client)
-- ---------------------------------------------------------------------------------------
create table public.profiles (
  id                          uuid primary key references auth.users (id) on delete cascade,
  full_name                   text,
  agency_name                 text,
  subscription_tier           public.subscription_tier not null default 'FREE_TRIAL',
  contact_unlocks_remaining   integer not null default 30 check (contact_unlocks_remaining >= 0),
  branding_logo_url           text,
  primary_hex_color           text check (primary_hex_color is null or primary_hex_color ~* '^#[0-9A-Fa-f]{6}$'),
  created_at                  timestamptz not null default now(),
  updated_at                  timestamptz not null default now()
);

comment on table public.profiles is 'Platform accounts (agency reps / clients). 1:1 extension of auth.users.';

create trigger trg_profiles_updated_at
  before update on public.profiles
  for each row execute function public.set_updated_at();

-- ---------------------------------------------------------------------------------------
-- 3.2 creators — the verified creator directory
-- ---------------------------------------------------------------------------------------
create table public.creators (
  id                          uuid primary key default gen_random_uuid(),
  handle                      text not null unique,
  display_name                text not null,
  avatar_url                  text,
  primary_metro               public.metro_hub not null,
  primary_niche               public.primary_niche not null,
  secondary_languages         text[] not null default '{}',
  engagement_rate             numeric(4,2) check (engagement_rate >= 0 and engagement_rate <= 100),
  avg_reel_views              integer check (avg_reel_views >= 0),
  est_minimum_rate_usd        integer check (est_minimum_rate_usd >= 0),
  est_maximum_rate_usd        integer check (est_maximum_rate_usd >= 0),
  booking_status              public.booking_status not null default 'available_immediate',
  lead_time_days              integer check (lead_time_days >= 0),
  verified_response_hours     integer check (verified_response_hours >= 0),
  rep_type                    public.rep_type not null default 'UNVERIFIED_BIO',
  direct_booking_email        text,
  direct_booking_phone        text,
  deliverability_score        integer check (deliverability_score between 0 and 100),
  is_verified                 boolean not null default false,
  last_refreshed_at           timestamptz not null default now(),
  created_at                  timestamptz not null default now(),
  updated_at                  timestamptz not null default now(),
  constraint creators_rate_range_chk
    check (est_maximum_rate_usd is null or est_minimum_rate_usd is null or est_maximum_rate_usd >= est_minimum_rate_usd)
);

comment on table public.creators is 'Verified creator intelligence directory records.';

create trigger trg_creators_updated_at
  before update on public.creators
  for each row execute function public.set_updated_at();

-- ---------------------------------------------------------------------------------------
-- 3.3 creator_category_blackouts — brand-exclusivity windows per creator
-- ---------------------------------------------------------------------------------------
create table public.creator_category_blackouts (
  id                          uuid primary key default gen_random_uuid(),
  creator_id                  uuid not null references public.creators (id) on delete cascade,
  brand_name                  text not null,
  category_slug               text not null,
  blackout_start_date         date not null,
  blackout_end_date           date not null,
  created_at                  timestamptz not null default now(),
  constraint blackout_date_range_chk check (blackout_end_date >= blackout_start_date)
);

comment on table public.creator_category_blackouts is 'Category-exclusivity blackout windows a creator is contractually restricted under.';

-- ---------------------------------------------------------------------------------------
-- 3.4 event_enterprises — the event-organizer directory
-- ---------------------------------------------------------------------------------------
create table public.event_enterprises (
  id                          uuid primary key default gen_random_uuid(),
  business_name               text not null,
  instagram_handle            text not null unique,
  metro_hub                   public.metro_hub not null,
  enterprise_type             public.enterprise_type not null,
  public_email                text,
  phone_number                text,
  ticketing_url               text,
  frequent_venues             text[] not null default '{}',
  created_at                  timestamptz not null default now(),
  updated_at                  timestamptz not null default now()
);

comment on table public.event_enterprises is 'Verified event organizer / promoter directory records.';

create trigger trg_event_enterprises_updated_at
  before update on public.event_enterprises
  for each row execute function public.set_updated_at();

-- ---------------------------------------------------------------------------------------
-- 3.5 promoter_creator_bookings — historical / tracked bookings between the two
-- ---------------------------------------------------------------------------------------
create table public.promoter_creator_bookings (
  id                          uuid primary key default gen_random_uuid(),
  enterprise_id               uuid not null references public.event_enterprises (id) on delete cascade,
  creator_id                  uuid not null references public.creators (id) on delete cascade,
  created_by                  uuid references public.profiles (id) on delete set null,
  event_name                  text not null,
  event_date                  date not null,
  created_at                  timestamptz not null default now(),
  constraint promoter_creator_bookings_unique unique (enterprise_id, creator_id, event_date)
);

comment on table public.promoter_creator_bookings is 'Tracked/logged bookings pairing an event enterprise with a creator on a given date.';

-- ---------------------------------------------------------------------------------------
-- 3.6 committee_workspaces — a client's talent-selection committee for an event
-- ---------------------------------------------------------------------------------------
create table public.committee_workspaces (
  id                          uuid primary key default gen_random_uuid(),
  name                        text not null,
  slug                        text not null unique,
  owner_id                    uuid not null references public.profiles (id) on delete cascade,
  event_date                  date,
  created_at                  timestamptz not null default now(),
  updated_at                  timestamptz not null default now()
);

comment on table public.committee_workspaces is 'A talent-review workspace (e.g. a wedding or gala committee) scoped to one event.';

create trigger trg_committee_workspaces_updated_at
  before update on public.committee_workspaces
  for each row execute function public.set_updated_at();

-- ---------------------------------------------------------------------------------------
-- 3.7 committee_members — who sits on a workspace's committee
-- ---------------------------------------------------------------------------------------
create table public.committee_members (
  id                          uuid primary key default gen_random_uuid(),
  workspace_id                uuid not null references public.committee_workspaces (id) on delete cascade,
  profile_id                  uuid not null references public.profiles (id) on delete cascade,
  role                        public.committee_role not null default 'GUEST_OBSERVER',
  created_at                  timestamptz not null default now(),
  constraint committee_members_unique unique (workspace_id, profile_id)
);

comment on table public.committee_members is 'Membership + role of a profile within a committee workspace.';

-- ---------------------------------------------------------------------------------------
-- 3.8 committee_submissions — creators submitted for committee review
-- ---------------------------------------------------------------------------------------
create table public.committee_submissions (
  id                          uuid primary key default gen_random_uuid(),
  workspace_id                uuid not null references public.committee_workspaces (id) on delete cascade,
  creator_id                  uuid not null references public.creators (id) on delete cascade,
  audition_reel_url           text,
  stage_status                public.talent_stage_status not null default 'SUBMITTED',
  created_at                  timestamptz not null default now(),
  updated_at                  timestamptz not null default now(),
  constraint committee_submissions_unique unique (workspace_id, creator_id)
);

comment on table public.committee_submissions is 'A creator entered into a workspace''s review pipeline.';

create trigger trg_committee_submissions_updated_at
  before update on public.committee_submissions
  for each row execute function public.set_updated_at();

-- ---------------------------------------------------------------------------------------
-- 3.9 committee_votes — per-member scoring of a submission
-- ---------------------------------------------------------------------------------------
create table public.committee_votes (
  id                          uuid primary key default gen_random_uuid(),
  submission_id               uuid not null references public.committee_submissions (id) on delete cascade,
  member_id                   uuid not null references public.committee_members (id) on delete cascade,
  dialect_fit_score           smallint not null check (dialect_fit_score between 1 and 5),
  stage_presence_score        smallint not null check (stage_presence_score between 1 and 5),
  delivery_score              smallint not null check (delivery_score between 1 and 5),
  internal_notes              text,
  created_at                  timestamptz not null default now(),
  updated_at                  timestamptz not null default now(),
  constraint committee_votes_unique unique (submission_id, member_id)
);

comment on table public.committee_votes is 'Blind per-member scorecards against a committee submission.';

create trigger trg_committee_votes_updated_at
  before update on public.committee_votes
  for each row execute function public.set_updated_at();

-- ---------------------------------------------------------------------------------------
-- 3.10 api_keys — programmatic access tokens for a profile
-- ---------------------------------------------------------------------------------------
create table public.api_keys (
  id                          uuid primary key default gen_random_uuid(),
  profile_id                  uuid not null references public.profiles (id) on delete cascade,
  key_hash                    text not null unique,
  key_prefix                  text not null,
  is_active                   boolean not null default true,
  rate_limit_rpm              integer not null default 1000 check (rate_limit_rpm > 0),
  created_at                  timestamptz not null default now(),
  last_used_at                timestamptz
);

comment on table public.api_keys is 'Hashed API keys issued to a profile for programmatic (DaaS) access.';

-- =======================================================================================
-- 4. INDEXES
-- =======================================================================================

-- Required performance indexes
create index idx_creators_metro_status on public.creators (primary_metro, booking_status);
create index idx_creators_engagement_rate on public.creators (engagement_rate);
create index idx_blackouts_creator_end on public.creator_category_blackouts (creator_id, blackout_end_date);
create index idx_enterprises_metro on public.event_enterprises (metro_hub);

-- Supporting indexes for FKs / common lookups
create index idx_creators_niche on public.creators (primary_niche);
create index idx_blackouts_category_slug on public.creator_category_blackouts (category_slug);
create index idx_bookings_enterprise on public.promoter_creator_bookings (enterprise_id);
create index idx_bookings_creator on public.promoter_creator_bookings (creator_id);
create index idx_bookings_created_by on public.promoter_creator_bookings (created_by);
create index idx_committee_workspaces_owner on public.committee_workspaces (owner_id);
create index idx_committee_members_workspace on public.committee_members (workspace_id);
create index idx_committee_members_profile on public.committee_members (profile_id);
create index idx_committee_submissions_workspace on public.committee_submissions (workspace_id);
create index idx_committee_submissions_creator on public.committee_submissions (creator_id);
create index idx_committee_submissions_status on public.committee_submissions (stage_status);
create index idx_committee_votes_submission on public.committee_votes (submission_id);
create index idx_committee_votes_member on public.committee_votes (member_id);
create index idx_api_keys_profile on public.api_keys (profile_id);

-- =======================================================================================
-- 5. RLS HELPER FUNCTIONS (SECURITY DEFINER — break RLS recursion on committee tables)
-- =======================================================================================

create or replace function public.is_committee_member(p_workspace_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.committee_members cm
    where cm.workspace_id = p_workspace_id
      and cm.profile_id = auth.uid()
  );
$$;

create or replace function public.is_workspace_owner(p_workspace_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.committee_workspaces cw
    where cw.id = p_workspace_id
      and cw.owner_id = auth.uid()
  );
$$;

-- Owner OR a member holding the CHAIR role — the set of people who can manage a committee.
create or replace function public.is_workspace_manager(p_workspace_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select
    public.is_workspace_owner(p_workspace_id)
    or exists (
      select 1
      from public.committee_members cm
      where cm.workspace_id = p_workspace_id
        and cm.profile_id = auth.uid()
        and cm.role = 'CHAIR'
    );
$$;

-- Direct, RLS-bypassing lookups used by the committee_votes policies below. Each is a
-- single indexed/PK read — kept separate from is_committee_member/is_workspace_owner/
-- is_workspace_manager (which take a workspace_id) so a vote-row policy check never has
-- to correlate out to committee_submissions or committee_members through their own RLS
-- policies. This keeps vote-row evaluation to fixed-cost function calls even as
-- committee_votes grows large.

-- Is member_id one of the caller's own committee_members rows?
create or replace function public.is_own_committee_member(p_member_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.committee_members cm
    where cm.id = p_member_id
      and cm.profile_id = auth.uid()
  );
$$;

-- Which workspace does a given submission belong to?
create or replace function public.workspace_id_for_submission(p_submission_id uuid)
returns uuid
language sql
stable
security definer
set search_path = public
as $$
  select cs.workspace_id
  from public.committee_submissions cs
  where cs.id = p_submission_id;
$$;

-- The caller's own committee_members.id within a given workspace, if any.
create or replace function public.my_committee_member_id(p_workspace_id uuid)
returns uuid
language sql
stable
security definer
set search_path = public
as $$
  select cm.id
  from public.committee_members cm
  where cm.workspace_id = p_workspace_id
    and cm.profile_id = auth.uid();
$$;

-- =======================================================================================
-- 6. FEATURE FUNCTION — check_active_blackout
-- =======================================================================================

create or replace function public.check_active_blackout(
  target_creator_id uuid,
  target_category text
)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.creator_category_blackouts ccb
    where ccb.creator_id = target_creator_id
      and ccb.category_slug = target_category
      and current_date between ccb.blackout_start_date and ccb.blackout_end_date
  );
$$;

comment on function public.check_active_blackout(uuid, text) is
  'Returns true if the given creator has an active brand/category blackout covering today for target_category.';

-- Allow any authenticated (or anon, for public directory pages) caller to invoke the
-- read-only check — it is SECURITY DEFINER so it works regardless of row-level grants
-- on creator_category_blackouts.
grant execute on function public.check_active_blackout(uuid, text) to authenticated, anon;

-- =======================================================================================
-- 7. ROW LEVEL SECURITY
-- =======================================================================================

alter table public.profiles enable row level security;
alter table public.creators enable row level security;
alter table public.creator_category_blackouts enable row level security;
alter table public.event_enterprises enable row level security;
alter table public.promoter_creator_bookings enable row level security;
alter table public.committee_workspaces enable row level security;
alter table public.committee_members enable row level security;
alter table public.committee_submissions enable row level security;
alter table public.committee_votes enable row level security;
alter table public.api_keys enable row level security;

-- ---------------------------------------------------------------------------------------
-- 7.1 profiles — a user only ever sees/edits their own account row.
-- ---------------------------------------------------------------------------------------
create policy "profiles_select_own"
  on public.profiles for select
  to authenticated
  using (id = auth.uid());

create policy "profiles_insert_own"
  on public.profiles for insert
  to authenticated
  with check (id = auth.uid());

create policy "profiles_update_own"
  on public.profiles for update
  to authenticated
  using (id = auth.uid())
  with check (id = auth.uid());

-- No delete policy: account deletion cascades from auth.users and is handled
-- server-side (service_role bypasses RLS).

-- ---------------------------------------------------------------------------------------
-- 7.2 creators — directory data is readable by any signed-in subscriber.
-- Writes are performed only by the backend ingestion/service_role (no user-facing
-- insert/update/delete policy is granted), since accuracy/verification is
-- platform-controlled, not user-editable.
-- ---------------------------------------------------------------------------------------
create policy "creators_select_authenticated"
  on public.creators for select
  to authenticated
  using (true);

-- ---------------------------------------------------------------------------------------
-- 7.3 creator_category_blackouts — readable by subscribers (drives availability
-- checks in the UI); writes are backend/service_role only.
-- ---------------------------------------------------------------------------------------
create policy "blackouts_select_authenticated"
  on public.creator_category_blackouts for select
  to authenticated
  using (true);

-- ---------------------------------------------------------------------------------------
-- 7.4 event_enterprises — readable by subscribers; writes are backend/service_role only.
-- ---------------------------------------------------------------------------------------
create policy "enterprises_select_authenticated"
  on public.event_enterprises for select
  to authenticated
  using (true);

-- ---------------------------------------------------------------------------------------
-- 7.5 promoter_creator_bookings — a user manages only the booking records they logged.
-- ---------------------------------------------------------------------------------------
create policy "bookings_select_own"
  on public.promoter_creator_bookings for select
  to authenticated
  using (created_by = auth.uid());

create policy "bookings_insert_own"
  on public.promoter_creator_bookings for insert
  to authenticated
  with check (created_by = auth.uid());

create policy "bookings_update_own"
  on public.promoter_creator_bookings for update
  to authenticated
  using (created_by = auth.uid())
  with check (created_by = auth.uid());

create policy "bookings_delete_own"
  on public.promoter_creator_bookings for delete
  to authenticated
  using (created_by = auth.uid());

-- ---------------------------------------------------------------------------------------
-- 7.6 committee_workspaces — visible to its owner and its members; only the owner
-- can create/rename/delete the workspace itself.
-- ---------------------------------------------------------------------------------------
create policy "workspaces_select_owner_or_member"
  on public.committee_workspaces for select
  to authenticated
  using (owner_id = auth.uid() or public.is_committee_member(id));

create policy "workspaces_insert_owner"
  on public.committee_workspaces for insert
  to authenticated
  with check (owner_id = auth.uid());

create policy "workspaces_update_owner"
  on public.committee_workspaces for update
  to authenticated
  using (owner_id = auth.uid())
  with check (owner_id = auth.uid());

create policy "workspaces_delete_owner"
  on public.committee_workspaces for delete
  to authenticated
  using (owner_id = auth.uid());

-- ---------------------------------------------------------------------------------------
-- 7.7 committee_members — visible to fellow members/owner; managed by owner or a CHAIR.
-- ---------------------------------------------------------------------------------------
create policy "members_select_visible_to_committee"
  on public.committee_members for select
  to authenticated
  using (public.is_committee_member(workspace_id) or public.is_workspace_owner(workspace_id));

create policy "members_insert_manager"
  on public.committee_members for insert
  to authenticated
  with check (public.is_workspace_manager(workspace_id));

create policy "members_update_manager"
  on public.committee_members for update
  to authenticated
  using (public.is_workspace_manager(workspace_id))
  with check (public.is_workspace_manager(workspace_id));

create policy "members_delete_manager"
  on public.committee_members for delete
  to authenticated
  using (public.is_workspace_manager(workspace_id));

-- ---------------------------------------------------------------------------------------
-- 7.8 committee_submissions — visible to the whole committee; managed by owner/CHAIR.
-- ---------------------------------------------------------------------------------------
create policy "submissions_select_committee"
  on public.committee_submissions for select
  to authenticated
  using (public.is_committee_member(workspace_id) or public.is_workspace_owner(workspace_id));

create policy "submissions_insert_manager"
  on public.committee_submissions for insert
  to authenticated
  with check (public.is_workspace_manager(workspace_id));

create policy "submissions_update_manager"
  on public.committee_submissions for update
  to authenticated
  using (public.is_workspace_manager(workspace_id))
  with check (public.is_workspace_manager(workspace_id));

create policy "submissions_delete_manager"
  on public.committee_submissions for delete
  to authenticated
  using (public.is_workspace_manager(workspace_id));

-- ---------------------------------------------------------------------------------------
-- 7.9 committee_votes — blind judging: a member sees only their own scorecards;
-- the workspace owner/CHAIR can see every vote once cast. Any committee member
-- may cast/edit their own vote.
-- ---------------------------------------------------------------------------------------
-- Each policy below resolves through the SECURITY DEFINER lookups declared in
-- section 5 (is_own_committee_member / workspace_id_for_submission /
-- my_committee_member_id) rather than correlated subqueries against
-- committee_members / committee_submissions, so evaluating a vote row never
-- re-runs those tables' own RLS policies.

create policy "votes_select_own_or_manager"
  on public.committee_votes for select
  to authenticated
  using (
    public.is_own_committee_member(member_id)
    or public.is_workspace_manager(public.workspace_id_for_submission(submission_id))
  );

create policy "votes_insert_own"
  on public.committee_votes for insert
  to authenticated
  with check (
    member_id = public.my_committee_member_id(public.workspace_id_for_submission(submission_id))
  );

create policy "votes_update_own"
  on public.committee_votes for update
  to authenticated
  using (public.is_own_committee_member(member_id))
  with check (public.is_own_committee_member(member_id));

create policy "votes_delete_own_or_manager"
  on public.committee_votes for delete
  to authenticated
  using (
    public.is_own_committee_member(member_id)
    or public.is_workspace_manager(public.workspace_id_for_submission(submission_id))
  );

-- ---------------------------------------------------------------------------------------
-- 7.10 api_keys — strictly private to the owning profile.
-- ---------------------------------------------------------------------------------------
create policy "api_keys_select_own"
  on public.api_keys for select
  to authenticated
  using (profile_id = auth.uid());

create policy "api_keys_insert_own"
  on public.api_keys for insert
  to authenticated
  with check (profile_id = auth.uid());

create policy "api_keys_update_own"
  on public.api_keys for update
  to authenticated
  using (profile_id = auth.uid())
  with check (profile_id = auth.uid());

create policy "api_keys_delete_own"
  on public.api_keys for delete
  to authenticated
  using (profile_id = auth.uid());

-- =======================================================================================
-- END OF 001_init.sql
-- =======================================================================================
