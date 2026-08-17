import { crToNumber } from "./loot";

/**
 * Experience awarded for defeating a creature, by Challenge Rating. These are
 * the standard 5e XP-by-CR values — game statistics (facts), not flavor text —
 * so a Goblin (CR 1/4) is worth 50 XP everywhere.
 *
 * Keyed by the numeric CR (fractions as decimals). xpForCr() normalizes a
 * statblock's "1/4" | "8" string through crToNumber first.
 */
const XP_BY_CR: Record<number, number> = {
  0: 10,
  0.125: 25,
  0.25: 50,
  0.5: 100,
  1: 200,
  2: 450,
  3: 700,
  4: 1100,
  5: 1800,
  6: 2300,
  7: 2900,
  8: 3900,
  9: 5000,
  10: 5900,
  11: 7200,
  12: 8400,
  13: 10000,
  14: 11500,
  15: 13000,
  16: 15000,
  17: 18000,
  18: 20000,
  19: 22000,
  20: 25000,
  21: 33000,
  22: 41000,
  23: 50000,
  24: 62000,
  25: 75000,
  26: 90000,
  27: 105000,
  28: 120000,
  29: 135000,
  30: 155000,
};

/** XP for a creature of the given CR ("1/4", "8", 0.5, …). */
export const xpForCr = (cr: string | number | undefined): number => {
  const n = crToNumber(cr);
  if (XP_BY_CR[n] != null) return XP_BY_CR[n];
  // Between-table CRs (shouldn't happen for SRD) fall to the nearest lower rung.
  const rungs = Object.keys(XP_BY_CR).map(Number).sort((a, b) => a - b);
  let xp = 0;
  for (const r of rungs) {
    if (r <= n) xp = XP_BY_CR[r];
    else break;
  }
  return xp;
};

/** Split a total XP award across the party, rounded down per member. */
export const splitXp = (total: number, partySize: number): number =>
  partySize > 0 ? Math.floor(total / partySize) : 0;
