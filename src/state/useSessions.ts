import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { supabase, supabaseConfigured } from "../lib/supabase";
import { appendGameLog } from "../lib/gameLog";
import { useAuth } from "./useAuth";

/**
 * GM-controlled sessions (#0041, docs/campaign-editor.md §5) — the recording
 * boundaries of table-time. While a session is live, game_log entries carry
 * its id and count toward the story of record; between sessions everything
 * still works but is off the record.
 *
 * Chapters ⊥ sessions: chapters are story-space, sessions are table-time.
 */

export interface GameSession {
  id: string;
  game_id: string;
  number: number;
  started_at: string;
  ended_at: string | null; // null = live right now
}

/** Sessions older than this with no activity get auto-closed on the next
 *  DM mount — the DM forgot to hit End, not played for 14 hours straight. */
const STALE_SESSION_MS = 6 * 60 * 60 * 1000;

export const useSessions = (
  gameId: string | null,
  opts?: { /** DM surfaces only — enables start/end + stale auto-close. */ canManage?: boolean; dmName?: string }
) => {
  const canManage = opts?.canManage ?? false;
  const dmName = opts?.dmName ?? "DM";
  const { user } = useAuth();
  const [sessions, setSessions] = useState<GameSession[]>([]);
  const [loading, setLoading] = useState(Boolean(gameId));

  useEffect(() => {
    if (!gameId || !supabaseConfigured) {
      setSessions([]);
      setLoading(false);
      return;
    }
    let cancelled = false;
    setLoading(true);
    void (async () => {
      const { data } = await supabase
        .from("sessions")
        .select("*")
        .eq("game_id", gameId)
        .order("number", { ascending: false });
      if (cancelled) return;
      setSessions((data ?? []) as GameSession[]);
      setLoading(false);
    })();
    const channel = supabase
      .channel(`sessions:${gameId}`)
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "sessions", filter: `game_id=eq.${gameId}` },
        (p) => {
          const s = p.new as GameSession;
          setSessions((prev) => (prev.some((x) => x.id === s.id) ? prev : [s, ...prev].sort((a, b) => b.number - a.number)));
        }
      )
      .on(
        "postgres_changes",
        { event: "UPDATE", schema: "public", table: "sessions", filter: `game_id=eq.${gameId}` },
        (p) => {
          const s = p.new as GameSession;
          setSessions((prev) => prev.map((x) => (x.id === s.id ? s : x)));
        }
      )
      .subscribe();
    return () => {
      cancelled = true;
      supabase.removeChannel(channel);
    };
  }, [gameId]);

  const activeSession = useMemo(() => sessions.find((s) => !s.ended_at) ?? null, [sessions]);
  // Roll persistence reads the live session at call time, not render time.
  const activeSessionRef = useRef<GameSession | null>(null);
  activeSessionRef.current = activeSession;

  const startSession = useCallback(async (): Promise<{ session: GameSession | null; error: string | null }> => {
    if (!gameId || !user) return { session: null, error: "Not signed in" };
    if (activeSessionRef.current) return { session: activeSessionRef.current, error: null };
    const number = sessions.length ? Math.max(...sessions.map((s) => s.number)) + 1 : 1;
    const { data, error } = await supabase
      .from("sessions")
      .insert({ game_id: gameId, number })
      .select()
      .single();
    if (error || !data) return { session: null, error: error?.message ?? "Insert failed" };
    const created = data as GameSession;
    setSessions((prev) => (prev.some((x) => x.id === created.id) ? prev : [created, ...prev]));
    appendGameLog({
      game_id: gameId,
      session_id: created.id,
      kind: "system",
      author_id: user.id,
      author_name: dmName,
      body: { type: "session_started", number: created.number },
    });
    return { session: created, error: null };
  }, [gameId, user, sessions, dmName]);

  const endSession = useCallback(
    async (id: string, endedAt?: string): Promise<{ error: string | null }> => {
      if (!gameId || !user) return { error: "Not signed in" };
      const session = sessions.find((s) => s.id === id);
      const ended_at = endedAt ?? new Date().toISOString();
      setSessions((prev) => prev.map((s) => (s.id === id ? { ...s, ended_at } : s)));
      const { error } = await supabase.from("sessions").update({ ended_at }).eq("id", id);
      if (!error && session) {
        appendGameLog({
          game_id: gameId,
          session_id: id,
          kind: "system",
          author_id: user.id,
          author_name: dmName,
          body: { type: "session_ended", number: session.number },
        });
      }
      return { error: error?.message ?? null };
    },
    [gameId, user, sessions, dmName]
  );

  // Auto-close a forgotten session: if the live one has seen no log activity
  // for STALE_SESSION_MS, end it and attribute the end time to the last
  // activity (or the start, for a session that never logged anything).
  const autoClosedRef = useRef(false);
  useEffect(() => {
    if (!canManage || !gameId || !activeSession || autoClosedRef.current) return;
    let cancelled = false;
    void (async () => {
      const { data } = await supabase
        .from("game_log")
        .select("created_at")
        .eq("session_id", activeSession.id)
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle();
      if (cancelled) return;
      const lastActivity = new Date((data as { created_at?: string } | null)?.created_at ?? activeSession.started_at).getTime();
      if (Date.now() - lastActivity > STALE_SESSION_MS) {
        autoClosedRef.current = true;
        void endSession(activeSession.id, new Date(lastActivity).toISOString());
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [canManage, gameId, activeSession, endSession]);

  return { sessions, activeSession, activeSessionRef, loading, startSession, endSession };
};

/** "2h 14m" from a session's bounds; live sessions measure to now. */
export const sessionDuration = (s: GameSession): string => {
  const ms = (s.ended_at ? new Date(s.ended_at).getTime() : Date.now()) - new Date(s.started_at).getTime();
  const mins = Math.max(1, Math.round(ms / 60000));
  const h = Math.floor(mins / 60);
  const m = mins % 60;
  return h ? `${h}h ${m ? `${m}m` : ""}`.trim() : `${m}m`;
};
