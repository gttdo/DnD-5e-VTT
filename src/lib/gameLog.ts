import { supabase, supabaseConfigured } from "./supabase";

/**
 * The persistent game log (#0041) — one append-only stream per game: rolls,
 * chat, and system events (scene staged, session start/end). Entries made
 * while a session is live carry its id; everything else is "off the record"
 * (visible in the feed, excluded from recaps and Scribe context).
 *
 * Fire-and-forget by design: the log must never block or break play. A failed
 * insert costs one history row, not a roll.
 */

export type GameLogKind = "roll" | "chat" | "system";

export interface GameLogEntry {
  id: string;
  game_id: string;
  session_id: string | null;
  kind: GameLogKind;
  author_id: string | null;
  author_name: string;
  body: Record<string, unknown>;
  created_at: string;
}

export const appendGameLog = (row: {
  game_id: string;
  session_id: string | null;
  kind: GameLogKind;
  author_id: string | null;
  author_name: string;
  body: Record<string, unknown>;
}): void => {
  if (!supabaseConfigured) return;
  void supabase
    .from("game_log")
    .insert(row)
    .then(({ error }) => {
      if (error) console.error("[game_log] append failed:", error.message);
    });
};
