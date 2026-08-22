-- ============================================================================
-- D&D 5e VTT — 0048: campaign memory (the Co-DM's remember tool)
--
-- Paste into Supabase SQL Editor → Run. Idempotent: safe to re-run.
--
-- Durable facts that emerge IN PLAY and live in no document — "the party
-- spared the ferryman; he owes them", "they named the goblin Steve". The
-- Co-DM proposes remembering one; on the DM's approval it lands here, and the
-- Co-DM re-reads these rows into its context every turn. DM-only.
-- ============================================================================

create table if not exists public.campaign_memory (
  id uuid primary key default gen_random_uuid(),
  game_id uuid not null references public.games(id) on delete cascade,
  content text not null,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now()
);

create index if not exists campaign_memory_game_idx on public.campaign_memory (game_id, created_at);

alter table public.campaign_memory enable row level security;

-- DM-only: the memory is the DM's second brain; players never read or write it.
drop policy if exists campaign_memory_dm_all on public.campaign_memory;
create policy campaign_memory_dm_all on public.campaign_memory
  for all using (
    exists (select 1 from public.games g where g.id = campaign_memory.game_id and g.dm_user_id = auth.uid())
  )
  with check (
    exists (select 1 from public.games g where g.id = campaign_memory.game_id and g.dm_user_id = auth.uid())
  );
