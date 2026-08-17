/**
 * Library-glyph paths for the six abilities and the eighteen skills
 * (public/icons/abilities, public/icons/skills). Filenames are the snake_case
 * of the stat name, so the mapping is mechanical.
 */
export const abilityGlyph = (a: string): string => `/icons/abilities/abil_${a.toLowerCase()}.svg`;

export const skillGlyph = (name: string): string =>
  `/icons/skills/skill_${name.toLowerCase().replace(/\s+/g, "_")}.svg`;
