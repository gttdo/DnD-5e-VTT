import type { Ability } from "../types/character";
import type { SpellAreaShape } from "../types/content";

/**
 * Combat mechanics for spells — the piece the bundled spell dataset does NOT
 * carry (spells.json has only name/level/school/range/etc., no attack-vs-save
 * flag and no damage). This is a curated table for the common combat spells so
 * the quick-cast panel can route them properly:
 *   - "attack" spells go through the real targeted combat loop (roll vs AC,
 *     damage, resistances) via an AttackSpec.
 *   - "save" spells roll their damage for reference and announce the DC (the
 *     resolver has no save path yet — the DM adjudicates the save).
 *   - "heal" spells roll their healing and announce it.
 * Spells not listed here fall back to announce-only (spend slot + log a note).
 *
 * Damage cantrips scale with character level (see scaleCantrip). Numbers follow
 * the SRD; a DM can always override the logged result.
 */

export type SpellKind = "attack" | "save" | "heal" | "condition" | "cleanse" | "move" | "utility";

export interface SpellMech {
  kind: SpellKind;
  /** Damage dice, e.g. "1d10" or "8d6" (no ability mod — spells rarely add it). */
  damage?: string;
  damageType?: string;
  /** For "save" and "condition" spells: which save the target rolls. */
  save?: Ability;
  /** For "heal" spells: healing dice; the caster's spell mod is added by the panel. */
  heal?: string;
  /** For "condition" spells: the condition applied on a failed save (e.g. "paralyzed"). */
  condition?: string;
  /** Creature-type restriction (e.g. Hold Person only affects "humanoid"). */
  onlyType?: string;
  /** For "cleanse" spells/items: condition slugs it can remove from a target
   *  (Lesser Restoration → blinded/deafened/paralyzed/poisoned). "disease" and
   *  "curse" are accepted markers too. */
  cures?: string[];
  /** True if this cantrip's damage scales with character level. */
  scales?: boolean;
  /** Dice ADDED per slot level above the spell's base (upcasting). Defaults to
   *  one base die (e.g. Fireball +1d6, Cure Wounds +1d8); set this only when it
   *  differs, like Scorching Ray (+2d6 = one extra ray per level). */
  upcast?: string;
  /** No to-hit, no save — the spell simply lands (Magic Missile's darts). The
   *  resolver skips the d20/Shield window and applies damage straight up. */
  autoHit?: boolean;
  /** Board VFX key (see SpellFx). When set, casting plays this sprite from the
   *  caster to the target and lands the effect on arrival. */
  vfx?: string;
  /** Area/cone spell that's AIMED at a target rather than dealt to it: routes
   *  through targeting so the caster picks a direction, plays an anchored burst
   *  VFX from the caster, and announces the save (the DM adjudicates who's caught
   *  and applies damage — a cone hits a whole wedge, not one token). */
  burst?: boolean;
  /** Magic Missile-style "N darts, each 1dX+1" — the base dart count at the
   *  spell's own level; each upcast slot adds one dart. Damage is derived as
   *  `${darts}d4+${darts}` so the flat +1/dart scales too. */
  darts?: number;
  /** A spell that leaves a PERSISTENT area on the board (Web, Wall of Fire,
   *  Darkness…). Casting it aims at a point and drops a #80 spell-area token
   *  there that stays until removed — as opposed to an instantaneous burst. */
  lingering?: boolean;
  /** The footprint of a lingering/area spell — the shape + size (feet) of the
   *  token it places. Sphere/cube are point-placed; line/cone aim via facing. */
  area?: { shape: SpellAreaShape; size: number };
  /** A rare area that can be REPOSITIONED after casting (Moonbeam, Flaming
   *  Sphere). Most areas are fixed once placed; this flag unlocks moving one. */
  movable?: boolean;
}

