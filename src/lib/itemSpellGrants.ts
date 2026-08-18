/**
 * Curated item-granted spellcasting for SRD magic items (#88).
 *
 * The seeded SRD magic items store their charges + spell ONLY as description
 * prose (e.g. "This wand has 7 charges… cast magic missile"), never as
 * structured fields — so nothing flows into the HUD's Items tab on its own.
 * This table is the structured source of truth: item name -> a charge pool +
 * the spells it casts (and per-spell charge cost where a spell costs more than
 * one). It's applied when an item enters inventory (itemAsset) and as a
 * read-time fallback in the HUD for items already added.
 *
 * Spells here should exist in spellMechanics so they resolve through the combat
 * loop; a spell that isn't modelled still casts (spends a charge + logs), it
 * just won't auto-roll its effect. Names are matched case-insensitively, with a
 * trailing "+1/+2/+3" or "(…)" suffix on the stored item name ignored.
 */
export interface ItemSpellGrant {
  charges: number;
  recharge?: "short" | "long" | "dawn";
  spells: string[];
  /** Charges per cast, by spell name (default 1). */
  cost?: Record<string, number>;
}

const GRANTS: Record<string, ItemSpellGrant> = {
  "wand of magic missiles": { charges: 7, recharge: "dawn", spells: ["Magic Missile"] },
  "wand of fireballs": { charges: 7, recharge: "dawn", spells: ["Fireball"], cost: { Fireball: 3 } },
  "wand of web": { charges: 7, recharge: "dawn", spells: ["Web"] },
  "wand of fear": { charges: 7, recharge: "dawn", spells: ["Fear"] },
  "wand of binding": { charges: 7, recharge: "dawn", spells: ["Hold Monster", "Hold Person"] },
  "staff of fire": {
    charges: 10,
    recharge: "dawn",
    spells: ["Burning Hands", "Fireball", "Wall of Fire"],
    cost: { "Burning Hands": 1, Fireball: 3, "Wall of Fire": 4 },
  },
  "staff of frost": {
    charges: 10,
    recharge: "dawn",
    spells: ["Fog Cloud", "Cone of Cold"],
    cost: { "Fog Cloud": 1, "Cone of Cold": 5 },
  },
};

/** Look up an item's curated spell grant by name (suffix-tolerant), or null. */
export const itemSpellGrant = (name: string): ItemSpellGrant | null => {
  const n = name
    .trim()
    .toLowerCase()
    .replace(/\s*\+\d+\s*$/, "") // "Staff of Fire +1"
    .replace(/\s*\([^)]*\)\s*$/, ""); // "Wand of Fireballs (rare)"
  return GRANTS[n] ?? null;
};
