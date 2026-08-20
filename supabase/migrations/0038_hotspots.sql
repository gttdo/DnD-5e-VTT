-- ============================================================================
-- 0038_hotspots.sql
--
-- The navigable world-tree (Phase 2). A hotspot is a pin placed on a scene's
-- backdrop that links to another scene — click it to travel there. This is how
-- a regional/overworld map becomes interactive: drop pins on its towns and
-- landmarks, link each to the scene for that place.
--
-- Hotspots overlay a scene (the chosen model) — no new scene "mode". A scene
-- with a regional-map backdrop + hotspots simply IS a navigation map.
--
-- Coordinates are normalized 0..1 of the backdrop, so a pin stays put at any
-- board size or zoom. `hidden` gates a pin (DM reveals it later — Phase 2
-- slice 4 / exploration); default visible.
--
-- Paste into the Supabase SQL Editor -> Run. Idempotent.
-- ============================================================================

create table if not exists public.hotspots (
  id uuid primary key default gen_random_uuid(),
  -- The scene this pin is drawn on.
  scene_id uuid not null references public.scenes(id) on delete cascade,
  -- Where it leads. Null = a stub/unlinked pin (placed but not wired yet).
  target_scene_id uuid references public.scenes(id) on delete set null,
  x real not null,
  y real not null,
  label text,
  hidden boolean not null default false,
  created_by uuid not null references auth.users(id) on delete cascade,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists hotspots_scene_idx on public.hotspots (scene_id);

drop trigger if exists hotspots_touch_updated_at on public.hotspots;
create trigger hotspots_touch_updated_at
  before update on public.hotspots
  for each row execute procedure public.touch_updated_at();

-- RLS: any game member can read a scene's hotspots; only the game's DM writes.
-- Membership/ownership is resolved through the scene's parent game.
alter table public.hotspots enable row level security;

drop policy if exists hotspots_member_read on public.hotspots;
create policy hotspots_member_read on public.hotspots
  for select using (
    exists (
      select 1 from public.scenes s
      where s.id = hotspots.scene_id
        and public.is_game_member(s.game_id, auth.uid())
    )
  );

drop policy if exists hotspots_dm_write on public.hotspots;
create policy hotspots_dm_write on public.hotspots
  for all using (
    exists (
      select 1 from public.scenes s
      join public.games g on g.id = s.game_id
      where s.id = hotspots.scene_id and g.dm_user_id = auth.uid()
    )
  )
  with check (
    exists (
      select 1 from public.scenes s
      join public.games g on g.id = s.game_id
      where s.id = hotspots.scene_id and g.dm_user_id = auth.uid()
    )
  );

-- Realtime — pins appear/move/vanish for everyone as the DM edits.
do $$ begin
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'hotspots'
  ) then
    alter publication supabase_realtime add table public.hotspots;
  end if;
end $$;

alter table public.hotspots replica identity full;
