import type { Character } from "../types/character";
import { supabase } from "./supabase";

// Class-flavored art (public/*.png) used as the character-sheet backdrop.
// Falls back to the login hero for classes without dedicated art yet.
const CLASS_ART: Record<string, string> = {
  Wizard: "/art/wizard.png",
  Sorcerer: "/art/wizard.png",
  Warlock: "/art/wizard.png",
  Bard: "/art/wizard.png",
  Paladin: "/art/paladin.png",
  Fighter: "/art/paladin.png",
  Cleric: "/art/paladin.png",
  Ranger: "/art/elf_hunter.png",
  Rogue: "/art/elf_hunter.png",
  Druid: "/art/elf_hunter.png",
  Barbarian: "/art/elf_hunter.png",
  Monk: "/art/elf_hunter.png",
};

/** Static class-art fallback (used until a character has a generated bgImage). */
export const classArtFallback = (c: Character): string =>
  CLASS_ART[c.classes[0]?.name ?? ""] ?? "/art/login.png";

/** The sheet backdrop: the character's own generated scene, or class-art fallback. */
export const classArtFor = (c: Character): string => c.bgImage || classArtFallback(c);

/**
 * Prompt for a cinematic ultrawide character scene used as the sheet backdrop.
 * It sits dimmed behind the sheet, so it's atmospheric, not a tight portrait.
 *
 * Note: gpt-image-1's widest native size is 1536×1024 (3:2). We prompt for a
 * 21:9 ultrawide banner composition and the sheet crops it to a wide band, so
 * the framing reads ultrawide even though the pixels are 3:2.
 */
export const buildCharacterScenePrompt = (c: Character): string => {
  const cls = c.classes.map((cl) => cl.name).join("/") || "adventurer";
  const bits = [c.species, cls].filter(Boolean).join(" ");
  const bg = c.background ? `, a ${c.background.toLowerCase()} by trade` : "";
  return (
    `Ultrawide 21:9 cinematic fantasy banner in the style of a Dungeons & ` +
    `Dragons character splash: a ${bits}${bg}, ${c.name}, in an environment ` +
    `that fits their calling — dramatic chiaroscuro lighting, atmospheric ` +
    `depth and fog, painterly digital brushwork, rich detail on armor, cloth, ` +
    `and weapons, muted warm cinematic palette. The figure sits off to one ` +
    `side with sweeping atmospheric negative space filling the rest of the ` +
    `wide frame. NO text, letters, words, numbers, logos, watermarks, or UI. ` +
    `Wide panoramic composition.`
  );
};

/**
 * Square bust-portrait prompt for a character avatar. The avatar doubles as the
 * VTT token, so this mirrors the token generator's "circular bust, plain
 * background" framing (see lib/tokenSmith) — it reads cleanly clipped to a
 * circle at small sizes.
 */
export const buildCharacterPortraitPrompt = (c: Character): string => {
  const cls = c.classes.map((cl) => cl.name).join("/") || "adventurer";
  const subject = [c.species, cls].filter(Boolean).join(" ");
  return (
    `Character portrait token for a virtual tabletop, Roll20/Foundry/Owlbear ` +
    `marketplace quality. Circular bust portrait: ${subject}${c.name ? ` named ${c.name}` : ""}, ` +
    `centered and framed from mid-chest up, facing forward or slightly angled, ` +
    `filling the composition. SQUARE 1:1 aspect against a SOLID PLAIN ` +
    `background (neutral dark grey or deep navy) — no landscape, no scenery, ` +
    `no environment. Detailed digital painting: visible fabric, armor, skin ` +
    `texture, hair, expression. Dramatic three-quarter lighting, naturalistic ` +
    `muted palette, professional character art. ONLY the bust and plain ` +
    `background — NO text, letters, borders, frames, or watermarks. NOT ` +
    `cartoon, NOT chibi, NOT anime, NOT flat vector.`
  );
};

/**
 * Generate a character backdrop via the generate-image edge function (which is
 * art-agnostic). Returns the public image URL, or null on failure. The caller
 * persists it onto the character (data.bgImage).
 */
export const generateCharacterBackground = async (
  c: Character,
  /** Override the auto-composed prompt (the Change-background dialog lets the
   *  player edit it before generating). */
  promptOverride?: string
): Promise<{ url: string | null; error: string | null }> => {
  const prompt = promptOverride?.trim() || buildCharacterScenePrompt(c);
  const { data, error } = await supabase.functions.invoke("generate-image", {
    body: { prompt, size: "1536x1024", quality: "high" },
  });
  if (error) return { url: null, error: error.message };
  const payload = data as { image_url?: string; error?: string };
  return { url: payload?.image_url ?? null, error: payload?.error ?? null };
};
