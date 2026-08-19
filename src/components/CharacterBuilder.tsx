import { useEffect, useMemo, useState } from "react";
import type { Ability, Character, SkillName } from "../types/character";
import { Icon } from "./ui/Icon";
import { ABILITIES, ABILITY_FULL, SKILLS } from "../types/character";
import {
  type BackgroundData,
  type ClassData,
  type FeatData,
  type SpeciesData,
  type SpeciesLineage,
  type SpellData,
  loadBackgrounds,
  loadClasses,
  loadFeats,
  loadSpecies,
  loadSpells,
} from "../data/loader";
import {
  type BuilderState,
  buildCharacter,
  emptyBuilderState,
  pointBuyCost,
  pointBuyTotal,
  POINT_BUY_BUDGET,
  roll4d6DropLowest,
  STANDARD_ARRAY,
  spellAllotment,
} from "../lib/characterBuilder";
import { spellsForClass } from "../lib/spellcasting";
import { startingKitSummary } from "../lib/startingEquipment";
import { abilityMod } from "../lib/calc";

type Step = "Home" | "Class" | "Background" | "Species" | "Abilities" | "Spells" | "Equipment" | "Review";

interface Props {
  onCancel: () => void;
  onFinish: (c: Character) => void;
  /** Seed the wizard (Import-from-PDF, #110) — opens pre-filled. */
  initialState?: BuilderState;
  /** Which step to open on (imports land on "Review" to confirm). */
  initialStep?: Step;
}

