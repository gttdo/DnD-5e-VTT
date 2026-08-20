-- ============================================================================
-- 0040_region_navigator.sql
--
-- The Region Map navigator (IA rework, 2026-08-20). The Region Map panel
-- becomes THE navigation surface: the GM adds regional maps (from the library)
-- and places hotspots on them; players open the panel and click hotspots to
-- travel. Region maps NEST — a hotspot can lead to a scene OR to a deeper
-- region map (Kingdom -> City -> tavern scene), giving the world a hierarchy.
--
-- Changes:
--   1. region_maps — game-scoped navigation maps (name + image). The panel's
--      root is simply the oldest map in the game.
--   2. hotspots grows two parents/targets:
--        * region_map_id — a pin can live on a region map instead of a scene
--          (scene_id becomes nullable; exactly one parent must be set)
--        * target_map_id — a pin can drill into a deeper region map instead
--          of traveling to a scene
--      RLS is rewritten to resolve membership through EITHER parent.
--
-- Paste into the Supabase SQL Editor -> Run. Idempotent.
-- ============================================================================

-- 1. region_maps -------------------------------------------------------------
create table if not exists public.region_maps (
  id uuid primary key default gen_random_uuid(),
  game_id uuid not null references public.games(id) on delete cascade,
  name text not null default 'Untitled Map',
  image_url text not null,
  created_by uuid not null references auth.users(id) on delete cascade,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists region_maps_game_idx on public.region_maps (game_id);

drop trigger if exists region_maps_touch_updated_at on public.region_maps;
create trigger region_maps_touch_updated_at
  before update on public.region_maps
  for each row execute procedure public.touch_updated_at();

alter table public.region_maps enable row level security;

drop policy if exists region_maps_member_read on public.region_maps;
create policy region_maps_member_read on public.region_maps
  for select using (public.is_game_member(region_maps.game_id, auth.uid()));

drop policy if exists region_maps_dm_all on public.region_maps;
create policy region_maps_dm_all on public.region_maps
  for all using (
    exists (select 1 from public.games g where g.id = region_maps.game_id and g.dm_user_id = auth.uid())
  )
  with check (
    exists (select 1 from public.games g where g.id = region_maps.game_id and g.dm_user_id = auth.uid())
  );

do $$ begin
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'region_maps'
  ) then
    alter publication supabase_realtime add table public.region_maps;
  end if;
end $$;

alter table public.region_maps replica identity full;

-- 2. hotspots: second parent + second target ---------------------------------
alter table public.hotspots alter column scene_id drop not null;

alter table public.hotspots
  add column if not exists region_map_id uuid references public.region_maps(id) on delete cascade,
  add column if not exists target_map_id uuid references public.region_maps(id) on delete set null;

create index if not exists hotspots_region_map_idx on public.hotspots (region_map_id);

-- Exactly one parent (scene XOR region map). Guarded add for idempotency.
do $$ begin
  alter table public.hotspots
    add constraint hotspots_one_parent
    check ((scene_id is null) <> (region_map_id is null));
exception when duplicate_object then null;
end $$;

-- RLS rewrite: membership resolves through whichever parent the pin has.
drop policy if exists hotspots_member_read on public.hotspots;
create policy hotspots_member_read on public.hotspots
  for select using (
    exists (
      select 1 from public.scenes s
      where s.id = hotspots.scene_id
        and public.is_game_member(s.game_id, auth.uid())
    )
    or exists (
      select 1 from public.region_maps rm
      where rm.id = hotspots.region_map_id
        and public.is_game_member(rm.game_id, auth.uid())
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
    or exists (
      select 1 from public.region_maps rm
      join public.games g on g.id = rm.game_id
      where rm.id = hotspots.region_map_id and g.dm_user_id = auth.uid()
    )
  )
  with check (
    exists (
      select 1 from public.scenes s
      join public.games g on g.id = s.game_id
      where s.id = hotspots.scene_id and g.dm_user_id = auth.uid()
    )
    or exists (
      select 1 from public.region_maps rm
      join public.games g on g.id = rm.game_id
      where rm.id = hotspots.region_map_id and g.dm_user_id = auth.uid()
    )
  );
