import type { Character, Ability } from "../types/character";
import { ABILITIES, ABILITY_FULL } from "../types/character";
import { abilityModFor, abilityScore, formatMod, saveBonus } from "../lib/calc";
import { rollD20 } from "../lib/dice";
import { useDiceLog } from "../state/DiceLog";

export const AbilityScores = ({ character: c }: { character: Character }) => {
  const { push } = useDiceLog();

  const rollCheck = (a: Ability) => {
    const r = rollD20(abilityModFor(c, a));
    push(`${ABILITY_FULL[a]} Check`, r);
  };

  const rollSave = (a: Ability) => {
    const r = rollD20(saveBonus(c, a));
    push(`${ABILITY_FULL[a]} Save`, r);
  };

  return (
    <>
      <div className="panel">
        <div className="panel-title">Ability Scores</div>
        <div className="ability-grid">
          {ABILITIES.map((a) => (
            <div
              key={a}
              className="ability-card"
              onClick={() => rollCheck(a)}
              title={`Click to roll ${ABILITY_FULL[a]} check`}
            >
              <div className="name">{a}</div>
              <div className="mod">{formatMod(abilityModFor(c, a))}</div>
              <div className="score">{abilityScore(c, a)}</div>
            </div>
          ))}
        </div>
      </div>

      <div className="panel">
        <div className="panel-title">Saving Throws</div>
        <div className="col" style={{ gap: 0 }}>
          {ABILITIES.map((a) => (
            <div
              key={a}
              className="list-row"
              onClick={() => rollSave(a)}
              title={`Roll ${ABILITY_FULL[a]} save`}
              style={{ gridTemplateColumns: "14px 56px 1fr auto" }}
            >
              <span className={`pip ${c.saveProficiencies.includes(a) ? "prof" : ""}`} />
              <span className="ab">{a}</span>
              <span>{ABILITY_FULL[a]}</span>
              <span className="bonus">{formatMod(saveBonus(c, a))}</span>
            </div>
          ))}
        </div>
      </div>
    </>
  );
};
