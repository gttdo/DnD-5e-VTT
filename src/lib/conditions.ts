import type { Ability } from "../types/character";

/**
 * Mechanical effects of the 2024 conditions, so a condition badge on a token
 * actually changes what happens in play. Paraphrased from the SRD 5.2 (CC-BY);
 * the DM can always override. Only the effects the combat loop / HUD act on are
 * modeled here — the fuller prose lives in the rules reference.
 */

// Conditions we have library art for (public/icons/conditions/cond_<slug>.svg).
// A status reads at a glance from its glyph; anything else falls back to text.
const COND_ICONS = new Set([
  "banished", "blinded", "charmed", "deafened", "exhaustion", "frightened",
  "grappled", "incapacitated", "invisible", "paralyzed", "petrified", "poisoned",
  "prone", "restrained", "sleep", "stunned", "unconscious",
]);

/** Path to a condition's glyph, or null if we have no art for it. */
export const conditionGlyph = (name: string): string | null => {
  const slug = name.toLowerCase().trim().split(/[\s\d]+/)[0];
  return COND_ICONS.has(slug) ? `/icons/conditions/cond_${slug}.svg` : null;
};

export interface ConditionEffect {
  /** Can't take actions, bonus actions, or reactions. */
  incapacitated?: boolean;
  /** Speed becomes 0 (can't move). */
  speed0?: boolean;
  /** Attack rolls against this creature have advantage. */
  attackersAdvantage?: boolean;
  /** This creature's own attack rolls have disadvantage. */
  selfAttackDisadvantage?: boolean;
  /** Auto-fails Strength and Dexterity saving throws. */
  autoFailStrDex?: boolean;
  /** One-line effect summary for the HUD. */
  note: string;
}

const EFFECTS: Record<string, ConditionEffect> = {
  blinded: { attackersAdvantage: true, selfAttackDisadvantage: true, note: "Can't see; its attacks have disadvantage, attacks against it have advantage." },
  charmed: { note: "Can't attack the charmer or target them with harmful effects." },
  deafened: { note: "Can't hear; auto-fails hearing-based checks." },
  frightened: { selfAttackDisadvantage: true, note: "Disadvantage on checks & attacks while the source is in sight; can't move closer to it." },
  grappled: { speed0: true, note: "Speed 0; moves with the grappler." },
  incapacitated: { incapacitated: true, note: "Can't take actions, bonus actions, or reactions." },
  paralyzed: { incapacitated: true, speed0: true, attackersAdvantage: true, autoFailStrDex: true, note: "Incapacitated, can't move, auto-fails STR/DEX saves; attacks against it have advantage, and a melee hit within 5 ft is a crit." },
  petrified: { incapacitated: true, speed0: true, attackersAdvantage: true, autoFailStrDex: true, note: "Turned to stone: incapacitated, resistant to all damage, auto-fails STR/DEX saves." },
  poisoned: { selfAttackDisadvantage: true, note: "Disadvantage on attack rolls and ability checks." },
  prone: { selfAttackDisadvantage: true, attackersAdvantage: true, note: "Disadvantage on attacks; melee attacks against it have advantage, ranged have disadvantage." },
  restrained: { speed0: true, selfAttackDisadvantage: true, attackersAdvantage: true, autoFailStrDex: false, note: "Speed 0; disadvantage on attacks & DEX saves; attacks against it have advantage." },
  stunned: { incapacitated: true, speed0: true, attackersAdvantage: true, autoFailStrDex: true, note: "Incapacitated, can't move, auto-fails STR/DEX saves; attacks against it have advantage." },
  unconscious: { incapacitated: true, speed0: true, attackersAdvantage: true, autoFailStrDex: true, note: "Incapacitated & prone, unaware; auto-fails STR/DEX saves; attacks have advantage, melee within 5 ft crits." },
};

export const conditionEffect = (name: string): ConditionEffect | null => EFFECTS[name.toLowerCase()] ?? null;

/**
 * A stored condition entry may carry the ongoing save that ends it, encoded as
 * "paralyzed@WIS:13". Parse the base name (and, when present, the repeat-save
 * ability + DC) back out. Bare entries like "poisoned" parse to just a name.
 */
export interface ParsedCondition {
  name: string;
  save?: Ability;
  dc?: number;
}
export const parseCondition = (entry: string): ParsedCondition => {
  const at = entry.indexOf("@");
  if (at < 0) return { name: entry };
  const name = entry.slice(0, at);
  const m = /^([A-Za-z]{3}):(\d+)$/.exec(entry.slice(at + 1));
  if (!m) return { name };
  return { name, save: m[1].toUpperCase() as Ability, dc: parseInt(m[2], 10) };
};
/** Just the display/lookup name of a stored entry. */
export const conditionName = (entry: string): string => parseCondition(entry).name;

/** Aggregate the effects of a set of conditions into a single flag summary. */
export const aggregateConditions = (conditions: string[]) => {
  const agg = {
    incapacitated: false,
    speed0: false,
    attackersAdvantage: false,
    selfAttackDisadvantage: false,
    autoFailStrDex: false,
    notes: [] as { name: string; note: string }[],
  };
  for (const c of conditions) {
    const name = conditionName(c);
    const e = conditionEffect(name);
    if (!e) continue;
    agg.incapacitated ||= !!e.incapacitated;
    agg.speed0 ||= !!e.speed0;
    agg.attackersAdvantage ||= !!e.attackersAdvantage;
    agg.selfAttackDisadvantage ||= !!e.selfAttackDisadvantage;
    agg.autoFailStrDex ||= !!e.autoFailStrDex;
    agg.notes.push({ name, note: e.note });
  }
  return agg;
};

/** True if a paralyzed/etc. creature auto-fails this save. */
export const autoFailsSave = (conditions: string[], ability: Ability): boolean =>
  (ability === "STR" || ability === "DEX") && aggregateConditions(conditions).autoFailStrDex;
