/**
 * Weapon-property glyphs (public/icons/weapon_properties). Property strings on a
 * magic item come with parentheticals ("Thrown (20/60)", "Versatile (1d10)")
 * and mixed casing/hyphens, so slug them down to the canonical filename first.
 */
const SET = new Set([
  "ammunition", "finesse", "heavy", "light", "loading", "reach", "thrown",
  "two_handed", "versatile",
]);

export const weaponPropSlug = (p: string): string =>
  p.toLowerCase().replace(/\([^)]*\)/g, "").trim().replace(/[\s-]+/g, "_");

/** Glyph for a weapon property, or null for ones with no art (e.g. "Special"). */
export const weaponPropGlyph = (p: string): string | null => {
  const s = weaponPropSlug(p);
  return SET.has(s) ? `/icons/weapon_properties/wprop_${s}.svg` : null;
};
