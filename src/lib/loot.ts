import type { Currency, InventoryItem } from "../types/character";
import type { MonsterStatblock } from "../types/content";

/**
 * Loot carried by a board token — coins plus a short list of takeable items.
 * Stored on tokens.loot (jsonb) and frozen once generated, so a body/chest
 * yields the same haul no matter who peeks or how often.
 *
 * The numbers here are our own light-weight design, NOT the DMG treasure tables:
 * coin amounts scale by Challenge Rating (creatures) or party tier (containers)
 * so rewards feel proportional without copying copyrighted tables. Gear is lifted
 * straight from the statblock's own "Gear" line — those are facts about the
 * creature, not flavor text.
 */

export interface LootItem {
  id: string;
  name: string;
  qty: number;
  /** Maps to InventoryItem.type when taken into a sheet. */
  kind?: InventoryItem["type"];
  /** gp value each, when known (coins are separate). */
  value?: number;
  /** Carried through to the inventory item so weapons stay usable. */
  damage?: string;
  damageType?: string;
  weight?: number;
  notes?: string;
}

export interface TokenLoot {
  /** Loose coins. Partial — omit a denomination rather than storing 0. */
  coins: Partial<Currency>;
  items: LootItem[];
  /** True once everything has been taken; keeps an empty body from re-rolling. */
  looted?: boolean;
}

export type PartyTier = 1 | 2 | 3 | 4;

// ---- dice (app-side, so Math.random is fine; the freeze is the persisted value) ----

const die = (sides: number): number => Math.floor(Math.random() * sides) + 1;
const dice = (count: number, sides: number): number => {
  let total = 0;
  for (let i = 0; i < count; i++) total += die(sides);
  return total;
};
const chance = (p: number): boolean => Math.random() < p;
const pick = <T,>(arr: readonly T[]): T => arr[Math.floor(Math.random() * arr.length)];

let idSeq = 0;
const lid = (): string => `loot-${Date.now().toString(36)}-${(idSeq++).toString(36)}`;

/** "1/8" | "1/4" | "1/2" | "8" | "0" → a number (0.125 … 30). */
export const crToNumber = (cr: string | number | undefined): number => {
  if (cr == null) return 0;
  if (typeof cr === "number") return cr;
  const s = cr.trim();
  if (s.includes("/")) {
    const [a, b] = s.split("/").map(Number);
    return b ? a / b : 0;
  }
  const n = Number(s);
  return Number.isFinite(n) ? n : 0;
};

/** Party tier from the average character level (5e-style brackets). */
export const tierForLevel = (avgLevel: number): PartyTier =>
  avgLevel >= 17 ? 4 : avgLevel >= 11 ? 3 : avgLevel >= 5 ? 2 : 1;

// ---- coin generation ------------------------------------------------------

const dropZeros = (c: Partial<Currency>): Partial<Currency> => {
  const out: Partial<Currency> = {};
  (Object.keys(c) as (keyof Currency)[]).forEach((k) => {
    if (c[k] && c[k]! > 0) out[k] = c[k];
  });
  return out;
};

/** Coins on a creature, scaled by CR. Our own bracketed design. */
const coinsForCr = (cr: number): Partial<Currency> => {
  if (cr < 1) return dropZeros({ cp: dice(3, 6), sp: dice(2, 6) });
  if (cr <= 4) return dropZeros({ sp: dice(2, 6), gp: dice(2, 6) });
  if (cr <= 10) return dropZeros({ gp: dice(4, 6) * 10, sp: dice(3, 6) });
  if (cr <= 16) return dropZeros({ gp: dice(5, 6) * 50, pp: dice(1, 6) });
  return dropZeros({ gp: dice(6, 6) * 100, pp: dice(2, 6) * 5 });
};

/** Coins in a container, scaled by party tier. */
const coinsForTier = (tier: PartyTier): Partial<Currency> => {
  switch (tier) {
    case 1: return dropZeros({ cp: dice(4, 6), sp: dice(3, 6), gp: dice(1, 6) });
    case 2: return dropZeros({ sp: dice(4, 6), gp: dice(3, 6) * 5 });
    case 3: return dropZeros({ gp: dice(4, 6) * 25, pp: dice(1, 6) });
    case 4: return dropZeros({ gp: dice(5, 6) * 100, pp: dice(2, 6) * 5 });
  }
};

