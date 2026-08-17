/**
 * Lazy-loader for the bundled PHB JSON files. Files live in /public/data
 * so Vite serves them directly without bundling — keeps the build small.
 */

import type { MonsterStatblock } from "../types/content";

export interface ClassData {
  primary_ability: string[];
  hit_die: 6 | 8 | 10 | 12;
  saves: string[];
  skill_choices: { count: number; list: string[] | "any" };
  armor: string[];
  weapons: string[];
  tools: string[];
  starting_gold: number;
  caster: "none" | "third" | "half" | "full" | "pact";
  complexity: string;
  level_features: Record<string, string[]>;
}

export interface SpeciesData {
  size: "Small" | "Medium" | "Large";
  speed: number;
  creature_type: string;
  traits: Array<{ name: string; desc: string }>;
}

export interface BackgroundData {
  ability_scores: string[];
  feat: string;
  skill_proficiencies: string[];
  tool_proficiency: string;
  equipment: string;
}

/** One spell. Mechanical fields only — no rules prose, deliberately. */
export interface SpellData {
  name: string;
  level: number; // 0 = cantrip
  school: string;
  classes: string[];
  casting_time: string;
  range: string;
  components: string;
  duration: string;
}

export interface ConditionData {
  effects: string[];
}

export interface FeatData {
  category: string; // "Origin" | "General" | …
  prerequisite: string | null;
  summary: string;
}

/**
 * The lookup tables from the rulebook. Indexed maps are keyed by level as a
 * string because they come straight from JSON.
 */
export interface TablesData {
  ability_modifiers: Record<string, number>;
  proficiency_bonus: Record<string, number>;
  experience: Record<string, number>;
  typical_dcs: Record<string, number>;
  point_buy_cost: Record<string, number>;
  standard_array: number[];
  hit_die_first_level: Record<string, number>;
  hp_per_level: Record<string, number>;
  /** [1st … 9th] slot counts, indexed by character level. */
  full_caster_slots: Record<string, number[]>;
  /** [1st … 5th] slot counts, indexed by character level. */
  half_caster_slots: Record<string, number[]>;
  /** Warlock pact magic: a number of slots, all at one level. */
  warlock_slots: Record<string, { slots: number; level: number }>;
  cover: Record<string, { ac_bonus: number | null; save_bonus: number | null; desc: string }>;
  travel_pace: Record<string, { per_minute_ft: number; per_hour_mi: number; per_day_mi: number }>;
  creature_size: Record<string, unknown>;
  skills: unknown;
  starting_at_higher_levels: unknown;
  asi_levels_default: number[];
  asi_levels_fighter: number[];
  asi_levels_rogue: number[];
}

const cache: Record<string, unknown> = {};

const fetchJson = async <T>(path: string): Promise<T> => {
  if (cache[path]) return cache[path] as T;
  const res = await fetch(path);
  if (!res.ok) throw new Error(`Failed to load ${path}: ${res.status}`);
  const data = await res.json();
  cache[path] = data;
  return data as T;
};

export const loadClasses = () => fetchJson<Record<string, ClassData>>("/data/classes.json");
export const loadSpecies = () => fetchJson<Record<string, SpeciesData>>("/data/species.json");
export const loadBackgrounds = () => fetchJson<Record<string, BackgroundData>>("/data/backgrounds.json");
export const loadSpells = () => fetchJson<SpellData[]>("/data/spells.json");
export const loadConditions = () => fetchJson<Record<string, ConditionData>>("/data/conditions.json");
export const loadFeats = () => fetchJson<Record<string, FeatData>>("/data/feats.json");
export const loadTables = () => fetchJson<TablesData>("/data/tables.json");
export const loadBestiary = () => fetchJson<MonsterStatblock[]>("/data/bestiary.json");