export const CharacterBuilder = ({ onCancel, onFinish, initialState, initialStep }: Props) => {
  const [step, setStep] = useState<Step>(initialStep ?? "Home");
  const [state, setState] = useState<BuilderState>(() => initialState ?? emptyBuilderState());
  const [classes, setClasses] = useState<Record<string, ClassData> | null>(null);
  const [species, setSpeciesData] = useState<Record<string, SpeciesData> | null>(null);
  const [backgrounds, setBackgrounds] = useState<Record<string, BackgroundData> | null>(null);
  const [feats, setFeats] = useState<Record<string, FeatData> | null>(null);
  const [spellData, setSpellData] = useState<SpellData[] | null>(null);

  useEffect(() => {
    loadClasses().then(setClasses);
    loadSpecies().then(setSpeciesData);
    loadBackgrounds().then(setBackgrounds);
    loadFeats().then(setFeats);
    loadSpells().then(setSpellData);
  }, []);

  // A Spells step slots in after Abilities only for classes that cast at level 1.
  const allot = spellAllotment(state.className);
  const isCaster = !!allot;
  const steps = useMemo<Step[]>(
    () =>
      isCaster
        ? ["Home", "Class", "Background", "Species", "Abilities", "Spells", "Equipment", "Review"]
        : ["Home", "Class", "Background", "Species", "Abilities", "Equipment", "Review"],
    [isCaster]
  );
  // If the active step vanished (e.g. switched to a non-caster class while on
  // Spells), fall back to Class so navigation stays valid.
  useEffect(() => {
    if (!steps.includes(step)) setStep("Class");
  }, [steps, step]);

  const stepIndex = Math.max(0, steps.indexOf(step));

  const spellsComplete =
    !isCaster || (state.cantrips.length >= (allot?.cantrips ?? 0) && state.spells.length >= (allot?.spells ?? 0));
  // Skills: the player must pick the class's full quota. Abilities: they must
  // have actually assigned scores (not the untouched all-10 default).
  const skillQuota = state.className && classes ? classes[state.className]?.skill_choices.count ?? 0 : 0;
  const skillsComplete = !state.className || state.skillChoices.length >= skillQuota;
  const abilitiesComplete = ABILITIES.reduce((s, a) => s + state.abilities[a], 0) !== 60;
  // A species with a lineage/ancestry (Elf, Dragonborn…) needs one chosen (#148).
  const speciesHasLineage = !!(state.species && species && species[state.species]?.lineages);
  const lineageComplete = !speciesHasLineage || !!state.lineage;
  const canFinish = !!(
    state.name &&
    state.className &&
    state.background &&
    state.species &&
    lineageComplete &&
    spellsComplete &&
    skillsComplete &&
    abilitiesComplete
  );

  // Per-step completion — drives the check marks in the rail and the summary
  // progress chip, so the builder reads like a checklist you can see through.
  const done: Record<Step, boolean> = {
    Home: !!state.name,
    Class: !!state.className && skillsComplete,
    Background: !!state.background,
    Species: !!state.species && lineageComplete,
    Abilities: abilitiesComplete,
    Spells: spellsComplete,
    Equipment: true,
    Review: !!canFinish,
  };
  const doneCount = steps.filter((s) => s !== "Review" && done[s]).length;
  const totalPicks = steps.length - 1;
  const initials = state.name
    ? state.name.trim().split(/\s+/).slice(0, 2).map((w) => w[0]?.toUpperCase() ?? "").join("")
    : "?";

  const finish = () => {
    if (!classes || !species || !backgrounds || !canFinish) return;
    const c = buildCharacter(state, { classes, species, backgrounds, feats: feats ?? undefined });
    onFinish(c);
  };

  return (
    <div style={{ minHeight: "100vh", display: "flex", flexDirection: "column" }}>
      {/* Header */}
      <div className="topbar">
        <div className="row" style={{ justifyContent: "space-between" }}>
          <div className="row" style={{ gap: 16 }}>
            <button
              className="ghost"
              onClick={onCancel}
              title="Back to character list"
              style={{ display: "inline-flex", alignItems: "center", gap: 6 }}
            >
              <Icon name="back" size={14} />
              Back
            </button>
            <h2 style={{ color: "var(--cream)", fontSize: 18 }}>Character Builder</h2>
          </div>
          <div className="row" style={{ gap: 4 }}>
            {steps.map((s, i) => (
              <button
                key={s}
                className={`tab ${step === s ? "active" : ""}`}
                onClick={() => setStep(s)}
                style={{ fontSize: 11, display: "inline-flex", alignItems: "center", gap: 4 }}
                title={done[s] && s !== "Review" ? `${s} — done` : s}
              >
                {done[s] && s !== "Review" ? (
                  <Icon name="check" size={11} />
                ) : (
                  <span style={{ opacity: 0.55 }}>{i + 1}.</span>
                )}
                {s}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* Persistent character summary — who you're building, always in view. */}
      <div
        className="row"
        style={{
          gap: 12,
          alignItems: "center",
          padding: "10px 16px",
          borderBottom: "1px solid var(--panel-border)",
          background: "var(--panel)",
        }}
      >
        {state.portrait ? (
          <img
            src={state.portrait}
            alt=""
            style={{ width: 42, height: 42, borderRadius: "50%", objectFit: "cover", flexShrink: 0 }}
          />
        ) : (
          <div
            style={{
              width: 42,
              height: 42,
              borderRadius: "50%",
              display: "grid",
              placeItems: "center",
              background: "var(--bg-1)",
              color: "var(--text-dim)",
              fontFamily: "var(--font-display)",
              fontSize: 15,
              flexShrink: 0,
            }}
          >
            {initials}
          </div>
        )}
        <div style={{ minWidth: 0 }}>
          <div
            style={{
              fontFamily: "var(--font-display)",
              fontSize: 16,
              color: "var(--cream)",
              overflow: "hidden",
              textOverflow: "ellipsis",
              whiteSpace: "nowrap",
            }}
          >
            {state.name || "Unnamed hero"}
          </div>
          <div className="dim" style={{ fontSize: 12 }}>
            Level 1 · {state.species || "Species?"}{state.lineage ? ` (${state.lineage})` : ""} · {state.className || "Class?"}
            {state.background ? ` · ${state.background}` : ""}
          </div>
        </div>
        <span
          style={{
            marginLeft: "auto",
            fontSize: 11,
            fontWeight: 600,
            letterSpacing: "0.06em",
            padding: "3px 10px",
            borderRadius: 999,
            border: "1px solid",
            borderColor: canFinish ? "var(--good, #4ade80)" : "var(--panel-border)",
            color: canFinish ? "var(--good, #4ade80)" : "var(--text-dim)",
            whiteSpace: "nowrap",
          }}
        >
          {canFinish ? "Ready" : `${doneCount}/${totalPicks} chosen`}
        </span>
      </div>

      {/* Body */}
      <div style={{ flex: 1, overflowY: "auto", padding: "24px 16px" }}>
        <div style={{ maxWidth: 900, margin: "0 auto" }}>
          {step === "Home" && <HomeStep state={state} setState={setState} />}
          {step === "Class" && <ClassStep state={state} setState={setState} data={classes} />}
          {step === "Background" && <BackgroundStep state={state} setState={setState} data={backgrounds} />}
          {step === "Species" && <SpeciesStep state={state} setState={setState} data={species} />}
          {step === "Abilities" && <AbilitiesStep state={state} setState={setState} backgrounds={backgrounds} />}
          {step === "Spells" && allot && (
            <SpellsStep state={state} setState={setState} spellData={spellData} className={state.className} allot={allot} />
          )}
          {step === "Equipment" && <EquipmentStep state={state} setState={setState} classes={classes} backgrounds={backgrounds} />}
          {step === "Review" && (
            <ReviewStep
              state={state}
              classes={classes}
              species={species}
              backgrounds={backgrounds}
              onFinish={finish}
              canFinish={!!canFinish}
              extraMissing={[
                ...(!lineageComplete ? [species && state.species ? (species[state.species]?.lineage_label ?? "Lineage") : "Lineage"] : []),
                ...(state.className && !skillsComplete
                  ? [`${skillQuota - state.skillChoices.length} more skill${skillQuota - state.skillChoices.length === 1 ? "" : "s"}`]
                  : []),
                ...(!abilitiesComplete ? ["Ability scores"] : []),
                ...(isCaster && !spellsComplete ? ["Spells"] : []),
              ]}
            />
          )}
        </div>
      </div>

      {/* Footer — pinned to the viewport bottom so Previous/Next/Create stay in
          reach without scrolling, even on a short step. */}
      <div
        className="topbar"
        style={{
          borderTop: "1px solid var(--panel-border)",
          borderBottom: "none",
          position: "sticky",
          bottom: 0,
          zIndex: 20,
          background: "var(--bg-0)",
        }}
      >
        <div className="row" style={{ justifyContent: "space-between" }}>
          <button
            disabled={stepIndex === 0}
            onClick={() => setStep(steps[stepIndex - 1])}
            style={{
              visibility: stepIndex === 0 ? "hidden" : "visible",
              display: "inline-flex",
              alignItems: "center",
              gap: 6,
            }}
          >
            <Icon name="back" size={14} />
            Previous
          </button>
          <div className="dim" style={{ fontSize: 12 }}>
            Step {stepIndex + 1} of {steps.length}
          </div>
          {stepIndex < steps.length - 1 ? (
            <button
              className="primary"
              onClick={() => setStep(steps[stepIndex + 1])}
              style={{ display: "inline-flex", alignItems: "center", gap: 6 }}
            >
              Next
              <Icon name="forward" size={14} />
            </button>
          ) : (
            <button
              className="primary"
              disabled={!canFinish}
              onClick={finish}
              style={{ display: "inline-flex", alignItems: "center", gap: 6 }}
            >
              <Icon name="check" size={14} />
              Create Character
            </button>
          )}
        </div>
      </div>
    </div>
  );
};

// ============================================================================
// Step components
// ============================================================================

interface StepProps {
  state: BuilderState;
  setState: React.Dispatch<React.SetStateAction<BuilderState>>;
}

const HomeStep = ({ state, setState }: StepProps) => (
  <div className="panel">
    <h2 style={{ color: "var(--cream)", marginBottom: 16 }}>Who Is Your Hero?</h2>
    <div className="col" style={{ gap: 16 }}>
      <label className="col" style={{ gap: 4 }}>
        <span className="dim" style={{ fontSize: 11, letterSpacing: "0.16em", textTransform: "uppercase" }}>
          Character Name
        </span>
        <input
          value={state.name}
          onChange={(e) => setState({ ...state, name: e.target.value })}
          placeholder="e.g. Drashk Stoneheart"
          style={{ fontSize: 18, padding: 10 }}
        />
      </label>
      <label className="col" style={{ gap: 4 }}>
        <span className="dim" style={{ fontSize: 11, letterSpacing: "0.16em", textTransform: "uppercase" }}>
          Alignment (optional)
        </span>
        <select
          value={state.alignment}
          onChange={(e) => setState({ ...state, alignment: e.target.value })}
          style={{ fontSize: 14, padding: 8 }}
        >
          <option value="">—</option>
          {[
            "Lawful Good", "Neutral Good", "Chaotic Good",
            "Lawful Neutral", "True Neutral", "Chaotic Neutral",
            "Lawful Evil", "Neutral Evil", "Chaotic Evil",
          ].map((a) => (
            <option key={a} value={a}>{a}</option>
          ))}
        </select>
      </label>
      <label className="col" style={{ gap: 4 }}>
        <span className="dim" style={{ fontSize: 11, letterSpacing: "0.16em", textTransform: "uppercase" }}>
          Portrait URL (optional)
        </span>
        <input
          value={state.portrait ?? ""}
          onChange={(e) => setState({ ...state, portrait: e.target.value })}
          placeholder="https://..."
        />
      </label>
    </div>
  </div>
);

// Per-class accent for the monogram badges — a splash of identity in lieu of
// full class art (which we don't ship). Falls back to gold for anything new.
const CLASS_COLOR: Record<string, string> = {
  Barbarian: "#c0392b", Bard: "#a855f7", Cleric: "#eab308", Druid: "#4ade80",
  Fighter: "#94a3b8", Monk: "#38bdf8", Paladin: "#f59e0b", Ranger: "#22c55e",
  Rogue: "#64748b", Sorcerer: "#ef4444", Warlock: "#7c3aed", Wizard: "#3b82f6",
};

const ClassStep = ({
  state, setState, data,
}: StepProps & { data: Record<string, ClassData> | null }) => {
  const [q, setQ] = useState("");
  if (!data) return <div className="panel">Loading classes…</div>;
  const needle = q.trim().toLowerCase();
  const entries = Object.entries(data).filter(([name]) => name.toLowerCase().includes(needle));
  const selected = state.className ? data[state.className] : null;

  // "any" (Bard) means pick from the whole skill list — surface all of them
  // instead of the old "coming soon" stub.
  const skillList =
    selected?.skill_choices.list === "any"
      ? SKILLS.map((s) => s.name)
      : (selected?.skill_choices.list ?? null);

  const toggleSkill = (s: string) => {
    if (!selected) return;
    const has = state.skillChoices.includes(s as SkillName);
    if (has) {
      setState({ ...state, skillChoices: state.skillChoices.filter((x) => x !== s) });
    } else if (state.skillChoices.length < selected.skill_choices.count) {
      setState({ ...state, skillChoices: [...state.skillChoices, s as SkillName] });
    }
  };

  return (
    <div>
      <h2 style={{ color: "var(--cream)", marginBottom: 16 }}>Choose a Class</h2>
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16 }}>
        <div className="col" style={{ gap: 8 }}>
          <input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Search classes…"
            aria-label="Search classes"
            style={{ width: "100%" }}
          />
          {entries.length === 0 && <div className="dim" style={{ fontSize: 12, padding: 8 }}>No classes match “{q}”.</div>}
          {entries.map(([name, c]) => {
            const on = state.className === name;
            const color = CLASS_COLOR[name] ?? "var(--gold)";
            return (
              <button
                key={name}
                onClick={() => setState({ ...state, className: name, skillChoices: [] })}
                style={{
                  textAlign: "left",
                  padding: "10px 12px",
                  display: "flex",
                  alignItems: "center",
                  gap: 12,
                  borderColor: on ? color : undefined,
                  background: on ? `color-mix(in srgb, ${color} 14%, transparent)` : undefined,
                }}
              >
                <span
                  style={{
                    flexShrink: 0,
                    width: 36,
                    height: 36,
                    borderRadius: 8,
                    display: "grid",
                    placeItems: "center",
                    fontFamily: "Cinzel, serif",
                    fontWeight: 700,
                    fontSize: 16,
                    color,
                    background: `color-mix(in srgb, ${color} 18%, transparent)`,
                    border: `1px solid color-mix(in srgb, ${color} 45%, transparent)`,
                  }}
                >
                  {name[0]}
                </span>
                <span style={{ minWidth: 0 }}>
                  <span style={{ display: "block", fontFamily: "Cinzel, serif", fontWeight: 700, color: on ? "var(--cream)" : undefined }}>{name}</span>
                  <span className="dim" style={{ fontSize: 11 }}>
                    d{c.hit_die} · {c.primary_ability.join("/")} · {c.complexity}
                    {c.caster !== "none" ? " · caster" : ""}
                  </span>
                </span>
              </button>
            );
          })}
        </div>

        <div className="panel">
          {selected ? (
            <div className="col" style={{ gap: 8 }}>
              <h3 style={{ color: "var(--cream)" }}>{state.className}</h3>
              <div className="kv">
                <span className="k">Primary</span><span>{selected.primary_ability.join(", ")}</span>
                <span className="k">Hit Die</span><span>d{selected.hit_die}</span>
                <span className="k">Saves</span><span>{selected.saves.join(", ")}</span>
                <span className="k">Armor</span><span>{selected.armor.join(", ") || "—"}</span>
                <span className="k">Weapons</span><span>{selected.weapons.join(", ") || "—"}</span>
                <span className="k">Tools</span><span>{selected.tools.join(", ") || "—"}</span>
                <span className="k">Caster</span><span>{selected.caster}</span>
              </div>
              <div className="divider" />
              <div className="panel-title">Level-1 Features</div>
              <ul style={{ margin: 0, paddingLeft: 18, color: "var(--text-dim)" }}>
                {(selected.level_features["1"] ?? []).map((f) => (
                  <li key={f}>{f}</li>
                ))}
              </ul>
              <div className="divider" />
              <div className="panel-title">
                Pick {selected.skill_choices.count} skill{selected.skill_choices.count === 1 ? "" : "s"}
              </div>
              {skillList ? (
                <div className="col" style={{ gap: 4 }}>
                  {skillList.map((s) => {
                    const checked = state.skillChoices.includes(s as SkillName);
                    const disabled = !checked && state.skillChoices.length >= selected.skill_choices.count;
                    return (
                      <label key={s} className="row" style={{ opacity: disabled ? 0.4 : 1 }}>
                        <input
                          type="checkbox"
                          checked={checked}
                          disabled={disabled}
                          onChange={() => toggleSkill(s)}
                        />
                        {s}
                      </label>
                    );
                  })}
                </div>
              ) : (
                <div className="dim" style={{ fontSize: 12 }}>
                  This class can pick any {selected.skill_choices.count} skills — full picker UI coming soon.
                </div>
              )}
            </div>
          ) : (
            <div className="dim" style={{ textAlign: "center", padding: 24 }}>
              Select a class to see details.
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

/** Detail card for a chosen lineage: its perks + level-gated innate spells (#148). */
const LineageDetail = ({ lineage }: { lineage: SpeciesLineage }) => {
  const spellRows = lineage.spells
    ? Object.entries(lineage.spells)
        .sort((a, b) => Number(a[0]) - Number(b[0]))
        .map(([lvl, names]) => ({ lvl, list: (Array.isArray(names) ? names : [names]).join(", ") }))
    : [];
  return (
    <div className="feature-card" style={{ display: "grid", gap: 6 }}>
      {lineage.desc && <div className="dim" style={{ fontSize: 12 }}>{lineage.desc}</div>}
      <div className="kv" style={{ fontSize: 12 }}>
        {lineage.speed && (<><span className="k">Speed</span><span>{lineage.speed} ft</span></>)}
        {lineage.darkvision && (<><span className="k">Darkvision</span><span>{lineage.darkvision} ft</span></>)}
        {lineage.resistance && (<><span className="k">Resistance</span><span>{lineage.resistance}</span></>)}
        {lineage.damage_type && (<><span className="k">Breath</span><span>{lineage.damage_type} ({lineage.breath})</span></>)}
      </div>
      {lineage.traits?.map((t) => (
        <div key={t.name} style={{ fontSize: 12 }}>
          <span style={{ fontWeight: 600 }}>{t.name}.</span> <span className="dim">{t.desc}</span>
        </div>
      ))}
      {spellRows.length > 0 && (
        <div style={{ fontSize: 12 }}>
          <span style={{ fontWeight: 600 }}>Innate spells</span>
          {spellRows.map((r) => (
            <div key={r.lvl} className="dim">Lvl {r.lvl}: {r.list}</div>
          ))}
        </div>
      )}
    </div>
  );
};

const SpeciesStep = ({
  state, setState, data,
}: StepProps & { data: Record<string, SpeciesData> | null }) => {
  const [q, setQ] = useState("");
  if (!data) return <div className="panel">Loading species…</div>;
  const needle = q.trim().toLowerCase();
  const entries = Object.entries(data).filter(([name]) => name.toLowerCase().includes(needle));
  const selected = state.species ? data[state.species] : null;

  return (
    <div>
      <h2 style={{ color: "var(--cream)", marginBottom: 16 }}>Choose Your Species</h2>
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16 }}>
        <div className="col" style={{ gap: 8 }}>
          <input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Search species…"
            aria-label="Search species"
            style={{ width: "100%" }}
          />
          {entries.length === 0 && <div className="dim" style={{ fontSize: 12, padding: 8 }}>No species match “{q}”.</div>}
          {entries.map(([name, sp]) => {
            const on = state.species === name;
            return (
              <button
                key={name}
                onClick={() => setState({ ...state, species: name, lineage: null })}
                style={{
                  textAlign: "left",
                  padding: "10px 12px",
                  display: "flex",
                  alignItems: "center",
                  gap: 12,
                  borderColor: on ? "var(--gold)" : undefined,
                  background: on ? "color-mix(in srgb, var(--gold) 14%, transparent)" : undefined,
                }}
              >
                <span
                  style={{
                    flexShrink: 0,
                    width: 36,
                    height: 36,
                    borderRadius: 8,
                    display: "grid",
                    placeItems: "center",
                    fontFamily: "Cinzel, serif",
                    fontWeight: 700,
                    fontSize: 16,
                    color: "var(--gold)",
                    background: "color-mix(in srgb, var(--gold) 16%, transparent)",
                    border: "1px solid color-mix(in srgb, var(--gold) 45%, transparent)",
                  }}
                >
                  {name[0]}
                </span>
                <span style={{ minWidth: 0 }}>
                  <span style={{ display: "block", fontFamily: "Cinzel, serif", fontWeight: 700, color: on ? "var(--cream)" : undefined }}>{name}</span>
                  <span className="dim" style={{ fontSize: 11 }}>{sp.size} · {sp.speed} ft · {sp.creature_type}</span>
                </span>
              </button>
            );
          })}
        </div>

        <div className="panel">
          {selected ? (
            <div className="col" style={{ gap: 10 }}>
              <h3 style={{ color: "var(--cream)" }}>{state.species}</h3>
              <div className="kv">
                <span className="k">Size</span><span>{selected.size}</span>
                <span className="k">Speed</span><span>{selected.speed} ft</span>
                <span className="k">Type</span><span>{selected.creature_type}</span>
              </div>
              <div className="divider" />
              <div className="panel-title">Traits</div>
              {selected.traits.map((t) => (
                <div key={t.name} className="feature-card" style={{ marginBottom: 6 }}>
                  <div style={{ fontWeight: 600 }}>{t.name}</div>
                  <div className="dim" style={{ fontSize: 12, marginTop: 2 }}>{t.desc}</div>
                </div>
              ))}

              {selected.lineages && (
                <>
                  <div className="divider" />
                  <div className="panel-title">{selected.lineage_label ?? "Lineage"}</div>
                  <div style={{ display: "flex", flexWrap: "wrap", gap: 6, marginBottom: 8 }}>
                    {Object.keys(selected.lineages).map((lname) => (
                      <button
                        key={lname}
                        onClick={() => setState({ ...state, lineage: lname })}
                        className={state.lineage === lname ? "primary" : ""}
                        style={{ padding: "6px 12px", borderRadius: 999, fontSize: 12, fontWeight: 600 }}
                      >
                        {lname}
                      </button>
                    ))}
                  </div>
                  {state.lineage && selected.lineages[state.lineage] ? (
                    <LineageDetail lineage={selected.lineages[state.lineage]} />
                  ) : (
                    <div className="dim" style={{ fontSize: 12 }}>
                      Choose a {(selected.lineage_label ?? "lineage").toLowerCase()} to finish this species.
                    </div>
                  )}
                </>
              )}
            </div>
          ) : (
            <div className="dim" style={{ textAlign: "center", padding: 24 }}>
              Select a species to see traits.
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

const BackgroundStep = ({
  state, setState, data,
}: StepProps & { data: Record<string, BackgroundData> | null }) => {
  const [q, setQ] = useState("");
  if (!data) return <div className="panel">Loading backgrounds…</div>;
  const needle = q.trim().toLowerCase();
  const entries = Object.entries(data).filter(
    ([name, bg]) =>
      name.toLowerCase().includes(needle) ||
      bg.feat.toLowerCase().includes(needle) ||
      bg.skill_proficiencies.some((s) => s.toLowerCase().includes(needle))
  );
  const selected = state.background ? data[state.background] : null;

  return (
    <div>
      <h2 style={{ color: "var(--cream)", marginBottom: 16 }}>Choose a Background</h2>
      <div className="dim" style={{ marginBottom: 12, fontSize: 13 }}>
        Backgrounds grant 3 ability score bonuses (+2/+1 or three +1s),
        one Origin feat, two skill proficiencies, and a tool proficiency.
      </div>
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16 }}>
        <div className="col" style={{ gap: 8 }}>
          <input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Search backgrounds, feats, skills…"
            aria-label="Search backgrounds"
            style={{ width: "100%" }}
          />
          {entries.length === 0 && <div className="dim" style={{ fontSize: 12, padding: 8 }}>No backgrounds match “{q}”.</div>}
          {entries.map(([name, bg]) => {
            const on = state.background === name;
            return (
              <button
                key={name}
                onClick={() => setState({ ...state, background: name })}
                style={{
                  textAlign: "left",
                  padding: "10px 12px",
                  display: "flex",
                  alignItems: "center",
                  gap: 12,
                  borderColor: on ? "var(--gold)" : undefined,
                  background: on ? "color-mix(in srgb, var(--gold) 14%, transparent)" : undefined,
                }}
              >
                <span
                  style={{
                    flexShrink: 0,
                    width: 36,
                    height: 36,
                    borderRadius: 8,
                    display: "grid",
                    placeItems: "center",
                    fontFamily: "Cinzel, serif",
                    fontWeight: 700,
                    fontSize: 16,
                    color: "var(--gold)",
                    background: "color-mix(in srgb, var(--gold) 16%, transparent)",
                    border: "1px solid color-mix(in srgb, var(--gold) 45%, transparent)",
                  }}
                >
                  {name[0]}
                </span>
                <span style={{ minWidth: 0 }}>
                  <span style={{ display: "block", fontFamily: "Cinzel, serif", fontWeight: 700, color: on ? "var(--cream)" : undefined }}>{name}</span>
                  <span className="dim" style={{ fontSize: 11 }}>{bg.feat} · {bg.skill_proficiencies.join(", ")}</span>
                </span>
              </button>
            );
          })}
        </div>

        <div className="panel">
          {selected ? (
            <div className="col" style={{ gap: 8 }}>
              <h3 style={{ color: "var(--cream)" }}>{state.background}</h3>
              <div className="kv">
                <span className="k">Ability Scores</span><span>{selected.ability_scores.join(", ")}</span>
                <span className="k">Origin Feat</span><span>{selected.feat}</span>
                <span className="k">Skills</span><span>{selected.skill_proficiencies.join(", ")}</span>
                <span className="k">Tool</span><span>{selected.tool_proficiency}</span>
              </div>
              <div className="divider" />
              <div className="panel-title">Starting Equipment</div>
              <div className="dim" style={{ fontSize: 12 }}>{selected.equipment}</div>
            </div>
          ) : (
            <div className="dim" style={{ textAlign: "center", padding: 24 }}>
              Select a background to see details.
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

const AbilitiesStep = ({
  state, setState, backgrounds,
}: StepProps & { backgrounds: Record<string, BackgroundData> | null }) => {
  // Determine which pool values are still unassigned for the current method
  const unassignedPool = useMemo(() => {
    if (state.abilityMethod === "standard") {
      const used = ABILITIES.map((a) => state.abilities[a]).filter((v) =>
        ([...STANDARD_ARRAY] as number[]).includes(v)
      );
      const pool = [...STANDARD_ARRAY] as number[];
      for (const v of used) {
        const idx = pool.indexOf(v);
        if (idx >= 0) pool.splice(idx, 1);
      }
      return pool;
    }
    return null; // managed via local state for rolled
  }, [state.abilityMethod, state.abilities]);

  const [rolledPool, setRolledPool] = useState<number[]>([]);
  const arrayPool = state.abilityMethod === "standard" ? unassignedPool ?? [] : rolledPool;

  // Entering the step already on "Roll" (with nothing assigned) rolls a set at
  // once, so the dice tray isn't empty and confusing.
  useEffect(() => {
    if (state.abilityMethod === "rolled" && rolledPool.length === 0 && ABILITIES.every((a) => state.abilities[a] === 10)) {
      setRolledPool(roll4d6DropLowest().sort((a, b) => b - a));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const setMethod = (m: BuilderState["abilityMethod"]) => {
    setState({
      ...state,
      abilityMethod: m,
      abilities: { STR: 10, DEX: 10, CON: 10, INT: 10, WIS: 10, CHA: 10 },
    });
    if (m === "rolled") setRolledPool(roll4d6DropLowest().sort((a, b) => b - a));
    else setRolledPool([]);
  };

  // Background bonuses preview
  const bgBonuses = useMemo(() => {
    if (!backgrounds || !state.background) return {};
    const bg = backgrounds[state.background];
    const bonuses: Partial<Record<Ability, number>> = {};
    const map: Record<string, Ability> = {
      Strength: "STR", Dexterity: "DEX", Constitution: "CON",
      Intelligence: "INT", Wisdom: "WIS", Charisma: "CHA",
    };
    if (bg.ability_scores[0]) bonuses[map[bg.ability_scores[0]]] = 2;
    if (bg.ability_scores[1]) bonuses[map[bg.ability_scores[1]]] = 1;
    return bonuses;
  }, [backgrounds, state.background]);

  const assignFromPool = (a: Ability, value: number) => {
    // For rolled mode we still mutate the local pool; for standard mode the
    // pool is derived from state.abilities, so we only need to update abilities.
    if (state.abilityMethod === "rolled") {
      const current = state.abilities[a];
      const newPool = [...rolledPool];
      const idx = newPool.indexOf(value);
      if (idx >= 0) newPool.splice(idx, 1);
      if (current !== 10) newPool.push(current);
      setRolledPool(newPool);
    }
    setState({ ...state, abilities: { ...state.abilities, [a]: value } });
  };

  const clearAbility = (a: Ability) => {
    const current = state.abilities[a];
    if (state.abilityMethod === "rolled" && current !== 10) {
      setRolledPool([...rolledPool, current]);
    }
    setState({ ...state, abilities: { ...state.abilities, [a]: 10 } });
  };

  const pbCost = pointBuyTotal(state.abilities);
  const pbRemaining = POINT_BUY_BUDGET - pbCost;

  const stepPB = (a: Ability, delta: number) => {
    const next = state.abilities[a] + delta;
    if (next < 8 || next > 15) return;
    const candidate = { ...state.abilities, [a]: next };
    if (pointBuyTotal(candidate) > POINT_BUY_BUDGET) return;
    setState({ ...state, abilities: candidate });
  };

  return (
    <div>
      <h2 style={{ color: "var(--cream)", marginBottom: 16 }}>Determine Ability Scores</h2>

      <div className="row" style={{ gap: 8, marginBottom: 16 }}>
        {(["standard", "pointbuy", "rolled", "manual"] as const).map((m) => (
          <button
            key={m}
            className={state.abilityMethod === m ? "primary" : ""}
            onClick={() => setMethod(m)}
          >
            {m === "standard" ? "Standard Array" :
             m === "pointbuy" ? "Point Buy" :
             m === "rolled" ? "Roll 4d6 drop lowest" :
             "Manual"}
          </button>
        ))}
      </div>

      {(state.abilityMethod === "standard" || state.abilityMethod === "rolled") && (
        <div
          className="panel"
          style={{ marginBottom: 16, padding: 12, display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap" }}
        >
          <span className="dim" style={{ fontSize: 13 }}>
            {state.abilityMethod === "rolled" ? "Your rolls" : "Standard array"} — assign each to an ability:
          </span>
          <div className="row" style={{ gap: 6, flexWrap: "wrap" }}>
            {arrayPool.length > 0 ? (
              arrayPool.map((v, i) => (
                <span
                  key={`${v}-${i}`}
                  className="mono"
                  style={{
                    minWidth: 34,
                    textAlign: "center",
                    padding: "4px 8px",
                    borderRadius: 8,
                    border: "1px solid var(--gold)",
                    color: "var(--gold)",
                    fontWeight: 700,
                  }}
                >
                  {v}
                </span>
              ))
            ) : (
              <span className="dim" style={{ fontSize: 13, color: "var(--good, #4ade80)" }}>All assigned ✓</span>
            )}
          </div>
          {state.abilityMethod === "rolled" && (
            <button
              onClick={() => {
                setRolledPool(roll4d6DropLowest().sort((a, b) => b - a));
                setState({ ...state, abilities: { STR: 10, DEX: 10, CON: 10, INT: 10, WIS: 10, CHA: 10 } });
              }}
              style={{ marginLeft: "auto", display: "inline-flex", alignItems: "center", gap: 6 }}
              title="Roll a fresh set of six (clears assignments)"
            >
              <Icon name="dice" size={14} />
              Reroll
            </button>
          )}
        </div>
      )}
      {state.abilityMethod === "pointbuy" && (
        <div className="dim" style={{ marginBottom: 12, fontSize: 13 }}>
          Budget used: <span className="mono gold">{pbCost} / {POINT_BUY_BUDGET}</span> · Remaining: <span className="mono">{pbRemaining}</span>
        </div>
      )}

      <div style={{ display: "grid", gridTemplateColumns: "repeat(2, 1fr)", gap: 10 }}>
        {ABILITIES.map((a) => {
          const base = state.abilities[a];
          const bonus = bgBonuses[a] ?? 0;
          const total = base + bonus;
          const mod = abilityMod(total);
          return (
            <div key={a} className="panel" style={{ padding: 12 }}>
              <div className="row" style={{ justifyContent: "space-between", marginBottom: 6 }}>
                <div>
                  <div style={{ fontWeight: 700 }}>{ABILITY_FULL[a]}</div>
                  <div className="dim" style={{ fontSize: 11 }}>{a}</div>
                </div>
                <div style={{ textAlign: "right" }}>
                  <div className="mono" style={{ fontSize: 22, fontWeight: 700 }}>
                    {mod >= 0 ? "+" : ""}{mod}
                  </div>
                  <div className="dim mono" style={{ fontSize: 11 }}>
                    {total}{bonus > 0 ? ` (${base} + ${bonus})` : ""}
                  </div>
                </div>
              </div>

              {state.abilityMethod === "pointbuy" && (
                <div className="row" style={{ gap: 4 }}>
                  <button onClick={() => stepPB(a, -1)} disabled={base <= 8}>−</button>
                  <div className="mono" style={{ width: 40, textAlign: "center" }}>{base}</div>
                  <button onClick={() => stepPB(a, +1)} disabled={base >= 15 || pointBuyCost(base + 1) - pointBuyCost(base) > pbRemaining}>+</button>
                  <span className="dim" style={{ marginLeft: 6, fontSize: 11 }}>
                    cost: {pointBuyCost(base)}
                  </span>
                </div>
              )}

              {(state.abilityMethod === "standard" || state.abilityMethod === "rolled") && (() => {
                // One dropdown per ability, DDB-style: it lists this ability's
                // current value plus every value still in the pool. Picking one
                // assigns it (and returns the old value to the pool); "—" clears.
                const assigned = base !== 10 ? base : null;
                const options = Array.from(new Set([...(assigned != null ? [assigned] : []), ...arrayPool])).sort(
                  (x, y) => y - x
                );
                return (
                  <select
                    className="mono"
                    value={assigned ?? ""}
                    onChange={(e) => {
                      const v = e.target.value;
                      if (v === "") clearAbility(a);
                      else assignFromPool(a, parseInt(v, 10));
                    }}
                    style={{ width: "100%" }}
                    aria-label={`Assign a score to ${ABILITY_FULL[a]}`}
                  >
                    <option value="">— assign a roll —</option>
                    {options.map((v, i) => (
                      <option key={`${v}-${i}`} value={v}>
                        {v}
                      </option>
                    ))}
                  </select>
                );
              })()}

              {state.abilityMethod === "manual" && (
                <input
                  type="number"
                  className="mono"
                  value={base}
                  onChange={(e) => setState({
                    ...state,
                    abilities: { ...state.abilities, [a]: parseInt(e.target.value, 10) || 0 },
                  })}
                  style={{ width: 60, textAlign: "center" }}
                />
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
};

const EquipmentStep = ({
  state, setState, classes, backgrounds,
}: StepProps & {
  classes: Record<string, ClassData> | null;
  backgrounds: Record<string, BackgroundData> | null;
}) => {
  if (!classes || !backgrounds) return <div className="panel">Loading…</div>;
  const cls = state.className ? classes[state.className] : null;
  const bg = state.background ? backgrounds[state.background] : null;

  return (
    <div>
      <h2 style={{ color: "var(--cream)", marginBottom: 16 }}>Starting Equipment</h2>
      <div className="dim" style={{ marginBottom: 12, fontSize: 13 }}>
        Pick how your character gears up. You can always modify items later from the inventory panel.
      </div>

      <div className="col" style={{ gap: 10 }}>
        {cls && (
          <label className="panel" style={{ cursor: "pointer", borderColor: state.equipmentChoice !== "gold" ? "var(--accent)" : undefined }}>
            <div className="row" style={{ gap: 12, alignItems: "flex-start" }}>
              <input
                type="radio"
                name="eq"
                checked={state.equipmentChoice !== "gold"}
                onChange={() => setState({ ...state, equipmentChoice: "A" })}
                style={{ marginTop: 3 }}
              />
              <div>
                <div style={{ fontWeight: 600 }}>{state.className} starting equipment</div>
                <div className="dim" style={{ fontSize: 12, marginTop: 3, lineHeight: 1.5 }}>
                  {startingKitSummary(state.className).join(" · ") || "A ready-to-play kit."}
                </div>
                <div className="dim" style={{ fontSize: 11, marginTop: 4, color: "var(--good, #4ade80)" }}>
                  Your weapon comes equipped — ready in Actions from turn one.
                </div>
                {bg?.equipment && (
                  <div className="dim" style={{ fontSize: 11, marginTop: 4 }}>Plus your {state.background} kit: {bg.equipment}</div>
                )}
              </div>
            </div>
          </label>
        )}
        {cls && (
          <label className="panel" style={{ cursor: "pointer", borderColor: state.equipmentChoice === "gold" ? "var(--accent)" : undefined }}>
            <div className="row" style={{ gap: 12 }}>
              <input
                type="radio"
                name="eq"
                checked={state.equipmentChoice === "gold"}
                onChange={() => setState({ ...state, equipmentChoice: "gold" })}
              />
              <div>
                <div style={{ fontWeight: 600 }}>Start with gold</div>
                <div className="dim" style={{ fontSize: 12 }}>
                  Receive {cls.starting_gold} GP to spend on equipment yourself. Useful if you want custom gear.
                </div>
              </div>
            </div>
          </label>
        )}
      </div>
    </div>
  );
};

// ---- Spells (casters only) --------------------------------------------------
const SpellsStep = ({
  state,
  setState,
  spellData,
  className,
  allot,
}: StepProps & {
  spellData: SpellData[] | null;
  className: string | null;
  allot: { cantrips: number; spells: number; prepares: boolean };
}) => {
  const list = useMemo(
    () => (spellData && className ? spellsForClass(spellData, className) : []),
    [spellData, className]
  );
  const cantrips = list.filter((s) => s.level === 0);
  const lvl1 = list.filter((s) => s.level === 1);

  const toggle = (key: "cantrips" | "spells", name: string, max: number) => {
    setState((st) => {
      const cur = st[key];
      if (cur.includes(name)) return { ...st, [key]: cur.filter((n) => n !== name) };
      if (cur.length >= max) return st; // at the cap — ignore extra picks
      return { ...st, [key]: [...cur, name] };
    });
  };

  const section = (key: "cantrips" | "spells", title: string, cap: number, items: SpellData[]) => {
    const picked = state[key];
    return (
      <div style={{ marginBottom: 20 }}>
        <div className="row" style={{ justifyContent: "space-between", alignItems: "baseline", marginBottom: 8 }}>
          <h3 style={{ color: "var(--cream)", fontSize: 15 }}>{title}</h3>
          <span className="dim mono" style={{ fontSize: 12, color: picked.length >= cap ? "var(--good, #4ade80)" : undefined }}>
            {picked.length} / {cap}
          </span>
        </div>
        {items.length === 0 ? (
          <div className="dim" style={{ fontSize: 13 }}>No options in the dataset for this class.</div>
        ) : (
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(180px, 1fr))", gap: 8 }}>
            {items.map((sp) => {
              const on = picked.includes(sp.name);
              const full = !on && picked.length >= cap;
              return (
                <button
                  key={sp.name}
                  className={`feature-card ${on ? "selected" : ""}`}
                  onClick={() => toggle(key, sp.name, cap)}
                  disabled={full}
                  style={{
                    textAlign: "left",
                    opacity: full ? 0.45 : 1,
                    borderColor: on ? "var(--gold)" : undefined,
                    display: "flex",
                    alignItems: "center",
                    gap: 8,
                  }}
                >
                  <Icon name={on ? "check" : "sparkles"} size={14} />
                  <span style={{ minWidth: 0 }}>
                    <span style={{ display: "block", color: "var(--cream)", fontSize: 13, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{sp.name}</span>
                    <span className="dim" style={{ fontSize: 11 }}>{sp.school}</span>
                  </span>
                </button>
              );
            })}
          </div>
        )}
      </div>
    );
  };

  return (
    <div className="panel">
      <h2 style={{ color: "var(--cream)", marginBottom: 4 }}>Choose Your Spells</h2>
      <p className="dim" style={{ fontSize: 13, marginBottom: 16 }}>
        {className} · pick {allot.cantrips} cantrip{allot.cantrips === 1 ? "" : "s"} and {allot.spells} level-1 spell{allot.spells === 1 ? "" : "s"}.
        {allot.prepares ? " You can re-prepare spells later from the character sheet." : ""}
      </p>
      {section("cantrips", "Cantrips", allot.cantrips, cantrips)}
      {section("spells", "Level 1 Spells", allot.spells, lvl1)}
    </div>
  );
};

const ReviewStep = ({
  state, classes, species, backgrounds, onFinish, canFinish, extraMissing,
}: {
  state: BuilderState;
  classes: Record<string, ClassData> | null;
  species: Record<string, SpeciesData> | null;
  backgrounds: Record<string, BackgroundData> | null;
  onFinish: () => void;
  canFinish: boolean;
  extraMissing: string[];
}) => {
  const missing: string[] = [];
  if (!state.name) missing.push("Name");
  if (!state.className) missing.push("Class");
  if (!state.background) missing.push("Background");
  if (!state.species) missing.push("Species");
  missing.push(...extraMissing);

  return (
    <div>
      <h2 style={{ color: "var(--cream)", marginBottom: 16 }}>Review & Create</h2>

      {missing.length > 0 && (
        <div className="panel" style={{ borderColor: "var(--accent)", marginBottom: 12 }}>
          <div style={{ color: "var(--accent)", fontWeight: 600, marginBottom: 4 }}>
            Still missing:
          </div>
          <div>{missing.join(", ")}</div>
        </div>
      )}

      <div className="panel">
        <div className="kv">
          <span className="k">Name</span><span>{state.name || "—"}</span>
          <span className="k">Class</span><span>{state.className || "—"}</span>
          <span className="k">Background</span><span>{state.background || "—"}</span>
          <span className="k">Species</span><span>{state.species ? `${state.species}${state.lineage ? ` (${state.lineage})` : ""}` : "—"}</span>
          <span className="k">Alignment</span><span>{state.alignment || "—"}</span>
          <span className="k">Method</span><span>{state.abilityMethod}</span>
          <span className="k">Abilities</span>
          <span className="mono">
            STR {state.abilities.STR} · DEX {state.abilities.DEX} · CON {state.abilities.CON} ·{" "}
            INT {state.abilities.INT} · WIS {state.abilities.WIS} · CHA {state.abilities.CHA}
          </span>
          <span className="k">Skills</span><span>{state.skillChoices.join(", ") || "—"}</span>
          <span className="k">Equipment</span><span>{state.equipmentChoice === "gold" ? "Gold" : "Background pack"}</span>
        </div>
        <div className="divider" />
        <button className="primary" disabled={!canFinish} onClick={onFinish} style={{ width: "100%", padding: 12 }}>
          Create Character ✓
        </button>
        {!classes || !species || !backgrounds ? (
          <div className="dim" style={{ fontSize: 11, marginTop: 8 }}>Loading data…</div>
        ) : null}
      </div>
    </div>
  );
};
