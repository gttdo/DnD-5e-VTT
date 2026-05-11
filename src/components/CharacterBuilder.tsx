import { useEffect, useMemo, useState } from "react";
import type { Ability, Character, SkillName } from "../types/character";
import { ABILITIES, ABILITY_FULL } from "../types/character";
import {
  type BackgroundData,
  type ClassData,
  type SpeciesData,
  loadBackgrounds,
  loadClasses,
  loadSpecies,
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
} from "../lib/characterBuilder";
import { abilityMod } from "../lib/calc";

const STEPS = ["Home", "Class", "Background", "Species", "Abilities", "Equipment", "Review"] as const;
type Step = typeof STEPS[number];

interface Props {
  onCancel: () => void;
  onFinish: (c: Character) => void;
}

export const CharacterBuilder = ({ onCancel, onFinish }: Props) => {
  const [step, setStep] = useState<Step>("Home");
  const [state, setState] = useState<BuilderState>(emptyBuilderState());
  const [classes, setClasses] = useState<Record<string, ClassData> | null>(null);
  const [species, setSpeciesData] = useState<Record<string, SpeciesData> | null>(null);
  const [backgrounds, setBackgrounds] = useState<Record<string, BackgroundData> | null>(null);

  useEffect(() => {
    loadClasses().then(setClasses);
    loadSpecies().then(setSpeciesData);
    loadBackgrounds().then(setBackgrounds);
  }, []);

  const stepIndex = STEPS.indexOf(step);

  const canFinish = state.name && state.className && state.background && state.species;

  const finish = () => {
    if (!classes || !species || !backgrounds || !canFinish) return;
    const c = buildCharacter(state, { classes, species, backgrounds });
    onFinish(c);
  };

  return (
    <div style={{ minHeight: "100vh", display: "flex", flexDirection: "column" }}>
      {/* Header */}
      <div className="topbar">
        <div className="row" style={{ justifyContent: "space-between" }}>
          <div className="row" style={{ gap: 16 }}>
            <button className="ghost" onClick={onCancel} title="Back to character list">
              ← Back
            </button>
            <h2 style={{ color: "var(--gold)", fontSize: 18 }}>Character Builder</h2>
          </div>
          <div className="row" style={{ gap: 4 }}>
            {STEPS.map((s, i) => (
              <button
                key={s}
                className={`tab ${step === s ? "active" : ""}`}
                onClick={() => setState(state) /* keep state */ || setStep(s)}
                style={{
                  fontSize: 11,
                  opacity: i <= stepIndex || state.className ? 1 : 0.5,
                }}
              >
                {i + 1}. {s}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* Body */}
      <div style={{ flex: 1, overflowY: "auto", padding: "24px 16px" }}>
        <div style={{ maxWidth: 900, margin: "0 auto" }}>
          {step === "Home" && <HomeStep state={state} setState={setState} />}
          {step === "Class" && <ClassStep state={state} setState={setState} data={classes} />}
          {step === "Background" && <BackgroundStep state={state} setState={setState} data={backgrounds} />}
          {step === "Species" && <SpeciesStep state={state} setState={setState} data={species} />}
          {step === "Abilities" && <AbilitiesStep state={state} setState={setState} backgrounds={backgrounds} />}
          {step === "Equipment" && <EquipmentStep state={state} setState={setState} classes={classes} backgrounds={backgrounds} />}
          {step === "Review" && (
            <ReviewStep
              state={state}
              classes={classes}
              species={species}
              backgrounds={backgrounds}
              onFinish={finish}
              canFinish={!!canFinish}
            />
          )}
        </div>
      </div>

      {/* Footer */}
      <div className="topbar" style={{ borderTop: "1px solid var(--panel-border)", borderBottom: "none" }}>
        <div className="row" style={{ justifyContent: "space-between" }}>
          <button
            disabled={stepIndex === 0}
            onClick={() => setStep(STEPS[stepIndex - 1])}
            style={{ visibility: stepIndex === 0 ? "hidden" : "visible" }}
          >
            ← Previous
          </button>
          <div className="dim" style={{ fontSize: 12 }}>
            Step {stepIndex + 1} of {STEPS.length}
          </div>
          {stepIndex < STEPS.length - 1 ? (
            <button className="primary" onClick={() => setStep(STEPS[stepIndex + 1])}>
              Next →
            </button>
          ) : (
            <button className="primary" disabled={!canFinish} onClick={finish}>
              Create Character ✓
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
    <h2 style={{ color: "var(--gold)", marginBottom: 16 }}>Who Is Your Hero?</h2>
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

const ClassStep = ({
  state, setState, data,
}: StepProps & { data: Record<string, ClassData> | null }) => {
  if (!data) return <div className="panel">Loading classes…</div>;
  const entries = Object.entries(data);
  const selected = state.className ? data[state.className] : null;

  const skillList = selected?.skill_choices.list === "any"
    ? null
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
      <h2 style={{ color: "var(--gold)", marginBottom: 16 }}>Choose a Class</h2>
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16 }}>
        <div className="col" style={{ gap: 6 }}>
          {entries.map(([name, c]) => (
            <button
              key={name}
              className={state.className === name ? "primary" : ""}
              onClick={() => setState({ ...state, className: name, skillChoices: [] })}
              style={{ textAlign: "left", padding: "10px 14px" }}
            >
              <div style={{ fontFamily: "Cinzel, serif", fontWeight: 700 }}>{name}</div>
              <div className="dim" style={{ fontSize: 11 }}>
                d{c.hit_die} HP · {c.primary_ability.join("/")} · {c.complexity}
              </div>
            </button>
          ))}
        </div>

        <div className="panel">
          {selected ? (
            <div className="col" style={{ gap: 8 }}>
              <h3 style={{ color: "var(--gold)" }}>{state.className}</h3>
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

const SpeciesStep = ({
  state, setState, data,
}: StepProps & { data: Record<string, SpeciesData> | null }) => {
  if (!data) return <div className="panel">Loading species…</div>;
  const entries = Object.entries(data);
  const selected = state.species ? data[state.species] : null;

  return (
    <div>
      <h2 style={{ color: "var(--gold)", marginBottom: 16 }}>Choose Your Species</h2>
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16 }}>
        <div className="col" style={{ gap: 6 }}>
          {entries.map(([name, sp]) => (
            <button
              key={name}
              className={state.species === name ? "primary" : ""}
              onClick={() => setState({ ...state, species: name })}
              style={{ textAlign: "left", padding: "10px 14px" }}
            >
              <div style={{ fontFamily: "Cinzel, serif", fontWeight: 700 }}>{name}</div>
              <div className="dim" style={{ fontSize: 11 }}>
                {sp.size} · {sp.speed} ft · {sp.creature_type}
              </div>
            </button>
          ))}
        </div>

        <div className="panel">
          {selected ? (
            <div className="col" style={{ gap: 10 }}>
              <h3 style={{ color: "var(--gold)" }}>{state.species}</h3>
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
  if (!data) return <div className="panel">Loading backgrounds…</div>;
  const entries = Object.entries(data);
  const selected = state.background ? data[state.background] : null;

  return (
    <div>
      <h2 style={{ color: "var(--gold)", marginBottom: 16 }}>Choose a Background</h2>
      <div className="dim" style={{ marginBottom: 12, fontSize: 13 }}>
        Backgrounds grant 3 ability score bonuses (+2/+1 or three +1s),
        one Origin feat, two skill proficiencies, and a tool proficiency.
      </div>
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16 }}>
        <div className="col" style={{ gap: 6 }}>
          {entries.map(([name, bg]) => (
            <button
              key={name}
              className={state.background === name ? "primary" : ""}
              onClick={() => setState({ ...state, background: name })}
              style={{ textAlign: "left", padding: "10px 14px" }}
            >
              <div style={{ fontFamily: "Cinzel, serif", fontWeight: 700 }}>{name}</div>
              <div className="dim" style={{ fontSize: 11 }}>
                Feat: {bg.feat} · {bg.skill_proficiencies.join(", ")}
              </div>
            </button>
          ))}
        </div>

        <div className="panel">
          {selected ? (
            <div className="col" style={{ gap: 8 }}>
              <h3 style={{ color: "var(--gold)" }}>{state.background}</h3>
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
      <h2 style={{ color: "var(--gold)", marginBottom: 16 }}>Determine Ability Scores</h2>

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
        {state.abilityMethod === "rolled" && (
          <button onClick={() => setRolledPool(roll4d6DropLowest().sort((a, b) => b - a))}>
            ↻ Reroll
          </button>
        )}
      </div>

      {(state.abilityMethod === "standard" || state.abilityMethod === "rolled") && (
        <div className="dim" style={{ marginBottom: 12, fontSize: 13 }}>
          Pool: <span className="mono gold">{arrayPool.length > 0 ? arrayPool.join(", ") : "Empty — assign by clicking on a value below."}</span>
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

              {(state.abilityMethod === "standard" || state.abilityMethod === "rolled") && (
                <div className="row" style={{ gap: 4, flexWrap: "wrap" }}>
                  {arrayPool.length === 0 && base === 10 ? (
                    <span className="dim" style={{ fontSize: 11 }}>Pool empty</span>
                  ) : (
                    arrayPool.map((v, i) => (
                      <button key={`${v}-${i}`} onClick={() => assignFromPool(a, v)}>{v}</button>
                    ))
                  )}
                  {base !== 10 && (
                    <button className="ghost" onClick={() => clearAbility(a)}>
                      ✕ Clear
                    </button>
                  )}
                </div>
              )}

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
      <h2 style={{ color: "var(--gold)", marginBottom: 16 }}>Starting Equipment</h2>
      <div className="dim" style={{ marginBottom: 12, fontSize: 13 }}>
        Pick how your character gears up. You can always modify items later from the inventory panel.
      </div>

      <div className="col" style={{ gap: 10 }}>
        {bg && (
          <label className={`panel ${state.equipmentChoice === "A" ? "" : ""}`} style={{ cursor: "pointer", borderColor: state.equipmentChoice === "A" ? "var(--accent)" : undefined }}>
            <div className="row" style={{ gap: 12 }}>
              <input
                type="radio"
                name="eq"
                checked={state.equipmentChoice === "A"}
                onChange={() => setState({ ...state, equipmentChoice: "A" })}
              />
              <div>
                <div style={{ fontWeight: 600 }}>Background Equipment Pack</div>
                <div className="dim" style={{ fontSize: 12 }}>{bg.equipment}</div>
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

const ReviewStep = ({
  state, classes, species, backgrounds, onFinish, canFinish,
}: {
  state: BuilderState;
  classes: Record<string, ClassData> | null;
  species: Record<string, SpeciesData> | null;
  backgrounds: Record<string, BackgroundData> | null;
  onFinish: () => void;
  canFinish: boolean;
}) => {
  const missing: string[] = [];
  if (!state.name) missing.push("Name");
  if (!state.className) missing.push("Class");
  if (!state.background) missing.push("Background");
  if (!state.species) missing.push("Species");

  return (
    <div>
      <h2 style={{ color: "var(--gold)", marginBottom: 16 }}>Review & Create</h2>

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
          <span className="k">Species</span><span>{state.species || "—"}</span>
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
