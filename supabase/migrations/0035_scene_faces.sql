-- ============================================================================
-- 0035_scene_faces.sql
--
-- "The Living World" Phase 1 — a scene grows a second *face*.
--
-- Until now a scene had exactly one background (`image_url`), used as the
-- top-down battlemap. A scene now carries two composable faces:
--   * TACTICAL  — the existing `image_url` (top-down battlemap + grid + tokens)
--   * CINEMATIC — a new `cinematic_url` (an atmospheric backdrop of the same place)
-- and a `mode` flag for which face the DM is currently showing. Only the DM
-- flips it; every client follows over realtime (mode lives on the scene row,
-- which already replicates).
--
-- `mode` defaults to 'tactical', so every existing scene renders EXACTLY as
-- before — this migration is purely additive and safe to run on live data.
--
-- Navigation (hotspots) is a third face and lands in Phase 2; per-player active
-- scenes land in Phase 3. Neither is touched here.
--
-- Paste into the Supabase SQL Editor -> Run. Idempotent.
-- ============================================================================

alter table public.scenes
  add column if not exists cinematic_url text,
  add column if not exists mode text not null default 'tactical'
    check (mode in ('cinematic', 'tactical'));
