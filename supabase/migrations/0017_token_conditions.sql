-- 0017_token_conditions.sql
--
-- Board-visible status conditions on a placed token (paralyzed, frightened,
-- restrained, …). Rendered as small badges under the token; applied by spells
-- like Hold Person (save-or-be-conditioned) and clearable by tapping a badge.
-- A plain text[] of condition slugs — realtime already syncs the tokens table,
-- so every client sees a condition appear/clear instantly.
--
-- Idempotent: safe to re-run.

alter table public.tokens
  add column if not exists conditions text[] not null default '{}';
