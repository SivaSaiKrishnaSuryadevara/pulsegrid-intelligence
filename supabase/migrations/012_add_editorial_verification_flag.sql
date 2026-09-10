-- =====================================================================================
-- PulseGrid Intelligence — Additive Migration
-- 012_add_editorial_verification_flag.sql
--
-- Protects manually-confirmed-legitimate creators from a future automated
-- cultural-relevance audit/purge. hasCulturalSignal() (apify-instagram-
-- parser.ts) is a keyword gate — good at rejecting genuinely unvetted,
-- off-niche auto-discovery, but a real public figure's bio frequently
-- doesn't spell out their ethnicity or use any of that keyword list (ALOK's
-- bio is just "comedian. poet."). Confirmed in production: an audit of the
-- legacy catalog against hasCulturalSignal() flagged several real,
-- known South Asian creators as "failing" purely because their bio text
-- happens not to contain a matching word — a human already verified these
-- are legitimate, so no future automated pass should ever re-litigate that.
--
-- Any future tooling that audits production_entities against
-- hasCulturalSignal() (or any similar deterministic keyword check) MUST
-- skip rows where this is true, rather than flag/purge them.
-- =====================================================================================

alter table public.production_entities
  add column is_editorially_verified boolean not null default false;

comment on column public.production_entities.is_editorially_verified is
  'True for creators a human has manually confirmed as legitimate/relevant regardless of what a deterministic keyword gate (e.g. hasCulturalSignal) would say — any automated audit/purge tooling must skip these rows rather than re-litigate them.';

create index idx_production_entities_editorially_verified
  on public.production_entities (is_editorially_verified)
  where is_editorially_verified = true;

-- Flags the specific creators confirmed legitimate during the 2026-09-10
-- legacy-catalog audit whose bios still don't match hasCulturalSignal()
-- even after expanding its lexicon (camelCase splitting, plurals,
-- culinary + regional-origin keywords) in the same platform-update pass:
--   alokvmenon, zarnagarg, deepica — explicitly named by the requester.
--   radhidevlukia, nabela — public figures identified and added to the
--     catalog earlier in the same work session.
--   thecurrymommy — display name "Jhankhana Patel" is an unambiguous
--     Gujarati Indian name; a food creator whose bio just doesn't happen
--     to use any of the added culinary keywords.
-- Everything else the audit flagged (the large majority of the legacy
-- catalog) is left untouched — genuinely ambiguous, not confirmed either
-- way, per explicit instruction not to guess on those.
update public.production_entities
  set is_editorially_verified = true
  where handle in ('alokvmenon', 'zarnagarg', 'deepica', 'radhidevlukia', 'nabela', 'thecurrymommy');
