import { useCallback, useMemo } from "react";
import { supabase } from "../lib/supabase";
import { isTokenDowned, type Token } from "./useTokens";
import type { Scene } from "./useScenes";
import { activeAt, advanceTurn, initiativeOrder } from "../lib/initiative";

/**
 * Turn order for one scene.
 *
 * A combatant IS a token — no parallel entity to keep in sync, and deleting a
 * token removes it from the order for free. Initiative lives on tokens.initiative
 * and the combat state (running / round / whose turn) on the scene, so both ride
 * the postgres_changes channels those tables already broadcast on. Every player
 * at the table sees the same turn without any new plumbing.
 *
 * The order is derived, never stored: filter to tokens with an initiative,
 * sort desc, tie-break by label so it's stable across clients. `turn_index`
 * points into that derived list.
 */

export interface UseInitiative {
  /** Tokens in the fight, highest initiative first. */
  order: Token[];
  /** Whose turn it is, or null when combat isn't running. */
  activeToken: Token | null;
  inCombat: boolean;
  round: number;
  setInitiative: (tokenId: string, value: number | null) => Promise<void>;
  /** Rolls for every token that doesn't have a score yet, then starts combat.
   *  Resolves with an error message if any write failed (e.g. migration 0008
   *  not applied yet), null on success. */
  rollAll: (rollFor: (t: Token) => number) => Promise<string | null>;
  /** The initiative ritual (#102): start combat, auto-rolling ONLY the DM-side
   *  combatants (monsters/NPCs with no bound character). Player-character tokens
   *  are left blank so each player rolls their own on their screen. */
  beginWithPlayerRolls: (rollFor: (t: Token) => number) => Promise<string | null>;
  start: () => Promise<string | null>;
  end: () => Promise<void>;
  next: () => Promise<void>;
  previous: () => Promise<void>;
}

export const useInitiative = (scene: Scene | null, tokens: Token[]): UseInitiative => {
  const order = useMemo(() => initiativeOrder(tokens), [tokens]);

  const inCombat = Boolean(scene?.in_combat);
  const round = scene?.round ?? 1;
  const activeToken = inCombat ? activeAt(order, scene?.turn_index ?? 0) : null;

  const patchScene = useCallback(
    async (patch: Partial<Pick<Scene, "in_combat" | "round" | "turn_index">>): Promise<string | null> => {
      if (!scene) return "No active scene";
      const { error } = await supabase.from("scenes").update(patch).eq("id", scene.id);
      return error?.message ?? null;
    },
    [scene]
  );

  const setInitiative = useCallback(async (tokenId: string, value: number | null) => {
    await supabase.from("tokens").update({ initiative: value }).eq("id", tokenId);
  }, []);

  const rollAll = useCallback(
    async (rollFor: (t: Token) => number): Promise<string | null> => {
      // Only fills blanks — a DM who has already set a boss's initiative by hand
      // shouldn't have it overwritten by "roll for everyone". Loose == null also
      // catches undefined (pre-migration rows). Props and spell areas never roll,
      // and a creature already at 0 HP stays out of the fight.
      const pending = tokens.filter(
        (t) => t.initiative == null && t.kind !== "prop" && t.kind !== "spell" && !isTokenDowned(t)
      );
      const results = await Promise.all(
        pending.map((t) => supabase.from("tokens").update({ initiative: rollFor(t) }).eq("id", t.id))
      );
      const writeError = results.find((r) => r.error)?.error?.message;
      const sceneError = await patchScene({ in_combat: true, round: 1, turn_index: 0 });
      // Surfacing matters: before migration 0008 these writes fail on a
      // missing column, and swallowing that made the button appear dead.
      return writeError ?? sceneError;
    },
    [tokens, patchScene]
  );

  const beginWithPlayerRolls = useCallback(
    async (rollFor: (t: Token) => number): Promise<string | null> => {
      // Auto-roll the DM's side only: creatures with no bound character (monsters,
      // NPCs). A token linked to a player character is left blank on purpose —
      // its controller gets a "Roll for initiative" prompt on their own client
      // (see TableCanvas). Props/spell areas never roll. Only fills blanks.
      const auto = tokens.filter(
        (t) => t.initiative == null && !t.character_id && t.kind !== "prop" && t.kind !== "spell" && !isTokenDowned(t)
      );
      const results = await Promise.all(
        auto.map((t) => supabase.from("tokens").update({ initiative: rollFor(t) }).eq("id", t.id))
      );
      const writeError = results.find((r) => r.error)?.error?.message;
      const sceneError = await patchScene({ in_combat: true, round: 1, turn_index: 0 });
      return writeError ?? sceneError;
    },
    [tokens, patchScene]
  );

  const start = useCallback(
    () => patchScene({ in_combat: true, round: 1, turn_index: 0 }),
    [patchScene]
  );

  const end = useCallback(async () => {
    await patchScene({ in_combat: false, round: 1, turn_index: 0 });
    // Clear scores so the next fight starts clean rather than inheriting the
    // last one's order.
    await Promise.all(
      tokens
        .filter((t) => t.initiative != null)
        .map((t) => supabase.from("tokens").update({ initiative: null }).eq("id", t.id))
    );
  }, [tokens, patchScene]);

  const step = useCallback(
    async (dir: 1 | -1) => {
      if (!scene) return;
      const patch = advanceTurn(scene.turn_index, scene.round, order.length, dir);
      if (patch) await patchScene(patch);
    },
    [scene, order.length, patchScene]
  );

  const next = useCallback(() => step(1), [step]);
  const previous = useCallback(() => step(-1), [step]);

  return { order, activeToken, inCombat, round, setInitiative, rollAll, beginWithPlayerRolls, start, end, next, previous };
};
