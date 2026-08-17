import { supabase } from "./supabase";
import { findMonster } from "./bestiary";
import { type TokenSize } from "./tokenSmith";
import type {
  TokenType,
  TokenDetails,
  MonsterStatblock,
  NpcProfile,
  MagicItem,
  PropDetails,
  SpellTokenDetails,
} from "../types/content";

/**
 * The token studio's create pipeline, one layer above the edge functions.
 *
 * Two halves, run in parallel by the UI:
 *  - stats: KNOWN creatures come from the bundled SRD bestiary (instant, exact);
 *    everything else is drafted by the generate-statblock function.
 *  - art: the generate-image function (gpt-image-2 / gpt-image-1.5) per-kind.
 */

export type StatSource = "srd" | "generated";

export interface StudioStats {
  details: TokenDetails;
  source: StatSource;
}

/**
 * Extra visual detail pulled from a token's STATS, so the art matches the block
 * instead of re-guessing (a generated dwarf guard captain, not a default human).
 * NPC ancestry + appearance, a monster's creature type + description, an item's
 * type + description. Deduped against the user's own description at the call site.
 */
const visualCuesFromDetails = (details?: TokenDetails | null): string => {
  if (!details) return "";
  if (details.kind === "npc") {
    const n = details.npc;
    return [n.ancestry, n.role, n.appearance].filter(Boolean).join(", ");
  }
  if (details.kind === "monster") {
    const m = details.monster;
    return [m.type && `a ${m.type.toLowerCase()}`, m.description].filter(Boolean).join(", ");
  }
  if (details.kind === "item") return details.item.description ?? "";
  if (details.kind === "prop") return details.prop.description ?? "";
  return "";
};

/** Per-kind image prompt: a circular creature token, or item illustration. */
export const buildStudioImagePrompt = (
  kind: TokenType,
  name: string,
  description: string,
  details?: TokenDetails | null
): string => {
  // The name leads — for a canonical creature ("Purple Worm") that name is the
  // single most important token in the prompt, so it must be the subject, not a
  // trailing "detail". A user description, when given, refines it. We deliberately
  // do NOT route monsters through buildTokenPrompt: its bust-portrait wrapper and
  // generic "a medium <type>" subject line drown out the canonical name and force
  // a humanoid framing on creatures that have none (worms, oozes, dragons).
  const n = name.trim();
  const desc = description.trim();
  // Fold the statblock's own visual details in after the user's description, so
  // the picture reflects what was actually generated/entered (spells excepted —
  // they're abstract emblems, not depictions of a creature).
  const cues = kind === "spell" ? "" : visualCuesFromDetails(details);
  const subject = [n, desc, cues].filter(Boolean).join(", ");

  if (kind === "item") {
    return (
      `A single Dungeons & Dragons magic item: ${subject || "a mysterious artifact"}. ` +
      `Painterly high-fantasy illustration, the item centered and filling the frame on a plain, ` +
      `dark, softly-lit parchment background, dramatic rim light, crisp focus, no text, no words, no border.`
    );
  }

  if (kind === "npc") {
    return (
      `Character portrait token for a virtual tabletop: ${subject || "a memorable fantasy NPC"}. ` +
      `Circular bust portrait, the character centered and framed from the chest up, painterly ` +
      `high-fantasy illustration, dramatic lighting, plain dark background, no text, no words, no border.`
    );
  }

  if (kind === "prop") {
    return (
      `A single Dungeons & Dragons scenery prop: ${subject || "a wooden chest"}. ` +
      `Top-down / slightly angled object token, the object centered and filling the frame on a plain, ` +
      `dark, softly-lit background, painterly high-fantasy illustration, crisp focus, no character, ` +
      `no text, no words, no border.`
    );
  }

  if (kind === "spell") {
    // House style (matches public/icons/spells/*): a glowing, painterly magical-
    // VFX icon that DEPICTS the spell's iconic subject/effect (Chill Touch = a
    // glowing skeletal hand, Fireball = a swirling flame). NOT thin flat vector
    // line-art — thick luminous strokes, a bright incandescent core, soft outer
    // bloom/halo, spark particles. Transparent background, element-keyed color.
    return (
      `A glowing fantasy spell icon in a painterly magical-VFX style, depicting the iconic subject or effect of ` +
      `the spell "${subject || "an arcane spell"}". ` +
      `Render it as vibrant luminous magical energy: BOLD, THICK glowing strokes with a bright incandescent core, ` +
      `a soft radiant outer bloom and halo with visible light-bleed, drifting spark and ember particles and wispy ` +
      `energy trails, hand-illustrated and high-contrast — NOT thin, flat, minimal, or clean vector line-art. ` +
      `A single motif centered and filling the frame on a fully transparent background. ` +
      `Saturated color keyed to the spell's element — fire→orange, cold→cyan, lightning→blue-white, ` +
      `radiant or healing→teal-white, necrotic→toxic green, poison→green, force→violet, psychic→magenta, ` +
      `nature/druid→emerald green. ` +
      `No scenery, no landscape, no background, no text, no words, no border, no UI frame.`
    );
  }

  // Monster → the full iconic creature, anchored on the canonical D&D name.
  // A painterly creature-portrait token (opaque dark vignette — NOT an emblem);
  // the board clips it to a circle, so fill the frame with the creature.
  return (
    `Virtual-tabletop monster token portrait of ${subject || "a fearsome monster"}, ` +
    `true to its canonical Dungeons & Dragons appearance. The full creature in a dynamic pose, ` +
    `centered and filling a circular token frame, rendered as a richly detailed painterly high-fantasy ` +
    `illustration with dramatic cinematic rim lighting, deep shadows and vivid textures, on a plain dark ` +
    `vignette background so it reads clearly as a game token. No text, no words, no border, no UI, no map.`
  );
};

