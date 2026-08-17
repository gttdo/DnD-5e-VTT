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
