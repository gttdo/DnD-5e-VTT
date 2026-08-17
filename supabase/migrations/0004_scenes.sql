-- ============================================================================
-- 0004_scenes.sql
--
-- Introduces the `scenes` model — one game can now have multiple maps.
-- A game has one *active* scene at a time; the DM switches it and all players
-- follow. Tokens now belong to a scene, not the game as a whole.
--
-- Idempotent: safe to re-run on partially-migrated state.
--
-- Migration order matters here:
--   1. Create `scenes` table + trigger
--   2. Backfill a default scene for every existing game
--   3. Add `games.active_scene_id`, point it at each game's default scene
--   4. Add `tokens.scene_id`, backfill from game_id, then NOT NULL it
--   5. RLS + realtime for scenes
-- ============================================================================

-- 1. scenes table -----------------------------------------------------------
create table if not exists public.scenes (
  id uuid primary key default gen_random_uuid(),
  game_id uuid not null references public.games(id) on delete cascade,
  name text not null default 'Untitled Scene',
  image_url text,
  grid_cols int not null default 30 check (grid_cols between 1 and 200),
  grid_rows int not null default 20 check (grid_rows between 1 and 200),
  created_by uuid not null references auth.users(id) on delete cascade,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists scenes_game_idx on public.scenes (game_id);

drop trigger if exists scenes_touch_updated_at on public.scenes;
create trigger scenes_touch_updated_at
  before update on public.scenes
  for each row execute procedure public.touch_updated_at();

-- 2. Backfill a default scene per game --------------------------------------
insert into public.scenes (game_id, name, created_by)
select g.id, 'Default Scene', g.dm_user_id
from public.games g
where not exists (select 1 from public.scenes s where s.game_id = g.id);

-- 3. games.active_scene_id + backfill ---------------------------------------
alter table public.games
  add column if not exists active_scene_id uuid
    references public.scenes(id) on delete set null;

update public.games g
set active_scene_id = (
  select s.id from public.scenes s where s.game_id = g.id order by s.created_at asc limit 1
)
where active_scene_id is null;

-- 4. tokens.scene_id + backfill + NOT NULL ---------------------------------
alter table public.tokens
  add column if not exists scene_id uuid
    references public.scenes(id) on delete cascade;

update public.tokens t
set scene_id = (
  select s.id from public.scenes s where s.game_id = t.game_id order by s.created_at asc limit 1
)
where scene_id is null;

-- Only enforce NOT NULL once every row has a value (guarded by an EXISTS check
-- so the migration is re-runnable even if it partially completed).
do $$ begin
  if not exists (select 1 from public.tokens where scene_id is null) then
    begin
      alter table public.tokens alter column scene_id set not null;
    exception when others then
      -- Already NOT NULL — nothing to do.
      null;
    end;
  end if;
end $$;

create index if not exists tokens_scene_idx on public.tokens (scene_id);

-- 5. RLS on scenes ---------------------------------------------------------
alter table public.scenes enable row level security;

drop policy if exists scenes_member_read on public.scenes;
create policy scenes_member_read on public.scenes
  for select using (public.is_game_member(scenes.game_id, auth.uid()));

-- Only the DM of the game can create/rename/delete scenes. Loose enough for
-- solo/AI-DM play (the DM does everything); tightens away from griefing.
drop policy if exists scenes_dm_insert on public.scenes;
create policy scenes_dm_insert on public.scenes
  for insert with check (
    auth.uid() = created_by
    and exists (
      select 1 from public.games g
      where g.id = scenes.game_id and g.dm_user_id = auth.uid()
    )
  );

drop policy if exists scenes_dm_update on public.scenes;
create policy scenes_dm_update on public.scenes
  for update using (
    exists (
      select 1 from public.games g
      where g.id = scenes.game_id and g.dm_user_id = auth.uid()
    )
  );

drop policy if exists scenes_dm_delete on public.scenes;
create policy scenes_dm_delete on public.scenes
  for delete using (
    exists (
      select 1 from public.games g
      where g.id = scenes.game_id and g.dm_user_id = auth.uid()
    )
  );

-- Realtime -----------------------------------------------------------------
do $$ begin
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'scenes'
  ) then
    alter publication supabase_realtime add table public.scenes;
  end if;
end $$;

alter table public.scenes replica identity full;
