import { useState } from "react";
import type { Character } from "../types/character";
import { SKILLS } from "../types/character";
import { formatMod, passiveInsight, passiveInvestigation, passivePerception, skillBonus } from "../lib/calc";
import { formatTerm, passiveBreakdown } from "../lib/breakdown";
import { RULE_TEXT } from "../lib/ruleText";
import { rollD20 } from "../lib/dice";
import { useDiceLog } from "../state/DiceLog";
import { SheetDrawer } from "./ui/SheetDrawer";
import { Icon } from "./ui/Icon";
import { GameGlyph } from "./ui/GameGlyph";
import { skillGlyph } from "../lib/statGlyphs";

export const Skills = ({ character: c }: { character: Character }) => {
  const { push } = useDiceLog();

  const rollSkill = (name: typeof SKILLS[number]["name"]) => {
    const r = rollD20(skillBonus(c, name));
    push(`${name} Check`, r);
  };

  return (
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
              <span className="skill-name">
                <GameGlyph src={skillGlyph(s.name)} size={15} className="skill-glyph" />
                {s.name}
              </span>
              <span className="bonus">{formatMod(skillBonus(c, s.name))}</span>
            </div>
          );
        })}
      </div>
    </div>
  );
};

/**
 * Passive senses. Belongs in the left column beside the saving throws, not
 * appended under Skills in the middle — the reference groups it with the
 * other at-a-glance derived values.
 */
export const Senses = ({ character: c }: { character: Character }) => {
  const [detailOpen, setDetailOpen] = useState(false);
  const rows = [
    ["Passive Perception", "Perception"],
    ["Passive Investigation", "Investigation"],
    ["Passive Insight", "Insight"],
  ] as const;

  return (
    <div className="panel">
      <div className="panel-title panel-title-row">
        Senses
        <button
          className="panel-gear"
          onClick={() => setDetailOpen(true)}
          title="Senses — how passives work"
          aria-label="Senses details"
        >
          <Icon name="settings" size={13} />
        </button>
      </div>
      {/* Value in a disc, label alongside — the reference reads these as scores
          at a glance rather than as a key/value table. */}
      <div className="senses-list">
        {(
          [
            ["Passive Perception", passivePerception(c)],
            ["Passive Investigation", passiveInvestigation(c)],
            ["Passive Insight", passiveInsight(c)],
          ] as const
        ).map(([label, value]) => (
          <div className="sense-row" key={label}>
            <span className="sense-value">{value}</span>
            <span className="sense-label">{label}</span>
          </div>
        ))}
      </div>

      {detailOpen && (
        <SheetDrawer title="Senses" onClose={() => setDetailOpen(false)}>
          {rows.map(([label, skill]) => {
            const b = passiveBreakdown(c, skill);
            return (
              <div className="rules-block" key={label}>
                <div className="rules-block-head">
                  <span>{label}</span>
                  <span className="rules-value mono">{b.total}</span>
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
          {RULE_TEXT.passiveSenses.map((p) => (
            <p className="drawer-lede" style={{ marginBottom: 10 }} key={p}>{p}</p>
          ))}
        </SheetDrawer>
      )}
    </div>
  );
};
