import { useState } from "react";
import type { Character, Ability } from "../types/character";
import { ABILITIES, ABILITY_FULL } from "../types/character";
import { abilityModFor, abilityScore, formatMod, saveBonus } from "../lib/calc";
import { formatTerm, saveBreakdown } from "../lib/breakdown";
import { RULE_TEXT } from "../lib/ruleText";
import { rollD20 } from "../lib/dice";
import { useDiceLog } from "../state/DiceLog";
import { SheetDrawer } from "./ui/SheetDrawer";
import { Icon } from "./ui/Icon";
import { GameGlyph } from "./ui/GameGlyph";
import { abilityGlyph } from "../lib/statGlyphs";

/**
 * The six ability scores. Sits as a full-width bar directly under the header
 * on desktop (matching the D&D Beyond reference) rather than inside a column,
 * so `.ability-grid` lays out six across and reflows on narrow screens.
 */
export const AbilityScores = ({ character: c }: { character: Character }) => {
  const { push } = useDiceLog();

  const rollCheck = (a: Ability) => {
    const r = rollD20(abilityModFor(c, a));
    push(`${ABILITY_FULL[a]} Check`, r);
  };

  return (
    <div className="panel ability-bar">
      <div className="panel-title">Ability Scores</div>
      <div className="ability-grid">
        {ABILITIES.map((a) => (
          <div
            key={a}
            className="ability-card"
            onClick={() => rollCheck(a)}
            title={`Click to roll ${ABILITY_FULL[a]} check`}
          >
            <GameGlyph src={abilityGlyph(a)} size={20} className="ability-glyph" />
            <div className="name">{a}</div>
            <div className="mod">{formatMod(abilityModFor(c, a))}</div>
            <div className="score">{abilityScore(c, a)}</div>
          </div>
        ))}
      </div>
    </div>
  );
};

/** Saving throws — left column, directly under the ability bar. */
export const SavingThrows = ({ character: c }: { character: Character }) => {
  const { push } = useDiceLog();
  const [detailOpen, setDetailOpen] = useState(false);

  const rollSave = (a: Ability) => {
    const r = rollD20(saveBonus(c, a));
    push(`${ABILITY_FULL[a]} Save`, r);
  };

  return (
    <div className="panel">
      <div className="panel-title panel-title-row">
        Saving Throws
        <button
          className="panel-gear"
          onClick={() => setDetailOpen(true)}
          title="Saving throws — breakdown and rules"
          aria-label="Saving throw details"
        >
          <Icon name="settings" size={13} />
        </button>
      </div>
      {/* Two columns of abbreviations, as in the reference — six full-width
          rows spent far more vertical space than the content needed. */}
      <div className="saves-grid">
        {ABILITIES.map((a) => (
          <div
            key={a}
            className="list-row is-compact"
            onClick={() => rollSave(a)}
            title={`Roll ${ABILITY_FULL[a]} save`}
          >
            <span className={`pip ${c.saveProficiencies.includes(a) ? "prof" : ""}`} />
            <span className="ab">{a}</span>
            <span className="bonus">{formatMod(saveBonus(c, a))}</span>
          </div>
        ))}
      </div>

      {detailOpen && (
        <SheetDrawer title="Saving Throws" onClose={() => setDetailOpen(false)}>
          {ABILITIES.map((a) => {
            const b = saveBreakdown(c, a);
            return (
              <div className="rules-block" key={a}>
                <div className="rules-block-head">
                  <span>{ABILITY_FULL[a]}</span>
                  <span className="rules-value mono">{formatMod(b.total)}</span>
                </div>
                <div className="rules-table">
                  {b.terms.map((t) => (
                    <div className="rules-row" key={t.label} style={{ fontSize: 12 }}>
                      <span className="dim">{t.label}</span>
                      <span className="rules-value mono">{formatTerm(t)}</span>
                    </div>
                  ))}
                </div>
              </div>
            );
          })}
          <div className="drawer-section-title">The rule</div>
          {RULE_TEXT.savingThrows.map((p) => (
            <p className="drawer-lede" style={{ marginBottom: 10 }} key={p}>{p}</p>
          ))}
        </SheetDrawer>
      )}
    </div>
  );
};
