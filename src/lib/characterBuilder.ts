import type {
  Ability,
  AbilityScore,
  Character,
  Feature,
  SkillName,
} from "../types/character";
import { ABILITIES } from "../types/character";
import type { BackgroundData, ClassData, SpeciesData } from "../data/loader";
import { abilityMod, proficiencyBonus } from "./calc";
import { startingInventory } from "./startingEquipment";

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
  /** Chosen subrace/lineage/ancestry when the species offers one (#148). */
  lineage: string | null;
  abilityMethod: BuilderAbilityMethod;
  abilities: Record<Ability, number>;
  /** Skills the player picked from the class's skill list */
  skillChoices: SkillName[];
  /** Cantrips + level-1 spells chosen (by name) for a caster at level 1. */
  cantrips: string[];
  spells: string[];
  /** "A", "B", or "gold" — depends on class */
  equipmentChoice: "A" | "B" | "gold";
}

/**
 * Level-1 spell allotment per class (2014 SRD). Only the classes that actually
 * cast at level 1 appear — half-casters (Paladin, Ranger) get no spells until
 * level 2, and third-casters key off a subclass, so both are omitted. `prepares`
 * marks the prepared casters (their starting picks are a loadout the player can
 * re-prepare later on the sheet, not a fixed "known" list).
 */
export const SPELL_ALLOTMENT: Record<string, { cantrips: number; spells: number; prepares: boolean }> = {
  Bard: { cantrips: 2, spells: 4, prepares: false },
  Cleric: { cantrips: 3, spells: 2, prepares: true },
  Druid: { cantrips: 2, spells: 2, prepares: true },
  Sorcerer: { cantrips: 4, spells: 2, prepares: false },
  Warlock: { cantrips: 2, spells: 2, prepares: false },
  Wizard: { cantrips: 3, spells: 6, prepares: true },
};
export const spellAllotment = (className: string | null) =>
  className ? SPELL_ALLOTMENT[className] ?? null : null;

export const emptyBuilderState = (): BuilderState => ({
  name: "",
  alignment: "",
  className: null,
  background: null,
  species: null,
  lineage: null,
  abilityMethod: "standard",
  abilities: { STR: 10, DEX: 10, CON: 10, INT: 10, WIS: 10, CHA: 10 },
  skillChoices: [],
  cantrips: [],
  spells: [],
  equipmentChoice: "A",
});

/**
 * The shape the `parse-character-pdf` edge function returns (Import-from-PDF,
 * #110). Class/species/background are already clamped server-side to the app's
 * allowed values (or null when unreadable); abilities are the FINAL sheet scores.
 */
export interface ImportedCharacter {
  name: string;
  className: string | null;
  species: string | null;
  lineage?: string | null;
  background: string | null;
  alignment?: string;
  abilities: Record<Ability, number>;
  skillProficiencies: SkillName[];
  cantrips: string[];
  spells: string[];
  confidence?: Record<string, number>;
}

/**
 * Map an imported sheet onto a BuilderState so the wizard can open pre-filled at
 * Review. Two reconciliations matter: (1) the PDF shows FINAL ability scores but
 * buildCharacter re-applies the background's +2/+1, so we subtract that here to
 * avoid double-counting; (2) skillProficiencies includes the background's own
 * skills, which buildCharacter also re-adds, so we drop those from the class picks.
 */
