-- ============================================================================
-- 0007_token_library.sql
--
-- Token library — like `maps` but for creature portraits used on the canvas.
-- Also teaches the `tokens` table about D&D 5e size categories so a Large
-- creature actually occupies 2x2 cells on the grid.
--
-- Idempotent: safe to re-run.
-- ============================================================================

create table if not exists public.token_assets (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users(id) on delete cascade,
  name text not null default 'Untitled Token',
  image_url text not null,
  prompt text,
  family text,             -- 'portrait' | 'topdown'
  size_category text not null default 'medium'
    check (size_category in ('tiny','small','medium','large','huge','gargantuan')),
  creature_type text,       -- 'humanoid' | 'beast' | 'monster' | ...
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists token_assets_owner_idx on public.token_assets (owner_id);

drop trigger if exists token_assets_touch_updated_at on public.token_assets;
create trigger token_assets_touch_updated_at
  before update on public.token_assets
  for each row execute procedure public.touch_updated_at();

alter table public.token_assets enable row level security;

drop policy if exists token_assets_owner_all on public.token_assets;
create policy token_assets_owner_all on public.token_assets
  for all using (auth.uid() = owner_id)
  with check (auth.uid() = owner_id);

do $$ begin
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'token_assets'
  ) then
    alter publication supabase_realtime add table public.token_assets;
  end if;
end $$;

alter table public.token_assets replica identity full;

-- Extend the in-scene `tokens` table with size + source-library link.
-- image_url already exists (added in 0002_tokens.sql) — no change needed there.
alter table public.tokens
  add column if not exists size text not null default 'medium'
    check (size in ('tiny','small','medium','large','huge','gargantuan'));

alter table public.tokens
  add column if not exists token_id uuid
    references public.token_assets(id) on delete set null;
