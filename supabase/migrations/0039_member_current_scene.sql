-- ============================================================================
-- 0039_member_current_scene.sql
--
-- Per-player navigation (Phase 3). Until now a whole game shared one active
-- scene (games.active_scene_id). Now each member can be somewhere different:
--
--   a player's active scene = game_members.current_scene_id ?? games.active_scene_id
--
-- games.active_scene_id stays as the DM's "stage" / default (and what the
-- projector casts). A roaming player overrides it with their own
-- current_scene_id; "gather" clears everyone's override back to the stage. A
-- member with no override behaves exactly as before — purely additive.
--
-- game_members already has a self-update policy (a player sets their OWN scene)
-- and is already in the realtime publication. This adds the column, a DM-update
-- policy (so the DM can move/gather any member), and replica identity full so
-- UPDATE payloads carry the row.
--
-- Paste into the Supabase SQL Editor -> Run. Idempotent.
-- ============================================================================

alter table public.game_members
  add column if not exists current_scene_id uuid
    references public.scenes(id) on delete set null;

-- The DM can move or gather any member in their game.
drop policy if exists game_members_dm_update on public.game_members;
create policy game_members_dm_update on public.game_members
  for update using (
    exists (
      select 1 from public.games g
      where g.id = game_members.game_id and g.dm_user_id = auth.uid()
    )
  );

alter table public.game_members replica identity full;