export const importedToBuilderState = (
  imp: ImportedCharacter,
  backgrounds: Record<string, BackgroundData> | null
): BuilderState => {
  const bg = imp.background && backgrounds ? backgrounds[imp.background] : null;
  const fulls = bg?.ability_scores ?? [];
  const bonuses: Partial<Record<Ability, number>> = {};
  const a0 = fulls[0] ? ABILITY_FROM_FULL[fulls[0]] : undefined;
  const a1 = fulls[1] ? ABILITY_FROM_FULL[fulls[1]] : undefined;
  if (a0) bonuses[a0] = (bonuses[a0] ?? 0) + 2;
  if (a1) bonuses[a1] = (bonuses[a1] ?? 0) + 1;

  const abilities = ABILITIES.reduce((acc, a) => {
    acc[a] = Math.max(3, Math.min(20, (imp.abilities?.[a] ?? 10) - (bonuses[a] ?? 0)));
    return acc;
  }, {} as Record<Ability, number>);

  const bgSkills = new Set<string>(bg?.skill_proficiencies ?? []);
  const skillChoices = (imp.skillProficiencies ?? []).filter((s) => !bgSkills.has(s));

  return {
    ...emptyBuilderState(),
    name: imp.name || "",
    alignment: imp.alignment || "",
    className: imp.className,
    background: imp.background,
    species: imp.species,
    lineage: imp.lineage ?? null,
    abilityMethod: "manual",
    abilities,
    skillChoices,
    cantrips: imp.cantrips ?? [],
    spells: imp.spells ?? [],
    equipmentChoice: "A",
  };
};

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
    /** Optional: real feat text from feats.json for the origin feat card. */
    feats?: Record<string, { category: string; prerequisite: string | null; summary: string }>;
  }
): Character => {
  if (!state.className || !state.background || !state.species) {
    throw new Error("Builder is missing required selections");
  }
  const cls = data.classes[state.className];
  const sp = data.species[state.species];
  const bg = data.backgrounds[state.background];
  // Chosen subrace/lineage/ancestry, if the species offers one (#148).
  const lin = state.lineage && sp.lineages ? sp.lineages[state.lineage] : null;

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

  // Lineage traits → features tagged with the lineage (e.g. "Elf (Drow)") (#148).
  const lineageLabel = state.lineage ? `${state.species} (${state.lineage})` : state.species!;
  if (lin?.traits) {
    features.push(
      ...lin.traits.map((t, i) => ({
        id: `feat-lineage-${i}`,
        name: t.name,
        source: "species" as const,
        sourceDetail: lineageLabel,
        description: t.desc,
      }))
    );
  }

  // Innate lineage spells gained by this character level (level 1 → the "1" set).
  // Kept both in `known` (so they list on the sheet) and in a dedicated `innate`
  // record with their casting ability (so slice 2 can give them a save DC even
  // for non-casters). #148
  const innateSpells: string[] = [];
  if (lin?.spells) {
    for (const [lvl, names] of Object.entries(lin.spells)) {
      if (Number(lvl) <= 1) innateSpells.push(...(Array.isArray(names) ? names : [names]));
    }
  }

  // Damage resistance from a lineage/legacy (Tiefling, Dragonborn ancestry).
  const resistances = lin?.resistance ? [lin.resistance] : [];

  // Darkvision (lineage override wins) surfaced as a sense line.
  const darkvision = lin?.darkvision ?? sp.darkvision;

  const casterAllot = SPELL_ALLOTMENT[state.className];
  const classSpells = casterAllot ? [...state.cantrips, ...state.spells] : [];
  const allKnown = [...classSpells, ...innateSpells];
  const spellcasting =
    casterAllot || innateSpells.length
      ? {
          known: allKnown,
          prepared: allKnown,
          slotsUsed: {},
          concentratingOn: null,
          ...(innateSpells.length
            ? { innate: { ability: (lin?.spell_ability ?? "CHA") as Ability, spells: innateSpells } }
            : {}),
        }
      : undefined;

  // Background feat. backgrounds.json names it with a variant suffix
  // ("Magic Initiate (Cleric)") while feats.json is keyed by the base name —
  // strip the parenthetical to look up the real summary.
  const baseFeatName = bg.feat.replace(/\s*\(.*\)$/, "");
  const featData = data.feats?.[baseFeatName];
  features.push({
    id: `feat-bg-${state.background.toLowerCase()}`,
    name: bg.feat,
    source: "feat",
    sourceDetail: `${state.background} (Origin Feat)`,
    description:
      featData?.summary ?? `Origin feat from ${state.background} background. See PHB Chapter 5.`,
  });

  // Activated lineage/ancestry traits → limited-use features so the combat HUD
  // surfaces them as spendable trait tiles (#148 slice 3). Both refresh on a Long
  // Rest, Proficiency Bonus times (PB = 2 at level 1).
  const pb = proficiencyBonus(1);
  if (state.species === "Dragonborn" && lin?.damage_type) {
    // Fold the ancestry's damage type into the Breath Weapon name so the HUD's
    // trait spec (which keys off the name) rolls the right element, and give it
    // its PB/long-rest uses so it appears as a tile.
    const bw = features.find((f) => f.name === "Breath Weapon");
    if (bw) {
      bw.name = `Breath Weapon (${lin.damage_type})`;
      bw.uses = { max: pb, current: pb, recharge: "long" };
    }
  }
  if (state.species === "Goliath" && lin?.traits) {
    // The chosen giant boon (Cloud's Jaunt, Fire's Burn…) becomes a spendable use.
    const boonNames = new Set(lin.traits.map((t) => t.name));
    for (const f of features) {
      if (boonNames.has(f.name)) f.uses = { max: pb, current: pb, recharge: "long" };
    }
  }

  // Combine tool/language profs
  const tools = new Set<string>([...cls.tools]);
  if (bg.tool_proficiency) tools.add(bg.tool_proficiency);

  return {
    id: crypto.randomUUID(),
    name: state.name || "Unnamed Hero",
    portrait: state.portrait,
    species: state.species,
    lineage: state.lineage ?? undefined,
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
    speed: lin?.speed ?? sp.speed,
    initiativeBonus: 0,
    inspiration: state.species === "Human",

    conditions: [],
    defenses: { resistances, immunities: [], vulnerabilities: [] },

    attacks: [],
    // Real starting gear (#110): the "gold" option gives coin to shop with; any
    // other choice materializes the class kit — a primary weapon comes in
    // equipped, so it lands in the character's Actions right away.
    inventory: state.equipmentChoice === "gold" ? [] : startingInventory(state.className),
    // Level-1 spellcasting from the Spells step (casters) plus any innate lineage
    // spells (#148). Everything starts available; prepared casters re-prepare on
    // the sheet. Built above so non-casters with an innate cantrip still get a
    // spellcasting block. (#110/#148)
    spellcasting,
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

    senses: darkvision ? { other: [`Darkvision ${darkvision} ft.`] } : {},

    notes: {
      backstory: state.equipmentChoice === "A"
        ? `Starting equipment (Option A from ${state.background}): ${bg.equipment}`
        : state.equipmentChoice === "gold"
          ? `Started with ${cls.starting_gold} GP to buy equipment.`
          : `Starting equipment (Option B from ${state.background}): ${bg.equipment}`,
    },
  };
};
