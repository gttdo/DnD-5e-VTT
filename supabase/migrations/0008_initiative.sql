-- Initiative tracker
--
-- Deliberately does NOT introduce a separate "combatant" entity. A combatant is
-- a token that's already on the scene — it has a name, portrait, size and
-- controller. Adding a parallel table would mean keeping two things in sync and
-- deciding what happens when one is deleted. So:
--
--   tokens.initiative  — the rolled score; null means "not in the order"
--   scenes.in_combat   — is a fight running on this scene
--   scenes.round       — 1-based round counter
--   scenes.turn_index  — position in the initiative order
--
-- Both tables already broadcast via postgres_changes and are already covered by
-- RLS, so the tracker syncs to every player at the table with no new plumbing.

alter table public.tokens
  add column if not exists initiative int;

alter table public.scenes
  add column if not exists in_combat boolean not null default false,
  add column if not exists round int not null default 1,
  add column if not exists turn_index int not null default 0;

-- Ordering the initiative list is the tracker's hot path.
create index if not exists tokens_scene_initiative_idx
  on public.tokens (scene_id, initiative desc nulls last);

comment on column public.tokens.initiative is
  'Rolled initiative for this token. NULL = not participating in the current combat.';
comment on column public.scenes.turn_index is
  'Index into the scene''s initiative order (tokens with initiative not null, sorted desc).';
