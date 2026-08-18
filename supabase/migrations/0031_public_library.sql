-- ============================================================================
-- 0031_public_library.sql
--
-- Shared "premade" library (#135, slice 1). Until now token_assets was
-- owner-only (RLS token_assets_owner_all), so the seeded SRD content — 327
-- monsters, 237 magic items, the spell library — was visible ONLY to the seed
-- account (vinces.gerardo@gmail.com). Every other account saw an empty
-- Resources library.
--
-- This adds an `is_public` flag + a read-only-for-everyone policy, and marks the
-- SRD-seeded rows public so all accounts (players included) can browse and use
-- the premades. Owners still fully control their own rows; nobody but the owner
-- can edit or delete a row (the existing owner_all policy is unchanged).
--
-- Paste into the Supabase SQL Editor -> Run. Idempotent.
-- ============================================================================

alter table public.token_assets
  add column if not exists is_public boolean not null default false;

create index if not exists token_assets_public_idx
  on public.token_assets (is_public) where is_public;

-- Everyone may READ public rows. RLS policies are OR'd, so this only WIDENS
-- reads — owners keep full control of their own rows via token_assets_owner_all
-- (select/insert/update/delete all still gated on auth.uid() = owner_id).
drop policy if exists token_assets_public_read on public.token_assets;
create policy token_assets_public_read on public.token_assets
  for select using (is_public);

-- Mark the SRD-seeded content public. It's reliably identifiable by its monogram
-- placeholder art (/icons/<kind>/_mono/<L>.svg) — user-generated tokens carry
-- real Storage/generated image URLs, so they stay private.
update public.token_assets
  set is_public = true
  where image_url like '/icons/%/_mono/%'
    and is_public = false;
