import { useState } from "react";
import { SheetDrawer } from "./ui/SheetDrawer";

/**
 * Short / Long Rest confirmation drawers, following the D&D Beyond reference:
 * explain what the rest does, offer its options, then commit behind an explicit
 * button. Previously both buttons applied instantly with no explanation and no
 * way to back out.
 *
 * Rules text is paraphrased rather than quoted from the SRD.
 */

export type RestKind = "short" | "long";

interface Props {
  kind: RestKind;
  onConfirm: () => void;
  onClose: () => void;
}

export const RestDrawer = ({ kind, onConfirm, onClose }: Props) => {
  // 5e recovers half your hit dice on a long rest; the 2024 rules recover all.
  // Surfaced as a choice because tables commonly house-rule which they use.
  const [recoverAllHitDice, setRecoverAllHitDice] = useState(false);
  const [resetMaxHp, setResetMaxHp] = useState(true);
  const isLong = kind === "long";

  return (
    <SheetDrawer
      title={isLong ? "Long Rest" : "Short Rest"}
      onClose={onClose}
      footer={
        <>
          <button
            className="primary"
            onClick={() => {
              onConfirm();
              onClose();
            }}
          >
            Take {isLong ? "Long" : "Short"} Rest
          </button>
          <button className="ghost" onClick={onClose}>
            Cancel
          </button>
        </>
      }
    >
      <p className="drawer-lede">
        {isLong
          ? "At least 8 hours of downtime, with at least 6 of them asleep and no more than 2 spent on light activity such as reading, talking, or keeping watch."
          : "At least 1 hour of downtime doing nothing more strenuous than eating, drinking, reading, or tending to wounds."}
      </p>

      {isLong && (
        <>
          <div className="drawer-section-title">Hit Dice</div>
          <label className="drawer-option">
            <input
              type="radio"
              name="hitdice"
              checked={!recoverAllHitDice}
              onChange={() => setRecoverAllHitDice(false)}
            />
            <span>
              Recover half your Hit Dice
              <small>2014 rules</small>
            </span>
          </label>
          <label className="drawer-option">
            <input
              type="radio"
              name="hitdice"
              checked={recoverAllHitDice}
              onChange={() => setRecoverAllHitDice(true)}
            />
            <span>
              Recover all Hit Dice
              <small>2024 rules</small>
            </span>
          </label>
        </>
      )}

      <div className="drawer-section-title">Recover</div>
      <ul className="drawer-list">
        {isLong ? (
          <>
            <li>All lost hit points</li>
            <li>{recoverAllHitDice ? "All spent Hit Dice" : "Half your spent Hit Dice"}</li>
            <li>All spell slots and long-rest features</li>
            <li>Exhaustion reduced by one level</li>
          </>
        ) : (
          <>
            <li>Features that recharge on a short rest</li>
            <li>Hit Dice may be spent to regain hit points</li>
          </>
        )}
      </ul>

      {isLong && (
        <label className="drawer-option">
          <input
            type="checkbox"
            checked={resetMaxHp}
            onChange={(e) => setResetMaxHp(e.target.checked)}
          />
          <span>Reset maximum HP reductions</span>
        </label>
      )}

      {isLong && (
        <>
          <div className="drawer-section-title">Interrupting the rest</div>
          <p className="drawer-note">
            A long rest is broken by at least an hour of walking, fighting,
            casting spells, or any other strenuous activity — you must start it
            over. You also need at least 1 hit point to begin one.
          </p>
        </>
      )}
    </SheetDrawer>
  );
};
