-- =====================================================================================
-- PulseGrid Intelligence — Additive Migration
-- 011_add_clt_metro_and_locality.sql
--
-- Two independent additive changes bundled together (neither depends on the
-- other, but they ship in the same platform-update pass):
--
--  1. Adds 'CLT_CAROLINAS' to the metro_hub enum — Charlotte/Triangle
--     becomes PulseGrid's 5th primary regional hub alongside DFW, DMV,
--     ATX, and HOU. Postgres requires ALTER TYPE ... ADD VALUE to run
--     before any statement in the same session that USES the new value —
--     this migration only adds the value, it never references
--     'CLT_CAROLINAS' itself, so it's safe to run as one script. (If your
--     SQL runner errors on that restriction anyway, just run statement 1
--     alone first, then the rest.)
--
--  2. Adds production_entities.locality — the specific suburb/city a
--     creator's bio names (e.g. "Ashburn, VA", "Prosper, TX", "Cary, NC"),
--     set by the new suburb-to-metro normalizer in
--     src/lib/ingest/apify-instagram-parser.ts. Distinct from
--     primary_metro (the parent hub used for filtering): a creator whose
--     bio says "Ashburn" gets primary_metro = DMV_NOVA (so metro
--     filtering still groups correctly) and locality = 'Ashburn, VA' (so
--     the talent card can show the specific suburb instead of the generic
--     hub badge). Nullable — most existing rows have no locality signal
--     yet and fall back to the metro's short label on the card until
--     their next ingest/refresh cycle.
-- =====================================================================================

alter type public.metro_hub add value if not exists 'CLT_CAROLINAS';

alter table public.production_entities
  add column locality text;

comment on column public.production_entities.locality is
  'Specific suburb/city display name (e.g. "Ashburn, VA") detected from the bio via the suburb-to-metro normalizer — distinct from primary_metro, which is the parent hub used for filtering.';
