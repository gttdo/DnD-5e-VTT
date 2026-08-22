import { GameGlyph } from "./ui/GameGlyph";
import { CONDITION_NAMES, conditionGlyph, conditionName } from "../lib/conditions";
import { BUFF_CATALOG, buffGlyph } from "../lib/buffs";

/**
 * The DM's status picker (#conditions Phase 2) — toggle conditions (red) and
 * buffs (gold) on a token from its Examine card. Active statuses are lit; a
 * click adds or removes. The board's status strip reflects changes live.
 */
export const TokenStatusEditor = ({
  conditions,
  buffs,
  onToggleCondition,
  onToggleBuff,
}: {
  conditions: string[];
  buffs: string[];
  onToggleCondition: (name: string) => void;
  onToggleBuff: (name: string) => void;
}) => {
  const hasCond = (name: string) => conditions.some((c) => conditionName(c).toLowerCase() === name.toLowerCase());
  const hasBuff = (name: string) => buffs.some((b) => b.toLowerCase() === name.toLowerCase());

  return (
    <div className="tstatus">
      <div className="tstatus-sec">
        <span className="tstatus-l">Conditions</span>
        <div className="tstatus-grid">
          {CONDITION_NAMES.map((name) => {
            const on = hasCond(name);
            const g = conditionGlyph(name);
            return (
              <button
                key={name}
                type="button"
                className={`tstatus-chip is-cond ${on ? "is-on" : ""}`}
                onClick={() => onToggleCondition(name)}
                title={name}
              >
                {g && <GameGlyph src={g} size={15} className="tstatus-ico" />}
                <span>{name}</span>
              </button>
            );
          })}
        </div>
      </div>

      <div className="tstatus-sec">
        <span className="tstatus-l">Buffs &amp; effects</span>
        <div className="tstatus-grid">
          {BUFF_CATALOG.map((b) => {
            const on = hasBuff(b.name);
            return (
              <button
                key={b.name}
                type="button"
                className={`tstatus-chip ${b.good === false ? "is-cond" : "is-buff"} ${on ? "is-on" : ""}`}
                onClick={() => onToggleBuff(b.name)}
                title={b.note}
              >
                <GameGlyph src={buffGlyph(b.name)} size={15} className="tstatus-ico" />
                <span>{b.name}</span>
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
};
