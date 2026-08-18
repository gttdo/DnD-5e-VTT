import type { InventoryItem } from "../types/character";
import type { MagicItem } from "../types/content";
import type { TokenAsset } from "../state/useTokenAssets";

/**
 * Bridge from the token studio's item output (a `MagicItem`) to a character
 * sheet's `InventoryItem`. The studio speaks D&D Beyond's homebrew vocabulary
 * (itemType "Wondrous item", a `rarity`, prose `description`); the sheet speaks
 * inventory rows (a `type` bucket, `qty`, `notes`). This is the one place that
 * translation lives, so "add this item to my character" is a pure, testable map.
 */

/** Map a homebrew item's category words onto the sheet's coarse type buckets. */
const bucketFor = (m: MagicItem): NonNullable<InventoryItem["type"]> => {
  const words = `${m.baseType ?? ""} ${m.itemType} ${m.baseWeapon ?? ""}`.toLowerCase();
  if (m.damage || words.includes("weapon")) return "weapon";
  if (m.armorClass || words.includes("armor") || words.includes("shield")) return "armor";
  if (words.includes("potion") || words.includes("scroll") || words.includes("consumable")) return "consumable";
  if (words.includes("tool") || words.includes("kit") || words.includes("instrument")) return "tool";
  if (words.includes("gem") || words.includes("art object") || words.includes("treasure")) return "treasure";
  return "gear";
};

/** Fold rarity, attunement, and effect prose into the inventory row's notes. */
const notesFor = (m: MagicItem): string | undefined => {
  const parts: string[] = [];
  if (m.rarity) parts.push(m.rarity);
  if (m.attunement) parts.push(`requires attunement${m.attunementNote ? ` ${m.attunementNote}` : ""}`);
  const head = parts.join(" · ");
  const body = m.description?.trim();
  const joined = [head, body].filter(Boolean).join(" — ");
  return joined || undefined;
};

/** Map a library item's free-text recharge ("regains 1d6+1 charges daily at
 *  dawn") to the sheet's coarse recharge trigger. Most magic items recharge at
 *  dawn, so that's the default when the item has charges but no clear cue. */
const rechargeFor = (raw?: string): "short" | "long" | "dawn" => {
  const s = (raw ?? "").toLowerCase();
  if (s.includes("short rest")) return "short";
  if (s.includes("long rest")) return "long";
  return "dawn";
};

/** A collision-resistant id without pulling in a uuid dep. */
const newId = (): string =>
  typeof crypto !== "undefined" && "randomUUID" in crypto
    ? `inv-${crypto.randomUUID()}`
    : `inv-${Date.now()}-${Math.floor(Math.random() * 1e6)}`;

/**
 * Turn a studio `MagicItem` into an inventory row. `art` is the token asset's
 * image so the item shows its generated portrait on the grid and paper doll.
 * Weapon damage/type/properties carry over so the item is immediately usable in
 * the actions panel; slot inference is left to lib/equip when the item equips.
 */
export const magicItemToInventory = (m: MagicItem, art?: string): InventoryItem => {
  const type = bucketFor(m);
  const item: InventoryItem = {
    id: newId(),
    name: m.name,
    qty: 1,
    weight: m.weight ?? 0,
    type,
  };
  if (art) item.art = art;
  const notes = notesFor(m);
  if (notes) item.notes = notes;
  if (type === "weapon") {
    if (m.damage) item.damage = m.damage;
    if (m.damageType) item.damageType = m.damageType;
    if (m.properties?.length) {
      item.properties = m.properties;
      if (m.properties.some((p) => /finesse/i.test(p))) item.finesse = true;
    }
  }
  // Item-granted spellcasting (#88): carry the library item's charge pool + the
  // spells it can cast onto the inventory row so the HUD's Items tab can drive it.
  if (m.charges && m.charges.max > 0) {
    item.charges = { max: m.charges.max, current: m.charges.max, recharge: rechargeFor(m.charges.recharge) };
  }
  if (m.attachedSpells?.length) item.grantedSpells = m.attachedSpells;
  if (m.attunement) item.attuned = false;
  return item;
};

/** Pull the `MagicItem` out of an item-typed token asset, or null if it isn't one. */
export const itemFromAsset = (a: TokenAsset): MagicItem | null =>
  a.details?.kind === "item" ? a.details.item : null;

/** Convenience: asset → inventory row, carrying the asset's art. Null if not an item. */
export const inventoryFromAsset = (a: TokenAsset): InventoryItem | null => {
  const m = itemFromAsset(a);
  return m ? magicItemToInventory(m, a.image_url || undefined) : null;
};
