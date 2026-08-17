import type { Character } from "../types/character";
import type { CharacterAPI } from "../state/useCharacter";
import type { SpellData } from "../data/loader";
import { casterClass, spellAttackBonus, spellSaveDC } from "../lib/spellcasting";
import { useRules } from "../state/Rules";
import { formatMod } from "../lib/calc";
import { rollD20 } from "../lib/dice";
import { useDiceLog } from "../state/DiceLog";
import { SheetDrawer } from "./ui/SheetDrawer";

/**
 * Detail drawer for one spell — the reference's Fire Bolt panel, scoped to
 * the mechanical fields the dataset actually has. The data deliberately
 * carries no rules prose, so this drawer doesn't invent any: it shows the
 * casting mechanics, your numbers for it, and the learn/prepare controls.
 */

const SCHOOL_LEVEL = (s: SpellData) =>
  s.level === 0 ? `${s.school} Cantrip` : `Level ${s.level} · ${s.school}`;

interface Props {
  character: Character;
  spell: SpellData;
  api: CharacterAPI;
  onClose: () => void;
}

export const SpellDrawer = ({ character: c, spell, api, onClose }: Props) => {
  const { classes } = useRules();
  const { push } = useDiceLog();
  const caster = casterClass(c, classes);
  const sc = c.spellcasting ?? { known: [], prepared: [], slotsUsed: {} };
  const known = sc.known.includes(spell.name);
  const prepared = sc.prepared.includes(spell.name);
  const atk = caster ? spellAttackBonus(c, caster.name) : null;
  const dc = caster ? spellSaveDC(c, caster.name) : null;

  const rows: Array<[string, string]> = [
    ["Casting time", spell.casting_time],
    ["Range", spell.range],
    ["Components", spell.components],
    ["Duration", spell.duration],
    ["Classes", spell.classes.join(", ")],
  ];
  if (atk !== null) rows.push(["Your spell attack", formatMod(atk)]);
  if (dc !== null) rows.push(["Your save DC", String(dc)]);

  return (
    <SheetDrawer
      title={spell.name}
      onClose={onClose}
      footer={
        <>
          <button className={known ? "" : "primary"} onClick={() => api.toggleSpellKnown(spell.name)}>
            {known ? "Forget" : "Learn"}
          </button>
          {known && spell.level > 0 && (
            <button className={prepared ? "" : "primary"} onClick={() => api.toggleSpellPrepared(spell.name)}>
              {prepared ? "Unprepare" : "Prepare"}
            </button>
          )}
        </>
      }
    >
      <p className="drawer-lede" style={{ marginBottom: 10 }}>{SCHOOL_LEVEL(spell)}</p>

      {prepared && spell.level > 0 && (
        <p className="drawer-lede" style={{ color: "var(--candle)" }}>Prepared.</p>
      )}
      {spell.level === 0 && known && (
        <p className="drawer-lede" style={{ color: "var(--candle)" }}>
          Cantrip — cast at will, no slot needed.
        </p>
      )}

      <div className="rules-table">
        {rows.map(([k, v]) => (
          <div className="rules-row" key={k}>
            <span>{k}</span>
            <span className="rules-value mono" style={{ whiteSpace: "normal", textAlign: "right" }}>{v}</span>
          </div>
        ))}
      </div>

      {atk !== null && (
        <button
          className="primary"
          style={{ width: "100%", marginTop: 12 }}
          onClick={() => push(`${spell.name} (spell attack)`, rollD20(atk))}
        >
          Roll spell attack {formatMod(atk)}
        </button>
      )}

      <p className="drawer-note" style={{ marginTop: 12 }}>
        Full spell text lives in your Player's Handbook — the app stores only
        the mechanics.
      </p>
    </SheetDrawer>
  );
};
