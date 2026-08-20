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
 * rolled). Styled as a frosted-glass tray of die-shape silhouettes (the
 * cinematic redesign, phase 0) — the reference anchors it to the floating d20.
 */

const DICE = [20, 12, 100, 10, 8, 6, 4] as const;
type Die = (typeof DICE)[number];

/** Die-shape silhouette per die type (viewBox 0 0 40 40), stroked in currentColor. */
const DieGlyph = ({ d }: { d: Die }) => (
  <svg viewBox="0 0 40 40" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinejoin="round" aria-hidden="true">
    {d === 4 && <path d="M20 5 L34 33 L6 33 Z" />}
    {d === 6 && <rect x="9" y="9" width="22" height="22" rx="3" />}
    {d === 8 && (<><path d="M20 4 L33 20 L20 36 L7 20 Z" /><path d="M7 20 L33 20" /></>)}
    {(d === 10 || d === 100) && (<><path d="M20 4 L34 18 L20 36 L6 18 Z" /><path d="M6 18 L20 25 L34 18" /></>)}
    {d === 12 && <path d="M20 4 L31 10 L35 22 L27 33 L13 33 L5 22 L9 10 Z" />}
    {d === 20 && (<><path d="M20 3 L34 13 L34 27 L20 37 L6 27 L6 13 Z" /><path d="M20 3 L20 15 M6 13 L20 15 L34 13 M6 27 L20 15 L34 27 M20 37 L20 15" /></>)}
  </svg>
);

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
    <div className="dice-tray">
      <div className="dice-tray-head">
        <span>Roll Dice</span>
        <button className="dice-tray-x" onClick={onClose} aria-label="Close" title="Close">
          <Icon name="close" size={12} />
        </button>
      </div>

      <div className="dice-grid">
        {DICE.map((d) => {
          const n = pool[d] ?? 0;
          return (
            <button
              key={d}
              className={`die-tile ${n ? "has" : ""}`}
              onClick={() => add(d)}
              onContextMenu={(e) => {
                e.preventDefault();
                remove(d);
              }}
              title={`Add a d${d}${n ? " · right-click to remove one" : ""}`}
            >
              <span className="die-glyph"><DieGlyph d={d} /></span>
              <span className="die-label">d{d}</span>
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

      <div className="dice-tray-expr" aria-live="polite">
        {isEmpty ? "Pick dice to roll" : label}
      </div>

      <div className="dice-tray-actions">
        <button className="dice-tray-clear" onClick={clear} disabled={isEmpty && modifier === 0}>
          Clear
        </button>
        <button className="dice-tray-roll" onClick={doRoll} disabled={isEmpty}>
          Roll
        </button>
      </div>
    </div>
  );
};