// Keyed by lower-cased spell name.
const MECH: Record<string, SpellMech> = {
  // ---- Attack-roll cantrips (scale with level) ----
  "fire bolt": { kind: "attack", damage: "1d10", damageType: "fire", scales: true, vfx: "firebolt" },
  "ray of frost": { kind: "attack", damage: "1d8", damageType: "cold", scales: true },
  "eldritch blast": { kind: "attack", damage: "1d10", damageType: "force", scales: true },
  "shocking grasp": { kind: "attack", damage: "1d8", damageType: "lightning", scales: true },
  "chill touch": { kind: "attack", damage: "1d8", damageType: "necrotic", scales: true },
  "thorn whip": { kind: "attack", damage: "1d6", damageType: "piercing", scales: true },
  "produce flame": { kind: "attack", damage: "1d8", damageType: "fire", scales: true },

  // ---- Auto-hit projectile (no roll) ----
  // 3 darts at level 1 (each 1d4+1 force), +1 dart per slot level. Auto-hits;
  // fires the magic-missile projectile VFX from caster → target.
  "magic missile": { kind: "attack", damage: "3d4+3", damageType: "force", autoHit: true, vfx: "magic-missile", darts: 3 },

  // ---- Attack-roll leveled spells ----
  "guiding bolt": { kind: "attack", damage: "4d6", damageType: "radiant" },
  "chromatic orb": { kind: "attack", damage: "3d8", damageType: "acid" },
  "witch bolt": { kind: "attack", damage: "1d12", damageType: "lightning" },
  "ray of sickness": { kind: "attack", damage: "2d8", damageType: "poison" },
  "inflict wounds": { kind: "attack", damage: "3d10", damageType: "necrotic" },
  "scorching ray": { kind: "attack", damage: "6d6", damageType: "fire", upcast: "2d6" }, // 3 rays × 2d6; +1 ray/level
  "acid arrow": { kind: "attack", damage: "4d6", damageType: "acid" },

  // ---- Save cantrips ----
  "sacred flame": { kind: "save", damage: "1d8", damageType: "radiant", save: "DEX", scales: true },
  "toll the dead": { kind: "save", damage: "1d8", damageType: "necrotic", save: "WIS", scales: true },
  "poison spray": { kind: "save", damage: "1d12", damageType: "poison", save: "CON", scales: true },

  // ---- Save leveled spells ----
  // Instant AoEs carry their true shape (slice B aims them like Cone of Cold);
  // `area` WITHOUT `lingering` = a one-shot blast, not a persistent zone.
  "burning hands": { kind: "save", damage: "3d6", damageType: "fire", save: "DEX", area: { shape: "cone", size: 15 } },
  "thunderwave": { kind: "save", damage: "2d8", damageType: "thunder", save: "CON", area: { shape: "cube", size: 15 } },
  "fireball": { kind: "save", damage: "8d6", damageType: "fire", save: "DEX", area: { shape: "sphere", size: 20 } },
  "lightning bolt": { kind: "save", damage: "8d6", damageType: "lightning", save: "DEX", area: { shape: "line", size: 100 } },
  "shatter": { kind: "save", damage: "3d8", damageType: "thunder", save: "CON", area: { shape: "sphere", size: 10 } },
  "cone of cold": { kind: "save", damage: "8d8", damageType: "cold", save: "CON", vfx: "cone-of-cold", burst: true, area: { shape: "cone", size: 60 } },

  // ---- Condition (save or be afflicted) ----
  "hold person": { kind: "condition", save: "WIS", condition: "paralyzed", onlyType: "humanoid" },
  "hold monster": { kind: "condition", save: "WIS", condition: "paralyzed" },
  "tasha's hideous laughter": { kind: "condition", save: "WIS", condition: "incapacitated" },
  "fear": { kind: "condition", save: "WIS", condition: "frightened" },
  "command": { kind: "condition", save: "WIS", condition: "" },
  "entangle": { kind: "condition", save: "STR", condition: "restrained", lingering: true, area: { shape: "cube", size: 20 } },
  "web": { kind: "condition", save: "DEX", condition: "restrained", lingering: true, area: { shape: "cube", size: 20 } },
  "sleep": { kind: "condition", save: "WIS", condition: "unconscious" },
  "banishment": { kind: "condition", save: "CHA", condition: "banished" },

  // ---- Lingering area spells (leave a persistent #80 area token on the board;
  // ongoing damage/saves for creatures inside are the DM's to adjudicate) ----
  "wall of fire": { kind: "save", damage: "5d8", damageType: "fire", save: "DEX", lingering: true, area: { shape: "line", size: 60 } },
  "darkness": { kind: "utility", lingering: true, area: { shape: "sphere", size: 15 } },
  "fog cloud": { kind: "utility", lingering: true, area: { shape: "sphere", size: 20 } },
  "spike growth": { kind: "utility", damageType: "piercing", lingering: true, area: { shape: "sphere", size: 20 } },
  "grease": { kind: "save", save: "DEX", lingering: true, area: { shape: "cube", size: 10 } },
  "cloud of daggers": { kind: "save", damage: "4d4", damageType: "slashing", save: "DEX", lingering: true, area: { shape: "cube", size: 5 } },
  "silence": { kind: "utility", lingering: true, area: { shape: "sphere", size: 20 } },
  "sleet storm": { kind: "utility", damageType: "cold", lingering: true, area: { shape: "cylinder", size: 40 } },
  // Relocatable areas — the rare spells you move after casting.
  "moonbeam": { kind: "save", damage: "2d10", damageType: "radiant", save: "CON", lingering: true, movable: true, area: { shape: "cylinder", size: 5 } },
  "flaming sphere": { kind: "save", damage: "2d6", damageType: "fire", save: "DEX", lingering: true, movable: true, area: { shape: "sphere", size: 5 } },

  // ---- Movement / teleport ----
  "misty step": { kind: "move" },
  "dimension door": { kind: "move" },
  "thunder step": { kind: "move" },

  // ---- Healing ----
  "cure wounds": { kind: "heal", heal: "1d8" },
  "healing word": { kind: "heal", heal: "1d4" },
  "mass healing word": { kind: "heal", heal: "1d4" },
  "prayer of healing": { kind: "heal", heal: "2d8" },

  // ---- Cleanse (remove conditions) ----
  "lesser restoration": { kind: "cleanse", cures: ["blinded", "deafened", "paralyzed", "poisoned", "disease"] },
  "greater restoration": { kind: "cleanse", cures: ["charmed", "frightened", "paralyzed", "petrified", "stunned", "poisoned", "exhaustion", "curse"] },
  "protection from poison": { kind: "cleanse", cures: ["poisoned"] },
  "remove curse": { kind: "cleanse", cures: ["curse"] },
  "heal": { kind: "cleanse", cures: ["blinded", "deafened", "disease"] },
};

