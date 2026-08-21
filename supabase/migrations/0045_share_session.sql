-- ============================================================================
-- D&D 5e VTT — 0045: which session a doc was shared in (Journal scale, Phase 1)
--
-- Paste into Supabase SQL Editor → Run. Idempotent: safe to re-run.
--
-- Captures the live session at share-time so the Journal can group artifacts
-- by session later (Phase 2) without backfilling. Nullable — a share made
-- off the record (no live session) simply has none.
-- ============================================================================

alter table public.document_shares
  add column if not exists session_id uuid references public.sessions(id) on delete set null;
