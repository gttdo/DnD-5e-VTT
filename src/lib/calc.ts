import type { Ability, Character, SkillName } from "../types/character";
import { SKILLS } from "../types/character";

export const abilityMod = (score: number): number => Math.floor((score - 10) / 2);

export const abilityScore = (c: Character, a: Ability): number => {
  const s = c.abilities[a];
  if (s.override != null) return s.override;
  return s.base + s.bonus;
};

export const abilityModFor = (c: Character, a: Ability): number =>
  abilityMod(abilityScore(c, a));

export const proficiencyBonus = (level: number): number => {
  if (level >= 17) return 6;
  if (level >= 13) return 5;
  if (level >= 9) return 4;
  if (level >= 5) return 3;
  return 2;
};

export const saveBonus = (c: Character, a: Ability): number => {
  const pb = proficiencyBonus(c.level);
  const profPart = c.saveProficiencies.includes(a) ? pb : 0;
  const extra = c.saveBonuses[a] ?? 0;
  return abilityModFor(c, a) + profPart + extra;
};

export const skillAbility = (skill: SkillName): Ability =>
  SKILLS.find((s) => s.name === skill)!.ability as Ability;

export const skillBonus = (c: Character, skill: SkillName): number => {
  const ability = skillAbility(skill);
  const pb = proficiencyBonus(c.level);
  const prof = c.skillProficiencies.includes(skill);
  const exp = c.skillExpertise.includes(skill);
  const profPart = exp ? pb * 2 : prof ? pb : 0;
  const extra = c.skillBonuses[skill] ?? 0;
  return abilityModFor(c, ability) + profPart + extra;
};

export const passivePerception = (c: Character): number =>
  10 + skillBonus(c, "Perception");

export const passiveInvestigation = (c: Character): number =>
  10 + skillBonus(c, "Investigation");

export const passiveInsight = (c: Character): number =>
  10 + skillBonus(c, "Insight");

export const initiative = (c: Character): number =>
  abilityModFor(c, "DEX") + (c.initiativeBonus || 0);

export const attackBonus = (
  c: Character,
  attack: { ability: Ability; proficient: boolean; bonusToHit?: number }
): number => {
  const pb = proficiencyBonus(c.level);
  return (
    abilityModFor(c, attack.ability) +
    (attack.proficient ? pb : 0) +
    (attack.bonusToHit ?? 0)
  );
};

export const damageBonus = (
  c: Character,
  attack: { ability: Ability; bonusToDamage?: number }
): number => abilityModFor(c, attack.ability) + (attack.bonusToDamage ?? 0);

export const formatMod = (n: number): string => (n >= 0 ? `+${n}` : `${n}`);

export const totalWeight = (c: Character): number =>
  c.inventory
    .filter((i) => (i.qty ?? 0) > 0)
    .reduce((sum, i) => sum + (i.weight ?? 0) * (i.qty ?? 1), 0);

export const carryingCapacity = (c: Character): number =>
  abilityScore(c, "STR") * 15;
