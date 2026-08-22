import { useEffect, useRef, useState } from "react";
import { Dialog } from "./ui/Dialog";
import { Icon } from "./ui/Icon";
import { naturalD20, type RollMode, type OptionalBonus } from "../lib/rolls";
import { roll as rollDice, type RollResult } from "../lib/dice";

/**
 * Cinematic d20 roll — the BG3-style prompt. A big DC, a tumbling d20 that
 * settles and shows the natural roll ON the die face, the bonus broken into
 * chips, and an advantage/disadvantage toggle. Used for any prompted roll
 * (saving throws today; ability checks later).
 *
 * The roll itself is supplied by the caller (`performRoll`) so the dialog never
 * owns game logic — it animates the given result, reveals it, then hands it
 * back through `onComplete` for the caller to apply and log.
 */

// public/sprites/dice_roll.png — 5×3 grid. Rows 0 & 2 are settled poses; row 1 is the
// motion-blurred spin. The dice are NOT centred in their grid cells, so we
// window each frame on its measured content centre (avoids the off-centre look
// and neighbour bleed) rather than by geometric cell.
const SHEET_W = 1536;
const SHEET_H = 1024;
// [cx, cy] content centre of each of the 15 frames, measured from the sheet.
const CENTERS: [number, number][] = [
  [141, 183], [423, 183], [769, 183], [1075, 180], [1331, 182],
  [143, 521], [463, 523], [767, 520], [1075, 521], [1347, 521],
  [140, 795], [432, 797], [727, 797], [1039, 792], [1338, 797],
];
const WIN_W = 250; // crop window < min gap between frame centres → no bleed
const WIN_H = 270;
const SPIN_FRAMES = [5, 6, 7, 8, 9]; // blurred row
const LAND_FRAME = 0; // clean front-facing settled pose, good for a number overlay
const DIE_W = 184;
const SCALE = DIE_W / WIN_W;
const DIE_H = WIN_H * SCALE;

export interface RollChip {
  label: string;
  value: number | string;
}

interface Props {
  title: string;
  subtitle?: string;
  dc?: number;
  bonus: number;
  chips?: RollChip[];
  /** Optional bonus dice the roller can toggle on before rolling (Guidance,
   *  Bless, Bardic Inspiration). Each toggled-on die is rolled and folded into
   *  the total. Omit for rolls that admit no buffs. */
  optionalBonuses?: OptionalBonus[];
  autoFail?: boolean;
  onBehalf?: boolean;
  /** Pre-selected roll mode — e.g. a Dodging defender's DEX save opens on
   *  Advantage (slice F). The roller can still override. */
  initialMode?: RollMode;
  /** Pure — roll a d20 with this mode and return the result (no side effects). */
  performRoll: (mode: RollMode) => RollResult;
  /** Called after the reveal; the caller applies + logs the outcome. */
  onComplete: (result: RollResult, mode: RollMode) => void;
  onAutoFail: () => void;
}

const sign = (n: number | string) =>
  typeof n === "number" ? (n >= 0 ? `+${n}` : `${n}`) : n;

type Phase = "ready" | "rolling" | "landed";

