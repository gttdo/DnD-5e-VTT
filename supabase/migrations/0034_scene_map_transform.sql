-- ============================================================================
-- 0034_scene_map_transform.sql
--
-- Map grid alignment (#115). An uploaded / AI-generated map has its own baked-in
-- grid that rarely matches the app's overlay grid, so movement ranges and
-- measurement are off the moment a real map is used. Rather than move the
-- canonical grid (which every token/movement calc depends on), we let the DM
-- position + scale the MAP IMAGE under the fixed grid until the baked cells line
-- up. These three columns store that transform, in SVG board units (offset) and
-- a uniform multiplier (scale). Defaults reproduce the old behavior (map fills
-- the board 1:1).
--
-- Paste into the Supabase SQL Editor -> Run. Idempotent.
-- ============================================================================

alter table public.scenes
  add column if not exists map_offset_x real not null default 0,
  add column if not exists map_offset_y real not null default 0,
  add column if not exists map_scale real not null default 1;
