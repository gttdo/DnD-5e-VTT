import { supabase } from "./supabase";
import { readFnError } from "./classArt";

/**
 * The Co-DM (P3 slice 3a) — client for the co-dm edge function. Assist mode:
 * a conversation only, no table effects. The whole campaign is re-assembled
 * server-side from rows each turn, so the client just carries the dialogue.
 */

export interface CoDMTurn {
  role: "user" | "assistant";
  content: string;
}

export const askCoDM = async (
  gameId: string,
  messages: CoDMTurn[]
): Promise<{ text: string | null; error: string | null }> => {
  const { data, error } = await supabase.functions.invoke("co-dm", {
    body: { game_id: gameId, messages },
  });
  if (error) return { text: null, error: await readFnError(error) };
  const payload = data as { text?: string; error?: string };
  if (payload.error) return { text: null, error: payload.error };
  if (!payload.text) return { text: null, error: "The Co-DM had nothing to say" };
  return { text: payload.text, error: null };
};
