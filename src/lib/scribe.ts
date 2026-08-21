import { supabase } from "./supabase";
import { readFnError } from "./classArt";

/**
 * The Scribe (#0041 slice 1d) — client for the campaign-scribe edge function.
 * One assistant, many lenses: each call names a mode (which atom to write)
 * and optional style filters. Context assembly happens server-side, scoped
 * to the DM's own RLS view.
 */

export type ScribeGenre = "auto" | "drama" | "horror" | "action" | "comedy" | "fantasy";

export const SCRIBE_GENRES: { key: ScribeGenre; label: string }[] = [
  { key: "auto", label: "Genre: auto" },
  { key: "drama", label: "Drama" },
  { key: "horror", label: "Horror" },
  { key: "action", label: "Action" },
  { key: "comedy", label: "Comedy" },
  { key: "fantasy", label: "High fantasy" },
];

interface ScribeResult {
  text: string | null;
  error: string | null;
}

const invoke = async (body: Record<string, unknown>): Promise<ScribeResult> => {
  const { data, error } = await supabase.functions.invoke("campaign-scribe", { body });
  if (error) return { text: null, error: await readFnError(error) };
  const payload = data as { text?: string; error?: string };
  if (payload.error) return { text: null, error: payload.error };
  if (!payload.text) return { text: null, error: "The Scribe returned nothing" };
  return { text: payload.text, error: null };
};

/** ~25-word arrival boxed text, drafted from the scene's description. */
export const draftReadAloud = (gameId: string, sceneId: string, genre: ScribeGenre = "auto") =>
  invoke({ game_id: gameId, mode: "read_aloud", scene_id: sceneId, ...(genre !== "auto" ? { genre } : {}) });

/** 120–180 word player-facing "previously on…", drafted from the session log. */
export const draftRecap = (gameId: string, sessionId: string) =>
  invoke({ game_id: gameId, mode: "recap", session_id: sessionId });
