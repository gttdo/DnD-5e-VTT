import type { Ability, Character, Feature } from "../types/character";
import type { SpeciesData } from "../data/loader";

/**
 * Apply (or change/clear) a species lineage on an EXISTING character (#148).
 *
 * buildCharacter bakes a lineage in at creation, but characters made before
 * lineages existed — or imported before the subrace was preserved — have none.
 * This re-derives the lineage's effects on the live character so they don't need
 * a rebuild. It is idempotent: it first strips whatever a prior lineage of this
 * species added (traits, darkvision, resistance, innate spells) before applying
 * the new one, so re-running or switching is clean.
 */
export const applyLineage = (
  c: Character,
  sp: SpeciesData,
  lineageName: string | null
): Character => {
  const lineages = sp.lineages ?? {};
  const lin = lineageName ? lineages[lineageName] ?? null : null;

  // Everything ANY lineage of this species could have added — so we can remove a
  // previous choice's marks regardless of which one it was.
  const allLineageSpells = new Set<string>();
  const allResist = new Set<string>();
  for (const l of Object.values(lineages)) {
    if (l.spells) {
      for (const v of Object.values(l.spells)) (Array.isArray(v) ? v : [v]).forEach((s) => allLineageSpells.add(s));
    }
    if (l.resistance) allResist.add(l.resistance);
  }

  // Features: drop old lineage traits, add the chosen lineage's.
  const features: Feature[] = c.features.filter((f) => !f.id.startsWith("feat-lineage-"));
  if (lin?.traits) {
    const label = `${c.species} (${lineageName})`;
    lin.traits.forEach((t, i) =>
      features.push({ id: `feat-lineage-${i}`, name: t.name, source: "species", sourceDetail: label, description: t.desc })
    );
  }

  // Speed + darkvision (lineage overrides the base).
  const speed = lin?.speed ?? sp.speed ?? c.speed;
  const darkvision = lin?.darkvision ?? sp.darkvision;
  const otherSenses = (c.senses.other ?? []).filter((s) => !/darkvision/i.test(s));
  const senses = {
    ...c.senses,
    other: darkvision ? [`Darkvision ${darkvision} ft.`, ...otherSenses] : otherSenses,
  };

  // Resistances: strip any lineage-sourced one, add the new.
  const resistances = (c.defenses.resistances ?? []).filter((r) => !allResist.has(r));
  if (lin?.resistance && !resistances.includes(lin.resistance)) resistances.push(lin.resistance);

  // Innate spells gained by this character's level (level 1 → the "1" set).
  const newInnate: string[] = [];
  if (lin?.spells) {
    for (const [lvl, v] of Object.entries(lin.spells)) {
      if (Number(lvl) <= c.level) newInnate.push(...(Array.isArray(v) ? v : [v]));
    }
  }

  // Rebuild spellcasting: remove any prior innate spells, add the new set.
  const sc = c.spellcasting;
  const known = [...(sc?.known ?? []).filter((n) => !allLineageSpells.has(n)), ...newInnate];
  const prepared = [...(sc?.prepared ?? []).filter((n) => !allLineageSpells.has(n)), ...newInnate];
  let spellcasting = sc;
  if (newInnate.length || known.length || prepared.length) {
    spellcasting = {
      known,
      prepared,
      slotsUsed: sc?.slotsUsed ?? {},
      concentratingOn: sc?.concentratingOn ?? null,
      ...(newInnate.length
        ? { innate: { ability: (lin?.spell_ability ?? "CHA") as Ability, spells: newInnate } }
        : {}),
    };
  } else {
    spellcasting = undefined; // no class or innate spells left
  }

  return {
    ...c,
    lineage: lineageName ?? undefined,
    speed,
    senses,
    features,
    defenses: { ...c.defenses, resistances },
    spellcasting,
  };
};
