-- ============================================================================
-- D&D 5e VTT — 0044: document shares (Story/Journal reconciliation)
--
-- Paste into Supabase SQL Editor → Run. Idempotent: safe to re-run.
--
-- "Who can see a doc" is a property of the SHARE, not the document. A share
-- targets an audience: the whole party, or one specific player. A player's
-- Journal is every doc shared with the party plus every doc shared with them.
-- This retires the dm/players visibility toggle — a doc is PRIVATE until
-- shared (the old "DM-only" = simply no shares).
-- ============================================================================

create table if not exists public.document_shares (
  id uuid primary key default gen_random_uuid(),
  document_id uuid not null references public.campaign_documents(id) on delete cascade,
  game_id uuid not null references public.games(id) on delete cascade,
  audience text not null check (audience in ('party', 'player')),
  -- null when audience='party'; the recipient's user id when audience='player'.
  recipient_id uuid references auth.users(id) on delete cascade,
  shared_at timestamptz not null default now(),
  -- one share per (doc, audience, recipient) — re-sharing is idempotent.
  unique (document_id, audience, recipient_id)
);

create index if not exists document_shares_doc_idx on public.document_shares (document_id);
create index if not exists document_shares_game_idx on public.document_shares (game_id, shared_at desc);

alter table public.document_shares enable row level security;

-- A member sees a share row if it's to the whole party or to them; the DM sees
-- all of their game's shares (so the editor can show share status).
drop policy if exists document_shares_read on public.document_shares;
create policy document_shares_read on public.document_shares
  for select using (
    public.is_game_member(document_shares.game_id, auth.uid())
    and (
      audience = 'party'
      or recipient_id = auth.uid()
      or exists (select 1 from public.games g where g.id = document_shares.game_id and g.dm_user_id = auth.uid())
    )
  );

-- Only the game's DM shares/unshares.
drop policy if exists document_shares_dm_write on public.document_shares;
create policy document_shares_dm_write on public.document_shares
  for all using (
    exists (select 1 from public.games g where g.id = document_shares.game_id and g.dm_user_id = auth.uid())
  )
  with check (
    exists (select 1 from public.games g where g.id = document_shares.game_id and g.dm_user_id = auth.uid())
  );

-- Tighten campaign_documents read: a player may read a doc only once it's been
-- SHARED with them (party or personal) — spoiler-safe. The DM still reads all.
drop policy if exists campaign_documents_read on public.campaign_documents;
create policy campaign_documents_read on public.campaign_documents
  for select using (
    exists (select 1 from public.games g where g.id = campaign_documents.game_id and g.dm_user_id = auth.uid())
    or exists (
      select 1 from public.document_shares s
      where s.document_id = campaign_documents.id
        and public.is_game_member(campaign_documents.game_id, auth.uid())
        and (s.audience = 'party' or s.recipient_id = auth.uid())
    )
  );

-- Backfill: every existing player-facing doc was "shared with the party" under
-- the old model — preserve that so nothing vanishes from players mid-campaign.
insert into public.document_shares (document_id, game_id, audience, recipient_id)
select d.id, d.game_id, 'party', null
from public.campaign_documents d
where d.visibility = 'players'
on conflict (document_id, audience, recipient_id) do nothing;

-- Realtime — the Journal updates live as the DM shares.
do $$ begin
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'document_shares'
  ) then
    alter publication supabase_realtime add table public.document_shares;
  end if;
end $$;
