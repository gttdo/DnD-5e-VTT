-- 0049_token_buffs.sql
--
-- Board-visible BUFFS on a placed token (Bless, Haste, Shield of Faith, …) —
-- the positive/neutral counterpart to conditions (0017). Rendered as gold
-- status chips above the token, alongside the red condition chips, and applied
-- from the combat HUD's status picker.
--
-- A plain text[] of buff names, mirroring `conditions`. The tokens UPDATE
-- policy is already member-wide (players write hp/conditions/loot), so buffs
-- ride the same path — no policy change. The move-guard trigger only inspects
-- x/y, so buff writes flow through untouched.
--
-- Idempotent: safe to re-run.

alter table public.tokens
  add column if not exists buffs text[] not null default '{}';
