import { supabase } from "./supabase";
import { readFnError } from "./classArt";

/**
 * Read-aloud narration (the Narrator channel) — client for the narrate edge
 * function. The DM pre-generates a doc's voice in the editor; the returned
 * URL is cached on the doc's meta and played when the text is Presented.
 */
export const generateNarration = async (
  gameId: string,
  text: string,
  voiceId?: string
): Promise<{ url: string | null; error: string | null }> => {
  const { data, error } = await supabase.functions.invoke("narrate", {
    body: { game_id: gameId, text, ...(voiceId ? { voice_id: voiceId } : {}) },
  });
  if (error) return { url: null, error: await readFnError(error) };
  const payload = data as { url?: string; error?: string };
  if (payload.error) return { url: null, error: payload.error };
  if (!payload.url) return { url: null, error: "No audio returned" };
  return { url: payload.url, error: null };
};
