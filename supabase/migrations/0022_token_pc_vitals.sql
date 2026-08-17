-- ============================================================================
-- D&D 5e VTT — share player-character vitals on the token (todo #121)
--
-- Paste into Supabase SQL Editor → Run. Idempotent: safe to re-run.
--
-- A player-character token carried only name + art + character_id; a character's
-- HP and level live on the owner-scoped `characters` row, so the DM (and other
-- players) never saw them. We mirror those onto the shared token so anyone can
-- see a PC's HP/level at a glance (drives the token info bar + cross-client
-- grey-out at 0 HP). hp_current/hp_max already exist (migration 0016); this adds
-- the one missing field — the character's level.
-- ============================================================================

alter table public.tokens
  add column if not exists char_level integer;
