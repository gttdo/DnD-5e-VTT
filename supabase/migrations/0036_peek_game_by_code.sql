-- ============================================================================
-- 0036_peek_game_by_code.sql
--
-- Invite flow slice 2 — the branded pre-join lobby.
--
-- A player who opens an invite link (#/join/<code>) is not yet a member, so RLS
-- on `games`/`scenes` hides the row from them — they can't see what they're
-- joining. This SECURITY DEFINER function exposes just enough to render a lobby
-- for anyone who holds the code: the game name, the GM's display name, the
-- active scene's art + mode, and how many players are already in. No mutation,
-- no membership required — the same trust model as the invite code itself.
--
-- Idempotent: safe to re-run.
-- ============================================================================

drop function if exists public.peek_game_by_code(text);

create or replace function public.peek_game_by_code(_code text)
returns table (
  game_id uuid,
  name text,
  dm_name text,
  scene_image text,
  scene_cinematic text,
  scene_mode text,
  player_count int
)
language sql
security definer
set search_path = public
as $$
  select
    g.id,
    g.name,
    coalesce(p.display_name, 'Gamemaster'),
    s.image_url,
    s.cinematic_url,
    s.mode,
    (select count(*)::int from public.game_members gm where gm.game_id = g.id)
  from public.games g
  left join public.profiles p on p.user_id = g.dm_user_id
  left join public.scenes s on s.id = g.active_scene_id
  where g.join_code = upper(trim(_code))
  limit 1;
$$;

-- Anyone with the code can peek (pre-auth lobby preview); joining still requires
-- auth via join_game_by_code.
grant execute on function public.peek_game_by_code(text) to anon, authenticated;