export const spellMech = (name: string): SpellMech | null => MECH[name.trim().toLowerCase()] ?? null;

/** Magic Missile-style dart damage at a given slot level: one extra dart per
 *  level above base, each dart being 1d4+1 → `${n}d4+${n}`. */
export const dartDamage = (baseDarts: number, baseLevel: number, slotLevel: number): string => {
  const n = baseDarts + Math.max(0, slotLevel - baseLevel);
  return `${n}d4+${n}`;
};

/** Cantrip damage tier (dice multiplier) by character level: 1 / 2 / 3 / 4. */
export const cantripTier = (charLevel: number): number =>
  charLevel >= 17 ? 4 : charLevel >= 11 ? 3 : charLevel >= 5 ? 2 : 1;

/** Scale a cantrip's leading dice count by the character's tier, e.g. "1d10" → "2d10". */
export const scaleCantrip = (damage: string, charLevel: number): string => {
  const tier = cantripTier(charLevel);
  if (tier === 1) return damage;
  return damage.replace(/^(\d+)d(\d+)/i, (_, n: string, s: string) => `${parseInt(n, 10) * tier}d${s}`);
};

/**
 * Upcast a damage/heal expression by the number of slot levels above the spell's
 * base level. Adds `perLevel` dice per level (default: one die of the base size,
 * which is correct for the vast majority — Fireball +1d6, Cure Wounds +1d8);
 * `perLevel` overrides it for spells like Scorching Ray (+2d6/level). Any flat
 * modifier (e.g. "+3") is preserved. No-op when slotLevel <= baseLevel.
 */
export const upcastDamage = (
  expr: string,
  baseLevel: number,
  slotLevel: number,
  perLevel?: string
): string => {
  const extra = Math.max(0, slotLevel - baseLevel);
  if (extra === 0) return expr;
  const m = /^(\d+)d(\d+)(.*)$/.exec(expr.trim());
  if (!m) return expr;
  const [, n, size, tail] = m;
  let addDice = extra; // default: +1 base die per level
  if (perLevel) {
    const pm = /^(\d+)d(\d+)$/.exec(perLevel.trim());
    if (pm && pm[2] === size) addDice = parseInt(pm[1], 10) * extra;
  }
  return `${parseInt(n, 10) + addDice}d${size}${tail}`;
};
