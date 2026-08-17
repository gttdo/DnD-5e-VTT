import { roll, rollD20, type RollResult } from "./dice";
import { attackBonus, damageBonus, saveBonus, skillBonus, abilityModFor } from "./calc";
import { ABILITY_FULL, type Ability, type Attack, type Character, type SkillName } from "../types/character";
import type { SpellAreaShape } from "../types/content";

/**
 * The roll pipeline — the whole point of the in-game HUD.
 *
 * calc.ts answers "what's the bonus?"; dice.ts answers "roll NdM"; this layer
 * ties them together into the *actions a creature takes*, so every rollable
 * control in the HUD and its modals goes through one place. That keeps the
 * game's rules (crit doubles the damage dice, a natural 1 misses, a save adds
 * proficiency) defined once instead of re-implemented per button.
 *
 * Everything here is pure and returns plain, serialisable data — a `RollEntry`
 * is `{ label, result }` where `result` is dice.ts's `RollResult`. That matters
 * because these entries are what we push to the shared game log AND broadcast to
 * the rest of the table (see state/useTableRolls) — so they must survive
 * JSON.stringify with no methods or class instances.
 */

export type RollMode = "normal" | "adv" | "dis";

/** How a result reads on the board — a plain roll, a crit, or a fumble. */
export type RollTone = "normal" | "crit" | "fumble";

/**
 * A ready-to-resolve attack, handed from a HUD's attack button to the combat
 * resolver. Bonus + damage are already computed (from a character's weapon or a
 * monster's statblock), so the resolver just needs a target.
 */
export interface AttackSpec {
  label: string;
  attackBonus: number;
  damage?: string; // dice, e.g. "1d12+4"
  damageType?: string;
  /** A healing action instead of an attack — dice expr, e.g. "1d8+3". When set,
   *  the resolver skips the to-hit roll and restores HP to the chosen target
   *  (which may be the caster's own token). */
  heal?: string;
  /** A save-or-be-conditioned spell (e.g. Hold Person). The target rolls `save`
   *  vs `dc`; on a failure the resolver puts `condition` on the target token. */
  condition?: string;
  save?: Ability;
  dc?: number;
  /** Creature-type restriction (e.g. Hold Person → "humanoid"); the save never
   *  fires against a target whose statblock type doesn't match. */
  restrictType?: string;
  /** The weapon/attack's reach or range, verbatim from the source ("5", "5 ft",
   *  "20/60", "range 60/240 ft"). Drives the out-of-range check at target time;
   *  absent → unrestricted (e.g. most spells for now). */
  range?: string;
  /** A restoration effect — condition slugs to remove from the target (Lesser
   *  Restoration, antitoxin…). No to-hit; the resolver strips matching badges. */
  cleanse?: string[];
  /** Auto-hit spell (Magic Missile): the resolver skips the to-hit roll and the
   *  Shield window, applying damage on the projectile's arrival. */
  autoHit?: boolean;
  /** Board VFX key — plays this sprite from caster → target on cast (see SpellFx). */
  vfx?: string;
  /** Aimed area spell (Cone of Cold): the resolver plays an anchored burst from
   *  the caster toward the target and announces the save damage (no auto-apply —
   *  a cone catches a wedge of creatures for the DM to adjudicate). */
  burst?: boolean;
  /** A LINGERING area spell (Web, Wall of Fire…): instead of a one-shot burst,
   *  the resolver drops a persistent area token at the aimed point. `movable`
   *  marks the rare relocatable areas (Moonbeam). */
  placeArea?: { shape: SpellAreaShape; size: number; damageType?: string; level?: number; movable?: boolean };
}

/** One line for the dice log: a human label plus the raw dice result. */
export interface RollEntry {
  label: string;
  result: RollResult;
}

/**
 * An OPTIONAL bonus die the roller can choose to add at roll time — Guidance,
 * Bless, a Bardic Inspiration die. These aren't baked into a creature's sheet
 * (they come and go with buffs the table narrates), so rather than track every
 * source we surface them as toggles in the dice dialog: the player flips on the
 * ones in effect and the die rolls them into the total. `dice` is any
 * dice.ts expression (e.g. "1d4").
 */
export interface OptionalBonus {
  id: string;
  label: string;
  dice: string;
  note?: string;
}

/** The roll categories that admit optional buffs, and which buffs apply to each
 *  (per the 2024 rules: Guidance → ability checks, Bless → attacks & saves,
 *  Bardic Inspiration → any of the three). */
export type BuffKind = "check" | "save" | "attack";