export const DiceRollDialog = ({
  title,
  subtitle,
  dc,
  bonus,
  chips,
  optionalBonuses,
  autoFail,
  onBehalf,
  initialMode,
  performRoll,
  onComplete,
  onAutoFail,
}: Props) => {
  const [mode, setMode] = useState<RollMode>(initialMode ?? "normal");
  const [phase, setPhase] = useState<Phase>("ready");
  const [result, setResult] = useState<RollResult | null>(null);
  // Which optional bonuses (Guidance, Bless…) the roller has toggled on, and
  // the dice they actually rolled once the roll fires (for the breakdown).
  const [chosen, setChosen] = useState<Set<string>>(new Set());
  const [extras, setExtras] = useState<{ label: string; total: number }[]>([]);
  const toggleBonus = (id: string) =>
    setChosen((cur) => {
      const next = new Set(cur);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  const dieRef = useRef<HTMLDivElement | null>(null);
  const raf = useRef(0);
  const timers = useRef<number[]>([]);

  const setFrame = (f: number) => {
    const el = dieRef.current;
    if (!el) return;
    const [cx, cy] = CENTERS[f];
    const left = cx - WIN_W / 2;
    const top = cy - WIN_H / 2;
    el.style.backgroundPosition = `${-(left * SCALE)}px ${-(top * SCALE)}px`;
  };

  useEffect(() => {
    setFrame(LAND_FRAME);
    return () => {
      cancelAnimationFrame(raf.current);
      timers.current.forEach((t) => window.clearTimeout(t));
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const natural = result ? naturalD20(result) : null;
  const total = result ? result.total : null;
  const success = total != null && dc != null ? total >= dc : null;

  const roll = () => {
    if (phase !== "ready") return;
    const base = performRoll(mode);
    // Fold in any toggled optional bonus dice: roll each, add to the total, and
    // keep a labelled breakdown. The d20 stays rolls[0]/kept[0], so crit/fumble
    // detection is untouched.
    const picked = (optionalBonuses ?? []).filter((b) => chosen.has(b.id));
    const rolled = picked.map((b) => ({ label: b.label, r: rollDice(b.dice) }));
    const extraTotal = rolled.reduce((s, e) => s + e.r.total, 0);
    const res: RollResult =
      rolled.length === 0
        ? base
        : {
            ...base,
            rolls: [...base.rolls, ...rolled.flatMap((e) => e.r.rolls)],
            total: base.total + extraTotal,
            detail: base.detail + rolled.map((e) => ` + ${e.r.total} (${e.label})`).join(""),
          };
    setExtras(rolled.map((e) => ({ label: e.label, total: e.r.total })));
    setResult(res);
    setPhase("rolling");
    // Tumble the blurred frames, decelerating, then snap to the landing pose.
    let i = 0;
    let last = 0;
    let step = 55;
    const started = performance.now();
    const tick = (t: number) => {
      if (!last) last = t;
      if (t - last >= step) {
        last = t;
        setFrame(SPIN_FRAMES[i % SPIN_FRAMES.length]);
        i += 1;
        step += 4; // ease-out
      }
      if (t - started < 850) {
        raf.current = requestAnimationFrame(tick);
      } else {
        setFrame(LAND_FRAME);
        setPhase("landed");
        timers.current.push(window.setTimeout(() => onComplete(res, mode), 1150));
      }
    };
    raf.current = requestAnimationFrame(tick);
  };

  return (
    <Dialog onClose={() => {}} dismissible={false} size="sm" title={title} subtitle={onBehalf && subtitle ? subtitle : subtitle}>
      <div className="diceroll">
        {dc != null && (
          <div className="diceroll-dc">
            <span className="diceroll-dc-k">Difficulty Class</span>
            <span className="diceroll-dc-v">{dc}</span>
          </div>
        )}

        <div className={`diceroll-stage ${phase}`}>
          <div
            ref={dieRef}
            className={`diceroll-die ${phase === "ready" ? "is-clickable" : ""}`}
            role={phase === "ready" ? "button" : undefined}
            tabIndex={phase === "ready" ? 0 : -1}
            aria-label={phase === "ready" ? "Roll the die" : undefined}
            onClick={roll}
            onKeyDown={(e) => {
              if (phase === "ready" && (e.key === "Enter" || e.key === " ")) {
                e.preventDefault();
                roll();
              }
            }}
            style={{
              width: DIE_W,
              height: DIE_H,
              backgroundImage: "url(/sprites/dice_roll.png)",
              backgroundSize: `${SHEET_W * SCALE}px ${SHEET_H * SCALE}px`,
            }}
          />
          {phase === "landed" && natural != null && (
            <span className={`diceroll-face ${natural === 20 ? "is-crit" : natural === 1 ? "is-fumble" : ""}`}>
              {natural}
            </span>
          )}
        </div>

        {phase === "landed" && total != null ? (
          <div className={`diceroll-outcome ${success == null ? "" : success ? "is-good" : "is-bad"}`}>
            <span className="diceroll-total">{total}</span>
            {dc != null && (
              <span className="diceroll-verdict">{success ? "Success" : "Failure"}</span>
            )}
            <span className="diceroll-math">
              {natural} {sign(bonus)}
              {extras.map((e) => (
                <span key={e.label} className="diceroll-math-buff"> +{e.total} {e.label}</span>
              ))}
            </span>
          </div>
        ) : (
          <>
            {chips && chips.length > 0 && (
              <div className="diceroll-chips">
                {chips.map((c, i) => (
                  <div key={i} className="diceroll-chip">
                    <span className="diceroll-chip-v">{sign(c.value)}</span>
                    <span className="diceroll-chip-l">{c.label}</span>
                  </div>
                ))}
                <div className="diceroll-chip is-total">
                  <span className="diceroll-chip-v">{sign(bonus)}</span>
                  <span className="diceroll-chip-l">Total</span>
                </div>
              </div>
            )}

            {autoFail ? (
              <>
                <p className="diceroll-auto">
                  <Icon name="alert" size={15} /> Incapacitated — auto-fails this save.
                </p>
                <div className="diceroll-actions">
                  <button className="primary" onClick={onAutoFail}>Apply the failure</button>
                </div>
              </>
            ) : (
              <>
                {optionalBonuses && optionalBonuses.length > 0 && (
                  <div className="diceroll-buffs" role="group" aria-label="Optional bonuses">
                    {optionalBonuses.map((b) => {
                      const on = chosen.has(b.id);
                      return (
                        <button
                          key={b.id}
                          type="button"
                          className={`diceroll-buff ${on ? "is-on" : ""}`}
                          aria-pressed={on}
                          onClick={() => toggleBonus(b.id)}
                          disabled={phase !== "ready"}
                          title={b.note}
                        >
                          <Icon name={on ? "check" : "add"} size={13} />
                          <span className="diceroll-buff-l">{b.label}</span>
                          <span className="diceroll-buff-d">{b.dice}</span>
                        </button>
                      );
                    })}
                  </div>
                )}

                <div className="diceroll-mode" role="group" aria-label="Advantage">
                  {(["dis", "normal", "adv"] as RollMode[]).map((m) => (
                    <button key={m} className={mode === m ? "is-on" : ""} onClick={() => setMode(m)} disabled={phase !== "ready"}>
                      {m === "dis" ? "Disadv." : m === "adv" ? "Advantage" : "Straight"}
                    </button>
                  ))}
                </div>
                {/* No Roll button — the die itself is the trigger. */}
                <p className="diceroll-hint">
                  <Icon name="dice" size={14} /> {phase === "rolling" ? "Rolling…" : "Tap the die to roll"}
                </p>
              </>
            )}
          </>
        )}
      </div>
    </Dialog>
  );
};
