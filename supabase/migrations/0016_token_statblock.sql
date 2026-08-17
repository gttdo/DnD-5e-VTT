-- ============================================================================
-- D&D 5e VTT — monster statblock + per-instance HP on placed tokens
--
-- Paste into Supabase SQL Editor → Run. Idempotent: safe to re-run.
--
-- When a monster token is placed from the library, its statblock is copied onto
-- the tokens row so the DM's in-combat HUD can read it, and each placed instance
-- gets its OWN current/max HP (two goblins take damage independently). Plain
-- art tokens and character tokens leave these null.
-- ============================================================================

alter table public.tokens
  add column if not exists statblock jsonb,
  add column if not exists hp_current integer,
  add column if not exists hp_max integer;
