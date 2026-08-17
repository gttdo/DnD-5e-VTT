import type { Ability, Character, Feature } from "../types/character";
import type { ClassData, FeatData, TablesData } from "../data/loader";
import { abilityModFor } from "./calc";

/**
 * Level-up rules, pure and testable. The drawer builds a LevelUpPlan from the
 * player's choices; useCharacter.applyLevelUp() commits it in one update.
 *
 * Single-class for now: the plan levels classes[0]. Multiclassing needs its
 * own prerequisites table and is deliberately out of scope.
 */

export interface LevelUpPlan {
  className: string;
  newLevel: number;
  /** Total HP gained, CON modifier included, floored at 1. */
  hpGain: number;
  /** Class features gained at the new level (from classes.json). */
  newFeatures: Feature[];
  /** ASI path: which abilities go up and by how much (sums to at most 2). */
  abilityIncreases?: Partial<Record<Ability, number>>;
  /** Feat path: a General feat instead of the ability increase. */
  featName?: string;
  featSummary?: string;
}

export const nextLevelXp = (tables: TablesData | null, level: number): number | undefined =>
  tables?.experience?.[String(level + 1)];

/** XP-eligible for the next level. Milestone tables ignore this and level anyway. */
export const eligibleByXp = (c: Character, tables: TablesData | null): boolean => {
  const need = nextLevelXp(tables, c.level);
  return need !== undefined && c.xp >= need;
};

/** ASI levels for a class — Fighter and Rogue get extras. */
export const asiLevels = (className: string, tables: TablesData | null): number[] => {
  if (!tables) return [4, 8, 12, 16, 19];
  if (className === "Fighter") return tables.asi_levels_fighter;
  if (className === "Rogue") return tables.asi_levels_rogue;
  return tables.asi_levels_default;
};

export const isAsiLevel = (className: string, level: number, tables: TablesData | null): boolean =>
  asiLevels(className, tables).includes(level);

/** Fixed HP option: half the die rounded up, plus CON. Never less than 1. */
export const averageHpGain = (hitDie: number, conMod: number): number =>
  Math.max(1, hitDie / 2 + 1 + conMod);

export const rolledHpGain = (roll: number, conMod: number): number => Math.max(1, roll + conMod);

/** Features the class grants at exactly this level. */
export const featuresAtLevel = (
  className: string,
  level: number,
  classes: Record<string, ClassData> | null
): Feature[] => {
  const names = classes?.[className]?.level_features?.[String(level)] ?? [];
  return names.map((name, i) => ({
    id: `feat-${className.toLowerCase()}-l${level}-${i}`,
    name,
    source: "class" as const,
    sourceDetail: `${className} ${level}`,
    description: `Class feature gained at ${className} level ${level}. See PHB for full details.`,
  }));
};

/** General feats a level-up can pick (the +2 ASI path is presented separately). */
export const pickableFeats = (
  feats: Record<string, FeatData> | null
): Array<{ name: string; data: FeatData }> =>
  Object.entries(feats ?? {})
    .filter(([name, f]) => f.category === "General" && name !== "Ability Score Improvement")
    .map(([name, data]) => ({ name, data }));

/** Mutates a character draft with everything the plan grants. */
export const applyPlan = (d: Character, plan: LevelUpPlan): Character => {
  d.level = plan.newLevel;
  const entry = d.classes.find((cl) => cl.name === plan.className) ?? d.classes[0];
  if (entry) entry.level += 1;

  d.hp.max += plan.hpGain;
  d.hp.current += plan.hpGain; // levelling doesn't leave you wounded

  d.features = [...d.features, ...plan.newFeatures];

  if (plan.abilityIncreases) {
    for (const [ab, inc] of Object.entries(plan.abilityIncreases)) {
      if (!inc) continue;
      const score = d.abilities[ab as Ability];
      // 2024 caps ability scores at 20 for these increases.
      const room = Math.max(0, 20 - (score.base + score.bonus));
      score.bonus += Math.min(inc, room);
    }
  }

  if (plan.featName) {
    d.features = [
      ...d.features,
      {
        id: `feat-pick-l${plan.newLevel}-${plan.featName.toLowerCase().replace(/\s+/g, "-")}`,
        name: plan.featName,
        source: "feat",
        sourceDetail: `Chosen at level ${plan.newLevel}`,
        description: plan.featSummary ?? "General feat. See PHB for full details.",
      },
    ];
  }

  return d;
};

/** Convenience: CON modifier for HP math. */
export const conMod = (c: Character): number => abilityModFor(c, "CON");
