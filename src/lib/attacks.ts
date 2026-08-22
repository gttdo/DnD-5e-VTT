import type { Ability, Attack, Character, InventoryItem } from "../types/character";
import { abilityModFor } from "./calc";

/**
 * Resolves what actually shows up in the Actions panel.
 *
 * A character can carry a greataxe without wielding it — carrying it shouldn't
 * put an attack on the sheet. So Actions is derived from the inventory's
 * `equipped` flag rather than from a separate hand-maintained list:
 *
 *  - A manual attack in `character.attacks` that matches an inventory item by
 *    name is shown only while that item is equipped. (Manual entries win on a
 *    name match because they carry curated ability/proficiency/bonus values.)
 *  - A manual attack with no matching item is always shown — that's how innate
 *    attacks work: Unarmed Strike, claws, spell attacks.
 *  - An equipped weapon with no manual entry generates an attack automatically,
 *    so newly-added weapons work without also editing the attack list.
 */

const key = (s: string) => s.trim().toLowerCase();

/** Anything that can be wielded in combat, and so earns an equip checkbox. */
export const isWeapon = (item: InventoryItem): boolean =>
  item.type === "weapon" || Boolean(item.damage);

/** Weapons and armour are equippable; gear/consumables/treasure are not. */
export const isEquippable = (item: InventoryItem): boolean =>
  isWeapon(item) || item.type === "armor";

/**
 * Best-effort weapon proficiency. Without a weapon table we can't tell whether
 * a greataxe is Simple or Martial, so a category grant ("Simple Weapons",
 * "Martial Weapons") is treated as covering the item. Errs toward proficient,
 * which matches the common case of a character wielding their own gear.
 */
const isProficientWith = (c: Character, item: InventoryItem): boolean => {
  const list = c.proficiencies.weapons.map(key);
  if (!list.length) return false;
  const name = key(item.name);
  if (list.some((w) => w.includes("all weapons"))) return true;
  if (list.some((w) => name.includes(w) || w.includes(name))) return true;
  return list.some((w) => w.includes("simple") || w.includes("martial"));
};

/**
 * SRD thrown weapons and their throw ranges. The app has no equipment table,
 * so most items carry no `properties` — recognize the classics by name and
 * supply the canonical range when the item data has none.
 */
const THROWN_RANGES: Record<string, string> = {
  dagger: "20/60",
  handaxe: "20/60",
  javelin: "30/120",
  "light hammer": "20/60",
  spear: "20/60",
  trident: "20/60",
  dart: "20/60",
};

/** Does this weapon have the Thrown property (by data, or by SRD name)? */
export const isThrown = (item: InventoryItem): boolean =>
  (item.properties ?? []).some((p) => key(p).includes("thrown")) || key(item.name) in THROWN_RANGES;

/**
 * Weapon stats for common SRD weapons, so "Add item… → Dagger" creates a REAL
 * weapon (equippable, attack-derived, throwable) instead of a bare gear line.
 * Same philosophy as THROWN_RANGES: the app has no equipment table, so the
 * classics are recognized by name.
 */
