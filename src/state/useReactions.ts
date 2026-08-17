import { useCallback, useEffect, useRef, useState } from "react";
import { supabase, supabaseConfigured } from "../lib/supabase";
import type { ReactionOffer, ReactionResponse } from "../lib/reactions";

/**
 * Cross-client reaction offers — the blocking half of the attack loop. The
 * attacker emits an `offer`; it lands in every client's `pending`, and the one
 * that CONTROLS the target shows the reaction prompt. The controller answers
 * with `respond` (carrying the chosen AC bonus), which travels back to the
 * attacker via `onResponse`. When the attacker finalizes (on a response or a
 * timeout) it `clear`s the offer so any lingering prompt disappears everywhere.
 *
 * Single consumer of its topic, like the other realtime hooks here.
 */
export const useReactions = (
  gameId: string | null,
  onResponse: (resp: ReactionResponse) => void
) => {
  const [pending, setPending] = useState<ReactionOffer[]>([]);
  const channelRef = useRef<ReturnType<typeof supabase.channel> | null>(null);
  const joinedRef = useRef(false);
  // Keep the latest callback without resubscribing the channel.
  const respCbRef = useRef(onResponse);
  useEffect(() => {
    respCbRef.current = onResponse;
  }, [onResponse]);

  const add = useCallback((o: ReactionOffer) => {
    setPending((prev) => (prev.some((r) => r.id === o.id) ? prev : [...prev, o]));
  }, []);
  const drop = useCallback((id: string) => {
    setPending((prev) => prev.filter((r) => r.id !== id));
  }, []);

  useEffect(() => {
    if (!gameId || !supabaseConfigured) return;
    joinedRef.current = false;
    const channel = supabase.channel(`reactions:${gameId}`);
    channel.on("broadcast", { event: "offer" }, ({ payload }) => {
      const o = payload as ReactionOffer;
      if (o && o.id && o.targetTokenId) add(o);
    });
    channel.on("broadcast", { event: "respond" }, ({ payload }) => {
      const r = payload as ReactionResponse;
      if (r && r.id) {
        drop(r.id);
        respCbRef.current(r);
      }
    });
    channel.on("broadcast", { event: "resolve" }, ({ payload }) => {
      const p = payload as { id?: string };
      if (p?.id) drop(p.id);
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
  }, [gameId, add, drop]);

  const send = (event: string, payload: unknown) => {
    const channel = channelRef.current;
    if (channel && joinedRef.current) void channel.send({ type: "broadcast", event, payload });
  };

  /** Attacker: open a reaction window (shows on whoever controls the target). */
  const offer = useCallback((o: ReactionOffer) => {
    add(o); // local-first (harmless on the attacker; filtered out by control)
    send("offer", o);
  }, [add]);

  /** Defender's controller: answer an offer — travels back to the attacker.
   *  Also fired locally so a single client acting as BOTH sides (solo testing,
   *  or a DM controlling the defender) resolves without waiting on a self-echo
   *  the realtime layer never sends. The attacker's handler is idempotent. */
  const respond = useCallback((resp: ReactionResponse) => {
    drop(resp.id);
    send("respond", resp);
    respCbRef.current(resp);
  }, [drop]);

  /** Attacker: tear the offer down everywhere once it's been resolved. */
  const clear = useCallback((id: string) => {
    drop(id);
    send("resolve", { id });
  }, [drop]);

  return { pending, offer, respond, clear };
};