// Generic gems / art objects — our own list, ordered roughly by tier value.
const VALUABLES: Record<PartyTier, { name: string; value: number }[]> = {
  1: [
    { name: "Chunk of turquoise", value: 10 },
    { name: "Banded agate", value: 10 },
    { name: "Tiny silver locket", value: 25 },
  ],
  2: [
    { name: "Polished bloodstone", value: 50 },
    { name: "Carved bone dice", value: 25 },
    { name: "Gilded hand mirror", value: 75 },
  ],
  3: [
    { name: "Deep-green jade", value: 100 },
    { name: "Cluster of black pearls", value: 250 },
    { name: "Jeweled ceremonial dagger", value: 300 },
  ],
  4: [
    { name: "Fire opal", value: 1000 },
    { name: "Star sapphire", value: 1000 },
    { name: "Golden idol with ruby eyes", value: 750 },
  ],
};

const valuable = (tier: PartyTier): LootItem => {
  const v = pick(VALUABLES[tier]);
  return { id: lid(), name: v.name, qty: 1, kind: "treasure", value: v.value };
};

// ---- gear pulled from a statblock ----------------------------------------

const WEAPON_HINT = /(sword|axe|dagger|mace|spear|bow|club|hammer|javelin|halberd|glaive|scimitar|rapier|flail|maul|sling|dart|whip|trident|pike|lance|staff|quarterstaff)/i;
const ARMOR_HINT = /(armor|armour|mail|plate|shield|breastplate|leather|cuirass)/i;

const gearItems = (gear?: string[]): LootItem[] =>
  (gear ?? []).map((g) => ({
    id: lid(),
    name: g,
    qty: 1,
    kind: WEAPON_HINT.test(g) ? "weapon" : ARMOR_HINT.test(g) ? "armor" : "gear",
  }));

// ---- public generators ----------------------------------------------------

/** Incidental haul for a defeated creature: CR-scaled coins + its gear. */
export const incidentalCreatureLoot = (statblock: MonsterStatblock): TokenLoot => {
  const cr = crToNumber(statblock.cr);
  return { coins: coinsForCr(cr), items: gearItems(statblock.gear) };
};

/** Incidental haul for a container: tier-scaled coins + a shot at a valuable. */
export const incidentalContainerLoot = (tier: PartyTier): TokenLoot => {
  const items: LootItem[] = [];
  if (chance(0.4)) items.push(valuable(tier));
  return { coins: coinsForTier(tier), items };
};

/** True when there's nothing left worth taking. */
export const lootIsEmpty = (loot: TokenLoot | null | undefined): boolean => {
  if (!loot) return true;
  const coin = Object.values(loot.coins ?? {}).some((n) => (n ?? 0) > 0);
  return !coin && (loot.items?.length ?? 0) === 0;
};

/** A one-line human summary of what a token holds, e.g.
 *  "30 gp · 15 sp · Rusty Key · Potion of Healing ×2". Empty → "". */
export const lootSummary = (loot: TokenLoot | null | undefined): string => {
  if (lootIsEmpty(loot)) return "";
  const parts: string[] = [];
  const c = loot!.coins ?? {};
  for (const d of ["pp", "gp", "ep", "sp", "cp"] as const) {
    const n = c[d] ?? 0;
    if (n > 0) parts.push(`${n} ${d}`);
  }
  for (const i of loot!.items ?? []) parts.push(i.qty > 1 ? `${i.name} ×${i.qty}` : i.name);
  return parts.join(" · ");
};

/** Total gp-equivalent, for a quick "worth ~N gp" summary. */
export const lootValueGp = (loot: TokenLoot): number => {
  const c = loot.coins ?? {};
  const coinGp = (c.pp ?? 0) * 10 + (c.gp ?? 0) + (c.ep ?? 0) * 0.5 + (c.sp ?? 0) * 0.1 + (c.cp ?? 0) * 0.01;
  const itemGp = loot.items.reduce((sum, i) => sum + (i.value ?? 0) * i.qty, 0);
  return Math.round(coinGp + itemGp);
};

/** Convert a loot line into a sheet inventory item (fresh id per take). */
export const lootToInventoryItem = (li: LootItem): InventoryItem => ({
  id: `inv-${Date.now().toString(36)}-${(idSeq++).toString(36)}`,
  name: li.name,
  qty: li.qty,
  weight: li.weight ?? 0,
  cost: li.value,
  type: li.kind ?? "gear",
  damage: li.damage,
  damageType: li.damageType,
  notes: li.notes,
});
