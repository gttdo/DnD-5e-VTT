-- Fog of war, grid-based.
--
-- Fog state lives on the scene row, which players already receive over
-- realtime — no new channel, no new table.
--
--   fog_enabled  — is the fog layer on for this scene
--   fog_revealed — jsonb array of revealed CELL INDICES (y * grid_cols + x).
--                  Integers rather than "x,y" strings: half the payload, and
--                  the client keeps them in a Set for O(1) paint/lookup.
--
-- Whole-array last-write-wins on update. The DM is the only writer, and a
-- reveal brush emits debounced full snapshots, so conflicts can only arise
-- from two DM devices painting simultaneously — acceptable.

alter table public.scenes
  add column if not exists fog_enabled boolean not null default false,
  add column if not exists fog_revealed jsonb not null default '[]'::jsonb;
