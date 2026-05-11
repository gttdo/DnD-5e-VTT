/**
 * Lazy-loader for the bundled PHB JSON files. Files live in /public/data
 * so Vite serves them directly without bundling — keeps the build small.
 */

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
