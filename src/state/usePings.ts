import { useCallback, useEffect, useRef, useState } from "react";
import { supabase, supabaseConfigured } from "../lib/supabase";

/**
 * Shared pings for one scene — "look HERE" pulses every player sees.
 *
 * Uses a realtime BROADCAST channel rather than postgres_changes: pings are
 * ephemeral, so writing them to a table would be pure overhead. Nothing is
 * persisted; a viewer who joins mid-ping simply doesn't see it.
 *
 * Key design point (this is what an earlier version got wrong): the SENDER
 * renders its own ping LOCALLY and immediately, and broadcast carries it only
 * to OTHERS (self:false). Relying on a self-echo to see your own ping meant a
 * flaky/disabled realtime transport produced no feedback at all. Now a click
 * always pulses locally; the network only affects whether teammates see it.
 */

export interface Ping {
  id: string;
  /** SVG user coordinates (the canvas's own space). */
  x: number;
  y: number;
  at: number;
}

/** How long a pulse stays on screen. Matches the CSS animation length. */
export const PING_LIFETIME_MS = 2600;

export const usePings = (sceneId: string | null) => {
  const [pings, setPings] = useState<Ping[]>([]);
  const channelRef = useRef<ReturnType<typeof supabase.channel> | null>(null);
  const joinedRef = useRef(false);

  // Add a pulse to the local layer and schedule its removal. Shared by the
  // local (sender) path and the remote (broadcast) path.
  const addPing = useCallback((x: number, y: number) => {
    const ping: Ping = {
      id: `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
      x,
      y,
      at: Date.now(),
    };
    setPings((prev) => [...prev, ping]);
    window.setTimeout(() => {
      setPings((prev) => prev.filter((q) => q.id !== ping.id));
    }, PING_LIFETIME_MS);
  }, []);

  useEffect(() => {
    if (!sceneId || !supabaseConfigured) return;
    joinedRef.current = false;
    const channel = supabase.channel(`pings:${sceneId}`);
    channel.on("broadcast", { event: "ping" }, ({ payload }) => {
      const p = payload as { x: number; y: number };
      if (typeof p?.x === "number" && typeof p?.y === "number") addPing(p.x, p.y);
    });
    channel.subscribe((status, err) => {
      joinedRef.current = status === "SUBSCRIBED";
      if (status === "CHANNEL_ERROR" || status === "TIMED_OUT") {
        console.error(`[pings] channel ${status}`, err ?? "");
      }
    });
    channelRef.current = channel;
    return () => {
      joinedRef.current = false;
      channelRef.current = null;
      void supabase.removeChannel(channel);
    };
  }, [sceneId, addPing]);

  /**
   * Pulse at (x, y). Renders locally first — you always see your own ping —
   * then broadcasts to teammates. Resolves null on success, otherwise a note
   * about the broadcast leg (the local pulse still played).
   */
  const sendPing = useCallback(
    async (x: number, y: number): Promise<string | null> => {
      addPing(x, y); // instant, transport-independent feedback
      const channel = channelRef.current;
      if (!channel || !joinedRef.current) {
        return "Ping shown locally, but the realtime channel isn't connected — teammates won't see it yet.";
      }
      const result = await channel.send({ type: "broadcast", event: "ping", payload: { x, y } });
      return result === "ok" ? null : `Ping shown locally, but the broadcast failed (${result}).`;
    },
    [addPing]
  );

  return { pings, sendPing };
};
