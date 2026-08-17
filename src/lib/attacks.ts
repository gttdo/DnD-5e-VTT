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

/** Ranged weapons and finesse weapons key off DEX; everything else STR. */
const attackAbility = (c: Character, item: InventoryItem): Ability => {
  const props = (item.properties ?? []).map(key);
  const ranged = Boolean(item.range?.includes("/")) || props.includes("ammunition");
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
  range: item.range,
  notes: item.properties?.join(", "),
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
  return n ? parseInt(n[1], 10) : 5;
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

  const list = [...manual, ...derived];
  // Everyone can always throw a punch — append it unless the sheet already has
  // its own (a Monk's enhanced Unarmed Strike, say).
  if (!list.some((a) => key(a.name) === "unarmed strike")) list.push(unarmedStrike());
  return list;
};
