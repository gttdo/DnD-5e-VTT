import { useState } from "react";
import type { Character, Condition } from "../types/character";
import type { CharacterAPI } from "../state/useCharacter";
import { initiative, proficiencyBonus } from "../lib/calc";
import { rollD20 } from "../lib/dice";
import { useDiceLog } from "../state/DiceLog";

const ALL_CONDITIONS: Condition[] = [
  "Blinded", "Charmed", "Deafened", "Frightened", "Grappled",
  "Incapacitated", "Invisible", "Paralyzed", "Petrified", "Poisoned",
  "Prone", "Restrained", "Stunned", "Unconscious", "Exhaustion",
];

interface Props {
  character: Character;
  api: CharacterAPI;
}

export const TopBar = ({ character: c, api }: Props) => {
  const [amount, setAmount] = useState(5);
  const { push } = useDiceLog();
  const initials = c.name
    .split(/\s+/)
    .map((w) => w[0])
    .filter(Boolean)
    .slice(0, 2)
    .join("")
    .toUpperCase();

  const rollInit = () => {
    const r = rollD20(initiative(c));
    push("Initiative", r);
  };

  return (
    <div className="topbar">
      <div className="topbar-grid">
        {/* Portrait + identity */}
        <div className="row" style={{ gap: 12 }}>
          {c.portrait ? (
            <img className="portrait" src={c.portrait} alt={c.name} />
          ) : (
            <div className="portrait">{initials || "?"}</div>
          )}
          <div>
            <input
              className="char-name"
              value={c.name}
              onChange={(e) => api.setName(e.target.value)}
            />
            <div className="subline">
              {c.species} · {c.classes.map((cl) => `${cl.name} ${cl.level}`).join(" / ")} · {c.background}
            </div>
          </div>
        </div>

        {/* Rest + conditions in main row */}
        <div className="col" style={{ alignItems: "flex-start", gap: 6 }}>
          <div className="row">
            <button onClick={api.shortRest} title="Recover short-rest features">Short Rest</button>
            <button onClick={api.longRest} title="Full HP and recover all features">Long Rest</button>
            <button
              className={`inspiration ${c.inspiration ? "on" : ""}`}
              onClick={api.toggleInspiration}
              title="Heroic Inspiration"
            >
              ★
            </button>
          </div>
          <div className="condition-chips">
            {ALL_CONDITIONS.map((cond) => (
              <span
                key={cond}
                className={`cond-chip ${c.conditions.includes(cond) ? "on" : ""}`}
                onClick={() => api.toggleCondition(cond)}
              >
                {cond}
              </span>
            ))}
          </div>
        </div>

        {/* HP */}
        <div className="hp-tracker" style={{ gridTemplateColumns: "1fr 1fr 1fr" }}>
          <div>
            <label>Current</label>
            <div className="hp-current">{c.hp.current}</div>
          </div>
          <div>
            <label>Max</label>
            <div className="hp-max">{c.hp.max}</div>
          </div>
          <div>
            <label>Temp</label>
            <div className="hp-max">{c.hp.temp || "—"}</div>
          </div>
          <div className="hp-bar">
            <div style={{ width: `${(c.hp.current / c.hp.max) * 100}%` }} />
          </div>
          <div className="heal-damage-row" style={{ gridColumn: "1 / -1", marginTop: 4 }}>
            <input
              type="number"
              value={amount}
              onChange={(e) => setAmount(parseInt(e.target.value, 10) || 0)}
            />
            <button onClick={() => api.heal(amount)} title="Heal">+ Heal</button>
            <button onClick={() => api.damage(amount)} className="primary" title="Take Damage">− Dmg</button>
            <button onClick={() => api.setTempHp(amount)} title="Set temp HP">Temp</button>
          </div>
        </div>

        {/* Quick stats */}
        <div className="topbar-stat">
          <label>AC</label>
          <div className="val">{c.ac.override ?? c.ac.value}</div>
        </div>
        <div className="topbar-stat" style={{ cursor: "pointer" }} onClick={rollInit} title="Roll initiative">
          <label>Initiative</label>
          <div className="val">{formatMod(initiative(c))}</div>
        </div>
        <div className="topbar-stat">
          <label>Speed</label>
          <div className="val">{c.speed}<span style={{ fontSize: 11, color: "var(--text-dim)" }}> ft</span></div>
        </div>
        <div className="topbar-stat">
          <label>Prof</label>
          <div className="val">+{proficiencyBonus(c.level)}</div>
        </div>
      </div>
    </div>
  );
};

const formatMod = (n: number) => (n >= 0 ? `+${n}` : `${n}`);
