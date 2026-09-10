-- =====================================================================================
-- PulseGrid Intelligence — Additive Migration
-- 010_add_bio.sql
--
-- The raw scraped bio was parsed at ingestion (email/phone/link-hub
-- extraction, entity-type inference) but never persisted — `production_entities`
-- had no column for it. Discover's quick search only matched display_name
-- and handle as a result. Stores the bio text so search can substring-match
-- against it too (see matchesFilters in src/lib/discover/filters.ts).
-- Nullable: existing rows backfill on their next ingest/refresh cycle.
-- =====================================================================================

alter table public.production_entities
  add column bio text;

comment on column public.production_entities.bio is
  'Raw scraped Instagram bio text — used for Discover''s quick-search substring match; not otherwise rendered.';
