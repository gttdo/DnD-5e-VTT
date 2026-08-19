// Quickbuilder (#110, 4th-of-four creation methods): turn two choices — class and
// species — into a complete, ready-to-play level-1 BuilderState. Everything else
// (a sensible standard-array spread, a fitting background, the class's skill
// quota, a starter spell loadout for casters, and a starting kit) is auto-filled,
// then the wizard opens pre-filled at Review so the player can tweak or just
// create. Same hand-off shape as the PDF importer, so all the builder's
// validation and buildCharacter logic is reused as-is.

import type { Ability, SkillName } from "../types/character";
import type { ClassData, BackgroundData, SpeciesData, SpellData } from "../data/loader";
import { type BuilderState, emptyBuilderState, spellAllotment, STANDARD_ARRAY } from "./characterBuilder";
import { spellsForClass } from "./spellcasting";

/**
 * Standard-array priority per class — the order the 15/14/13/12/10/8 spread is
 * poured into ability scores. Primary attack/spellcasting stat first, then the
 * usual survivability/secondary picks. A quick, playable spread, not a min-max.
 */
const ABILITY_PRIORITY: Record<string, Ability[]> = {
  Barbarian: ["STR", "CON", "DEX", "WIS", "CHA", "INT"],
  Bard: ["CHA", "DEX", "CON", "WIS", "INT", "STR"],
  Cleric: ["WIS", "CON", "STR", "CHA", "DEX", "INT"],
  Druid: ["WIS", "CON", "DEX", "INT", "CHA", "STR"],
  Fighter: ["STR", "CON", "DEX", "WIS", "CHA", "INT"],
  Monk: ["DEX", "WIS", "CON", "STR", "INT", "CHA"],
  Paladin: ["STR", "CHA", "CON", "WIS", "DEX", "INT"],
  Ranger: ["DEX", "WIS", "CON", "STR", "INT", "CHA"],
  Rogue: ["DEX", "CON", "WIS", "CHA", "INT", "STR"],
  Sorcerer: ["CHA", "CON", "DEX", "WIS", "INT", "STR"],
  Warlock: ["CHA", "CON", "DEX", "WIS", "INT", "STR"],
  Wizard: ["INT", "CON", "DEX", "WIS", "CHA", "STR"],
};

/** A background whose ability trio flatters each class's primary stat. */
const CLASS_BACKGROUND: Record<string, string> = {
  Barbarian: "Soldier",
  Bard: "Entertainer",
  Cleric: "Acolyte",
  Druid: "Hermit",
  Fighter: "Soldier",
  Monk: "Wayfarer",
  Paladin: "Noble",
  Ranger: "Guide",
  Rogue: "Criminal",
  Sorcerer: "Charlatan",
  Warlock: "Charlatan",
  Wizard: "Sage",
};

/** A thematic default species per class (the player can change it first). */
export const CLASS_SPECIES: Record<string, string> = {
  Barbarian: "Goliath",
  Bard: "Human",
  Cleric: "Human",
  Druid: "Elf",
  Fighter: "Human",
  Monk: "Elf",
  Paladin: "Human",
  Ranger: "Elf",
  Rogue: "Halfling",
  Sorcerer: "Tiefling",
  Warlock: "Tiefling",
  Wizard: "Gnome",
};

const FALLBACK_PRIORITY: Ability[] = ["STR", "DEX", "CON", "INT", "WIS", "CHA"];

/**
 * Build a complete level-1 BuilderState from a class + species. Deterministic —
 * the same inputs always yield the same hero — so a quick build is repeatable and
 * the player can predict what they'll get before tweaking on Review.
 */
export const quickBuildState = (
  className: string,
  species: string,
  name: string,
  data: {
    classes: Record<string, ClassData>;
    backgrounds: Record<string, BackgroundData>;
    species: Record<string, SpeciesData>;
    spells: SpellData[];
  }
): BuilderState => {
  const cls = data.classes[className];
  const background = CLASS_BACKGROUND[className] ?? "Soldier";
  const bg = data.backgrounds[background];

  // Standard array poured in by class priority.
  const priority = ABILITY_PRIORITY[className] ?? FALLBACK_PRIORITY;
  const abilities = { STR: 10, DEX: 10, CON: 10, INT: 10, WIS: 10, CHA: 10 } as Record<Ability, number>;
  priority.forEach((ab, i) => {
    abilities[ab] = STANDARD_ARRAY[i] ?? 10;
  });

  // Class skills: take the quota off the class list, skipping any the chosen
  // background already grants (buildCharacter adds those separately).
  const bgSkills = new Set<string>(bg?.skill_proficiencies ?? []);
  const pool: string[] =
    cls?.skill_choices.list === "any"
      ? [] // "any" = free pick; leave for the player rather than guess
      : (cls?.skill_choices.list as string[] | undefined) ?? [];
  const skillChoices = pool
    .filter((s) => !bgSkills.has(s))
    .slice(0, cls?.skill_choices.count ?? 0) as SkillName[];

  // Caster starter loadout: the first cantrips/level-1 spells the class offers.
  const allot = spellAllotment(className);
  let cantrips: string[] = [];
  let spells: string[] = [];
  if (allot) {
    const list = spellsForClass(data.spells, className);
    cantrips = list
      .filter((s) => s.level === 0)
      .slice(0, allot.cantrips)
      .map((s) => s.name);
    spells = list
      .filter((s) => s.level === 1)
      .slice(0, allot.spells)
      .map((s) => s.name);
  }

  return {
    ...emptyBuilderState(),
    name: name.trim(),
    className,
    background,
    species,
    abilityMethod: "standard",
    abilities,
    skillChoices,
    cantrips,
    spells,
    equipmentChoice: "A",
  };
};
