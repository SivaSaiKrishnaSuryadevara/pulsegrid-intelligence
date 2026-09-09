-- =====================================================================================
-- PulseGrid Intelligence — Additive Migration
-- 007_add_growth_leads_production_needs.sql
--
-- Adds a `production_needs` column to `growth_leads` so the Agency Pass
-- modal's lead-capture form can record what a prospect is actually
-- interested in: stage-talent booking (the only thing PulseGrid delivers
-- today), the proposed "Regional Media & Creator Ad Desks" campaign
-- product (not built — landing-page/lead-capture only, gauging demand
-- before committing engineering time to it), or both. Nullable — existing
-- rows and any future submission that omits it stay valid.
-- =====================================================================================

alter table public.growth_leads
  add column production_needs text
  check (production_needs is null or production_needs in ('stage_talent', 'creator_media_flight', 'full_bundle'));

comment on column public.growth_leads.production_needs is
  'What the lead selected in the Agency Pass modal: stage_talent (DJs/emcees/troupes/planners — the only real, shipped product), creator_media_flight (proposed regional ad-campaign product — demand signal only, not built), or full_bundle.';