const SRD_WEAPONS: Record<string, Pick<InventoryItem, "damage" | "damageType" | "properties" | "weight" | "finesse" | "range">> = {
  dagger: { damage: "1d4", damageType: "piercing", properties: ["Finesse", "Light", "Thrown", "Nick"], weight: 1, finesse: true, range: "20/60" },
  handaxe: { damage: "1d6", damageType: "slashing", properties: ["Light", "Thrown", "Vex"], weight: 2, range: "20/60" },
  javelin: { damage: "1d6", damageType: "piercing", properties: ["Thrown", "Slow"], weight: 2, range: "30/120" },
  "light hammer": { damage: "1d4", damageType: "bludgeoning", properties: ["Light", "Thrown", "Nick"], weight: 2, range: "20/60" },
  spear: { damage: "1d6", damageType: "piercing", properties: ["Thrown", "Versatile", "Sap"], weight: 3, range: "20/60" },
  trident: { damage: "1d8", damageType: "piercing", properties: ["Thrown", "Versatile", "Topple"], weight: 4, range: "20/60" },
  dart: { damage: "1d4", damageType: "piercing", properties: ["Finesse", "Thrown", "Vex"], weight: 0.25, finesse: true, range: "20/60" },
  club: { damage: "1d4", damageType: "bludgeoning", properties: ["Light", "Slow"], weight: 2 },
  quarterstaff: { damage: "1d6", damageType: "bludgeoning", properties: ["Versatile", "Topple"], weight: 4 },
  shortsword: { damage: "1d6", damageType: "piercing", properties: ["Finesse", "Light", "Vex"], weight: 2, finesse: true },
  longsword: { damage: "1d8", damageType: "slashing", properties: ["Versatile", "Sap"], weight: 3 },
  greataxe: { damage: "1d12", damageType: "slashing", properties: ["Heavy", "Two-Handed", "Cleave"], weight: 7 },
  greatsword: { damage: "2d6", damageType: "slashing", properties: ["Heavy", "Two-Handed", "Graze"], weight: 6 },
  mace: { damage: "1d6", damageType: "bludgeoning", properties: ["Sap"], weight: 4 },
  rapier: { damage: "1d8", damageType: "piercing", properties: ["Finesse", "Vex"], weight: 2, finesse: true },
  scimitar: { damage: "1d6", damageType: "slashing", properties: ["Finesse", "Light", "Nick"], weight: 3, finesse: true },
  shortbow: { damage: "1d6", damageType: "piercing", properties: ["Ammunition", "Two-Handed", "Vex"], weight: 2, range: "80/320" },
  longbow: { damage: "1d8", damageType: "piercing", properties: ["Ammunition", "Heavy", "Two-Handed", "Slow"], weight: 2, range: "150/600" },
  warhammer: { damage: "1d8", damageType: "bludgeoning", properties: ["Versatile", "Push"], weight: 5 },
  battleaxe: { damage: "1d8", damageType: "slashing", properties: ["Versatile", "Topple"], weight: 4 },
};

/** SRD weapon stats for a name, or null — lets the Add-item flow create a real
 *  weapon out of a recognized name. */
export const srdWeaponData = (name: string): (typeof SRD_WEAPONS)[string] & { type: "weapon" } | null => {
  const d = SRD_WEAPONS[key(name)];
  return d ? { ...d, type: "weapon" } : null;
};

/** The range a throw of this item uses ("20/60"), or null if unthrowable. */
const throwRange = (item: InventoryItem): string | null =>
  item.range?.includes("/") ? item.range : THROWN_RANGES[key(item.name)] ?? null;

/**
 * Ranged (ammunition) weapons key off DEX; finesse picks the better of the two;
 * everything else STR. Thrown weapons are NOT ranged for this purpose — RAW a
 * thrown javelin uses the same STR as a stab (slice E fix: a "30/120" range
 * used to misclassify thrown STR weapons as DEX).
 */
const attackAbility = (c: Character, item: InventoryItem): Ability => {
  const props = (item.properties ?? []).map(key);
  const ranged = props.includes("ammunition") || (!isThrown(item) && Boolean(item.range?.includes("/")));
  if (ranged) return "DEX";
  if (item.finesse || props.includes("finesse")) {
    return abilityModFor(c, "DEX") > abilityModFor(c, "STR") ? "DEX" : "STR";
  }
  return "STR";
};

const itemToAttack = (c: Character, item: InventoryItem): Attack => ({
  id: `inv-atk-${item.id}`,
  name: item.name,
  ability: attackAbility(c, item),
  proficient: isProficientWith(c, item),
  damage: item.damage ?? "1d4",
  damageType: item.damageType,
  // A thrown-melee weapon's base tile is the STAB — reach, not the throw range
  // (the separate Throw tile carries that; see resolveAttacks).
  range: isThrown(item) ? "5 ft" : item.range,
  notes: item.properties?.join(", "),
  itemId: item.id,
});

/**
 * The Throw variant of a thrown weapon (slice E): same ability as the melee
 * use (that's what Thrown means), the item's 20/60-style range, and it
 * CONSUMES the item — the resolver removes it from inventory and drops it at
 * the target's cell as a ground pickup.
 */
