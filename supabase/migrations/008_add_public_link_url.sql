-- =====================================================================================
-- PulseGrid Intelligence — Additive Migration
-- 008_add_public_link_url.sql
--
-- Backs the Talent Desk tab's "Official Booking / Press Link" callout: a
-- creator's own link-in-bio URL (Instagram's `external_url` field, or a
-- Linktree/Beacons/press-page pattern the ingest worker's `detectLinkHub`
-- already recognizes inside the bio text) is public information — visible
-- on the creator's actual Instagram profile to anyone — so it's surfaced
-- unconditionally, not gated behind a contact-unlock credit like
-- direct_booking_email/direct_booking_phone are.
-- =====================================================================================

alter table public.production_entities
  add column public_link_url text;

comment on column public.production_entities.public_link_url is
  'Creator''s public link-in-bio URL (Instagram external_url, or a recognized link-hub pattern found in the bio text) — public info, shown regardless of contact-unlock state.';
