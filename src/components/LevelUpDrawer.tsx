import { useMemo, useState } from "react";
import type { Ability, Character } from "../types/character";
import { ABILITIES, ABILITY_FULL } from "../types/character";
import { useRules } from "../state/Rules";
import {
  averageHpGain,
  conMod,
  featuresAtLevel,
  isAsiLevel,
  pickableFeats,
  rolledHpGain,
  type LevelUpPlan,
} from "../lib/levelUp";
import { roll } from "../lib/dice";
import { useDiceLog } from "../state/DiceLog";
import { useToast } from "../state/Toast";
import { SheetDrawer } from "./ui/SheetDrawer";
import { Icon } from "./ui/Icon";

/**
 * The level-up wizard, as one drawer: HP gain (average or roll), the class
 * features the new level grants, and — at ASI levels — the choice between
 * ability increases and a General feat. Confirm commits everything atomically
 * through onApply — the sheet passes api.applyLevelUp, the VTT passes a
 * roster-backed applier, so the same wizard works from both surfaces.
 *
 * Works for XP and milestone tables alike: eligibility by XP is shown in the
 * header, but levelling is never blocked on it — the DM's word outranks the
 * spreadsheet.
 */

type AsiMode = "plus2" | "split" | "feat";

export const LevelUpDrawer = ({
  character: c,
  onApply,
  onClose,
}: {
  character: Character;
  onApply: (plan: LevelUpPlan) => void;
  onClose: () => void;
}) => {
  const { tables, classes, feats } = useRules();
  const { push } = useDiceLog();
  const toast = useToast();

  const className = c.classes[0]?.name ?? "";
  const newLevel = c.level + 1;
  const hitDie = classes?.[className]?.hit_die ?? 8;
  const con = conMod(c);
  const avg = averageHpGain(hitDie, con);

  const [hpMode, setHpMode] = useState<"average" | "roll">("average");
  const [rolled, setRolled] = useState<number | null>(null);

  const asi = isAsiLevel(className, newLevel, tables);
  const [asiMode, setAsiMode] = useState<AsiMode>("plus2");
  const [abilityA, setAbilityA] = useState<Ability | "">("");
  const [abilityB, setAbilityB] = useState<Ability | "">("");
  const [featName, setFeatName] = useState("");

  const newFeatures = useMemo(
    () => featuresAtLevel(className, newLevel, classes),
    [className, newLevel, classes]
  );
  const featChoices = useMemo(() => pickableFeats(feats), [feats]);

  const doRoll = () => {
    const r = roll(`1d${hitDie}`);
    push(`Hit die (level ${newLevel})`, r);
    setRolled(r.total);
  };

  const hpGain = hpMode === "average" ? avg : rolled !== null ? rolledHpGain(rolled, con) : null;

  const asiReady =
    !asi ||
    (asiMode === "plus2" && abilityA !== "") ||
    (asiMode === "split" && abilityA !== "" && abilityB !== "" && abilityA !== abilityB) ||
    (asiMode === "feat" && featName !== "");
  const ready = hpGain !== null && asiReady;

  const confirm = () => {
    if (!ready || hpGain === null) return;
    const plan: LevelUpPlan = {
      className,
      newLevel,
      hpGain,
      newFeatures,
    };
    if (asi) {
      if (asiMode === "plus2" && abilityA) plan.abilityIncreases = { [abilityA]: 2 };
      if (asiMode === "split" && abilityA && abilityB)
        plan.abilityIncreases = { [abilityA]: 1, [abilityB]: 1 };
      if (asiMode === "feat" && featName) {
        plan.featName = featName;
        plan.featSummary = feats?.[featName]?.summary;
      }
    }
    onApply(plan);
    toast.success(`${c.name} is now level ${newLevel}!`);
    onClose();
  };

  const abilityOptions = (exclude: Ability | "") =>
    ABILITIES.filter((a) => a !== exclude).map((a) => (
      <option key={a} value={a}>
        {ABILITY_FULL[a]}
      </option>
    ));

  return (
    <SheetDrawer
      title={`Level Up — ${c.level} → ${newLevel}`}
      onClose={onClose}
      footer={
        <>
          <button className="primary" disabled={!ready} onClick={confirm}>
            <Icon name="check" size={13} />
            Become level {newLevel}
          </button>
          <button className="ghost" onClick={onClose}>
            Cancel
          </button>
        </>
      }
    >
      <p className="drawer-lede">
        {className} {c.classes[0]?.level ?? c.level} → {newLevel}.
      </p>

      {/* ---- Hit points ---- */}
      <div className="drawer-section-title">Hit Points (d{hitDie} + CON {con >= 0 ? `+${con}` : con})</div>
      <label className="drawer-option">
        <input type="radio" name="hp" checked={hpMode === "average"} onChange={() => setHpMode("average")} />
        <span>
          Take the average: <strong>+{avg} HP</strong>
          <small>Half the die rounded up, plus Constitution.</small>
        </span>
      </label>
      <label className="drawer-option">
        <input type="radio" name="hp" checked={hpMode === "roll"} onChange={() => setHpMode("roll")} />
        <span>
          Roll for it
          {rolled !== null && hpMode === "roll" && (
            <strong> — rolled {rolled}: +{rolledHpGain(rolled, con)} HP</strong>
          )}
          <small>Riskier: anywhere from {Math.max(1, 1 + con)} to {Math.max(1, hitDie + con)}.</small>
        </span>
      </label>
      {hpMode === "roll" && (
        <button onClick={doRoll} style={{ width: "100%", marginTop: 4 }} disabled={rolled !== null}>
          {rolled === null ? `Roll 1d${hitDie}` : `Rolled ${rolled} — locked in`}
        </button>
      )}

      {/* ---- New features ---- */}
      {newFeatures.length > 0 && (
        <>
          <div className="drawer-section-title">You gain</div>
          <ul className="drawer-list">
            {newFeatures.map((f) => (
              <li key={f.id}>{f.name}</li>
            ))}
          </ul>
        </>
      )}

      {/* ---- ASI / feat choice ---- */}
      {asi && (
        <>
          <div className="drawer-section-title">Ability Score Improvement</div>
          <label className="drawer-option">
            <input type="radio" name="asi" checked={asiMode === "plus2"} onChange={() => setAsiMode("plus2")} />
            <span>+2 to one ability</span>
          </label>
          {asiMode === "plus2" && (
            <select value={abilityA} onChange={(e) => setAbilityA(e.target.value as Ability)} style={{ width: "100%", marginBottom: 6 }}>
              <option value="">Choose an ability…</option>
              {abilityOptions("")}
            </select>
          )}
          <label className="drawer-option">
            <input type="radio" name="asi" checked={asiMode === "split"} onChange={() => setAsiMode("split")} />
            <span>+1 to two abilities</span>
          </label>
          {asiMode === "split" && (
            <div style={{ display: "flex", gap: 6, marginBottom: 6 }}>
              <select value={abilityA} onChange={(e) => setAbilityA(e.target.value as Ability)} style={{ flex: 1 }}>
                <option value="">First…</option>
                {abilityOptions(abilityB)}
              </select>
              <select value={abilityB} onChange={(e) => setAbilityB(e.target.value as Ability)} style={{ flex: 1 }}>
                <option value="">Second…</option>
                {abilityOptions(abilityA)}
              </select>
            </div>
          )}
          <label className="drawer-option">
            <input type="radio" name="asi" checked={asiMode === "feat"} onChange={() => setAsiMode("feat")} />
            <span>Take a General feat instead</span>
          </label>
          {asiMode === "feat" && (
            <>
              <select value={featName} onChange={(e) => setFeatName(e.target.value)} style={{ width: "100%" }}>
                <option value="">Choose a feat…</option>
                {featChoices.map(({ name, data }) => (
                  <option key={name} value={name}>
                    {name}{data.prerequisite ? ` (requires ${data.prerequisite})` : ""}
                  </option>
                ))}
              </select>
              {featName && feats?.[featName] && (
                <p className="drawer-note" style={{ marginTop: 6 }}>
                  {feats[featName].summary}
                  {feats[featName].prerequisite && (
                    <>
                      {" "}
                      <em>Requires {feats[featName].prerequisite} — check you qualify.</em>
                    </>
                  )}
                </p>
              )}
            </>
          )}
        </>
      )}

      {ready && hpGain !== null && (
        <p className="drawer-note" style={{ marginTop: 12 }}>
          Confirming grants +{hpGain} HP
          {newFeatures.length ? `, ${newFeatures.map((f) => f.name).join(", ")}` : ""}
          {asi && asiMode !== "feat" && abilityA
            ? `, ${asiMode === "plus2" ? `+2 ${abilityA}` : `+1 ${abilityA} / +1 ${abilityB}`}`
            : ""}
          {asi && asiMode === "feat" && featName ? `, the ${featName} feat` : ""}
          {" "}— all at once.
        </p>
      )}
    </SheetDrawer>
  );
};
