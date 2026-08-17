/**
 * Damage resolution against a target's defenses — the "how much actually
 * lands" half of the combat loop.
 *
 * 2024 order of operations (confirmed against the rules): immunity zeroes the
 * damage; then any flat additions/subtractions; then ONE resistance halves it
 * (round down); then ONE vulnerability doubles it. Multiple instances of
 * resistance or vulnerability to the same type count only once — so this checks
 * a boolean, never a tally.
 *
 * Type matching is a case-insensitive substring test against the defense
 * entries, so "slashing" matches an entry like "bludgeoning, piercing, and
 * slashing". CAVEAT: conditional entries ("…from nonmagical attacks") are
 * matched by their damage word alone — we can't evaluate the magical/silvered
 * condition without more context, so this can over-apply. The DM can override
 * the final number; a later pass can surface the condition.
 */

export interface Defenses {
  resistances?: string[];
  immunities?: string[];
  vulnerabilities?: string[];
}

export interface DamageOutcome {
  /** Final damage after all adjustments (never below 0). */
  final: number;
  /** The rolled damage before defenses. */
  raw: number;
  immune: boolean;
  resisted: boolean;
  vulnerable: boolean;
  /** A short reason tag for the log, e.g. "resisted", "immune". */
  note: string | null;
}

const hasType = (list: string[] | undefined, type: string): boolean =>
  !!list && list.some((entry) => entry.toLowerCase().includes(type));

/**
 * Resolve rolled damage against defenses.
 * @param opts.reactionHalves a triggered reaction that halves the hit (e.g. a
 *   Rogue's Uncanny Dodge). Independent of resistance, applied before it — so
 *   the two can stack, which is correct RAW.
 */
export const resolveDamage = (
  raw: number,
  damageType: string | undefined,
  def: Defenses,
  opts?: { reactionHalves?: boolean }
): DamageOutcome => {
  const type = (damageType ?? "").trim().toLowerCase();
  const base = Math.max(0, Math.round(raw));

  if (type && hasType(def.immunities, type)) {
    return { final: 0, raw: base, immune: true, resisted: false, vulnerable: false, note: "immune" };
  }

  const resisted = !!type && hasType(def.resistances, type);
  const vulnerable = !!type && hasType(def.vulnerabilities, type);

  let dmg = base;
  if (opts?.reactionHalves) dmg = Math.floor(dmg / 2); // reaction (Uncanny Dodge, …)
  if (resisted) dmg = Math.floor(dmg / 2);
  if (vulnerable) dmg = dmg * 2;

  const note = opts?.reactionHalves && resisted ? "resisted + reaction"
    : resisted ? "resisted"
    : vulnerable ? "vulnerable"
    : opts?.reactionHalves ? "reaction"
    : null;

  return { final: Math.max(0, dmg), raw: base, immune: false, resisted, vulnerable, note };
};
