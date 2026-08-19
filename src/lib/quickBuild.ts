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
 * Iconic level-1 starter loadouts per caster class — so a quick build hands new
 * players the spells they'd actually reach for (Fire Bolt, Magic Missile, Shield)
 * instead of the alphabetically-first ones. Ordered by preference; the picker
 * takes those present in the SRD dataset and tops up from the class list if a
 * loadout runs short, so the allotment is always filled.
 */
const RECOMMENDED_SPELLS: Record<string, { cantrips: string[]; spells: string[] }> = {
  Bard: {
    cantrips: ["Vicious Mockery", "Minor Illusion", "Mage Hand", "Prestidigitation"],
    spells: ["Healing Word", "Faerie Fire", "Charm Person", "Dissonant Whispers", "Thunderwave", "Cure Wounds"],
  },
  Cleric: {
    cantrips: ["Sacred Flame", "Guidance", "Spare the Dying", "Light", "Thaumaturgy"],
    spells: ["Cure Wounds", "Guiding Bolt", "Bless", "Healing Word", "Shield of Faith"],
  },
  Druid: {
    cantrips: ["Produce Flame", "Shillelagh", "Guidance", "Druidcraft", "Thorn Whip"],
    spells: ["Cure Wounds", "Faerie Fire", "Entangle", "Thunderwave", "Goodberry"],
  },
  Sorcerer: {
    cantrips: ["Fire Bolt", "Ray of Frost", "Prestidigitation", "Mage Hand", "Minor Illusion", "Light", "Shocking Grasp"],
    spells: ["Magic Missile", "Shield", "Chromatic Orb", "Burning Hands", "Thunderwave", "Mage Armor"],
  },
  Warlock: {
    cantrips: ["Eldritch Blast", "Chill Touch", "Mage Hand", "Prestidigitation", "Minor Illusion"],
    spells: ["Hex", "Charm Person", "Witch Bolt", "Armor of Agathys"],
  },
  Wizard: {
    cantrips: ["Fire Bolt", "Ray of Frost", "Mage Hand", "Prestidigitation", "Minor Illusion", "Light"],
    spells: ["Magic Missile", "Shield", "Mage Armor", "Burning Hands", "Sleep", "Detect Magic", "Thunderwave", "Chromatic Orb", "Feather Fall"],
  },
};

/**
 * Pick `count` spell names: take the preferred (iconic) ones that actually exist
 * in `available`, in order, then top up with any remaining available spells so the
 * allotment is always filled even if a preferred spell isn't in the dataset.
 */
const pickSpells = (available: string[], preferred: string[], count: number): string[] => {
  const byKey = new Map(available.map((n) => [n.toLowerCase(), n]));
  const chosen: string[] = [];
  const used = new Set<string>();
  const take = (name: string) => {
    const key = name.toLowerCase();
    if (used.has(key)) return;
    used.add(key);
    chosen.push(name);
  };
  for (const p of preferred) {
    if (chosen.length >= count) break;
    const match = byKey.get(p.toLowerCase());
    if (match) take(match);
  }
  for (const n of available) {
    if (chosen.length >= count) break;
    take(n);
  }
  return chosen.slice(0, count);
};

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

  // If the species has a lineage/ancestry, default to its first option so a quick
  // hero is complete; the player can change it on Review. (#148)
  const spData = data.species[species];
  const lineage = spData?.lineages ? Object.keys(spData.lineages)[0] : null;

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

  // Caster starter loadout: an iconic recommended set, topped up from the class
  // list if a recommended spell isn't in the dataset (see pickSpells).
  const allot = spellAllotment(className);
  let cantrips: string[] = [];
  let spells: string[] = [];
  if (allot) {
    const list = spellsForClass(data.spells, className);
    const rec = RECOMMENDED_SPELLS[className] ?? { cantrips: [], spells: [] };
    cantrips = pickSpells(list.filter((s) => s.level === 0).map((s) => s.name), rec.cantrips, allot.cantrips);
    spells = pickSpells(list.filter((s) => s.level === 1).map((s) => s.name), rec.spells, allot.spells);
  }

  return {
    ...emptyBuilderState(),
    name: name.trim(),
    className,
    background,
    species,
    lineage,
    abilityMethod: "standard",
    abilities,
    skillChoices,
    cantrips,
    spells,
    equipmentChoice: "A",
  };
};
