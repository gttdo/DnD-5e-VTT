-- ============================================================================
-- 0037_map_type.sql
--
-- Generative foundry (Phase 2) — asset typing on the map/image library.
--
-- Until now every row in `maps` was a top-down battle map. The foundry now
-- produces three distinct kinds of place-image, and the pickers need to tell
-- them apart:
--   * battlemap — top-down, to-scale, for the tactical face + a grid
--   * regional  — illustrative overview map, no grid, for navigation/hotspots
--   * cinematic — an eye-level backdrop for a scene's cinematic face
--
-- `map_type` defaults to 'battlemap', so every existing row is correctly
-- classified with no backfill needed. Purely additive.
--
-- Paste into the Supabase SQL Editor -> Run. Idempotent.
-- ============================================================================

alter table public.maps
  add column if not exists map_type text not null default 'battlemap'
    check (map_type in ('battlemap', 'regional', 'cinematic'));

create index if not exists maps_type_idx on public.maps (owner_id, map_type);
