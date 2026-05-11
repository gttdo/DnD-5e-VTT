import type {
  Ability,
  AbilityScore,
  Character,
  Feature,
  SkillName,
} from "../types/character";
import { ABILITIES } from "../types/character";
import type { BackgroundData, ClassData, SpeciesData } from "../data/loader";
import { abilityMod } from "./calc";

export const STANDARD_ARRAY = [15, 14, 13, 12, 10, 8] as const;

export const POINT_BUY_COST: Record<number, number> = {
  8: 0, 9: 1, 10: 2, 11: 3, 12: 4, 13: 5, 14: 7, 15: 9,
};
export const POINT_BUY_BUDGET = 27;

export const pointBuyCost = (score: number): number => POINT_BUY_COST[score] ?? Infinity;
export const pointBuyTotal = (scores: Record<Ability, number>): number =>
  ABILITIES.reduce((s, a) => s + pointBuyCost(scores[a]), 0);

export const ABILITY_FROM_FULL: Record<string, Ability> = {
  Strength: "STR",
  Dexterity: "DEX",
  Constitution: "CON",
  Intelligence: "INT",
  Wisdom: "WIS",
  Charisma: "CHA",
};

export type BuilderAbilityMethod = "standard" | "pointbuy" | "manual" | "rolled";

export interface BuilderState {
  name: string;
  portrait?: string;
  alignment: string;
  className: string | null;
  background: string | null;
  species: string | null;
  abilityMethod: BuilderAbilityMethod;
  abilities: Record<Ability, number>;
  /** Skills the player picked from the class's skill list */
  skillChoices: SkillName[];
  /** "A", "B", or "gold" — depends on class */
  equipmentChoice: "A" | "B" | "gold";
}

export const emptyBuilderState = (): BuilderState => ({
  name: "",
  alignment: "",
  className: null,
  background: null,
  species: null,
  abilityMethod: "standard",
  abilities: { STR: 10, DEX: 10, CON: 10, INT: 10, WIS: 10, CHA: 10 },
  skillChoices: [],
  equipmentChoice: "A",
});

/** Re-roll 4d6 drop lowest, 6 times. */
export const roll4d6DropLowest = (): number[] =>
  Array.from({ length: 6 }, () => {
    const dice = [1, 2, 3, 4].map(() => Math.floor(Math.random() * 6) + 1);
    dice.sort((a, b) => b - a);
    return dice[0] + dice[1] + dice[2];
  });

/**
 * Build a complete Character from the wizard state plus the loaded data.
 * Applies background ASIs, species speed, class HP/saves/skills/features.
 */
export const buildCharacter = (
  state: BuilderState,
  data: {
    classes: Record<string, ClassData>;
    species: Record<string, SpeciesData>;
    backgrounds: Record<string, BackgroundData>;
  }
): Character => {
  if (!state.className || !state.background || !state.species) {
    throw new Error("Builder is missing required selections");
  }
  const cls = data.classes[state.className];
  const sp = data.species[state.species];
  const bg = data.backgrounds[state.background];

  // Background grants +2/+1 (or three +1s — we apply +2 to first, +1 to second/third)
  // Player would normally pick the split; we apply the simplest 2/1: first +2, second +1.
  const bonuses: Partial<Record<Ability, number>> = {};
  const abilityFulls = bg.ability_scores ?? [];
  if (abilityFulls.length >= 1) {
    const a = ABILITY_FROM_FULL[abilityFulls[0]];
    if (a) bonuses[a] = (bonuses[a] ?? 0) + 2;
  }
  if (abilityFulls.length >= 2) {
    const a = ABILITY_FROM_FULL[abilityFulls[1]];
    if (a) bonuses[a] = (bonuses[a] ?? 0) + 1;
  }

  const abilities = ABILITIES.reduce(
    (acc, a) => {
      acc[a] = { base: state.abilities[a], bonus: bonuses[a] ?? 0 };
      return acc;
    },
    {} as Record<Ability, AbilityScore>
  );

  const conMod = abilityMod(abilities.CON.base + (abilities.CON.bonus ?? 0));
  const maxHp = cls.hit_die + conMod;

  const saveProficiencies: Ability[] = cls.saves
    .map((s) => ABILITY_FROM_FULL[s])
    .filter((a): a is Ability => !!a);

  // Skill proficiencies: class picks + background's 2 skills
  const skillProficiencies: SkillName[] = [
    ...state.skillChoices,
    ...(bg.skill_proficiencies as SkillName[]),
  ];

  // Level-1 class features as readable Feature entries
  const levelOneFeatureNames = cls.level_features["1"] ?? [];
  const features: Feature[] = levelOneFeatureNames.map((name, i) => ({
    id: `feat-${state.className?.toLowerCase()}-${i}`,
    name,
    source: "class",
    sourceDetail: `${state.className} 1`,
    description: `Class feature from ${state.className}. See PHB for full details.`,
  }));

  // Species traits → species features
  features.push(
    ...sp.traits.map((t, i) => ({
      id: `feat-species-${i}`,
      name: t.name,
      source: "species" as const,
      sourceDetail: state.species!,
      description: t.desc,
    }))
  );

  // Background feat
  features.push({
    id: `feat-bg-${state.background.toLowerCase()}`,
    name: bg.feat,
    source: "feat",
    sourceDetail: `${state.background} (Origin Feat)`,
    description: `Origin feat from ${state.background} background. See PHB Chapter 5.`,
  });

  // Combine tool/language profs
  const tools = new Set<string>([...cls.tools]);
  if (bg.tool_proficiency) tools.add(bg.tool_proficiency);

  return {
    id: crypto.randomUUID(),
    name: state.name || "Unnamed Hero",
    portrait: state.portrait,
    species: state.species,
    background: state.background,
    alignment: state.alignment || undefined,
    classes: [{ name: state.className, level: 1, hitDie: cls.hit_die }],
    level: 1,
    xp: 0,

    abilities,
    saveProficiencies,
    saveBonuses: {},

    skillProficiencies,
    skillExpertise: [],
    skillBonuses: {},

    hp: { current: maxHp, max: maxHp, temp: 0 },
    hitDiceUsed: 0,

    ac: { value: 10 + abilityMod(abilities.DEX.base + (abilities.DEX.bonus ?? 0)) },
    speed: sp.speed,
    initiativeBonus: 0,
    inspiration: state.species === "Human",

    conditions: [],
    defenses: { resistances: [], immunities: [], vulnerabilities: [] },

    attacks: [],
    inventory: [],
    currency:
      state.equipmentChoice === "gold"
        ? { cp: 0, sp: 0, ep: 0, gp: cls.starting_gold, pp: 0 }
        : { cp: 0, sp: 0, ep: 0, gp: 0, pp: 0 },

    features,

    proficiencies: {
      armor: cls.armor.map((a) => (a.endsWith("Armor") || a === "Shields" ? a : `${a} Armor`)),
      weapons: cls.weapons.map((w) => (w.endsWith("Weapons") ? w : `${w} Weapons`)),
      tools: Array.from(tools),
      languages: ["Common"], // simple default; species/background may add more
    },

    senses: {},

    notes: {
      backstory: state.equipmentChoice === "A"
        ? `Starting equipment (Option A from ${state.background}): ${bg.equipment}`
        : state.equipmentChoice === "gold"
          ? `Started with ${cls.starting_gold} GP to buy equipment.`
          : `Starting equipment (Option B from ${state.background}): ${bg.equipment}`,
    },
  };
};
