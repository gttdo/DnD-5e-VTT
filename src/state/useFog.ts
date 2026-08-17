import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { supabase } from "../lib/supabase";
import type { Scene } from "./useScenes";

/**
 * Fog of war state for the active scene.
 *
 * The revealed-cell set is held locally for instant brush feedback and
 * persisted DEBOUNCED as a whole-array snapshot (a drag emits dozens of paint
 * events; writing each would hammer the row and spam realtime). Remote
 * updates (another DM device, or the initial row) are merged only while no
 * local paint is pending — otherwise the echo of write N-1 would erase the
 * cells painted since.
 *
 * Cells are indexed y * cols + x, matching the jsonb column format.
 */

const PERSIST_DEBOUNCE_MS = 500;

export const useFog = (scene: Scene | null, cols: number) => {
  const sceneId = scene?.id ?? null;
  const [revealed, setRevealed] = useState<Set<number>>(new Set());
  const pendingRef = useRef(false);
  const timerRef = useRef<number | null>(null);
  const [error, setError] = useState<string | null>(null);

  // Adopt the scene's fog when the scene changes or a remote update lands.
  const remote = scene?.fog_revealed;
  useEffect(() => {
    if (pendingRef.current) return; // our own paints outrank a stale echo
    setRevealed(new Set(Array.isArray(remote) ? remote : []));
  }, [sceneId, remote]);

  // Flush any unsaved paint when the scene unmounts/switches.
  useEffect(() => {
    return () => {
      if (timerRef.current != null) window.clearTimeout(timerRef.current);
    };
  }, [sceneId]);

  const persist = useCallback(
    (next: Set<number>) => {
      if (!sceneId) return;
      pendingRef.current = true;
      if (timerRef.current != null) window.clearTimeout(timerRef.current);
      timerRef.current = window.setTimeout(async () => {
        const { error } = await supabase
          .from("scenes")
          .update({ fog_revealed: [...next] })
          .eq("id", sceneId);
        pendingRef.current = false;
        setError(error?.message ?? null);
      }, PERSIST_DEBOUNCE_MS);
    },
    [sceneId]
  );

  /** Paint a set of cells revealed (true) or fogged (false). */
  const paint = useCallback(
    (cells: number[], reveal: boolean) => {
      setRevealed((prev) => {
        const next = new Set(prev);
        let changed = false;
        for (const c of cells) {
          if (reveal ? !next.has(c) : next.has(c)) {
            changed = true;
            if (reveal) next.add(c);
            else next.delete(c);
          }
        }
        if (!changed) return prev;
        persist(next);
        return next;
      });
    },
    [persist]
  );

  const setAll = useCallback(
    (reveal: boolean, rows: number) => {
      const next = reveal
        ? new Set(Array.from({ length: cols * rows }, (_, i) => i))
        : new Set<number>();
      setRevealed(next);
      persist(next);
    },
    [cols, persist]
  );

  const setEnabled = useCallback(
    async (enabled: boolean): Promise<string | null> => {
      if (!sceneId) return "No active scene";
      const { error } = await supabase
        .from("scenes")
        .update({ fog_enabled: enabled })
        .eq("id", sceneId);
      return error?.message ?? null;
    },
    [sceneId]
  );

  const enabled = Boolean(scene?.fog_enabled);

  return useMemo(
    () => ({ enabled, revealed, paint, setAll, setEnabled, error }),
    [enabled, revealed, paint, setAll, setEnabled, error]
  );
};
