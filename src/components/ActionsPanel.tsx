import { useMemo } from "react";
import type { Character } from "../types/character";
import type { CharacterAPI } from "../state/useCharacter";
import { attackBonus, damageBonus, formatMod } from "../lib/calc";
import { resolveAttacks, damageLabel } from "../lib/attacks";
import { roll, rollD20 } from "../lib/dice";
import { useDiceLog } from "../state/DiceLog";
import { DamageType } from "./ui/DamageType";

export const ActionsPanel = ({ character: c }: { character: Character; api: CharacterAPI }) => {
  const { push } = useDiceLog();
  // Only weapons the character is actually wielding — see lib/attacks.
  const attacks = useMemo(() => resolveAttacks(c), [c]);

  const doAttack = (atk: Character["attacks"][number]) => {
    const hit = rollD20(attackBonus(c, atk));
    push(`${atk.name} (to hit)`, hit);
  };

  const doDamage = (atk: Character["attacks"][number]) => {
    const dmgMod = damageBonus(c, atk);
    const expr = dmgMod === 0 ? atk.damage : `${atk.damage}${dmgMod >= 0 ? "+" : ""}${dmgMod}`;
    const r = roll(expr);
    push(`${atk.name} (damage${atk.damageType ? " " + atk.damageType : ""})`, r);
  };

  return (
    <div>
      <div className="panel-title">Attacks &amp; Damage</div>
      <table className="attack-table">
        <thead>
          <tr>
            <th>Name</th>
            <th>Range</th>
            <th>Hit/DC</th>
            <th>Damage</th>
            <th>Notes</th>
          </tr>
        </thead>
        <tbody>
          {attacks.map((atk) => {
            const hit = attackBonus(c, atk);
            const dmgMod = damageBonus(c, atk);
            return (
              <tr key={atk.id}>
                <td>
                  <div>{atk.name}</div>
                  <div className="dim" style={{ fontSize: 11, display: "flex", alignItems: "center", gap: 4 }}>
                    <span>{atk.ability}</span>
                    {atk.damageType && <>· <DamageType type={atk.damageType} size={12} /></>}
                  </div>
                </td>
                <td className="mono">{atk.range ?? "—"}</td>
                <td>
                  <button className="roll-btn" onClick={() => doAttack(atk)} title="Roll to hit">
                    {formatMod(hit)}
                  </button>
                </td>
                <td>
                  <button className="roll-btn" onClick={() => doDamage(atk)} title="Roll damage">
                    {damageLabel(atk, dmgMod)}
                  </button>
                </td>
                <td className="dim" style={{ fontSize: 11 }}>{atk.notes ?? ""}</td>
              </tr>
            );
          })}
          {attacks.length === 0 && (
            <tr>
              <td colSpan={5} className="dim center" style={{ padding: "20px 12px", fontStyle: "italic", fontFamily: "var(--font-story)" }}>
                No weapons drawn — equip one in your Inventory.
              </td>
            </tr>
          )}
        </tbody>
      </table>

      <div className="divider" />

      <div className="panel-title">Actions in Combat</div>
      <div className="dim" style={{ fontSize: 12 }}>
        Attack, Dash, Disengage, Dodge, Grapple, Help, Hide, Improvise,
        Influence, Magic, Ready, Search, Shove, Study, Utilize
      </div>
    </div>
  );
};
