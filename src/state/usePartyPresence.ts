import { useEffect, useState } from "react";
import { supabase, supabaseConfigured } from "../lib/supabase";
import { useAuth } from "./useAuth";

/**
 * Who's at the table (Phase 3b) — the game's members, live.
 *
 * Two layers, combined into one list:
 *  - MEMBERSHIP + LOCATION: game_members (+ profiles for names), kept live over
 *    postgres realtime — current_scene_id updates as people roam (0039).
 *  - ONLINE: a Supabase Realtime Presence channel keyed by user id. Everyone at
 *    the table tracks themselves while TableCanvas is mounted; the synced state
 *    is the set of online user ids. No table needed — presence is ephemeral
 *    channel state.
 */
export interface PartyMember {
  user_id: string;
  name: string;
  role: "player" | "dm";
  character_id: string | null;
  /** Their per-player override; null = following the stage. */
  current_scene_id: string | null;
  online: boolean;
}

export const usePartyPresence = (gameId: string | null) => {
  const { user } = useAuth();
  const [members, setMembers] = useState<
    Array<Omit<PartyMember, "online" | "name"> & { name?: string }>
  >([]);
  const [names, setNames] = useState<Map<string, string>>(new Map());
  const [online, setOnline] = useState<Set<string>>(new Set());

  // Membership + names (two-step fetch — same RLS-friendly pattern as
  // usePartyOwners) + realtime on game_members for joins/leaves/roaming.
  useEffect(() => {
    if (!gameId || !supabaseConfigured) {
      setMembers([]);
      return;
    }
    let cancelled = false;
    const load = async () => {
      const { data: rows } = await supabase
        .from("game_members")
        .select("user_id, role, character_id, current_scene_id")
        .eq("game_id", gameId);
      if (cancelled || !rows) return;
      setMembers(rows as PartyMember[]);
      const ids = [...new Set(rows.map((m) => m.user_id))];
      if (ids.length === 0) return;
      const { data: profiles } = await supabase
        .from("profiles")
        .select("user_id, display_name")
        .in("user_id", ids);
      if (cancelled) return;
      const map = new Map<string, string>();
      (profiles ?? []).forEach((p) => {
        if (p.display_name) map.set(p.user_id, p.display_name);
      });
      setNames(map);
    };
    void load();
    const channel = supabase
      .channel(`party:${gameId}`)
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "game_members", filter: `game_id=eq.${gameId}` },
        () => void load() // membership is tiny — refetch beats patch bookkeeping
      )
      .subscribe();
    return () => {
      cancelled = true;
      supabase.removeChannel(channel);
    };
  }, [gameId]);

  // Presence: track myself, watch everyone.
  useEffect(() => {
    if (!gameId || !user || !supabaseConfigured) {
      setOnline(new Set());
      return;
    }
    const channel = supabase.channel(`presence:${gameId}`, {
      config: { presence: { key: user.id } },
    });
    const sync = () => {
      setOnline(new Set(Object.keys(channel.presenceState())));
    };
    channel
      .on("presence", { event: "sync" }, sync)
      .on("presence", { event: "join" }, sync)
      .on("presence", { event: "leave" }, sync)
      .subscribe((status) => {
        if (status === "SUBSCRIBED") void channel.track({ online_at: new Date().toISOString() });
      });
    return () => {
      supabase.removeChannel(channel);
    };
  }, [gameId, user]);

  const party: PartyMember[] = members.map((m) => ({
    ...m,
    name: names.get(m.user_id) ?? (m.role === "dm" ? "DM" : "Player"),
    online: online.has(m.user_id),
  }));

  return { party };
};
