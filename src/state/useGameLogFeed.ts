import { useCallback, useEffect, useState, type RefObject } from "react";
import { supabase, supabaseConfigured } from "../lib/supabase";
import { useAuth } from "./useAuth";
import type { GameLogEntry } from "../lib/gameLog";
import type { GameSession } from "./useSessions";

/**
 * The persistent table feed (#0041, slice 1c) — game_log as ONE stream the
 * whole table reads: rolls, chat, and system events, interleaved. The panel
 * renders this; blooms and save prompts still ride the faster broadcast
 * channels (a bloom can afford to be lost; the record cannot).
 */

const PAGE = 120;

export const useGameLogFeed = (
  gameId: string | null,
  opts: {
    /** This client's display name, stamped onto chat rows. */
    authorName: string;
    /** Live session at SEND time (not render time) — chat made mid-session is
     *  on the record, everything else is off the record (session_id null). */
    sessionRef: RefObject<GameSession | null>;
  }
) => {
  const { user } = useAuth();
  const [entries, setEntries] = useState<GameLogEntry[]>([]);
  const [loading, setLoading] = useState(Boolean(gameId));

  useEffect(() => {
    if (!gameId || !supabaseConfigured) {
      setEntries([]);
      setLoading(false);
      return;
    }
    let cancelled = false;
    setLoading(true);
    void (async () => {
      const { data } = await supabase
        .from("game_log")
        .select("*")
        .eq("game_id", gameId)
        .order("created_at", { ascending: false })
        .limit(PAGE);
      if (cancelled) return;
      setEntries(((data ?? []) as GameLogEntry[]).reverse()); // chronological
      setLoading(false);
    })();
    const channel = supabase
      .channel(`game-log:${gameId}`)
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "game_log", filter: `game_id=eq.${gameId}` },
        (p) => {
          const e = p.new as GameLogEntry;
          setEntries((prev) => (prev.some((x) => x.id === e.id) ? prev : [...prev, e]));
        }
      )
      .subscribe();
    return () => {
      cancelled = true;
      supabase.removeChannel(channel);
    };
  }, [gameId]);

  const sendChat = useCallback(
    async (text: string): Promise<{ error: string | null }> => {
      const trimmed = text.trim();
      if (!trimmed || !gameId || !user) return { error: null };
      const { data, error } = await supabase
        .from("game_log")
        .insert({
          game_id: gameId,
          session_id: opts.sessionRef.current?.id ?? null,
          kind: "chat",
          author_id: user.id,
          author_name: opts.authorName,
          body: { text: trimmed },
        })
        .select()
        .single();
      if (error) return { error: error.message };
      // Optimistic append; the realtime echo dedupes by id.
      const row = data as GameLogEntry;
      setEntries((prev) => (prev.some((x) => x.id === row.id) ? prev : [...prev, row]));
      return { error: null };
    },
    [gameId, user, opts.authorName, opts.sessionRef]
  );

  return { entries, loading, sendChat };
};
