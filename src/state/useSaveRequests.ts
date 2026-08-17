import { useCallback, useEffect, useRef, useState } from "react";
import { supabase, supabaseConfigured } from "../lib/supabase";
import type { SaveRequest } from "../lib/saves";

/**
 * Cross-client saving-throw demands. When a caster's client emits a request, it
 * travels to EVERY client on the `saves:{gameId}` topic and lands in `pending`.
 * The component decides which pending requests belong to a token THIS client
 * controls (and shows the roll prompt); the DM additionally sees them all, to
 * roll on an absent player's behalf. Resolving one broadcasts a clear so it
 * leaves everyone's `pending`.
 *
 * Like the other realtime hooks here, this is the SINGLE consumer of its topic
 * — mounting a second on `saves:{gameId}` throws after subscribe().
 */
export const useSaveRequests = (gameId: string | null) => {
  const [pending, setPending] = useState<SaveRequest[]>([]);
  const channelRef = useRef<ReturnType<typeof supabase.channel> | null>(null);
  const joinedRef = useRef(false);

  const add = useCallback((req: SaveRequest) => {
    setPending((prev) => (prev.some((r) => r.id === req.id) ? prev : [...prev, req]));
  }, []);
  const remove = useCallback((id: string) => {
    setPending((prev) => prev.filter((r) => r.id !== id));
  }, []);

  useEffect(() => {
    if (!gameId || !supabaseConfigured) return;
    joinedRef.current = false;
    const channel = supabase.channel(`saves:${gameId}`);
    channel.on("broadcast", { event: "request" }, ({ payload }) => {
      const r = payload as SaveRequest;
      if (r && r.id && r.targetTokenId) add(r);
    });
    channel.on("broadcast", { event: "resolve" }, ({ payload }) => {
      const p = payload as { id?: string };
      if (p?.id) remove(p.id);
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
  }, [gameId, add, remove]);

  /** Demand a save: shows on every client, resolved by whoever controls the target. */
  const request = useCallback(
    (req: SaveRequest) => {
      add(req); // local-first, transport-independent
      const channel = channelRef.current;
      if (channel && joinedRef.current) {
        void channel.send({ type: "broadcast", event: "request", payload: req });
      }
    },
    [add]
  );

  /** Clear a resolved save everywhere. */
  const resolve = useCallback((id: string) => {
    remove(id);
    const channel = channelRef.current;
    if (channel && joinedRef.current) {
      void channel.send({ type: "broadcast", event: "resolve", payload: { id } });
    }
  }, [remove]);

  return { pending, request, resolve };
};
