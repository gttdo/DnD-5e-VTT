import type { InventoryItem } from "../types/character";

/**
 * Curated level-1 starting kits (#110). The class data only carries weapon/armor
 * *categories* and a gold value — no concrete items — so a freshly built
 * character had an empty inventory and no weapon in their Actions. This turns the
 * "equipment pack" choice into real InventoryItems, with a primary weapon marked
 * `equipped` so it becomes an Attack immediately (see lib/attacks).
 *
 * A pragmatic SRD-flavored loadout per class, not an exhaustive options tree —
 * enough to make a new character playable; players tweak from the inventory panel.
 */

interface WeaponDef {
  damage: string;
  damageType: string;
  weight: number;
  properties?: string[];
  range?: string;
  finesse?: boolean;
}

const WEAPONS: Record<string, WeaponDef> = {
  Greataxe: { damage: "1d12", damageType: "slashing", weight: 7, properties: ["Heavy", "Two-handed"] },
  Greatsword: { damage: "2d6", damageType: "slashing", weight: 6, properties: ["Heavy", "Two-handed"] },
  Longsword: { damage: "1d8", damageType: "slashing", weight: 3, properties: ["Versatile"] },
  Shortsword: { damage: "1d6", damageType: "piercing", weight: 2, properties: ["Finesse", "Light"], finesse: true },
  Rapier: { damage: "1d8", damageType: "piercing", weight: 2, properties: ["Finesse"], finesse: true },
  Scimitar: { damage: "1d6", damageType: "slashing", weight: 3, properties: ["Finesse", "Light"], finesse: true },
  Dagger: { damage: "1d4", damageType: "piercing", weight: 1, properties: ["Finesse", "Light", "Thrown"], range: "20/60", finesse: true },
  Handaxe: { damage: "1d6", damageType: "slashing", weight: 2, properties: ["Light", "Thrown"], range: "20/60" },
  Javelin: { damage: "1d6", damageType: "piercing", weight: 2, properties: ["Thrown"], range: "30/120" },
  Mace: { damage: "1d6", damageType: "bludgeoning", weight: 4 },
  Warhammer: { damage: "1d8", damageType: "bludgeoning", weight: 2, properties: ["Versatile"] },
  Quarterstaff: { damage: "1d6", damageType: "bludgeoning", weight: 4, properties: ["Versatile"] },
  Dart: { damage: "1d4", damageType: "piercing", weight: 0.25, properties: ["Finesse", "Thrown"], range: "20/60", finesse: true },
  Shortbow: { damage: "1d6", damageType: "piercing", weight: 2, properties: ["Ammunition", "Two-handed"], range: "80/320" },
  Longbow: { damage: "1d8", damageType: "piercing", weight: 2, properties: ["Ammunition", "Heavy", "Two-handed"], range: "150/600" },
  "Light Crossbow": { damage: "1d8", damageType: "piercing", weight: 5, properties: ["Ammunition", "Loading", "Two-handed"], range: "80/320" },
};

const ARMOR_WEIGHT: Record<string, number> = {
  "Leather Armor": 10,
  "Scale Mail": 45,
  "Chain Mail": 55,
  Shield: 6,
};

interface KitItem {
  name: string;
  qty?: number;
  equip?: boolean;
}

const STARTING_KIT: Record<string, KitItem[]> = {
  Barbarian: [{ name: "Greataxe", equip: true }, { name: "Handaxe", qty: 2 }, { name: "Javelin", qty: 4 }, { name: "Explorer's Pack" }],
  Bard: [{ name: "Rapier", equip: true }, { name: "Leather Armor", equip: true }, { name: "Dagger" }, { name: "Lute" }, { name: "Entertainer's Pack" }],
  Cleric: [{ name: "Mace", equip: true }, { name: "Scale Mail", equip: true }, { name: "Shield", equip: true }, { name: "Holy Symbol" }, { name: "Priest's Pack" }],
  Druid: [{ name: "Quarterstaff", equip: true }, { name: "Leather Armor", equip: true }, { name: "Shield", equip: true }, { name: "Druidic Focus" }, { name: "Explorer's Pack" }],
  Fighter: [{ name: "Longsword", equip: true }, { name: "Shield", equip: true }, { name: "Chain Mail", equip: true }, { name: "Light Crossbow" }, { name: "Crossbow Bolts", qty: 20 }, { name: "Explorer's Pack" }],
  Monk: [{ name: "Shortsword", equip: true }, { name: "Dart", qty: 10 }, { name: "Explorer's Pack" }],
  Paladin: [{ name: "Longsword", equip: true }, { name: "Shield", equip: true }, { name: "Chain Mail", equip: true }, { name: "Javelin", qty: 5 }, { name: "Holy Symbol" }, { name: "Priest's Pack" }],
  Ranger: [{ name: "Longbow", equip: true }, { name: "Shortsword", qty: 2 }, { name: "Scale Mail", equip: true }, { name: "Arrows", qty: 20 }, { name: "Explorer's Pack" }],
  Rogue: [{ name: "Rapier", equip: true }, { name: "Shortbow" }, { name: "Leather Armor", equip: true }, { name: "Dagger", qty: 2 }, { name: "Arrows", qty: 20 }, { name: "Thieves' Tools" }, { name: "Burglar's Pack" }],
  Sorcerer: [{ name: "Dagger", equip: true, qty: 2 }, { name: "Light Crossbow" }, { name: "Crossbow Bolts", qty: 20 }, { name: "Component Pouch" }, { name: "Explorer's Pack" }],
  Warlock: [{ name: "Light Crossbow", equip: true }, { name: "Leather Armor", equip: true }, { name: "Dagger", qty: 2 }, { name: "Crossbow Bolts", qty: 20 }, { name: "Component Pouch" }, { name: "Scholar's Pack" }],
  Wizard: [{ name: "Quarterstaff", equip: true }, { name: "Dagger" }, { name: "Spellbook" }, { name: "Component Pouch" }, { name: "Scholar's Pack" }],
};

const newId = (): string =>
  typeof crypto !== "undefined" && "randomUUID" in crypto
    ? `inv-${crypto.randomUUID()}`
    : `inv-${Date.now()}-${Math.floor(Math.random() * 1e6)}`;

const makeItem = (name: string, qty: number, equip: boolean): InventoryItem => {
  const w = WEAPONS[name];
  if (w) {
    return {
      id: newId(),
      name,
      qty,
      weight: w.weight,
      type: "weapon",
      damage: w.damage,
      damageType: w.damageType,
      properties: w.properties,
      range: w.range,
      finesse: w.finesse,
      equipped: equip,
    };
  }
  const isArmor = name in ARMOR_WEIGHT;
  return {
    id: newId(),
    name,
    qty,
    weight: ARMOR_WEIGHT[name] ?? 1,
    type: isArmor ? "armor" : "gear",
    ...(isArmor ? { equipped: equip } : {}),
  };
};

/** The class's level-1 starting kit as real inventory rows (weapon equipped). */
export const startingInventory = (className: string | null): InventoryItem[] => {
  const kit = className ? STARTING_KIT[className] : null;
  if (!kit) return [];
  return kit.map((k) => makeItem(k.name, k.qty ?? 1, !!k.equip));
};

/** A short human list of the kit for a preview (no ids), e.g. "Longsword, Shield…". */
export const startingKitSummary = (className: string | null): string[] => {
  const kit = className ? STARTING_KIT[className] : null;
  if (!kit) return [];
  return kit.map((k) => (k.qty && k.qty > 1 ? `${k.name} ×${k.qty}` : k.name));
};
