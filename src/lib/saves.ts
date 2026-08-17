import type { Ability } from "../types/character";

/**
 * A saving throw demanded of a target — the cross-client heart of "the caster
 * sets the DC, the target rolls the save". The caster's client emits one of
 * these; it travels to every client, and whoever CONTROLS the target token
 * (the owning player, or the DM for a monster/NPC) is prompted to roll. The
 * roll happens on the defender's machine, logs to the whole table, and the
 * defender applies the outcome to their own token/sheet.
 */
export interface SaveRequest {
  id: string;
  /** Caster's display name, for the log line. */
  by: string;
  targetTokenId: string;
  targetLabel: string;
  ability: Ability;
  dc: number;
  /** What demanded the save, e.g. "Hold Person". */
  sourceLabel: string;
  /** Effect on a FAILED save. "concentration": drop the target's held spell. */
  onFail: "condition" | "damage" | "concentration";
  /** onFail === "condition": the condition slug to apply (e.g. "paralyzed"). */
  condition?: string;
  /** onFail === "damage": dice expression rolled by the caster, carried here. */
  damage?: string;
  damageType?: string;
  /** What a SUCCESSFUL save does: nothing, or take half (damage saves). */
  onSave: "none" | "half";
  /** True when this is an end-of-turn repeat save on an already-applied
   *  condition (shake-it-off), not the initial cast. */
  repeat?: boolean;
}

/** Encode a condition + its ongoing save into one `conditions[]` entry:
 *  "paralyzed@WIS:13". Bare conditions (no repeat save) stay just "poisoned". */
export const encodeCondition = (name: string, save?: Ability, dc?: number): string =>
  save && dc != null ? `${name}@${save}:${dc}` : name;
