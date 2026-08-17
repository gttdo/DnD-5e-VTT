/**
 * The 13 D&D damage types, mapped to their library glyph (public/icons/damage_types)
 * and an element tint. Kept as one small module so every surface that shows a
 * damage type — attacks, spells, items, the dice log — renders it the same way.
 */
export const DAMAGE_TYPES = [
  "acid", "bludgeoning", "cold", "fire", "force", "lightning", "necrotic",
  "piercing", "poison", "psychic", "radiant", "slashing", "thunder",
] as const;

const SET = new Set<string>(DAMAGE_TYPES);

/** Canonical slug for a free-text damage type, or null if unrecognized. */
export const damageSlug = (t?: string | null): string | null => {
  if (!t) return null;
  const s = t.toLowerCase().trim();
  return SET.has(s) ? s : null;
};

/** Library glyph path for a damage type, or null when we have no art for it. */
export const damageGlyph = (t?: string | null): string | null => {
  const s = damageSlug(t);
  return s ? `/icons/damage_types/dmg_${s}.svg` : null;
};

// Element tints — muted enough to read on both the dark and light themes.
const COLORS: Record<string, string> = {
  acid: "#8bbf3f",
  bludgeoning: "#b0a289",
  cold: "#6cc3e0",
  fire: "#e8863c",
  force: "#c58be0",
  lightning: "#e6c94a",
  necrotic: "#6f8f5f",
  piercing: "#c3ab7f",
  poison: "#7fbf6a",
  psychic: "#e07fb5",
  radiant: "#f2d98a",
  slashing: "#c3ab7f",
  thunder: "#8fa6e0",
};

/** Element tint for a damage type; a neutral gold for anything unmapped. */
export const damageColor = (t?: string | null): string => {
  const s = damageSlug(t);
  return (s && COLORS[s]) || "var(--candle)";
};
