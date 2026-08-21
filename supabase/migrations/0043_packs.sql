-- ============================================================================
-- D&D 5e VTT — 0043: content packs (docs/campaign-editor.md → packs proposal)
--
-- Paste into Supabase SQL Editor → Run. Idempotent: safe to re-run.
--
-- A pack is a campaign in a box: the marketplace row carries the card fields
-- plus a `manifest` jsonb — chapters, scenes (both faces), documents,
-- region maps, and pins, serialized. Install deep-copies rows into a NEW
-- campaign on the DM's list; images are REFERENCED (the publisher's bucket
-- is ours and never deletes).
--
-- Publisher model: we are the only publisher. The export UI hides behind a
-- client flag, but the real lock is pack_publishers — RLS lets only listed
-- accounts write packs. Seed it once (run in the SQL editor):
--   insert into public.pack_publishers (user_id)
--   select id from auth.users where email = '<your email>';
-- ============================================================================

create table if not exists public.pack_publishers (
  user_id uuid primary key references auth.users(id) on delete cascade,
  created_at timestamptz not null default now()
);

alter table public.pack_publishers enable row level security;
-- Readable so the client can show/hide publisher UI; writable by nobody via
-- the API (no insert/update/delete policies — rows are seeded in SQL).
drop policy if exists pack_publishers_self_read on public.pack_publishers;
create policy pack_publishers_self_read on public.pack_publishers
  for select using (auth.uid() = user_id);

create table if not exists public.packs (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  tagline text not null default '',
  cover_url text,
  level_min int check (level_min between 1 and 20),
  level_max int check (level_max between 1 and 20),
  -- The serialized campaign. Shape: { version, chapters[], scenes[],
  -- documents[], region_maps[], hotspots[] } — see src/lib/packs.ts.
  manifest jsonb not null,
  published boolean not null default false,
  created_by uuid not null references auth.users(id) on delete cascade,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists packs_published_idx on public.packs (published, created_at desc);

drop trigger if exists packs_touch_updated_at on public.packs;
create trigger packs_touch_updated_at
  before update on public.packs
  for each row execute procedure public.touch_updated_at();

alter table public.packs enable row level security;

-- The shelf: every signed-in user browses published packs; publishers also
-- see their own unpublished drafts.
drop policy if exists packs_shelf_read on public.packs;
create policy packs_shelf_read on public.packs
  for select using (published = true or auth.uid() = created_by);

-- Only listed publishers write, and only as themselves.
drop policy if exists packs_publisher_write on public.packs;
create policy packs_publisher_write on public.packs
  for all using (
    auth.uid() = created_by
    and exists (select 1 from public.pack_publishers p where p.user_id = auth.uid())
  )
  with check (
    auth.uid() = created_by
    and exists (select 1 from public.pack_publishers p where p.user_id = auth.uid())
  );
