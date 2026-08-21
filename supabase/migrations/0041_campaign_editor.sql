-- ============================================================================
-- D&D 5e VTT — 0041: the Campaign Editor (docs/campaign-editor.md)
--
-- Paste into Supabase SQL Editor → Run. Idempotent: safe to re-run.
--
-- The narrative layer. Campaign → chapters → scenes; documents (notes,
-- read-alouds, quests, recaps) attach at scene, chapter, session, or campaign
-- level; GM-controlled sessions bound a NEW persistent game_log (the current
-- "log" is React state only — rolls vanish on refresh). Chapters carry
-- draft/published so unfinished story can't leak to players.
-- ============================================================================

-- 1. chapters — story-space grouping of scenes -------------------------------
create table if not exists public.chapters (
  id uuid primary key default gen_random_uuid(),
  game_id uuid not null references public.games(id) on delete cascade,
  title text not null default 'Untitled Chapter',
  position int not null default 0,
  -- Spatial by default: a chapter may point at the region map it plays on.
  region_map_id uuid references public.region_maps(id) on delete set null,
  -- Players can only reach scenes in PUBLISHED chapters. Unfiled scenes
  -- (scenes.chapter_id is null) count as published — pre-0041 games keep
  -- working untouched.
  status text not null default 'draft' check (status in ('draft', 'published')),
  created_by uuid not null references auth.users(id) on delete cascade,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists chapters_game_idx on public.chapters (game_id, position);

drop trigger if exists chapters_touch_updated_at on public.chapters;
create trigger chapters_touch_updated_at
  before update on public.chapters
  for each row execute procedure public.touch_updated_at();

alter table public.chapters enable row level security;

drop policy if exists chapters_member_read on public.chapters;
create policy chapters_member_read on public.chapters
  for select using (public.is_game_member(chapters.game_id, auth.uid()));

drop policy if exists chapters_dm_write on public.chapters;
create policy chapters_dm_write on public.chapters
  for all using (
    exists (select 1 from public.games g where g.id = chapters.game_id and g.dm_user_id = auth.uid())
  )
  with check (
    exists (select 1 from public.games g where g.id = chapters.game_id and g.dm_user_id = auth.uid())
  );

-- 2. sessions — GM-controlled recording boundaries (table-time) ---------------
create table if not exists public.sessions (
  id uuid primary key default gen_random_uuid(),
  game_id uuid not null references public.games(id) on delete cascade,
  number int not null,
  started_at timestamptz not null default now(),
  ended_at timestamptz,          -- null = live right now
  unique (game_id, number)
);

create index if not exists sessions_game_idx on public.sessions (game_id, number desc);

alter table public.sessions enable row level security;

drop policy if exists sessions_member_read on public.sessions;
create policy sessions_member_read on public.sessions
  for select using (public.is_game_member(sessions.game_id, auth.uid()));

drop policy if exists sessions_dm_write on public.sessions;
create policy sessions_dm_write on public.sessions
  for all using (
    exists (select 1 from public.games g where g.id = sessions.game_id and g.dm_user_id = auth.uid())
  )
  with check (
    exists (select 1 from public.games g where g.id = sessions.game_id and g.dm_user_id = auth.uid())
  );

-- 3. game_log — ONE persistent stream: rolls + chat + system events ----------
-- session_id null = "off the record" (between sessions): still visible in the
-- feed, excluded from recaps and Scribe context.
create table if not exists public.game_log (
  id uuid primary key default gen_random_uuid(),
  game_id uuid not null references public.games(id) on delete cascade,
  session_id uuid references public.sessions(id) on delete set null,
  kind text not null check (kind in ('roll', 'chat', 'system')),
  author_id uuid references auth.users(id) on delete set null,  -- null: system
  author_name text not null default '',
  body jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index if not exists game_log_game_idx on public.game_log (game_id, created_at desc);
create index if not exists game_log_session_idx on public.game_log (session_id, created_at);

alter table public.game_log enable row level security;

drop policy if exists game_log_member_read on public.game_log;
create policy game_log_member_read on public.game_log
  for select using (public.is_game_member(game_log.game_id, auth.uid()));

-- Members write their own rolls and chat; only the DM writes system events.
drop policy if exists game_log_member_insert on public.game_log;
create policy game_log_member_insert on public.game_log
  for insert with check (
    public.is_game_member(game_log.game_id, auth.uid())
    and (
      (kind in ('roll', 'chat') and auth.uid() = author_id)
      or (
        kind = 'system'
        and exists (select 1 from public.games g where g.id = game_log.game_id and g.dm_user_id = auth.uid())
      )
    )
  );
-- No update/delete policies: the log is append-only for everyone (the
-- standing house rule — players can't clear the game log; neither can the DM).

-- 4. campaign_documents — the narrative atoms ---------------------------------
create table if not exists public.campaign_documents (
  id uuid primary key default gen_random_uuid(),
  game_id uuid not null references public.games(id) on delete cascade,
  kind text not null default 'note' check (kind in ('note', 'read_aloud', 'quest', 'recap')),
  title text not null default '',
  content text not null default '',
  visibility text not null default 'dm' check (visibility in ('dm', 'players')),
  -- Attachment point: scene, chapter, session (recaps), or none (campaign).
  scene_id uuid references public.scenes(id) on delete cascade,
  chapter_id uuid references public.chapters(id) on delete set null,
  session_id uuid references public.sessions(id) on delete set null,
  position int not null default 0,
  created_by uuid not null references auth.users(id) on delete cascade,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists campaign_documents_game_idx on public.campaign_documents (game_id, position);
create index if not exists campaign_documents_scene_idx on public.campaign_documents (scene_id);

drop trigger if exists campaign_documents_touch_updated_at on public.campaign_documents;
create trigger campaign_documents_touch_updated_at
  before update on public.campaign_documents
  for each row execute procedure public.touch_updated_at();

alter table public.campaign_documents enable row level security;

-- DM reads everything; players read only player-facing docs.
drop policy if exists campaign_documents_read on public.campaign_documents;
create policy campaign_documents_read on public.campaign_documents
  for select using (
    public.is_game_member(campaign_documents.game_id, auth.uid())
    and (
      visibility = 'players'
      or exists (select 1 from public.games g where g.id = campaign_documents.game_id and g.dm_user_id = auth.uid())
    )
  );

drop policy if exists campaign_documents_dm_write on public.campaign_documents;
create policy campaign_documents_dm_write on public.campaign_documents
  for all using (
    exists (select 1 from public.games g where g.id = campaign_documents.game_id and g.dm_user_id = auth.uid())
  )
  with check (
    exists (select 1 from public.games g where g.id = campaign_documents.game_id and g.dm_user_id = auth.uid())
  );

-- 5. Column additions ---------------------------------------------------------
-- Scenes: chapter membership + the canonical prose source for the Scribe and
-- both image generators.
alter table public.scenes add column if not exists chapter_id uuid references public.chapters(id) on delete set null;
alter table public.scenes add column if not exists description text not null default '';
create index if not exists scenes_chapter_idx on public.scenes (chapter_id);

-- Games: campaign-card tagline, cover art, and the level band that calibrates
-- encounters, Scribe output, and (later) solo-play generation.
alter table public.games add column if not exists description text not null default '';
alter table public.games add column if not exists cover_url text;
alter table public.games add column if not exists level_min int check (level_min between 1 and 20);
alter table public.games add column if not exists level_max int check (level_max between 1 and 20);

do $$ begin
  if not exists (
    select 1 from pg_constraint where conname = 'games_level_band_check'
  ) then
    alter table public.games add constraint games_level_band_check
      check (level_min is null or level_max is null or level_min <= level_max);
  end if;
end $$;

-- 6. Realtime ------------------------------------------------------------------
do $$ begin
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'chapters'
  ) then
    alter publication supabase_realtime add table public.chapters;
  end if;
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'sessions'
  ) then
    alter publication supabase_realtime add table public.sessions;
  end if;
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'game_log'
  ) then
    alter publication supabase_realtime add table public.game_log;
  end if;
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'campaign_documents'
  ) then
    alter publication supabase_realtime add table public.campaign_documents;
  end if;
end $$;
