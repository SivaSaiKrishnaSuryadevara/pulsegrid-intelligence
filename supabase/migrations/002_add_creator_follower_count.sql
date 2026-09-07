-- =====================================================================================
-- PulseGrid Intelligence — Additive Migration
-- 002_add_creator_follower_count.sql
--
-- Adds `follower_count` to `creators`. Needed by the /verified/[handle]
-- media-kit page (Step 3 — Programmatic SEO Routes) for its Performance
-- Metrics bar, which surfaces Followers as a stat distinct from
-- avg_reel_views / engagement_rate. Purely additive: a nullable column plus
-- a supporting index, no existing column, constraint, policy, or row is
-- touched.
-- =====================================================================================

alter table public.creators
  add column if not exists follower_count integer;

alter table public.creators
  add constraint creators_follower_count_chk check (follower_count is null or follower_count >= 0);

create index if not exists idx_creators_follower_count on public.creators (follower_count);

comment on column public.creators.follower_count is 'Instagram follower count as of last_refreshed_at.';
