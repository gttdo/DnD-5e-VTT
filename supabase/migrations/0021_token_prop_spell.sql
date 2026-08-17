-- ============================================================================
-- D&D 5e VTT — Prop & Spell token kinds on the board (todo #80)
--
-- Paste into Supabase SQL Editor → Run. Idempotent: safe to re-run.
--
-- Two halves:
--   1. LIBRARY — #79 added 'prop' and 'spell' to the TokenType union in code,
--      but token_assets.token_type still carried the old 3-value check from
--      migration 0015. Saving a Prop/Spell asset therefore failed with
--      "violates check constraint token_assets_token_type_check". Widen it.
--   2. BOARD — a placed token needs to know it's a prop or a spell WITHOUT a
--      join back to the library (placement freezes data, like statblock in
--      0016). `kind` drives board behavior: props aren't combat targets and
--      containers open loot; spells render as a translucent area. `area` holds
--      the spell's footprint so the board can size the render.
-- ============================================================================

-- 1. Library asset kinds — allow the two new discriminants.
alter table public.token_assets
  drop constraint if exists token_assets_token_type_check;

alter table public.token_assets
  add constraint token_assets_token_type_check
  check (token_type in ('monster', 'npc', 'item', 'prop', 'spell'));

-- 2. Placed-token board behavior.
--    kind: 'prop' | 'spell'  (null = a creature/PC/plain token, the default)
--    area: spell footprint, e.g. { "shape": "sphere", "size": 20,
--          "damageType": "fire", "level": 3 }  (null for props/creatures)
alter table public.tokens
  add column if not exists kind text
  check (kind in ('prop', 'spell'));

alter table public.tokens
  add column if not exists area jsonb;
