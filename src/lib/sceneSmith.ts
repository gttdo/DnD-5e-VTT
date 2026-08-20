import { supabase } from "./supabase";
import { readFnError } from "./classArt";

/**
 * The scene generator (Phase 2). Where the character-backdrop generator makes a
 * cinematic banner of a *person*, this makes one of a *place* — an atmospheric
 * establishing shot to sit behind a scene's cinematic face (see 0035 faces).
 *
 * Deliberately NOT the cartographer: that builds orthographic top-down battle
 * maps. A scene backdrop is a first-person, eye-level matte painting — no grid,
 * no top-down. Same generate-image edge function, wide 1536x1024 at `medium`
 * quality to stay under the ~150s platform wall-clock (high 1536 can time out).
 */

export type SceneMood =
  | "auto"
  | "dawn"
  | "day"
  | "dusk"
  | "night"
  | "storm"
  | "torchlit"
  | "eerie";

export const SCENE_MOODS: { key: SceneMood; label: string; hint: string }[] = [
  { key: "auto", label: "Auto", hint: "let the description decide" },
  { key: "dawn", label: "Dawn", hint: "soft gold first light, long shadows" },
  { key: "day", label: "Daylight", hint: "clear, even, natural light" },
  { key: "dusk", label: "Dusk", hint: "amber sunset, warm rim light" },
  { key: "night", label: "Night", hint: "moonlit blues, deep shadow" },
  { key: "storm", label: "Storm", hint: "grey squall, rain, dramatic sky" },
  { key: "torchlit", label: "Torchlit", hint: "warm firelight pooling in dark" },
  { key: "eerie", label: "Eerie", hint: "cold fog, sickly light, dread" },
];

const MOOD_HINT: Record<Exclude<SceneMood, "auto">, string> = {
  dawn: "soft golden first light with long shadows",
  day: "clear even natural daylight",
  dusk: "amber sunset with warm rim light",
  night: "moonlit blues and deep shadow",
  storm: "a grey squall with driving rain and a dramatic sky",
  torchlit: "warm firelight pooling against darkness",
  eerie: "cold fog, sickly light, and a sense of dread",
};

export const buildScenePrompt = (description: string, mood: SceneMood = "auto"): string => {
  const moodLine = mood === "auto" ? "" : `Lighting and mood: ${MOOD_HINT[mood]}. `;
  return [
    "Ultrawide cinematic fantasy establishing shot — a matte-painting backdrop for a tabletop RPG scene.",
    `Subject: ${description.trim()}.`,
    moodLine +
      "Painterly and atmospheric, with depth and volumetric light, rich detail, first-person eye-level framing.",
    "No characters unless described, no text, no UI, no map grid, no top-down view — this is a scene backdrop, not a map.",
  ]
    .filter(Boolean)
    .join(" ");
};

/** Generate a cinematic scene backdrop. Returns the public image URL. */
export const generateScene = async (
  description: string,
  mood: SceneMood = "auto"
): Promise<{ url: string | null; error: string | null }> => {
  const prompt = buildScenePrompt(description, mood);
  const { data, error } = await supabase.functions.invoke("generate-image", {
    body: { prompt, size: "1536x1024", quality: "medium" },
  });
  if (error) return { url: null, error: await readFnError(error) };
  const payload = data as { image_url?: string; error?: string };
  if (payload.error) return { url: null, error: payload.error };
  if (!payload.image_url) return { url: null, error: "No image returned" };
  return { url: payload.image_url, error: null };
};
