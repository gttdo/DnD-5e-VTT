import { useCallback, useEffect, useRef } from "react";
import { supabase, supabaseConfigured } from "../lib/supabase";

/**
 * Cross-client "start combat" nudge. Only the DM may write scene.in_combat and
 * roll initiative for the table (scene RLS), so a PLAYER whose attack lands the
 * first harmful blow out of combat can't begin the fight on their own. Instead
 * their client fires this signal; the DM's client receives it and runs the
 * initiative ritual (monsters auto-roll, players are prompted).
 *
 * A one-way broadcast on `combat:{gameId}` — like the reactions/saves relays,
 * this is the SINGLE consumer of its topic. `onStart` should no-op if a fight is
 * already underway (several attackers may fire it near-simultaneously).
 */
export const useCombatSignal = (gameId: string | null, onStart: () => void) => {
  const channelRef = useRef<ReturnType<typeof supabase.channel> | null>(null);
  const joinedRef = useRef(false);
  // Keep the latest callback without resubscribing the channel each render.
  const onStartRef = useRef(onStart);
  onStartRef.current = onStart;

  useEffect(() => {
    if (!gameId || !supabaseConfigured) return;
    joinedRef.current = false;
    const channel = supabase.channel(`combat:${gameId}`);
    channel.on("broadcast", { event: "start" }, () => onStartRef.current());
    channel.subscribe((status) => {
      joinedRef.current = status === "SUBSCRIBED";
    });
    channelRef.current = channel;
    return () => {
      joinedRef.current = false;
      channelRef.current = null;
      void supabase.removeChannel(channel);
    };
  }, [gameId]);

  /** Ask the table to start combat (the DM's client obliges). */
  const requestStart = useCallback(() => {
    const channel = channelRef.current;
    if (channel && joinedRef.current) {
      void channel.send({ type: "broadcast", event: "start", payload: {} });
    }
  }, []);

  return { requestStart };
};
