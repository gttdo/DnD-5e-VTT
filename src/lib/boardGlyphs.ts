/**
 * Library-glyph paths for the board taxonomy (public/icons/board): creature
 * types, sizes, and token kinds. The only consumer of the `board/` set so far.
 */

// Studio presets store Monstrosity as "monster"; SRD seeds store "monstrosity".
const CTYPE_ALIAS: Record<string, string> = { monster: "monstrosity" };
const CTYPES = new Set([
  "aberration", "beast", "celestial", "construct", "dragon", "elemental", "fey",
  "fiend", "giant", "humanoid", "monstrosity", "ooze", "plant", "undead",
]);

/** Creature-type glyph, or null when the type isn't one of the 14 canonical ones. */
export const creatureTypeGlyph = (t?: string | null): string | null => {
  if (!t) return null;
  const raw = t.toLowerCase().trim();
  const slug = CTYPE_ALIAS[raw] ?? raw;
  return CTYPES.has(slug) ? `/icons/board/ctype_${slug}.svg` : null;
};

const SIZES = new Set(["tiny", "small", "medium", "large", "huge", "gargantuan"]);
/** Size glyph for a size_category key, or null if unrecognized. */
export const sizeGlyph = (key?: string | null): string | null => {
  const s = (key ?? "").toLowerCase().trim();
  return SIZES.has(s) ? `/icons/board/size_${s}.svg` : null;
};

const KINDS = new Set(["item", "monster", "npc", "prop", "spell"]);
/** Token-kind glyph (backpack / monster / character / barrel / sparkles). */
export const tokenKindGlyph = (kind?: string | null): string | null => {
  const s = (kind ?? "").toLowerCase().trim();
  return KINDS.has(s) ? `/icons/board/tkind_${s}.svg` : null;
};
