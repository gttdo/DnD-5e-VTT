-- ============================================================================
-- D&D 5e VTT — 0042: handouts as a document kind (docs/campaign-editor.md §7)
--
-- Paste into Supabase SQL Editor → Run. Idempotent: safe to re-run.
--
-- A handout is a player-facing document whose content is STRUCTURED FIELDS
-- (title, lines, signature…) rendered through a template (letter, notice,
-- menu, price sheet, services) — never raw image generation, which garbles
-- text. The fields live in `meta`; rendering happens client-side, so a
-- handout stays editable and crisp forever.
-- ============================================================================

-- 1. Allow the new kind.
alter table public.campaign_documents
  drop constraint if exists campaign_documents_kind_check;
alter table public.campaign_documents
  add constraint campaign_documents_kind_check
  check (kind in ('note', 'read_aloud', 'quest', 'recap', 'handout'));

-- 2. Structured payloads. Handouts store {template, fields}; other kinds may
--    use this later (e.g. structured quests).
alter table public.campaign_documents
  add column if not exists meta jsonb not null default '{}'::jsonb;
