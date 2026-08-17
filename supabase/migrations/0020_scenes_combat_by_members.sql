-- Let players drive the combat state machine (End Turn, roll-initiative start)
-- without handing them the whole scene.
--
-- scenes UPDATE was DM-only, but End Turn writes scenes.turn_index and a
-- player-triggered combat start writes in_combat/round. Row policies can't
-- tell columns apart, so: open UPDATE to game members, then a BEFORE UPDATE
-- trigger rejects any NON-combat-field change by a non-DM. The DM keeps full
-- edit rights (map, name, fog, grid) exactly as before.

drop policy if exists scenes_dm_update on public.scenes;
drop policy if exists scenes_member_update on public.scenes;
create policy scenes_member_update on public.scenes
  for update using (public.is_game_member(scenes.game_id, auth.uid()));

create or replace function public.scenes_enforce_member_update()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  -- The DM may change anything.
  if exists (
    select 1 from public.games g
    where g.id = new.game_id and g.dm_user_id = auth.uid()
  ) then
    return new;
  end if;
  -- Everyone else: only the combat fields may differ.
  if new.name           is distinct from old.name
    or new.game_id      is distinct from old.game_id
    or new.map_id       is distinct from old.map_id
    or new.image_url    is distinct from old.image_url
    or new.grid_cols    is distinct from old.grid_cols
    or new.grid_rows    is distinct from old.grid_rows
    or new.fog_enabled  is distinct from old.fog_enabled
    or new.fog_revealed is distinct from old.fog_revealed
    or new.created_by   is distinct from old.created_by
  then
    raise exception 'Players may only update combat state on a scene.';
  end if;
  return new;
end;
$$;

drop trigger if exists scenes_enforce_member_update on public.scenes;
create trigger scenes_enforce_member_update
  before update on public.scenes
  for each row
  execute function public.scenes_enforce_member_update();
