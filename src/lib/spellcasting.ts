import type { Ability, Character } from "../types/character";
import type { ClassData, SpellData, TablesData } from "../data/loader";
import { abilityModFor, proficiencyBonus } from "./calc";

/**
 * Spellcasting rules, kept pure (no data fetching, no Supabase) so the maths
 * is testable. Callers hand in the loaded class/table data from useRules.
 */

/** Which ability a class casts with. */
const CASTING_ABILITY: Record<string, Ability> = {
  Bard: "CHA",
  Cleric: "WIS",
  Druid: "WIS",
  Paladin: "CHA",
  Ranger: "WIS",
  Sorcerer: "CHA",
  Warlock: "CHA",
  Wizard: "INT",
};

export const castingAbility = (className: string): Ability | null =>
  CASTING_ABILITY[className] ?? null;

/** The character's primary casting class, if any. */
export const casterClass = (
  c: Character,
  classes: Record<string, ClassData> | null
): { name: string; level: number; caster: ClassData["caster"] } | null => {
  if (!classes) return null;
  for (const entry of c.classes) {
    const data = classes[entry.name];
    if (data && data.caster !== "none") {
      return { name: entry.name, level: entry.level, caster: data.caster };
    }
  }
  return null;
};

/**
 * Slots available per spell level ("1"–"9") for a class level.
 * Full and half casters read their tables; pact magic is modelled as slots at
 * a single level. `third` casters (subclass-based) use the third-caster column
 * of the full table if present; we approximate with half progression rounded
 * down, which is right for the common levels and safely conservative elsewhere.
 */
export const slotsFor = (
  caster: ClassData["caster"],
  level: number,
  tables: TablesData | null
): Record<string, number> => {
  const out: Record<string, number> = {};
  if (!tables || caster === "none") return out;
  const key = String(level);

  if (caster === "full") {
    (tables.full_caster_slots[key] ?? []).forEach((n, i) => {
      if (n > 0) out[String(i + 1)] = n;
    });
  } else if (caster === "half" || caster === "third") {
    const eff = caster === "half" ? level : Math.floor(level / 2);
    (tables.half_caster_slots[String(Math.max(eff, 0))] ?? []).forEach((n, i) => {
      if (n > 0) out[String(i + 1)] = n;
    });
  } else if (caster === "pact") {
    const pact = tables.warlock_slots[key];
    if (pact) out[String(pact.level)] = pact.slots;
  }
  return out;
};

export const spellSaveDC = (c: Character, className: string): number | null => {
  const ability = castingAbility(className);
  if (!ability) return null;
  return 8 + proficiencyBonus(c.level) + abilityModFor(c, ability);
};

export const spellAttackBonus = (c: Character, className: string): number | null => {
  const ability = castingAbility(className);
  if (!ability) return null;
  return proficiencyBonus(c.level) + abilityModFor(c, ability);
};

/** Spells castable by the given class, cantrips first then by level/name. */
export const spellsForClass = (spells: SpellData[], className: string): SpellData[] =>
  spells
    .filter((s) => s.classes.includes(className))
    .sort((a, b) => a.level - b.level || a.name.localeCompare(b.name));

export const emptySpellcasting = () => ({ known: [], prepared: [], slotsUsed: {} });

/**
 * Sorcery Points (#97). A Sorcerer's Font of Magic pool arrives at level 2 and
 * equals the Sorcerer class level (2024). Returns null for non-sorcerers and
 * level-1 sorcerers (who have no pool yet). Spent points live on the character
 * (`sorceryPointsUsed`) and reset on a Long Rest.
 */
export const sorceryPoints = (c: Character): { max: number; current: number } | null => {
  const sorc = c.classes.find((cl) => cl.name === "Sorcerer");
  if (!sorc || sorc.level < 2) return null;
  const max = Math.min(sorc.level, 20);
  return { max, current: Math.max(0, max - (c.sorceryPointsUsed ?? 0)) };
};

/** Cost in Sorcery Points to cast a spell as a Bonus Action via Quickened Spell. */
export const QUICKEN_COST = 2;