/** Wrap the raw details object from a source into the discriminated union. */
const wrap = (kind: TokenType, raw: unknown): TokenDetails =>
  kind === "monster"
    ? { kind: "monster", monster: raw as MonsterStatblock }
    : kind === "npc"
      ? { kind: "npc", npc: raw as NpcProfile }
      : kind === "prop"
        ? { kind: "prop", prop: raw as PropDetails }
        : kind === "spell"
          ? { kind: "spell", spell: raw as SpellTokenDetails }
          : { kind: "item", item: raw as MagicItem };

/** Lookup (SRD monsters) then generate (unknown / NPC / item). */
export const resolveStats = async (
  kind: TokenType,
  name: string,
  description: string,
  bestiary: MonsterStatblock[] | null
): Promise<StudioStats> => {
  // Props have no AI stats — just a name + a container flag the DM sets.
  if (kind === "prop") {
    return {
      details: { kind: "prop", prop: { name: name.trim() || "Prop", container: /chest|crate|coffer|barrel|box|urn|sack|trunk/i.test(`${name} ${description}`) } },
      source: "generated",
    };
  }
  // Spell markers have no AI stats either — name + (optional) area the DM sets.
  // Default to NO area; the DM picks a shape only for true AoE spells.
  if (kind === "spell") {
    return {
      details: { kind: "spell", spell: { name: name.trim() || "Spell effect" } },
      source: "generated",
    };
  }
  if (kind === "monster") {
    const hit = findMonster(name, bestiary);
    if (hit) return { details: { kind: "monster", monster: hit }, source: "srd" };
  }
  const { data, error } = await supabase.functions.invoke("generate-statblock", {
    body: { kind, name, description },
  });
  if (error) {
    // The most common cause is simply that the function isn't deployed yet.
    const notReachable = /failed to send|failed to fetch|not found|404/i.test(error.message ?? "");
    throw new Error(
      notReachable
        ? "The stat generator isn't deployed yet. Run: supabase functions deploy generate-statblock (SRD monsters work without it)."
        : error.message
    );
  }
  const payload = data as { details?: unknown; error?: string };
  if (payload.error) throw new Error(payload.error);
  if (!payload.details) throw new Error("The generator returned no details.");
  return { details: wrap(kind, payload.details), source: "generated" };
};

/** Generate the art via the image edge function; returns the stored URL. */
export const generateStudioImage = async (
  prompt: string,
  quality: "low" | "medium" | "high" = "high",
  opts: { background?: "transparent" | "opaque" } = {}
): Promise<string> => {
  const { data, error } = await supabase.functions.invoke("generate-image", {
    // `background` is honored by the edge function (gpt-image-1 supports a
    // transparent PNG); harmlessly ignored until that function is redeployed.
    body: { prompt, size: "1024x1024", quality, background: opts.background },
  });
  if (error) throw new Error(await edgeErrorMessage(error));
  const payload = data as { image_url?: string; error?: string };
  if (payload.error) throw new Error(payload.error);
  if (!payload.image_url) throw new Error("No image was returned.");
  return payload.image_url;
};

/**
 * supabase.functions.invoke reports a non-2xx as a FunctionsHttpError whose
 * `.message` is the useless "Edge Function returned a non-2xx status code" — the
 * real reason (e.g. the OpenAI error) is in the response body on `.context`.
 * Dig it out so failures actually say what went wrong.
 */
const edgeErrorMessage = async (error: { message?: string; context?: unknown }): Promise<string> => {
  const ctx = error.context;
  if (ctx && typeof (ctx as Response).json === "function") {
    try {
      const body = await (ctx as Response).clone().json();
      if (body && typeof body.error === "string") return body.error;
    } catch {
      /* body wasn't JSON — fall through to the generic message */
    }
  }
  return error.message ?? "The image service failed.";
};

/** The grid size a saved token should use, read off a monster statblock. */
export const sizeFromDetails = (details: TokenDetails): TokenSize => {
  if (details.kind === "monster") return details.monster.size;
  return "medium";
};

/** A sensible library name from whatever the details carry. */
export const nameFromDetails = (details: TokenDetails, fallback: string): string => {
  if (details.kind === "monster") return details.monster.name || fallback;
  if (details.kind === "npc") return details.npc.name || fallback;
  if (details.kind === "prop") return details.prop.name || fallback;
  if (details.kind === "spell") return details.spell.name || fallback;
  return details.item.name || fallback;
};
