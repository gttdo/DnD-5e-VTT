import { useEffect, useMemo, useState } from "react";
import { Button } from "./ui/Button";
import { LibraryBanner } from "./ui/LibraryBanner";
import { useToast } from "../state/Toast";
import {
  type BackgroundData,
  type ClassData,
  type SpeciesData,
  type SpellData,
  loadBackgrounds,
  loadClasses,
  loadSpecies,
  loadSpells,
} from "../data/loader";
import { type BuilderState } from "../lib/characterBuilder";
import { CLASS_SPECIES, quickBuildState } from "../lib/quickBuild";

/**
 * Quickbuilder (#110): the fast lane. Pick a class and a species; everything else
 * — abilities, a fitting background, skills, a starter spell loadout, gear — is
 * auto-filled into a complete level-1 hero and handed to the wizard's Review step
 * to tweak or create. Great for new players and one-off NPCs.
 */

interface Props {
  onBuilt: (state: BuilderState) => void;
  onCancel: () => void;
}

// Class monogram colors — mirrors the builder's ClassStep palette.
const CLASS_COLOR: Record<string, string> = {
  Barbarian: "#c0392b", Bard: "#a855f7", Cleric: "#eab308", Druid: "#4ade80",
  Fighter: "#94a3b8", Monk: "#38bdf8", Paladin: "#f59e0b", Ranger: "#22c55e",
  Rogue: "#64748b", Sorcerer: "#ef4444", Warlock: "#7c3aed", Wizard: "#3b82f6",
};

export const CharacterQuickBuild = ({ onBuilt, onCancel }: Props) => {
  const toast = useToast();
  const [classes, setClasses] = useState<Record<string, ClassData> | null>(null);
  const [backgrounds, setBackgrounds] = useState<Record<string, BackgroundData> | null>(null);
  const [species, setSpecies] = useState<Record<string, SpeciesData> | null>(null);
  const [spells, setSpells] = useState<SpellData[] | null>(null);

  const [name, setName] = useState("");
  const [className, setClassName] = useState<string | null>(null);
  // null species = follow the class's recommended default; a value = explicit pick.
  const [speciesPick, setSpeciesPick] = useState<string | null>(null);

  useEffect(() => {
    loadClasses().then(setClasses);
    loadBackgrounds().then(setBackgrounds);
    loadSpecies().then(setSpecies);
    loadSpells().then(setSpells);
  }, []);

  const effectiveSpecies = speciesPick ?? (className ? CLASS_SPECIES[className] ?? null : null);
  const ready = !!(className && effectiveSpecies && classes && backgrounds && species && spells);

  const classNames = useMemo(() => (classes ? Object.keys(classes) : []), [classes]);
  const speciesNames = useMemo(() => (species ? Object.keys(species) : []), [species]);

  const build = () => {
    if (!ready || !className || !effectiveSpecies) return;
    const state = quickBuildState(className, effectiveSpecies, name || `${effectiveSpecies} ${className}`, {
      classes: classes!,
      backgrounds: backgrounds!,
      species: species!,
      spells: spells!,
    });
    toast.success("Hero drafted — review the details before saving.");
    onBuilt(state);
  };

  return (
    <div className="screen-enter" style={{ padding: 24 }}>
      <LibraryBanner
        image="/art/goliath_barbarian.png"
        eyebrow="New Character"
        title="Quickbuilder"
        subtitle="Pick a class and a species — we'll fill in the rest and hand you a ready-to-play level-1 hero to review."
      >
        <Button variant="ghost" size="sm" icon="back" onClick={onCancel}>
          Back
        </Button>
      </LibraryBanner>

      <div style={{ maxWidth: 900, margin: "0 auto", display: "grid", gap: 24 }}>
        {/* Name */}
        <div>
          <label className="dim" style={{ fontSize: 12, textTransform: "uppercase", letterSpacing: 0.5 }}>
            Name <span style={{ opacity: 0.6 }}>(optional)</span>
          </label>
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder={effectiveSpecies && className ? `e.g. ${effectiveSpecies} ${className}` : "Name your hero"}
            style={{ width: "100%", marginTop: 6, padding: "10px 12px", fontSize: 15 }}
          />
        </div>

        {/* Class */}
        <div>
          <div style={{ fontWeight: 600, marginBottom: 10 }}>1 · Choose a class</div>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(130px, 1fr))", gap: 10 }}>
            {classNames.map((c) => {
              const sel = className === c;
              const color = CLASS_COLOR[c] ?? "var(--gold)";
              return (
                <button
                  key={c}
                  onClick={() => setClassName(c)}
                  style={{
                    display: "flex", alignItems: "center", gap: 10, padding: "10px 12px", textAlign: "left",
                    borderRadius: 12,
                    border: `1px solid ${sel ? color : "var(--border)"}`,
                    background: sel ? `color-mix(in srgb, ${color} 16%, var(--bg-1))` : "var(--bg-1)",
                    boxShadow: sel ? `0 0 0 1px ${color} inset` : "none",
                  }}
                >
                  <span
                    style={{
                      width: 30, height: 30, borderRadius: 8, flexShrink: 0, display: "grid", placeItems: "center",
                      background: color, color: "#0b0b0f", fontWeight: 800, fontFamily: "Cinzel, serif", fontSize: 14,
                    }}
                  >
                    {c[0]}
                  </span>
                  <span style={{ fontWeight: 600, fontSize: 14 }}>{c}</span>
                </button>
              );
            })}
          </div>
        </div>

        {/* Species */}
        <div>
          <div style={{ fontWeight: 600, marginBottom: 10 }}>
            2 · Choose a species
            {className && !speciesPick && (
              <span className="dim" style={{ fontSize: 12, fontWeight: 400, marginLeft: 8 }}>
                (suggested for {className}: {CLASS_SPECIES[className]})
              </span>
            )}
          </div>
          <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
            {speciesNames.map((s) => {
              const sel = effectiveSpecies === s;
              return (
                <button
                  key={s}
                  onClick={() => setSpeciesPick(s)}
                  className={sel ? "primary" : ""}
                  style={{ padding: "8px 14px", borderRadius: 999, fontSize: 13, fontWeight: 600 }}
                >
                  {s}
                </button>
              );
            })}
          </div>
        </div>

        <div style={{ display: "flex", justifyContent: "flex-end", gap: 12, paddingTop: 4 }}>
          <Button variant="ghost" onClick={onCancel}>Cancel</Button>
          <Button variant="primary" icon="sparkles" disabled={!ready} onClick={build}>
            Create level-1 hero
          </Button>
        </div>

        <p className="dim" style={{ fontSize: 12, textAlign: "center", lineHeight: 1.6, marginTop: -8 }}>
          We'll assign the standard array to your class's key abilities, pick a fitting background and skills,
          add a starter spell loadout for casters, and a starting kit — all editable on the next screen.
        </p>
      </div>
    </div>
  );
};
