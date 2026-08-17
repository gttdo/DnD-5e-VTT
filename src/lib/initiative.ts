import type { Token } from "../state/useTokens";

/**
 * Pure turn-order logic, kept out of the hook so it can be tested without a
 * Supabase client (importing the hook pulls in import.meta.env and dies
 * outside Vite). The hook owns persistence; this owns the rules.
 */

const byInitiative = (a: Token, b: Token) => {
  const d = (b.initiative ?? 0) - (a.initiative ?? 0);
  // Stable tie-break so every client renders the same order. (5e breaks ties
  // by DEX; tokens don't carry ability scores, so name is the honest fallback.)
  return d !== 0 ? d : a.label.localeCompare(b.label);
};

/** Combatants for a scene: those with a score, highest first.
 *  Loose != guards against BOTH null (rolled off) and undefined (rows read
 *  before migration 0008 added the column) — with a strict !== null check,
 *  a pre-migration database enrolled every token with a blank score. */
export const initiativeOrder = (tokens: Token[]): Token[] =>
  // Props and spell areas aren't combatants — only creatures take turns.
  tokens.filter((t) => t.initiative != null && t.kind !== "prop" && t.kind !== "spell").sort(byInitiative);

/**
 * Whose turn it is. turn_index is stored raw, so it can outrun the order when
 * a combatant is removed mid-fight — wrap it rather than showing nobody.
 */
export const activeAt = (order: Token[], turnIndex: number): Token | null => {
  if (order.length === 0) return null;
  const i = ((turnIndex % order.length) + order.length) % order.length;
  return order[i];
};

/**
 * Next/previous turn. Wrapping forward past the last combatant starts a new
 * round; wrapping backward returns to the previous one. Returns null when the
 * move isn't allowed (no combatants, or trying to reverse out of round 1).
 */
export const advanceTurn = (
  turnIndex: number,
  round: number,
  count: number,
  dir: 1 | -1
): { turn_index: number; round: number } | null => {
  if (count <= 0) return null;
  const i = turnIndex + dir;
  if (i >= count) return { turn_index: 0, round: round + 1 };
  if (i < 0) {
    if (round <= 1) return null;
    return { turn_index: count - 1, round: round - 1 };
  }
  return { turn_index: i, round };
};
