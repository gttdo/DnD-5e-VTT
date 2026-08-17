-- ============================================================================
-- D&D 5e VTT — apply ALL pending migrations (0009–0015), one paste.
-- Every block is idempotent (safe to re-run). Paste into Supabase SQL Editor.
-- ============================================================================


-- >>> 0009_token_visibility.sql >>>
-- DM-only token visibility.
--
-- tokens.hidden = true means only the DM sees the token — on the board AND in
-- the initiative order. The filtering is done client-side: every player still
-- RECEIVES hidden rows over realtime, their UI just doesn't render them.
--
-- Why not enforce with RLS? Filtering SELECT by role breaks realtime's UPDATE
-- delivery in the hide direction: when a token flips to hidden, players lose
-- SELECT on the row, so the change event is withheld — and the token they can
-- no longer "see" stays frozen on their board. Client-side filtering keeps
-- sync correct at the cost of being inspectable by a determined cheater, which
-- is the right trade for a table of friends.

alter table public.tokens
  add column if not exists hidden boolean not null default false;

-- >>> 0010_fog_of_war.sql >>>
-- Fog of war, grid-based.
--
-- Fog state lives on the scene row, which players already receive over
-- realtime — no new channel, no new table.
--
--   fog_enabled  — is the fog layer on for this scene
--   fog_revealed — jsonb array of revealed CELL INDICES (y * grid_cols + x).
--                  Integers rather than "x,y" strings: half the payload, and
--                  the client keeps them in a Set for O(1) paint/lookup.
--
-- Whole-array last-write-wins on update. The DM is the only writer, and a
-- reveal brush emits debounced full snapshots, so conflicts can only arise
-- from two DM devices painting simultaneously — acceptable.

alter table public.scenes
  add column if not exists fog_enabled boolean not null default false,
  add column if not exists fog_revealed jsonb not null default '[]'::jsonb;

-- >>> 0011_drawings.sql >>>
-- ============================================================================
-- D&D 5e VTT — freehand drawings + shapes on the shared canvas
--
-- Paste into Supabase SQL Editor → Run. Idempotent: safe to re-run.
--
-- A separate TABLE (not a jsonb column on scenes like fog) because drawings
-- are a multi-writer, append/erase collection: a table gives granular realtime
-- insert/delete and avoids the last-write-wins loss you'd get rewriting one
-- shared array from several clients at once. Modelled on `tokens`.
--
--   kind   — 'pen' | 'rect' | 'ellipse' | 'arrow'
--   points — jsonb flat array of SVG user coords. Pen: the whole path
--            [x0,y0,x1,y1,…]; shapes: two corners [x0,y0,x1,y1].
-- ============================================================================

create table if not exists public.drawings (
  id uuid primary key default gen_random_uuid(),
  scene_id uuid not null references public.scenes(id) on delete cascade,
  game_id uuid not null references public.games(id) on delete cascade,
  kind text not null check (kind in ('pen','rect','ellipse','arrow')),
  color text not null default '#e8c076',
  points jsonb not null,
  created_by uuid not null references auth.users(id) on delete cascade,
  created_at timestamptz not null default now()
);

create index if not exists drawings_scene_idx on public.drawings (scene_id);

-- ---------------------------------------------------------------------------
-- RLS — same "any game member" model as tokens
-- ---------------------------------------------------------------------------
alter table public.drawings enable row level security;

drop policy if exists drawings_member_read on public.drawings;
create policy drawings_member_read on public.drawings
  for select using (public.is_game_member(drawings.game_id, auth.uid()));

drop policy if exists drawings_member_insert on public.drawings;
create policy drawings_member_insert on public.drawings
  for insert with check (
    public.is_game_member(drawings.game_id, auth.uid())
    and auth.uid() = created_by
  );

drop policy if exists drawings_member_delete on public.drawings;
create policy drawings_member_delete on public.drawings
  for delete using (public.is_game_member(drawings.game_id, auth.uid()));

