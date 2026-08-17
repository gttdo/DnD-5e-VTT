import { useCallback, useEffect, useState } from "react";
import { supabase, supabaseConfigured } from "../lib/supabase";

/**
 * The campaign journal for one game — a shared party log.
 *
 * Every member reads all entries; you write and delete your own. Realtime keeps
 * the party in sync (topic journal:{gameId} — the single consumer of it). The
 * whole thing is migration-tolerant: if journal_entries doesn't exist yet the
 * fetch errors, `error` carries it, and the modal shows an apply-migration note
 * instead of breaking — the same pattern fog/drawings use.
 */

export interface JournalEntry {
  id: string;
  game_id: string;
  author_id: string;
  author_name: string;
  title: string | null;
  body: string;
  created_at: string;
}

export const useJournal = (gameId: string | null) => {
  const [entries, setEntries] = useState<JournalEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    if (!gameId || !supabaseConfigured) {
      setLoading(false);
      return;
    }
    const { data, error } = await supabase
      .from("journal_entries")
      .select("*")
      .eq("game_id", gameId)
      .order("created_at", { ascending: false });
    if (error) {
      setError(error.message);
      setEntries([]);
    } else {
      setEntries((data ?? []) as JournalEntry[]);
      setError(null);
    }
    setLoading(false);
  }, [gameId]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  useEffect(() => {
    if (!gameId || !supabaseConfigured) return;
    const channel = supabase
      .channel(`journal:${gameId}`)
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "journal_entries", filter: `game_id=eq.${gameId}` },
        () => refresh()
      )
      .subscribe();
    return () => {
      supabase.removeChannel(channel);
    };
  }, [gameId, refresh]);

  const addEntry = useCallback(
    async (title: string, body: string, authorName: string) => {
      if (!gameId || !body.trim()) return;
      const { data: userData } = await supabase.auth.getUser();
      const user = userData.user;
      if (!user) return;
      const { error } = await supabase.from("journal_entries").insert({
        game_id: gameId,
        author_id: user.id,
        author_name: authorName,
        title: title.trim() || null,
        body: body.trim(),
      });
      if (error) setError(error.message);
      else void refresh();
    },
    [gameId, refresh]
  );

  const removeEntry = useCallback(
    async (id: string) => {
      const { error } = await supabase.from("journal_entries").delete().eq("id", id);
      if (error) setError(error.message);
      else void refresh();
    },
    [refresh]
  );

  return { entries, loading, error, addEntry, removeEntry, refresh };
};
