-- ============================================================================
-- D&D 5e VTT — initial schema
--
-- Paste this into Supabase SQL Editor → Run.
-- Idempotent: safe to re-run.
--
-- Tables:
--   profiles       — display name per user, 1:1 with auth.users
--   characters     — owned by a user; full sheet stored as jsonb `data`
--   games          — a table session, has a DM and a 6-char join code
--   game_members   — join row (game × user) + which character they brought
--
-- Helper: is_game_member() avoids RLS recursion on game_members.
-- Realtime: enabled for characters, games, game_members so the table can
--           react live to HP / token / membership changes.
-- ============================================================================

-- ---------------------------------------------------------------------------
-- profiles
-- ---------------------------------------------------------------------------
create table if not exists public.profiles (
  user_id uuid primary key references auth.users(id) on delete cascade,
  display_name text,
  created_at timestamptz not null default now()
);

-- Auto-create a profile row when a new auth user signs up.
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer set search_path = public
as $$
begin
  insert into public.profiles (user_id, display_name)
  values (new.id, coalesce(new.raw_user_meta_data->>'display_name', split_part(new.email, '@', 1)))
  on conflict (user_id) do nothing;
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute procedure public.handle_new_user();

-- ---------------------------------------------------------------------------
-- characters (full sheet stored as JSON for now)
-- ---------------------------------------------------------------------------
create table if not exists public.characters (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users(id) on delete cascade,
  name text not null,
  data jsonb not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists characters_owner_idx on public.characters (owner_id);

create or replace function public.touch_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists characters_touch_updated_at on public.characters;
create trigger characters_touch_updated_at
  before update on public.characters
  for each row execute procedure public.touch_updated_at();

-- ---------------------------------------------------------------------------
-- games
-- ---------------------------------------------------------------------------
create table if not exists public.games (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  dm_user_id uuid not null references auth.users(id) on delete cascade,
  join_code text not null unique,
  created_at timestamptz not null default now()
);

create index if not exists games_dm_idx on public.games (dm_user_id);
create index if not exists games_join_code_idx on public.games (join_code);

-- ---------------------------------------------------------------------------
-- game_members
-- ---------------------------------------------------------------------------
create table if not exists public.game_members (
  game_id uuid not null references public.games(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  character_id uuid references public.characters(id) on delete set null,
  role text not null default 'player' check (role in ('player','dm')),
  joined_at timestamptz not null default now(),
  primary key (game_id, user_id)
);

create index if not exists game_members_user_idx on public.game_members (user_id);

-- ---------------------------------------------------------------------------
-- Helper: is the current (or given) user a member of this game?
-- security definer bypasses RLS so it can be safely called from policies
-- without causing recursion.
-- ---------------------------------------------------------------------------
create or replace function public.is_game_member(_game_id uuid, _user_id uuid default auth.uid())
returns boolean
language sql
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.game_members
    where game_id = _game_id and user_id = _user_id
  );
$$;

-- ---------------------------------------------------------------------------
-- RLS
-- ---------------------------------------------------------------------------
alter table public.profiles      enable row level security;
alter table public.characters    enable row level security;
alter table public.games         enable row level security;
alter table public.game_members  enable row level security;

-- profiles -------------------------------------------------------------------
drop policy if exists profiles_self_select on public.profiles;
create policy profiles_self_select on public.profiles
  for select using (auth.uid() = user_id);

drop policy if exists profiles_game_visible on public.profiles;
create policy profiles_game_visible on public.profiles
  for select using (
    exists (
      select 1 from public.game_members me, public.game_members them
      where me.user_id = auth.uid()
        and them.user_id = profiles.user_id
        and me.game_id = them.game_id
    )
  );

drop policy if exists profiles_self_insert on public.profiles;
create policy profiles_self_insert on public.profiles
  for insert with check (auth.uid() = user_id);

drop policy if exists profiles_self_update on public.profiles;
create policy profiles_self_update on public.profiles
  for update using (auth.uid() = user_id);

-- characters -----------------------------------------------------------------
drop policy if exists characters_owner_all on public.characters;
create policy characters_owner_all on public.characters
  for all using (auth.uid() = owner_id)
  with check (auth.uid() = owner_id);

drop policy if exists characters_game_members_read on public.characters;
create policy characters_game_members_read on public.characters
  for select using (
    exists (
      select 1
      from public.game_members them
      where them.character_id = characters.id
        and public.is_game_member(them.game_id, auth.uid())
    )
  );

-- games ----------------------------------------------------------------------
drop policy if exists games_dm_all on public.games;
create policy games_dm_all on public.games
  for all using (auth.uid() = dm_user_id)
  with check (auth.uid() = dm_user_id);

drop policy if exists games_member_read on public.games;
create policy games_member_read on public.games
  for select using (public.is_game_member(games.id, auth.uid()));

-- Anyone authenticated can read the game by its join_code so they can join.
-- The select above + the join flow below handle that — but we also need to
-- allow lookup BEFORE you're a member, so add a per-row policy that exposes
-- only id+name+join_code when the join_code matches. (Cannot restrict columns
-- in RLS; instead expose via a SECURITY DEFINER RPC — see find_game_by_code.)

create or replace function public.find_game_by_code(_code text)
returns table(id uuid, name text)
language sql
security definer
set search_path = public
as $$
  select g.id, g.name
  from public.games g
  where g.join_code = _code
  limit 1;
$$;

grant execute on function public.find_game_by_code(text) to anon, authenticated;

-- game_members ---------------------------------------------------------------
drop policy if exists game_members_visible_to_members on public.game_members;
create policy game_members_visible_to_members on public.game_members
  for select using (public.is_game_member(game_members.game_id, auth.uid()));

drop policy if exists game_members_self_insert on public.game_members;
create policy game_members_self_insert on public.game_members
  for insert with check (auth.uid() = user_id);

drop policy if exists game_members_self_update on public.game_members;
create policy game_members_self_update on public.game_members
  for update using (auth.uid() = user_id);

drop policy if exists game_members_self_or_dm_delete on public.game_members;
create policy game_members_self_or_dm_delete on public.game_members
  for delete using (
    auth.uid() = user_id
    or exists (select 1 from public.games g where g.id = game_id and g.dm_user_id = auth.uid())
  );

-- ---------------------------------------------------------------------------
-- Realtime publication — opt in tables that drive live UI
-- ---------------------------------------------------------------------------
do $$ begin
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'characters'
  ) then
    alter publication supabase_realtime add table public.characters;
  end if;
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'games'
  ) then
    alter publication supabase_realtime add table public.games;
  end if;
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'game_members'
  ) then
    alter publication supabase_realtime add table public.game_members;
  end if;
end $$;