const itemToThrow = (c: Character, item: InventoryItem): Attack => ({
  id: `inv-throw-${item.id}`,
  name: `Throw ${item.name}`,
  ability: attackAbility(c, item),
  proficient: isProficientWith(c, item),
  damage: item.damage ?? "1d4",
  damageType: item.damageType,
  range: throwRange(item) ?? undefined,
  notes: "thrown — leaves your hand",
  itemId: item.id,
  thrown: true,
});

/**
 * The Unarmed Strike every creature always has (2024 rules): attack = STR mod +
 * proficiency, damage = 1 + STR mod bludgeoning, reach 5 ft. Modelled with the
 * "1d1" convention — a die that always rolls 1 — so it flows through the normal
 * roll pipeline and lands at 1 + STR (damageBonus adds the STR mod). See
 * damageLabel for how "1d1" renders as a plain number in the UI.
 */
export const unarmedStrike = (): Attack => ({
  id: "unarmed-strike",
  name: "Unarmed Strike",
  ability: "STR",
  proficient: true,
  damage: "1d1",
  damageType: "bludgeoning",
  range: "5 ft",
});

/**
 * The furthest an attack can reach, in feet, from a range/reach string. Ranged
 * or thrown weapons ("20/60", "range 60/240 ft") return their MAX (long) range;
 * melee ("5", "5 ft", "10 ft") return the reach. Null when there's no range info
 * (unrestricted — most spells for now). Drives the out-of-range check.
 */
export const attackRangeFt = (range?: string): number | null => {
  if (!range) return null;
  const r = range.trim();
  if (/^self/i.test(r)) return null; // Self / Self-AoE — not a single-target range
  if (/touch/i.test(r)) return 5; // Touch = adjacent (5 ft)
  if (/sight|unlimited|special|mile/i.test(r)) return null; // effectively no limit here
  const slash = r.match(/(\d+)\s*\/\s*(\d+)/); // weapon normal/long → use long
  if (slash) return parseInt(slash[2], 10);
  const n = r.match(/(\d+)/); // "5", "5 ft", "60 feet", "60 feet (5 ft. Sphere)"
  const v = n ? parseInt(n[1], 10) : 5;
  // "reach 0 ft" swarms attack creatures IN their space; on a grid two tokens
  // can't share a cell, so treat 0 as adjacent (5 ft) or they could never hit.
  return v === 0 ? 5 : v;
};

/** Human-readable damage. Unarmed's "1d1" convention shows as its flat total. */
export const damageLabel = (atk: Attack, dmgBonus: number): string => {
  if (atk.damage === "1d1") return `${1 + dmgBonus}`;
  return `${atk.damage}${dmgBonus > 0 ? `+${dmgBonus}` : dmgBonus < 0 ? `${dmgBonus}` : ""}`;
};

export const resolveAttacks = (c: Character): Attack[] => {
  const byName = new Map(c.inventory.map((i) => [key(i.name), i]));

  // Hide manual attacks whose backing item is stowed rather than wielded.
  const manual = c.attacks.filter((a) => {
    const item = byName.get(key(a.name));
    return !item || !isWeapon(item) || item.equipped;
  });

  // Equipped weapons the attack list doesn't already cover.
  const claimed = new Set(c.attacks.map((a) => key(a.name)));
  const derived = c.inventory
    .filter((i) => i.equipped && isWeapon(i) && !claimed.has(key(i.name)))
    .map((i) => itemToAttack(c, i));
  // Thrown weapons ALSO get a Throw tile (slice E) — same weapon, two uses.
  // Derived even when a manual attack claims the melee use (the manual entry
  // covers the stab, not the throw); skipped only if "Throw X" itself exists.
  const throwables = c.inventory
    .filter((i) => i.equipped && isWeapon(i) && isThrown(i) && throwRange(i) != null && !claimed.has(key(`Throw ${i.name}`)))
    .map((i) => itemToThrow(c, i));

  const list = [...manual, ...derived, ...throwables];
  // Everyone can always throw a punch — append it unless the sheet already has
  // its own (a Monk's enhanced Unarmed Strike, say).
  if (!list.some((a) => key(a.name) === "unarmed strike")) list.push(unarmedStrike());
  return list;
};
