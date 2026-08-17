-- Loot carried by a board token: coins + takeable items, stored as jsonb and
-- frozen once generated. Players loot defeated creatures and containers into
-- their character's inventory (see src/lib/loot.ts, LootDialog).
--
-- Shape (TokenLoot): { "coins": { "gp": 12, "sp": 4 }, "items": [ ... ], "looted": false }
-- Nullable: a token with no loot generated yet is null.

alter table public.tokens
  add column if not exists loot jsonb;
