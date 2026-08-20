import { supabase } from "./supabase";
import { readFnError } from "./classArt";
import { generateScene, type SceneMood } from "./sceneSmith";
import { buildImagePrompt, type MapStyle, type MapFamily } from "./cartographer";

/**
 * "Generate a Location" (Phase 2, slice 4) — one description yields a MATCHED
 * pair: a cinematic backdrop (the scene's soul) and a top-down battlemap (its
 * tactical face) of the same place. Runs the two existing generators in
 * sequence off one prompt, so the DM authors a whole scene in a single step.
 *
 * Sequential, both at `medium` — two `high` 1536 renders would risk the ~150s
 * platform wall-clock, and back-to-back keeps peak load down.
 */

export interface LocationOpts {
  mood: SceneMood;
  style: MapStyle;
  family: MapFamily;
}

export interface LocationResult {
  cinematicUrl: string | null;
  battlemapUrl: string | null;
  battlemapPrompt: string;
  /** Which step failed, for a clearer message. */
  error: string | null;
}

const generateBattlemap = async (
  description: string,
  style: MapStyle,
  family: MapFamily
): Promise<{ url: string | null; prompt: string; error: string | null }> => {
  const prompt = buildImagePrompt({ description, style, family });
  const { data, error } = await supabase.functions.invoke("generate-image", {
    body: { prompt, size: "1536x1024", quality: "medium" },
  });
  if (error) return { url: null, prompt, error: await readFnError(error) };
  const payload = data as { image_url?: string; error?: string };
  if (payload.error) return { url: null, prompt, error: payload.error };
  if (!payload.image_url) return { url: null, prompt, error: "No battlemap returned" };
  return { url: payload.image_url, prompt, error: null };
};

export const generateLocation = async (
  description: string,
  opts: LocationOpts,
  onProgress?: (step: "backdrop" | "battlemap") => void
): Promise<LocationResult> => {
  onProgress?.("backdrop");
  const scene = await generateScene(description, opts.mood);
  if (scene.error) {
    return { cinematicUrl: null, battlemapUrl: null, battlemapPrompt: "", error: `Backdrop: ${scene.error}` };
  }
  onProgress?.("battlemap");
  const battle = await generateBattlemap(description, opts.style, opts.family);
  return {
    cinematicUrl: scene.url,
    battlemapUrl: battle.url,
    battlemapPrompt: battle.prompt,
    error: battle.error ? `Battlemap: ${battle.error}` : null,
  };
};
