import { findMonster } from "./bestiary";
import type { MonsterStatblock } from "../types/content";

/**
 * SRD humanoid "NPC" statblocks a DM can drop onto any NPC as its combat stats.
 * These are the generic NPC blocks from the SRD bestiary (all present in
 * public/data/bestiary.json) — a Guard's stats stand in for any town guard, a
 * Knight's for any armored warrior, and so on. Ordered roughly weakest→toughest
 * so the studio picker reads as a difficulty ramp.
 */
export const NPC_TEMPLATE_NAMES = [
  "Commoner",
  "Acolyte",
  "Guard",
  "Bandit",
  "Cultist",
  "Tribal Warrior",
  "Scout",
  "Thug",
  "Cult Fanatic",
  "Spy",
  "Bandit Captain",
  "Priest",
  "Berserker",
  "Veteran",
  "Knight",
  "Gladiator",
  "Druid",
  "Assassin",
  "Mage",
  "Noble",
  "Archmage",
];

/** The template blocks actually present in the loaded bestiary, in ramp order. */
export const npcTemplates = (bestiary: MonsterStatblock[] | null): MonsterStatblock[] =>
  NPC_TEMPLATE_NAMES.map((n) => findMonster(n, bestiary)).filter(
    (m): m is MonsterStatblock => !!m
  );
