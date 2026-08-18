import type { Character } from "../types/character";

/**
 * The blocking reaction interrupt ("true to rules"). When an attack HITS a
 * defender, the attacker PAUSES and offers the defender's controller a window
 * to spend a reaction that changes the outcome — Shield (+5 AC) is the flagship.
 * The offer travels to every client on the `reactions:{gameId}` topic; whoever
 * controls the target answers with a ReactionResponse, and the attacker applies
 * it (recomputing hit/miss vs the modified AC) before finalizing damage.
 *
 * Modeled on the SaveRequest pipeline — same local-first, broadcast-relay shape.
 */
/** Which reaction an offer/response is about — the relay carries every kind. */
export type ReactionKind = "shield" | "counterspell" | "opportunity" | "halve";

export interface ReactionOffer {
  id: string;
  kind: ReactionKind;
  /** Instigator's display name — attacker (shield) or caster (counterspell). */
  by: string;
  /** The token at the center of the offer: the DEFENDER (shield) or the CASTER
   *  being counterspelled. Eligibility differs by kind (see the canvas). */
  targetTokenId: string;
  targetLabel: string;
  /** The attack (shield) or spell (counterspell) name. */
  sourceLabel: string;
  // shield only
  toHit?: number;
  baseAc?: number;
  // counterspell only — the level of the spell being cast.
  spellLevel?: number;
  // opportunity only — the mover who left reach (the OA's victim). Here
  // `targetTokenId` is the REACTOR whose controller answers, not the victim.
  moverTokenId?: string;
  moverLabel?: string;
  // halve only — the damage that just landed and what it drops to if the
  // defender spends a reaction. `targetTokenId` is the DEFENDER, whose
  // controller answers; the attacker already applied `applied`, so taking it
  // gives back (applied - halved) on the defender's own client.
  applied?: number;
  halved?: number;
  damageType?: string;
}

export interface ReactionResponse {
  id: string;
  kind: ReactionKind;
  // shield: AC added by the reaction (+5), or 0 when declined.
  acBonus?: number;
  // counterspell: whether someone countered, and their spell save DC (the
  // ORIGINAL caster then rolls a CON save vs this).
  counter?: boolean;
  counterDc?: number;
  counterBy?: string;
  /** The reaction's name, for the log ("Shield" / "Counterspell"). */
  label?: string;
}

/** The lowest spell-slot level with a slot still open, or null if none remain. */
export const lowestOpenSlot = (
  slots: Record<string, number>,
  used: Record<string, number>
): number | null => {
  for (let lvl = 1; lvl <= 9; lvl++) {
    const key = String(lvl);
    if (Number(slots[key] ?? 0) - (used[key] ?? 0) > 0) return lvl;
  }
  return null;
};

/** The lowest open slot of at least `min` level (Counterspell needs 3rd+), or null. */
export const lowestOpenSlotAtLeast = (
  slots: Record<string, number>,
  used: Record<string, number>,
  min: number
): number | null => {
  for (let lvl = min; lvl <= 9; lvl++) {
    const key = String(lvl);
    if (Number(slots[key] ?? 0) - (used[key] ?? 0) > 0) return lvl;
  }
  return null;
};

/** Does this character have the Shield spell in their known/prepared list? */
export const knowsShield = (c: Character): boolean =>
  [...(c.spellcasting?.prepared ?? []), ...(c.spellcasting?.known ?? [])].some((n) =>
    /^shield$/i.test(n.trim())
  );

/** Does this character have Counterspell in their known/prepared list? */
export const knowsCounterspell = (c: Character): boolean =>
  [...(c.spellcasting?.prepared ?? []), ...(c.spellcasting?.known ?? [])].some((n) =>
    /^counterspell$/i.test(n.trim())
  );
