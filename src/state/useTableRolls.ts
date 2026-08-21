import { useCallback, useEffect, useRef, useState } from "react";
import { supabase, supabaseConfigured } from "../lib/supabase";
import { useDiceLog } from "./DiceLog";
import { headlineTotal, type RollEntry, type RollTone } from "../lib/rolls";

/**
 * Table-wide dice — the reason the HUD exists.
 *
 * A roll must be seen by the whole table, not just the person who tapped it, or
 * the shared-story point collapses. This carries every HUD/modal roll two ways:
 *  - into the shared game log (DiceLog), tagged with who rolled, and
 *  - as a transient "bloom" (the total, floating by the roller's token).
 *
 * Same shape as usePings: the roller renders LOCALLY and immediately, and the
 * broadcast carries the roll to OTHERS (self:false). A flaky realtime transport
 * then only affects whether teammates see it — your own roll always logs and
 * blooms. And, like every realtime hook here, this is the SINGLE consumer of
 * its channel topic (`rolls:{gameId}`); mounting a second one on the same topic
 * throws "cannot add postgres_changes callbacks after subscribe()".
 */

/** A floating result near a token on the board. Ephemeral, never persisted. */
export interface RollBloom {
  id: string;
  /** SVG user coordinates (the canvas's own space), or null for no board anchor. */
  x: number;
  y: number;
  text: string;
  tone: RollTone;
  at: number;
}

interface BloomSeed {
  x: number;
  y: number;
  tone?: RollTone;
  /** Overrides the default headline (the last entry's total). */
  text?: string;
}

/** How long a bloom stays on screen. */
export const BLOOM_LIFETIME_MS = 2400;

interface RollPayload {
  by: string;
  entries: RollEntry[];
  bloom?: BloomSeed & { text: string };
}

export const useTableRolls = (
  gameId: string | null,
  /** Called once per LOCAL roll (never for broadcast receives) — the hook
   *  point where TableCanvas persists the roll to game_log (#0041). Only the
   *  roller writes the row, so the table gets exactly one copy. */
  onLocalRoll?: (by: string, entries: RollEntry[]) => void
) => {
  const { push } = useDiceLog();
  const [blooms, setBlooms] = useState<RollBloom[]>([]);
  const channelRef = useRef<ReturnType<typeof supabase.channel> | null>(null);
  const joinedRef = useRef(false);

  const addBloom = useCallback((seed: BloomSeed & { text: string }) => {
    const bloom: RollBloom = {
      id: `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
      x: seed.x,
      y: seed.y,
      text: seed.text,
      tone: seed.tone ?? "normal",
      at: Date.now(),
    };
    setBlooms((prev) => [...prev, bloom]);
    window.setTimeout(() => {
      setBlooms((prev) => prev.filter((b) => b.id !== bloom.id));
    }, BLOOM_LIFETIME_MS);
  }, []);

  // Apply a roll to THIS client — used by both the local path and the remote
  // (broadcast) path, so a roll looks identical wherever it originated.
  const ingest = useCallback(
    (payload: RollPayload) => {
      const { by, entries, bloom } = payload;
      entries.forEach((e) => push(by ? `${by} · ${e.label}` : e.label, e.result));
      if (bloom) addBloom(bloom);
    },
    [push, addBloom]
  );

  useEffect(() => {
    if (!gameId || !supabaseConfigured) return;
    joinedRef.current = false;
    const channel = supabase.channel(`rolls:${gameId}`);
    channel.on("broadcast", { event: "roll" }, ({ payload }) => {
      const p = payload as RollPayload;
      if (p && Array.isArray(p.entries)) ingest(p);
    });
    channel.subscribe((status, err) => {
      joinedRef.current = status === "SUBSCRIBED";
      if (status === "CHANNEL_ERROR" || status === "TIMED_OUT") {
        console.error(`[rolls] channel ${status}`, err ?? "");
      }
    });
    channelRef.current = channel;
    return () => {
      joinedRef.current = false;
      channelRef.current = null;
      void supabase.removeChannel(channel);
    };
  }, [gameId, ingest]);

  /**
   * Log + bloom a roll locally, then broadcast it to the rest of the table.
   * `by` is the roller's display name; `seed` anchors the bloom to a token.
   */
  const roll = useCallback(
    (by: string, entries: RollEntry[], seed?: BloomSeed) => {
      const bloom: (BloomSeed & { text: string }) | undefined = seed
        ? { ...seed, text: seed.text ?? String(headlineTotal(entries)) }
        : undefined;
      const payload: RollPayload = { by, entries, bloom };
      ingest(payload); // instant, transport-independent
      onLocalRoll?.(by, entries); // persist to game_log — roller only (#0041)
      const channel = channelRef.current;
      if (channel && joinedRef.current) {
        void channel.send({ type: "broadcast", event: "roll", payload });
      }
    },
    [ingest, onLocalRoll]
  );

  return { roll, blooms };
};
