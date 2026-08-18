-- ============================================================================
-- 0033_public_characters.sql
--
-- Shared library for CHARACTERS (#135, final slice). Mirrors 0031/0032: add an
-- `is_public` flag + a read-for-everyone policy so a DM can publish a pre-gen PC
-- (or NPC sheet) as a "premade" that any account can browse and CLONE into their
-- own roster.
--
-- A character is a mutable, owned entity (HP, slots, concentration), so unlike
-- maps/tokens it is never used in place — the app copies a premade into your
-- roster (a fresh row you own). Publishing only grants READ; the owner_all
-- policy still gates every write.
--
-- No seeded content — characters are all user-made. Paste into the Supabase SQL
-- Editor -> Run. Idempotent.
-- ============================================================================

alter table public.characters
  add column if not exists is_public boolean not null default false;

create index if not exists characters_public_idx
  on public.characters (is_public) where is_public;

-- Everyone may READ public characters; owners keep full control of their own via
-- characters_owner_all, and party members still read shared-game PCs via
-- characters_game_members_read. Policies are OR'd, so this only widens reads.
drop policy if exists characters_public_read on public.characters;
create policy characters_public_read on public.characters
  for select using (is_public);
