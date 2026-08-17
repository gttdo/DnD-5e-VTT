-- ============================================================================
-- 0006_maps.sql
--
-- Introduces the `maps` model — the DM's reusable map library, decoupled
-- from any single game/scene.
--
-- Maps are owned by a DM. Scenes reference a map via nullable `map_id` (bonus
-- provenance), but keep their own `image_url` copy so player reads don't need
-- an extra join and RLS stays simple (players can already read scene rows for
-- games they're in; they don't need to see the DM's map library).
--
-- Idempotent: safe to re-run.
-- ============================================================================

create table if not exists public.maps (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users(id) on delete cascade,
  name text not null default 'Untitled Map',
  image_url text not null,
  -- The prompt + style used to generate the image, kept for provenance and
  -- future "regenerate variant" flows. All nullable so hand-uploaded maps fit.
  prompt text,
  family text,
  style text,
  size text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists maps_owner_idx on public.maps (owner_id);

drop trigger if exists maps_touch_updated_at on public.maps;
create trigger maps_touch_updated_at
  before update on public.maps
  for each row execute procedure public.touch_updated_at();

-- Scenes may point at the map they were created from — nullable because
-- blank scenes and pre-library scenes have no source map.
alter table public.scenes
  add column if not exists map_id uuid
    references public.maps(id) on delete set null;

-- RLS
alter table public.maps enable row level security;

drop policy if exists maps_owner_all on public.maps;
create policy maps_owner_all on public.maps
  for all using (auth.uid() = owner_id)
  with check (auth.uid() = owner_id);

-- Realtime (so the library reacts to inserts from the edge-function flow
-- and to changes from other devices).
do $$ begin
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'maps'
  ) then
    alter publication supabase_realtime add table public.maps;
  end if;
end $$;

alter table public.maps replica identity full;
