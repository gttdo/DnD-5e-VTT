import type { Character } from "../types/character";
import { SKILLS } from "../types/character";
import { formatMod, passiveInsight, passiveInvestigation, passivePerception, skillBonus } from "../lib/calc";
import { rollD20 } from "../lib/dice";
import { useDiceLog } from "../state/DiceLog";

export const Skills = ({ character: c }: { character: Character }) => {
  const { push } = useDiceLog();

  const rollSkill = (name: typeof SKILLS[number]["name"]) => {
    const r = rollD20(skillBonus(c, name));
    push(`${name} Check`, r);
  };

  return (
    <>
      <div className="panel">
        <div className="panel-title">Skills</div>
        <div className="col" style={{ gap: 0 }}>
          {SKILLS.map((s) => {
            const isProf = c.skillProficiencies.includes(s.name);
            const isExp = c.skillExpertise.includes(s.name);
            return (
              <div
                key={s.name}
                className="list-row"
                onClick={() => rollSkill(s.name)}
                title={`Roll ${s.name}`}
              >
                <span className={`pip ${isExp ? "exp" : isProf ? "prof" : ""}`} />
                <span className="ab">{s.ability}</span>
                <span>{s.name}</span>
                <span className="bonus">{formatMod(skillBonus(c, s.name))}</span>
              </div>
            );
          })}
        </div>
      </div>

      <div className="panel">
        <div className="panel-title">Passive Senses</div>
        <div className="kv">
          <span className="k">Perception</span><span className="mono">{passivePerception(c)}</span>
          <span className="k">Investigation</span><span className="mono">{passiveInvestigation(c)}</span>
          <span className="k">Insight</span><span className="mono">{passiveInsight(c)}</span>
        </div>
      </div>
    </>
  );
};
