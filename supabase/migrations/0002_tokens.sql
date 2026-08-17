-- ============================================================================
-- D&D 5e VTT — tokens on the shared canvas
--
-- Paste into Supabase SQL Editor → Run.
-- Idempotent: safe to re-run.
--
-- One `tokens` row = one movable piece on a game's tabletop.
-- Coordinates are in grid cells (real, so half-cells are fine).
-- `controller` sets up the AI-native VTT: 'dm' | 'player' | 'ai'.
-- Realtime is enabled so every member of the game sees moves live.
--
-- RLS v1 is intentionally loose: any member of the game can read, add,
-- move, and delete any token in that game. This matches the "co-op with
-- an AI DM" flavor; tighten later if adversarial play becomes a thing.
-- ============================================================================

create table if not exists public.tokens (
  id uuid primary key default gen_random_uuid(),
  game_id uuid not null references public.games(id) on delete cascade,
  label text not null,
  x real not null default 0,
  y real not null default 0,
  color text not null default '#c9a24a',
  image_url text,
  character_id uuid references public.characters(id) on delete set null,
  controller text not null default 'dm' check (controller in ('dm','player','ai')),
  created_by uuid not null references auth.users(id) on delete cascade,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists tokens_game_idx on public.tokens (game_id);

drop trigger if exists tokens_touch_updated_at on public.tokens;
create trigger tokens_touch_updated_at
  before update on public.tokens
  for each row execute procedure public.touch_updated_at();

-- ---------------------------------------------------------------------------
-- RLS
-- ---------------------------------------------------------------------------
alter table public.tokens enable row level security;

drop policy if exists tokens_member_read on public.tokens;
create policy tokens_member_read on public.tokens
  for select using (public.is_game_member(tokens.game_id, auth.uid()));

drop policy if exists tokens_member_insert on public.tokens;
create policy tokens_member_insert on public.tokens
  for insert with check (
    public.is_game_member(tokens.game_id, auth.uid())
    and auth.uid() = created_by
  );

drop policy if exists tokens_member_update on public.tokens;
create policy tokens_member_update on public.tokens
  for update using (public.is_game_member(tokens.game_id, auth.uid()));

drop policy if exists tokens_member_delete on public.tokens;
create policy tokens_member_delete on public.tokens
  for delete using (public.is_game_member(tokens.game_id, auth.uid()));

-- ---------------------------------------------------------------------------
-- Realtime — tokens drive the canvas, so we need live inserts/updates/deletes
-- ---------------------------------------------------------------------------
do $$ begin
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'tokens'
  ) then
    alter publication supabase_realtime add table public.tokens;
  end if;
end $$;

-- DELETE payloads only include the PK by default; we need `game_id` too so
-- the realtime subscriber can filter deletes without a round-trip lookup.
alter table public.tokens replica identity full;
