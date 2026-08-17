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
