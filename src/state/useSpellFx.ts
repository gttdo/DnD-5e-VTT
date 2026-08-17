import { useCallback, useEffect, useRef, useState } from "react";
import { supabase, supabaseConfigured } from "../lib/supabase";
import type { SpellFxInstance } from "../components/SpellFx";

/**
 * Shared spell VFX for one scene — the projectile/burst every player sees when
 * someone casts. Like usePings, this rides a realtime BROADCAST channel: the
 * effects are ephemeral, so there's nothing to persist.
 *
 * Same self-first design as pings: the CASTER spawns its own effect LOCALLY and
 * immediately (so a flaky transport never robs them of feedback), and broadcast
 * carries it only to the rest of the table.
 */
export const useSpellFx = (sceneId: string | null) => {
  const [fx, setFx] = useState<SpellFxInstance[]>([]);
  const channelRef = useRef<ReturnType<typeof supabase.channel> | null>(null);
  const joinedRef = useRef(false);

  const spawn = useCallback((f: Omit<SpellFxInstance, "id">) => {
    const inst: SpellFxInstance = { id: `fx-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`, ...f };
    setFx((prev) => [...prev, inst]);
  }, []);

  const removeFx = useCallback((id: string) => {
    setFx((prev) => prev.filter((f) => f.id !== id));
  }, []);

  useEffect(() => {
    if (!sceneId || !supabaseConfigured) return;
    joinedRef.current = false;
    const channel = supabase.channel(`spellfx:${sceneId}`);
    channel.on("broadcast", { event: "fx" }, ({ payload }) => {
      const f = payload as Omit<SpellFxInstance, "id">;
      if (f && typeof f.vfx === "string") spawn(f);
    });
    channel.subscribe((status) => {
      joinedRef.current = status === "SUBSCRIBED";
    });
    channelRef.current = channel;
    return () => {
      joinedRef.current = false;
      channelRef.current = null;
      void supabase.removeChannel(channel);
    };
  }, [sceneId, spawn]);

  /** Play a spell effect: locally first (always visible to the caster), then
   *  broadcast to teammates. */
  const sendFx = useCallback(
    (f: Omit<SpellFxInstance, "id">) => {
      spawn(f);
      const channel = channelRef.current;
      if (channel && joinedRef.current) {
        void channel.send({ type: "broadcast", event: "fx", payload: f });
      }
    },
    [spawn]
  );

  return { fx, sendFx, removeFx };
};
