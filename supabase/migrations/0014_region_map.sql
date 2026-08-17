-- ============================================================================
-- D&D 5e VTT — region map (a world map the DM shares, per game)
--
-- Paste into Supabase SQL Editor → Run. Idempotent: safe to re-run.
--
-- Distinct from the battle map (the scene): this is the wider region the party
-- moves through, for context. One nullable image URL on the game; the DM sets
-- it, players view it read-only. Updates ride the existing games UPDATE policy
-- (the DM already updates active_scene_id the same way).
-- ============================================================================

alter table public.games add column if not exists region_map_url text;
