import { useState } from "react";
import type { Character } from "../types/character";
import type { CharacterAPI } from "../state/useCharacter";
import { initiative, proficiencyBonus } from "../lib/calc";
import {
  acBreakdown,
  initiativeBreakdown,
  profBreakdown,
  speedBreakdown,
} from "../lib/breakdown";
import { rollD20 } from "../lib/dice";
import { useDiceLog } from "../state/DiceLog";
import { StatDrawer } from "./StatDrawer";

/**
 * AC · Initiative · Speed · Proficiency · Hit Points.
 *
 * These used to sit at the far right of the header, separated from the
 * character's name by the whole width of the sheet. The D&D Beyond reference
 * keeps the header to identity + rest actions and puts these in the same
 * horizontal strip as the ability scores, right below the name — so that's
 * where they live now (see .sheet-vitals).
 *
 * Clicking a stat opens its detail drawer: the value's breakdown and a short
 * rules explainer (the reference's per-stat drawers). Rolling initiative lives
 * inside its drawer, next to the numbers it's explaining.
 */
type VitalKey = "ac" | "initiative" | "speed" | "prof" | null;

export const VitalStats = ({ character: c, api }: { character: Character; api: CharacterAPI }) => {
  const [amount, setAmount] = useState(5);
  const [open, setOpen] = useState<VitalKey>(null);
  const { push } = useDiceLog();
  const hpPct = c.hp.max > 0 ? Math.max(0, Math.min(100, (c.hp.current / c.hp.max) * 100)) : 0;
  const initMod = initiative(c);

  return (
    <div className="panel vitals-panel">
      <div className="vitals-stats">
        <button className="topbar-stat is-roll" onClick={() => setOpen("ac")} title="Armor Class — see how it's calculated">
          <label>AC</label>
          <div className="val">{c.ac.override ?? c.ac.value}</div>
        </button>
        <button className="topbar-stat is-roll" onClick={() => setOpen("initiative")} title="Initiative — breakdown and roll">
          <label>Initiative</label>
          <div className="val">{formatMod(initMod)}</div>
        </button>
        <button className="topbar-stat is-roll" onClick={() => setOpen("speed")} title="Speed — movement rules">
          <label>Speed</label>
          <div className="val">
            {c.speed}
            <span style={{ fontSize: 11, color: "var(--text-dim)" }}> ft</span>
          </div>
        </button>
        <button className="topbar-stat is-roll" onClick={() => setOpen("prof")} title="Proficiency bonus — where it applies">
          <label>Prof</label>
          <div className="val">+{proficiencyBonus(c.level)}</div>
        </button>
      </div>

      {open === "ac" && (
        <StatDrawer title="Armor Class" breakdown={acBreakdown(c)} ruleKey="armorClass" onClose={() => setOpen(null)} />
      )}
      {open === "initiative" && (
        <StatDrawer
          title="Initiative"
          breakdown={initiativeBreakdown(c)}
          ruleKey="initiative"
          onClose={() => setOpen(null)}
        >
          <div className="rules-table" style={{ marginTop: 10 }}>
            <div className="rules-row">
              <span>With advantage (≈)</span>
              <span className="rules-value mono">{formatMod(initMod + 5)}</span>
            </div>
            <div className="rules-row">
              <span>With disadvantage (≈)</span>
              <span className="rules-value mono">{formatMod(initMod - 5)}</span>
            </div>
          </div>
          <button
            className="primary"
            style={{ width: "100%", marginTop: 12 }}
            onClick={() => push("Initiative", rollD20(initMod))}
          >
            Roll initiative
          </button>
        </StatDrawer>
      )}
      {open === "speed" && (
        <StatDrawer title="Speed" breakdown={speedBreakdown(c)} ruleKey="speed" onClose={() => setOpen(null)} />
      )}
      {open === "prof" && (
        <StatDrawer title="Proficiency Bonus" breakdown={profBreakdown(c)} ruleKey="proficiencyBonus" onClose={() => setOpen(null)} />
      )}

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
          <div style={{ width: `${hpPct}%` }} />
        </div>
        <div className="heal-damage-row" style={{ gridColumn: "1 / -1", marginTop: 4 }}>
          <input
            type="number"
            value={amount}
            onChange={(e) => setAmount(parseInt(e.target.value, 10) || 0)}
            aria-label="Amount"
          />
          <button onClick={() => api.heal(amount)} title="Heal">+ Heal</button>
          <button onClick={() => api.damage(amount)} className="primary" title="Take Damage">− Dmg</button>
          <button onClick={() => api.setTempHp(amount)} title="Set temp HP">Temp</button>
        </div>
      </div>
    </div>
  );
};

const formatMod = (n: number) => (n >= 0 ? `+${n}` : `${n}`);
