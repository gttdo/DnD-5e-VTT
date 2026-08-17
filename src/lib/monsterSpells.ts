import type { MonsterStatblock } from "../types/content";
import type { CastGroup } from "../components/SpellCastPanel";

/**
 * Pull a castable spell list out of a monster statblock's prose. Monsters store
 * spellcasting as a free-text trait — e.g.
 *
 *   "The shaman is a 6th-level spellcaster. Its spellcasting ability is Wisdom
 *    (spell save DC 13, +5 to hit with spell attacks). It has the following
 *    spells prepared: Cantrips (at will): fire bolt, light; 1st level (4 slots):
 *    cure wounds, guiding bolt; 2nd level (3 slots): hold person, misty step."
 *
 * This parses that common shape into the same CastGroup[] the quick-cast panel
 * uses, plus the save DC / attack bonus / caster level. Returns null if there's
 * no recognizable spellcasting trait — a best-effort convenience, not a spec.
 */

export interface MonsterSpellcasting {
  attackBonus: number;
  saveDC: number | null;
  charLevel: number; // caster level, for cantrip damage scaling
  groups: CastGroup[];
}

const titleCase = (s: string) => s.replace(/\b\w/g, (c) => c.toUpperCase());
const splitSpells = (s: string): string[] =>
  s
    .split(",")
    .map((x) => titleCase(x.trim().replace(/\s*\(.*?\)\s*$/, ""))) // drop trailing "(as a bonus action)" etc.
    .filter(Boolean);

export const parseMonsterSpellcasting = (m: MonsterStatblock): MonsterSpellcasting | null => {
  const trait = (m.traits ?? []).find((t) => /spellcasting/i.test(t.name));
  if (!trait?.text) return null;
  const text = trait.text;

  const dc = text.match(/spell save DC\s*(\d+)/i);
  const atk = text.match(/([+-]?\d+)\s*to hit with spell/i);
  const lvl = text.match(/(\d+)(?:st|nd|rd|th)[-\s]*level spellcaster/i);

  const groups: CastGroup[] = [];
  // Cantrips / at-will.
  const cantrips = text.match(/cantrips?\s*\(at will\)\s*:\s*([^.;\n]+)/i);
  const atWill = text.match(/\bat will\s*:\s*([^.;\n]+)/i);
  const cantripText = cantrips?.[1] ?? (cantrips ? null : atWill?.[1]);
  if (cantripText) groups.push({ level: 0, max: 0, used: 0, spells: splitSpells(cantripText) });

  // Leveled slots: "1st level (4 slots): a, b, c".
  const re = /(\d+)(?:st|nd|rd|th)[-\s]*level\s*\((\d+)\s*slots?\)\s*:\s*([^.;\n]+)/gi;
  let match: RegExpExecArray | null;
  while ((match = re.exec(text)) !== null) {
    groups.push({
      level: parseInt(match[1], 10),
      max: parseInt(match[2], 10),
      used: 0,
      spells: splitSpells(match[3]),
    });
  }

  if (groups.length === 0) return null;
  return {
    attackBonus: atk ? parseInt(atk[1], 10) : 0,
    saveDC: dc ? parseInt(dc[1], 10) : null,
    charLevel: lvl ? parseInt(lvl[1], 10) : 1,
    groups,
  };
};
