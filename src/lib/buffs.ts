/**
 * Buffs (#conditions Phase 2) — the positive/neutral counterpart to conditions.
 * Stored on a token as a plain string[] of buff names (mirrors `conditions`),
 * shown as status chips above the token and managed from the HUD status picker.
 *
 * We have no per-buff art, so each maps to a tintable school/game glyph
 * (public/icons, fill=currentColor) — good buffs render gold, bad ones red,
 * so the strip stays cohesive with the line-art condition glyphs. `good` also
 * decides the chip tint. Custom buffs fall back to a generic glyph.
 */

export interface BuffDef {
  name: string;
  glyph: string;
  /** false = a harmful spell-effect (Bane, Hex…) — tinted red like a condition. */
  good?: boolean;
  note: string;
}

const G = (p: string) => `/icons/${p}.svg`;
const SCHOOL = (s: string) => G(`spell_schools/school_${s}`);

export const BUFF_CATALOG: BuffDef[] = [
  { name: "Bless", glyph: SCHOOL("abjuration"), good: true, note: "+1d4 to attack rolls and saving throws." },
  { name: "Shield of Faith", glyph: SCHOOL("abjuration"), good: true, note: "+2 AC while it lasts." },
  { name: "Mage Armor", glyph: SCHOOL("abjuration"), good: true, note: "Base AC becomes 13 + DEX." },
  { name: "Haste", glyph: SCHOOL("transmutation"), good: true, note: "+2 AC, advantage on DEX saves, an extra action, doubled speed." },
  { name: "Heroism", glyph: SCHOOL("enchantment"), good: true, note: "Immune to fright; temp HP each turn." },
  { name: "Guidance", glyph: SCHOOL("divination"), good: true, note: "+1d4 to one ability check." },
  { name: "Inspired", glyph: G("game_state/game_inspiration"), good: true, note: "Bardic Inspiration die available." },
  { name: "Raging", glyph: SCHOOL("evocation"), good: true, note: "Resistance to b/p/s damage; bonus melee damage." },
  { name: "Dodging", glyph: SCHOOL("abjuration"), good: true, note: "Attacks against it have disadvantage; advantage on DEX saves." },
  { name: "Blurred", glyph: SCHOOL("illusion"), good: true, note: "Attacks against it have disadvantage." },
  { name: "Concentrating", glyph: G("game_state/game_concentration"), good: true, note: "Holding a spell — taking damage risks breaking it (CON save)." },
  { name: "Hunter's Mark", glyph: SCHOOL("divination"), good: false, note: "Marked: takes +1d6 from the hunter." },
  { name: "Hex", glyph: SCHOOL("necromancy"), good: false, note: "Hexed: +1d6 necrotic from the caster; disadvantage on one ability." },
  { name: "Bane", glyph: SCHOOL("necromancy"), good: false, note: "−1d4 to attack rolls and saving throws." },
  { name: "Slowed", glyph: SCHOOL("transmutation"), good: false, note: "Halved speed, −2 AC & DEX saves, one action only." },
];

const GENERIC = G("game_state/game_inspiration");
const find = (name: string) => BUFF_CATALOG.find((b) => b.name.toLowerCase() === name.toLowerCase());

export const buffGlyph = (name: string): string => find(name)?.glyph ?? GENERIC;
export const buffNote = (name: string): string | undefined => find(name)?.note;
/** Good (gold) unless the catalog marks it harmful; unknown/custom → good. */
export const buffIsGood = (name: string): boolean => find(name)?.good ?? true;
