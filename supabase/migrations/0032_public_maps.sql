-- ============================================================================
-- 0032_public_maps.sql
--
-- Shared library for MAPS (#135 / #137). Mirrors 0031 (token_assets): add an
-- `is_public` flag + a read-for-everyone policy so a DM can publish one of their
-- maps to the shared "premade" library and every account can then use it.
--
-- Unlike token_assets there is no seeded content to backfill — maps are all
-- user-generated, so nothing is marked public here. The publish toggle in the
-- Map Library (owner-only UPDATE via the existing maps_owner_all policy) is what
-- flips the flag.
--
-- Paste into the Supabase SQL Editor -> Run. Idempotent.
-- ============================================================================

alter table public.maps
  add column if not exists is_public boolean not null default false;

create index if not exists maps_public_idx
  on public.maps (is_public) where is_public;

-- Everyone may READ public maps; owners keep full control of their own rows via
-- the existing maps_owner_all policy (policies are OR'd, so this only widens reads).
drop policy if exists maps_public_read on public.maps;
create policy maps_public_read on public.maps
  for select using (is_public);
