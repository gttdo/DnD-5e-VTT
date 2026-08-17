-- ============================================================================
-- 0003_join_game_rpc.sql
--
-- Move joining a game behind a SECURITY DEFINER function so the caller
-- doesn't need INSERT/UPDATE RLS access on game_members directly.
-- Fixes: "new row violates row-level security policy" during joinByCode
-- (upsert to game_members from the client can trip on stale JWTs and on
-- the row-already-exists case where the caller is already the DM).
--
-- Idempotent: safe to re-run.
-- ============================================================================

-- Drop first: PostgreSQL won't let CREATE OR REPLACE change the RETURNS shape.
drop function if exists public.join_game_by_code(text, uuid);

create or replace function public.join_game_by_code(
  _code text,
  _character_id uuid default null
)
-- Return columns MUST NOT collide with target-table column names, or
-- references inside ON CONFLICT become ambiguous (see: game_id).
returns table(id uuid, name text)
language plpgsql
security definer
set search_path = public
as $$
declare
  _game_id uuid;
  _game_name text;
  _uid uuid := auth.uid();
begin
  if _uid is null then
    raise exception 'not authenticated';
  end if;

  select g.id, g.name into _game_id, _game_name
  from public.games g
  where g.join_code = upper(trim(_code))
  limit 1;

  if _game_id is null then
    raise exception 'no game found with that code';
  end if;

  insert into public.game_members (game_id, user_id, character_id, role)
  values (_game_id, _uid, _character_id, 'player')
  on conflict (game_id, user_id) do update
    set character_id = excluded.character_id;

  return query select _game_id, _game_name;
end;
$$;

grant execute on function public.join_game_by_code(text, uuid) to authenticated;
