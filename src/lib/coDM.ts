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

/** A gated action the Co-DM proposes (3c) — nothing runs until the DM approves. */
export interface CoDMProposal {
  tool: string;
  input: Record<string, unknown>;
}

export const askCoDM = async (opts: {
  /** Present for campaign modes; omit for "general". */
  gameId?: string | null;
  messages: CoDMTurn[];
  /** "dm": whole campaign + gated actions. "player": spoiler-safe helper.
   *  "general": no campaign — rules/app/character helper anywhere. */
  mode?: "dm" | "player" | "general";
  /** general mode only: a summary of the character the user is looking at. */
  characterContext?: string;
}): Promise<{ text: string | null; proposals: CoDMProposal[]; error: string | null }> => {
  const { gameId = null, messages, mode = "dm", characterContext } = opts;
  const payloadBody: Record<string, unknown> = { messages, mode };
  if (gameId) payloadBody.game_id = gameId;
  if (characterContext) payloadBody.characterContext = characterContext;
  const { data, error } = await supabase.functions.invoke("co-dm", { body: payloadBody });
  if (error) return { text: null, proposals: [], error: await readFnError(error) };
  const payload = data as { text?: string; proposals?: CoDMProposal[]; error?: string };
  if (payload.error) return { text: null, proposals: [], error: payload.error };
  const proposals = payload.proposals ?? [];
  if (!payload.text && proposals.length === 0) return { text: null, proposals: [], error: "The Co-DM had nothing to say" };
  return { text: payload.text ?? "", proposals, error: null };
};
