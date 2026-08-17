import type { Ability, Character, SkillName } from "../types/character";
import { abilityModFor, proficiencyBonus, skillAbility } from "./calc";
import { isWeapon } from "./attacks";
import { ABILITY_FULL } from "../types/character";

/**
 * Derivations that show their work.
 *
 * calc.ts answers "what is the value?"; this layer answers "where did it come
 * from?" — each stat as a list of labelled terms that sum to the total, for
 * the per-stat detail drawers (the sheet should teach the game, not just
 * store numbers). Every function here MUST agree with its calc.ts counterpart;
 * the terms are built FROM those helpers rather than re-deriving, so they
 * can't drift.
 */

export interface Term {
  label: string;
  value: number;
  /** Present when the term is a signed modifier rather than a base amount. */
  signed?: boolean;
}

export interface Breakdown {
  total: number;
  terms: Term[];
  /** Short caveats ("uses your stored AC — armor rules aren't modelled yet"). */
  notes?: string[];
}

const sum = (terms: Term[]) => terms.reduce((a, t) => a + t.value, 0);

// ---------------------------------------------------------------------------

export const initiativeBreakdown = (c: Character): Breakdown => {
  const terms: Term[] = [
    { label: "Dexterity modifier", value: abilityModFor(c, "DEX"), signed: true },
  ];
  if (c.initiativeBonus) {
    terms.push({ label: "Misc bonus", value: c.initiativeBonus, signed: true });
  }
  return { total: sum(terms), terms };
};

export const saveBreakdown = (c: Character, a: Ability): Breakdown => {
  const terms: Term[] = [
    { label: `${ABILITY_FULL[a]} modifier`, value: abilityModFor(c, a), signed: true },
  ];
  if (c.saveProficiencies.includes(a)) {
    terms.push({ label: "Proficiency bonus", value: proficiencyBonus(c.level), signed: true });
  }
  const extra = c.saveBonuses[a] ?? 0;
  if (extra) terms.push({ label: "Misc bonus", value: extra, signed: true });
  return { total: sum(terms), terms };
};

export const skillBreakdown = (c: Character, skill: SkillName): Breakdown => {
  const ability = skillAbility(skill);
  const terms: Term[] = [
    { label: `${ABILITY_FULL[ability]} modifier`, value: abilityModFor(c, ability), signed: true },
  ];
  const pb = proficiencyBonus(c.level);
  if (c.skillExpertise.includes(skill)) {
    terms.push({ label: "Expertise (2× proficiency)", value: pb * 2, signed: true });
  } else if (c.skillProficiencies.includes(skill)) {
    terms.push({ label: "Proficiency bonus", value: pb, signed: true });
  }
  const extra = c.skillBonuses[skill] ?? 0;
  if (extra) terms.push({ label: "Misc bonus", value: extra, signed: true });
  return { total: sum(terms), terms };
};

export const passiveBreakdown = (c: Character, skill: SkillName): Breakdown => {
  const skillPart = skillBreakdown(c, skill);
  return {
    total: 10 + skillPart.total,
    terms: [{ label: "Base", value: 10 }, ...skillPart.terms],
  };
};

/**
 * AC. The character stores a final AC (armor rules aren't modelled as data),
 * so the breakdown is honest about what it can and can't attribute:
 *  - override set → that's the whole story
 *  - equipped armor in inventory → attribute the stored value to it by name
 *  - otherwise, if the stored AC equals 10 + DEX, show the unarmored formula
 *  - failing that, a single "Stored AC" term with a note
 */
export const acBreakdown = (c: Character): Breakdown => {
  if (c.ac.override != null) {
    return {
      total: c.ac.override,
      terms: [{ label: "Manual override", value: c.ac.override }],
      notes: ["An override replaces the calculated value entirely."],
    };
  }
  const armor = c.inventory.find((i) => i.equipped && i.type === "armor");
  const dex = abilityModFor(c, "DEX");
  if (armor) {
    return {
      total: c.ac.value,
      terms: [{ label: armor.name, value: c.ac.value }],
      notes: armor.notes ? [armor.notes] : undefined,
    };
  }
  if (c.ac.value === 10 + dex) {
    return {
      total: c.ac.value,
      terms: [
        { label: "Base (unarmored)", value: 10 },
        { label: "Dexterity modifier", value: dex, signed: true },
      ],
    };
  }
  return {
    total: c.ac.value,
    terms: [{ label: "Stored AC", value: c.ac.value }],
    notes: ["Set on the sheet — no equipped armor to attribute it to."],
  };
};

export const speedBreakdown = (c: Character): Breakdown => ({
  total: c.speed,
  terms: [{ label: "Walking speed (species)", value: c.speed }],
});

export const profBreakdown = (c: Character): Breakdown => ({
  total: proficiencyBonus(c.level),
  terms: [{ label: `Character level ${c.level}`, value: proficiencyBonus(c.level), signed: true }],
});

/** Weapons currently wielded — context for the sheet's AC/attack drawers. */
export const equippedWeaponNames = (c: Character): string[] =>
  c.inventory.filter((i) => i.equipped && isWeapon(i)).map((i) => i.name);

export const formatTerm = (t: Term): string =>
  t.signed ? (t.value >= 0 ? `+${t.value}` : `${t.value}`) : `${t.value}`;
