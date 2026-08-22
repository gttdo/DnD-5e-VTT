import { useState } from "react";
import { GameGlyph } from "./ui/GameGlyph";
import { Icon } from "./ui/Icon";
import { CONDITION_NAMES, conditionGlyph, conditionName } from "../lib/conditions";
import { BUFF_CATALOG, buffGlyph } from "../lib/buffs";

/**
 * The DM's status editor (#conditions) on a token's Examine card. Shows only
 * the ACTIVE statuses — conditions (red) + buffs (gold), each removable — with
 * an "Add" control that reveals the catalog (only the ones not already on) so
 * the card isn't a wall of every possible status.
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
  const [adding, setAdding] = useState<null | "condition" | "buff">(null);

  const activeConds = conditions.map(conditionName);
  const has = (list: string[], name: string) => list.some((n) => n.toLowerCase() === name.toLowerCase());
  const addableConds = CONDITION_NAMES.filter((n) => !has(activeConds, n));
  const addableBuffs = BUFF_CATALOG.filter((b) => !has(buffs, b.name));
  const anyActive = activeConds.length + buffs.length > 0;

  return (
    <div className="tstatus">
      <div className="tstatus-head">
        <span className="tstatus-l">Status</span>
        <button
          type="button"
          className={`tstatus-addbtn ${adding ? "is-open" : ""}`}
          onClick={() => setAdding((a) => (a ? null : "condition"))}
        >
          <Icon name={adding ? "close" : "add"} size={12} /> {adding ? "Done" : "Add"}
        </button>
      </div>

      {/* Active statuses — click to remove. */}
      <div className="tstatus-active">
        {activeConds.map((name) => (
          <button
            key={`c:${name}`}
            type="button"
            className="tstatus-chip is-cond is-on"
            onClick={() => onToggleCondition(name)}
            title={`${name} — click to remove`}
          >
            {conditionGlyph(name) && <GameGlyph src={conditionGlyph(name)!} size={15} className="tstatus-ico" />}
            <span>{name}</span>
            <Icon name="close" size={11} />
          </button>
        ))}
        {buffs.map((name) => (
          <button
            key={`b:${name}`}
            type="button"
            className={`tstatus-chip ${BUFF_CATALOG.find((b) => b.name.toLowerCase() === name.toLowerCase())?.good === false ? "is-cond" : "is-buff"} is-on`}
            onClick={() => onToggleBuff(name)}
            title={`${name} — click to remove`}
          >
            <GameGlyph src={buffGlyph(name)} size={15} className="tstatus-ico" />
            <span>{name}</span>
            <Icon name="close" size={11} />
          </button>
        ))}
        {!anyActive && <span className="tstatus-empty">No conditions or buffs — add one.</span>}
      </div>

      {/* Add picker — only the statuses NOT already on the token. */}
      {adding && (
        <div className="tstatus-picker">
          <div className="tstatus-tabs" role="tablist">
            <button type="button" role="tab" aria-selected={adding === "condition"} className={adding === "condition" ? "is-on" : ""} onClick={() => setAdding("condition")}>
              Conditions
            </button>
            <button type="button" role="tab" aria-selected={adding === "buff"} className={adding === "buff" ? "is-on" : ""} onClick={() => setAdding("buff")}>
              Buffs &amp; effects
            </button>
          </div>
          <div className="tstatus-grid">
            {adding === "condition" &&
              (addableConds.length ? addableConds.map((name) => (
                <button key={name} type="button" className="tstatus-chip is-cond" onClick={() => onToggleCondition(name)} title={name}>
                  {conditionGlyph(name) && <GameGlyph src={conditionGlyph(name)!} size={15} className="tstatus-ico" />}
                  <span>{name}</span>
                </button>
              )) : <span className="tstatus-empty">All conditions are already on.</span>)}
            {adding === "buff" &&
              (addableBuffs.length ? addableBuffs.map((b) => (
                <button key={b.name} type="button" className={`tstatus-chip ${b.good === false ? "is-cond" : "is-buff"}`} onClick={() => onToggleBuff(b.name)} title={b.note}>
                  <GameGlyph src={buffGlyph(b.name)} size={15} className="tstatus-ico" />
                  <span>{b.name}</span>
                </button>
              )) : <span className="tstatus-empty">All buffs are already on.</span>)}
          </div>
        </div>
      )}
    </div>
  );
};
