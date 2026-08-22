-- ============================================================================
-- D&D 5e VTT — 0047: per-scene combat ambience (the state swap)
--
-- Paste into Supabase SQL Editor → Run. Idempotent: safe to re-run.
--
-- A scene has a base ambience (0046) and, optionally, a COMBAT ambience that
-- takes over while the scene is in_combat, cross-fading back to base when the
-- fight ends. Null = use the global default battle cue. This is what makes the
-- tavern sound different the moment a brawl breaks out.
-- ============================================================================

alter table public.scenes add column if not exists combat_ambience_url text;
