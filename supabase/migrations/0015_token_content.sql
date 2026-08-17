-- ============================================================================
-- D&D 5e VTT — token studio content (monsters, NPCs, items)
--
-- Paste into Supabase SQL Editor → Run. Idempotent: safe to re-run.
--
-- A token asset is no longer just art. It can be a monster (with a statblock),
-- an NPC (a roleplay profile), or a magic item (mechanical details). The shape
-- of `details` is discriminated by `token_type`; see src/types/content.ts.
-- Existing rows have token_type NULL (a plain art token) and keep working.
-- ============================================================================

alter table public.token_assets
  add column if not exists token_type text
  check (token_type in ('monster', 'npc', 'item'));

alter table public.token_assets
  add column if not exists details jsonb;
