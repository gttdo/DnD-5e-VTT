import type { Character } from "../types/character";
import { supabase } from "./supabase";

// Class-flavored art (public/*.png) used as the character-sheet backdrop.
// Falls back to the login hero for classes without dedicated art yet.
// A distinct backdrop per class (was 3 images shared across 12) now that the
// art folder has class-specific pieces — keeps the sheet from feeling repetitive.
const CLASS_ART: Record<string, string> = {
  Barbarian: "/art/goliath_barbarian.png",
  Bard: "/art/book_elf_warrior.png",
  Cleric: "/art/cleric_moradin.png",
  Druid: "/art/druid.png",
  Fighter: "/art/paladin.png",
  Monk: "/art/druid_elf.png",
  Paladin: "/art/dragonborn_paladin.png",
  Ranger: "/art/elf_hunter.png",
  Rogue: "/art/archer_v_kraken.png",
  Sorcerer: "/art/dragonborn_warcaster.png",
  Warlock: "/art/tiefling_warlock.png",
  Wizard: "/art/book_wizard.png",
};

/** Static class-art fallback (used until a character has a generated bgImage). */
export const classArtFallback = (c: Character): string =>
  CLASS_ART[c.classes[0]?.name ?? ""] ?? "/art/forest_mountain.png";

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
 * supabase.functions.invoke() collapses any non-2xx into the opaque "Edge
 * Function returned a non-2xx status code". The real reason (e.g. "openai 400:
 * content policy", a timeout) is JSON in the response body on error.context —
 * dig it out so failures are actionable, not mysterious.
 */
export const readFnError = async (error: unknown): Promise<string> => {
  const ctx = (error as { context?: Response } | null)?.context;
  if (ctx && typeof ctx.json === "function") {
    const body = await ctx.json().catch(() => null);
    if (body && typeof body.error === "string") return body.error;
  }
  return error instanceof Error ? error.message : "generation failed";
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
  // The wide 21:9-ish backdrop sits dimmed behind the sheet (atmospheric, not a
  // focal render), so it uses "medium" quality: a high-quality 1536×1024 render
  // risks overrunning the edge function's ~150s budget / resource cap and failing
  // (the same trap the square avatar hit). Medium reliably completes.
  const { data, error } = await supabase.functions.invoke("generate-image", {
    body: { prompt, size: "1536x1024", quality: "medium" },
  });
  if (error) return { url: null, error: await readFnError(error) };
  const payload = data as { image_url?: string; error?: string };
  return { url: payload?.image_url ?? null, error: payload?.error ?? null };
};

/**
 * Generate a SQUARE bust portrait for a character avatar. Square 1024×1024 (not
 * the background generator's wide 1536×1024 scene) and "medium" quality: a
 * high-quality gpt-image render can exceed Supabase's ~150s platform wall-clock,
 * which kills the function before it returns — the connection then hangs with no
 * error (the Change-avatar dialog spun forever). Medium reliably completes in
 * time, the right call for a token-sized image.
 */
export const generateCharacterPortrait = async (
  c: Character,
  promptOverride?: string
): Promise<{ url: string | null; error: string | null }> => {
  const prompt = promptOverride?.trim() || buildCharacterPortraitPrompt(c);
  const { data, error } = await supabase.functions.invoke("generate-image", {
    body: { prompt, size: "1024x1024", quality: "medium" },
  });
  if (error) return { url: null, error: await readFnError(error) };
  const payload = data as { image_url?: string; error?: string };
  return { url: payload?.image_url ?? null, error: payload?.error ?? null };
};
