import type { MonsterStatblock } from "../types/content";

/**
 * Bestiary lookup — "known first" half of the stat pipeline.
 *
 * A creator names a creature; if it's a known SRD monster we return its real
 * statblock straight from the bundled dataset (no LLM, no latency, correct
 * numbers). Anything not found falls through to generation. Matching is
 * name-insensitive and tolerant of a leading article ("a goblin", "the ogre").
 */

const normalize = (s: string): string =>
  s
    .trim()
    .toLowerCase()
    .replace(/^(a|an|the)\s+/, "")
    .replace(/[^a-z0-9 ]/g, "")
    .replace(/\s+/g, " ");

/** Exact (normalized) match for a creature name in the bestiary. */
export const findMonster = (
  name: string,
  bestiary: MonsterStatblock[] | null
): MonsterStatblock | null => {
  if (!bestiary || !name.trim()) return null;
  const key = normalize(name);
  return bestiary.find((m) => normalize(m.name) === key) ?? null;
};

/** Fuzzy contains-match — for a "did you mean" suggestion when no exact hit. */
export const searchMonsters = (
  query: string,
  bestiary: MonsterStatblock[] | null,
  limit = 6
): MonsterStatblock[] => {
  if (!bestiary || !query.trim()) return [];
  const key = normalize(query);
  return bestiary
    .filter((m) => normalize(m.name).includes(key))
    .slice(0, limit);
};