const GUIDANCE: OptionalBonus = { id: "guidance", label: "Guidance", dice: "1d4", note: "cantrip on the check" };
const BLESS: OptionalBonus = { id: "bless", label: "Bless", dice: "1d4", note: "while blessed" };
const BARDIC: OptionalBonus = { id: "bardic", label: "Bardic Inspiration", dice: "1d6", note: "spend if you hold one" };

export const optionalBonusesFor = (kind: BuffKind): OptionalBonus[] =>
  kind === "check" ? [GUIDANCE, BARDIC] : [BLESS, BARDIC];

/**
 * The natural d20 face that decides crit/fumble — *after* advantage/disadvantage
 * has picked which die counts. On a normal roll that's the single die; with
 * adv/dis it's the kept die, never the dropped one.
 */
export const naturalD20 = (r: RollResult): number =>
  r.kept && r.kept.length ? r.kept[0] : r.rolls[0] ?? 0;

/** Double only the DICE of a damage expression, never the flat modifier. */
const doubleDice = (expr: string): string =>
  expr.replace(/^(\d+)d(\d+)/i, (_, n: string, s: string) => `${parseInt(n, 10) * 2}d${s}`);

/** "1d12" + STR damage → "1d12+4" (matches ActionsPanel's expression). */
const damageExpr = (c: Character, atk: Attack): string => {
  const mod = damageBonus(c, atk);
  return mod === 0 ? atk.damage : `${atk.damage}${mod >= 0 ? "+" : ""}${mod}`;
};

export interface AttackOutcome {
  /** to-hit first, then damage — damage is omitted on a natural 1. */
  entries: RollEntry[];
  crit: boolean;
  fumble: boolean;
}

/**
 * A weapon/spell attack: roll to hit, then damage. A natural 20 doubles the
 * damage dice; a natural 1 is a miss and rolls no damage at all (both are the
 * table's rules, applied here so no caller has to remember them).
 */
export const attackRoll = (c: Character, atk: Attack, mode: RollMode = "normal"): AttackOutcome => {
  const hit = rollD20(attackBonus(c, atk), mode);
  const nat = naturalD20(hit);
  const crit = nat === 20;
  const fumble = nat === 1;

  const entries: RollEntry[] = [{ label: `${atk.name} — to hit`, result: hit }];
  if (!fumble) {
    const base = damageExpr(c, atk);
    // Unarmed Strike ("1d1") has no real damage dice, so a crit doubles nothing.
    const dmg = roll(crit && atk.damage !== "1d1" ? doubleDice(base) : base);
    entries.push({
      label: `${atk.name} — damage${atk.damageType ? " " + atk.damageType : ""}${crit ? " (crit ×2 dice)" : ""}`,
      result: dmg,
    });
  }
  return { entries, crit, fumble };
};

/**
 * An attack whose to-hit bonus and damage are already computed — a monster's
 * statblock action (e.g. Greatsword +9, 6d6+6). Same crit/fumble rules as
 * attackRoll, but no Character needed.
 */
export const rawAttackRoll = (
  label: string,
  attackBonus: number,
  damage?: string,
  mode: RollMode = "normal"
): AttackOutcome => {
  const hit = rollD20(attackBonus, mode);
  const nat = naturalD20(hit);
  const crit = nat === 20;
  const fumble = nat === 1;
  const entries: RollEntry[] = [{ label: `${label} — to hit`, result: hit }];
  if (!fumble && damage) {
    const dmg = roll(crit ? doubleDice(damage) : damage);
    entries.push({ label: `${label} — damage${crit ? " (crit ×2 dice)" : ""}`, result: dmg });
  }
  return { entries, crit, fumble };
};

/** A bare d20 + bonus test with an arbitrary label. */
export const checkRoll = (label: string, bonus: number, mode: RollMode = "normal"): RollEntry => ({
  label,
  result: rollD20(bonus, mode),
});

export const saveRoll = (c: Character, a: Ability, mode: RollMode = "normal"): RollEntry =>
  checkRoll(`${ABILITY_FULL[a]} save`, saveBonus(c, a), mode);

export const abilityCheckRoll = (c: Character, a: Ability, mode: RollMode = "normal"): RollEntry =>
  checkRoll(`${ABILITY_FULL[a]} check`, abilityModFor(c, a), mode);

export const skillRoll = (c: Character, skill: SkillName, mode: RollMode = "normal"): RollEntry =>
  checkRoll(skill, skillBonus(c, skill), mode);

/** Generic dice — consumables (a potion's 2d4+2), a rested Hit Die, healing. */
export const damageRoll = (label: string, expr: string): RollEntry => ({ label, result: roll(expr) });

/** The single result a board bloom / toast should headline (last entry's total). */
export const headlineTotal = (entries: RollEntry[]): number =>
  entries.length ? entries[entries.length - 1].result.total : 0;
