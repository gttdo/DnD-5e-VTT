-- Movement permissions, enforced at the DB.
--
-- The tokens UPDATE policy is member-wide on purpose: any player needs to write
-- a monster/prop token's hp, conditions, or loot (rolling a save, looting a
-- body). But only some people may MOVE a token. A column-agnostic row policy
-- can't tell "moved" from "looted", so we guard position specifically with a
-- BEFORE UPDATE trigger: if x/y actually change, the mover must be
--   • the game's DM, or
--   • the owner of the token's character (their own PC), or
--   • moving a prop/scenery token (no statblock and no character binding).
-- Every other column update flows through untouched.
--
-- SECURITY DEFINER so the checks can read games/characters regardless of the
-- caller's RLS. Speed/distance is NOT enforced here — that's a combat-only
-- display concern; tokens move any distance freely.

create or replace function public.tokens_enforce_move()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.x is distinct from old.x or new.y is distinct from old.y then
    -- DM of this game may move anything.
    if exists (
      select 1 from public.games g
      where g.id = new.game_id and g.dm_user_id = auth.uid()
    ) then
      return new;
    end if;
    -- A player may move their own character's token.
    if new.character_id is not null and exists (
      select 1 from public.characters c
      where c.id = new.character_id and c.owner_id = auth.uid()
    ) then
      return new;
    end if;
    -- Anyone at the table may nudge a prop/scenery token (no creature, no owner).
    if new.character_id is null and new.statblock is null then
      return new;
    end if;
    raise exception 'You do not have permission to move this token.';
  end if;
  return new;
end;
$$;

drop trigger if exists tokens_enforce_move on public.tokens;
create trigger tokens_enforce_move
  before update on public.tokens
  for each row
  execute function public.tokens_enforce_move();
