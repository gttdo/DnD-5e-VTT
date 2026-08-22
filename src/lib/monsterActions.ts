import type { Ability } from "../types/character";
import type { MonsterAction } from "../types/content";
import type { SpellAreaShape } from "./rolls";

/**
 * Save-based monster actions (slice C of the action map) — breath weapons,
 * gaze attacks, poison stings' secondary saves. The bestiary carries
 * saveDc/saveAbility structurally, but the damage dice and the area shape
 * live only in the action TEXT ("exhales fire in a 30-foot cone … DC 17
 * Dexterity saving throw, taking 55 (10d10) fire damage on a failed save,
 * or half as much on a successful one"). Parse just enough to run it.
 */

export interface SaveActionMech {
  save: Ability;
  dc: number;
  /** Dice expression, e.g. "10d10" — absent when the text carries none
   *  (condition-only saves are slice D's business). */
  damage?: string;
  damageType?: string;
  /** "half as much on a success" → half; otherwise nothing on a save. */
  onSave: "none" | "half";
  /** Area footprint parsed from the text ("30-foot cone"); absent → single target. */
  area?: { shape: SpellAreaShape; size: number };
}

const ABILITIES = new Set(["STR", "DEX", "CON", "INT", "WIS", "CHA"]);

/** Parse a save-based action into something the HUD can run, or null. */
export const parseSaveAction = (a: MonsterAction): SaveActionMech | null => {
  if (a.saveDc == null || !a.saveAbility) return null;
  const ability = String(a.saveAbility).toUpperCase();
  if (!ABILITIES.has(ability)) return null;
  const text = a.text ?? "";

  // Damage: prefer the structured field, else "55 (10d10) fire damage".
  let damage = a.damage;
  let damageType = a.damageType;
  if (!damage) {
    const m = /\(\s*(\d+d\d+(?:\s*[+-]\s*\d+)?)\s*\)\s*(\w+)\s+damage/i.exec(text);
    if (m) {
      damage = m[1].replace(/\s+/g, "");
      damageType = m[2].toLowerCase();
    }
  }

  // Area: "30-foot cone", "60-foot line", "20-foot-radius sphere", "15-foot cube".
  // SRD text sprinkles soft hyphens (U+00AD) and en/em dashes into "60-­foot",
  // so the number↔unit separator matches any run of hyphen-like chars/spaces.
  let area: SaveActionMech["area"];
  const H = "[\\s\\u00ad\\u2010-\\u2015-]*";
  const am = new RegExp(`(\\d+)${H}foot(?:${H}radius)?\\s+(cone|line|cube|sphere|radius)`, "i").exec(text);
  if (am) {
    const size = parseInt(am[1], 10);
    const raw = am[2].toLowerCase();
    const shape: SpellAreaShape = raw === "radius" ? "sphere" : (raw as SpellAreaShape);
    area = { shape, size };
  } else {
    // Fallback phrasing: "a line … that is 30 feet long" (Ankheg, Behir).
    const am2 = new RegExp(`(cone|line|cube|sphere)\\b[^.]*?(\\d+)${H}fe?e?t${H}long`, "i").exec(text);
    if (am2) area = { shape: am2[1].toLowerCase() as SpellAreaShape, size: parseInt(am2[2], 10) };
  }

  return {
    save: ability as Ability,
    dc: a.saveDc,
    damage,
    damageType,
    onSave: /half as much/i.test(text) ? "half" : "none",
    area,
  };
};

/** A condition an ATTACK inflicts when it hits (slice D) — the ghoul's claw
 *  paralyzes, the spider's bite poisons, the chain devil grapples. */
export interface HitRider {
  condition: string;
  /** The save the target rolls to AVOID it (and repeats at end of turn to shake
   *  it off). Absent for auto-applied conditions like a grapple. */
  save?: Ability;
  dc: number;
}

const ABILITY_WORD: Record<string, Ability> = {
  strength: "STR", dexterity: "DEX", constitution: "CON",
  intelligence: "INT", wisdom: "WIS", charisma: "CHA",
};

const RIDER_CONDITIONS = [
  "poisoned", "paralyzed", "stunned", "restrained", "grappled", "prone",
  "frightened", "blinded", "charmed", "petrified", "unconscious",
  "incapacitated", "deafened",
];

/** Parse a condition rider off an ATTACK's text, or null. Handles the two
 *  common statblock shapes: "must succeed on a DC 12 Con save or be poisoned"
 *  (save-to-avoid) and "the target is grappled (escape DC 14)" (auto-apply). */
export const parseHitRider = (a: MonsterAction): HitRider | null => {
  if (a.attackBonus == null) return null; // riders live on attacks
  const text = a.text ?? "";

  // Save-to-avoid: "DC 12 Constitution saving throw or be/become/against being
  // [magically] <condition>". The condition word may trail a short clause.
  const save = /DC\s*(\d+)\s+(Strength|Dexterity|Constitution|Intelligence|Wisdom|Charisma)\s+saving throw[^.]*?(?:or be|or become|against being)(?:\s+magically)?\s+(\w+)/i.exec(text);
  if (save) {
    const cond = save[3].toLowerCase();
    if (RIDER_CONDITIONS.includes(cond)) {
      return { condition: cond, save: ABILITY_WORD[save[2].toLowerCase()], dc: parseInt(save[1], 10) };
    }
  }

  // Auto-grapple: "the target is grappled (escape DC 14)". No save on the hit —
  // the escape DC is the victim's later action, not an end-of-turn save.
  const grab = /is grappled\s*\(escape DC\s*(\d+)\)/i.exec(text);
  if (grab) return { condition: "grappled", dc: parseInt(grab[1], 10) };

  return null;
};
