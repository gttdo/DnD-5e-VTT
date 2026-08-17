import { useState } from "react";
import { roll } from "../lib/dice";
import { useDiceLog } from "../state/DiceLog";
import { Icon } from "./ui/Icon";

/**
 * Manual dice roller — pick dice, throw them, results land in the Game Log.
 *
 * Until now the only way to roll was clicking a value on the sheet, so there
 * was no way to roll anything the sheet doesn't model: a DM's damage die, a
 * random table, "everyone roll a d6".
 *
 * An INPUT surface, kept separate from the Game Log (the record of what was
 * rolled) — the reference anchors this popover to the floating d20 and puts
 * the history in its own drawer.
 */

const DICE = [20, 12, 100, 10, 8, 6, 4] as const;
type Die = (typeof DICE)[number];

interface Props {
  onClose: () => void;
}

export const DiceRoller = ({ onClose }: Props) => {
  // die -> how many of it are in the pool
  const [pool, setPool] = useState<Partial<Record<Die, number>>>({});
  const [modifier, setModifier] = useState(0);
  const { push } = useDiceLog();

  const add = (d: Die) => setPool((p) => ({ ...p, [d]: (p[d] ?? 0) + 1 }));
  const remove = (d: Die) =>
    setPool((p) => {
      const next = (p[d] ?? 0) - 1;
      const copy = { ...p };
      if (next <= 0) delete copy[d];
      else copy[d] = next;
      return copy;
    });
  const clear = () => {
    setPool({});
    setModifier(0);
  };

  const entries = DICE.filter((d) => (pool[d] ?? 0) > 0);
  const isEmpty = entries.length === 0;
  const label =
    entries.map((d) => `${pool[d]}d${d}`).join(" + ") +
    (modifier ? ` ${modifier > 0 ? "+" : "−"} ${Math.abs(modifier)}` : "");

  const doRoll = () => {
    if (isEmpty) return;
    // Each die group is rolled separately (the parser takes one NdX at a time),
    // then combined so the log shows every die that was thrown.
    const rolls: number[] = [];
    for (const d of entries) rolls.push(...roll(`${pool[d]}d${d}`).rolls);
    const sum = rolls.reduce((a, b) => a + b, 0);
    const total = sum + modifier;
    push(label, {
      expression: label,
      rolls,
      modifier,
      total,
      detail:
        `[${rolls.join(", ")}]` +
        (modifier ? ` ${modifier >= 0 ? "+" : "−"} ${Math.abs(modifier)}` : "") +
        ` = ${total}`,
    });
  };

  return (
    <div className="dice-roller panel">
      <div className="dice-roller-head">
        <span>Roll Dice</span>
        <button className="ghost" onClick={onClose} aria-label="Close" title="Close">
          <Icon name="close" size={12} />
        </button>
      </div>

      <div className="dice-grid">
        {DICE.map((d) => {
          const n = pool[d] ?? 0;
          return (
            <button
              key={d}
              className={`die-btn ${n ? "has" : ""}`}
              onClick={() => add(d)}
              onContextMenu={(e) => {
                e.preventDefault();
                remove(d);
              }}
              title={`Add a d${d}${n ? " · right-click to remove one" : ""}`}
            >
              <span className="die-face">d{d}</span>
              {n > 0 && <span className="die-count">{n}</span>}
            </button>
          );
        })}
      </div>

      <div className="dice-mod">
        <label htmlFor="dice-mod-input">Modifier</label>
        <input
          id="dice-mod-input"
          type="number"
          value={modifier}
          onChange={(e) => setModifier(parseInt(e.target.value, 10) || 0)}
        />
      </div>

      <div className="dice-roller-expr" aria-live="polite">
        {isEmpty ? "Pick dice to roll" : label}
      </div>

      <div className="dice-roller-actions">
        <button className="ghost" onClick={clear} disabled={isEmpty && modifier === 0}>
          Clear
        </button>
        <button className="primary" onClick={doRoll} disabled={isEmpty}>
          Roll
        </button>
      </div>
    </div>
  );
};