-- ---------------------------------------------------------------------------
-- Realtime
-- ---------------------------------------------------------------------------
do $$ begin
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'drawings'
  ) then
    alter publication supabase_realtime add table public.drawings;
  end if;
end $$;

-- DELETE payloads need scene_id so subscribers can filter without a lookup.
alter table public.drawings replica identity full;

-- >>> 0012_character_bg_upload.sql >>>
-- Let signed-in users upload their own character-sheet backdrops.
--
-- The map-images bucket is already public-read; generated art is written by the
-- generate-map edge function (service role). This adds the one missing piece:
-- an INSERT policy so an authenticated client can upload a file directly (used
-- by the "Change background → Upload" option). Files land under character-bg/.

drop policy if exists "map_images_auth_insert" on storage.objects;
create policy "map_images_auth_insert" on storage.objects
  for insert to authenticated
  with check (bucket_id = 'map-images');

-- >>> 0013_journal.sql >>>
-- ============================================================================
-- D&D 5e VTT — campaign journal (one shared log per game)
--
-- Paste into Supabase SQL Editor → Run. Idempotent: safe to re-run.
--
-- A per-game record the whole party writes to: session recaps, clues, names,
-- plus anything the DM shares. Every game member reads all entries; authors
-- write and delete their own. author_name is denormalised so the UI can label
-- an entry without a join back to auth.users.
-- ============================================================================

create table if not exists public.journal_entries (
  id uuid primary key default gen_random_uuid(),
  game_id uuid not null references public.games(id) on delete cascade,
  author_id uuid not null references auth.users(id) on delete cascade,
  author_name text not null default '',
  title text,
  body text not null,
  created_at timestamptz not null default now()
);

create index if not exists journal_entries_game_idx
  on public.journal_entries (game_id, created_at desc);

-- ---------------------------------------------------------------------------
-- RLS — same "any game member" model as tokens/drawings
-- ---------------------------------------------------------------------------
alter table public.journal_entries enable row level security;

drop policy if exists journal_member_read on public.journal_entries;
create policy journal_member_read on public.journal_entries
  for select using (public.is_game_member(journal_entries.game_id, auth.uid()));

drop policy if exists journal_author_insert on public.journal_entries;
create policy journal_author_insert on public.journal_entries
  for insert with check (
    public.is_game_member(journal_entries.game_id, auth.uid())
    and auth.uid() = author_id
  );

drop policy if exists journal_author_delete on public.journal_entries;
create policy journal_author_delete on public.journal_entries
  for delete using (auth.uid() = author_id);

-- ---------------------------------------------------------------------------
-- Realtime
-- ---------------------------------------------------------------------------
do $$ begin
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'journal_entries'
  ) then
    alter publication supabase_realtime add table public.journal_entries;
  end if;
end $$;

alter table public.journal_entries replica identity full;

-- >>> 0014_region_map.sql >>>
-- ============================================================================
-- D&D 5e VTT — region map (a world map the DM shares, per game)
--
-- Paste into Supabase SQL Editor → Run. Idempotent: safe to re-run.
--
-- Distinct from the battle map (the scene): this is the wider region the party
-- moves through, for context. One nullable image URL on the game; the DM sets
-- it, players view it read-only. Updates ride the existing games UPDATE policy
-- (the DM already updates active_scene_id the same way).
-- ============================================================================

alter table public.games add column if not exists region_map_url text;

-- >>> 0015_token_content.sql >>>
-- ============================================================================
-- D&D 5e VTT — token studio content (monsters, NPCs, items)
--
-- Paste into Supabase SQL Editor → Run. Idempotent: safe to re-run.
--
-- A token asset is no longer just art. It can be a monster (with a statblock),
-- an NPC (a roleplay profile), or a magic item (mechanical details). The shape
-- of `details` is discriminated by `token_type`; see src/types/content.ts.
-- Existing rows have token_type NULL (a plain art token) and keep working.
-- ============================================================================

alter table public.token_assets
  add column if not exists token_type text
  check (token_type in ('monster', 'npc', 'item'));

alter table public.token_assets
  add column if not exists details jsonb;
