import { useMemo, useState } from "react";
import type { Character } from "../types/character";
import type { CharacterAPI } from "../state/useCharacter";
import { useRules } from "../state/Rules";
import {
  casterClass,
  castingAbility,
  slotsFor,
  spellAttackBonus,
  spellSaveDC,
  spellsForClass,
} from "../lib/spellcasting";
import { formatMod } from "../lib/calc";
import { rollD20 } from "../lib/dice";
import { useDiceLog } from "../state/DiceLog";
import { SpellDrawer } from "./SpellDrawer";
import type { SpellData } from "../data/loader";
import { Icon } from "./ui/Icon";

/**
 * Spells tab — backed by the 339-spell dataset in public/data/spells.json.
 *
 * The character stores NAMES (known/prepared) that key into the dataset; the
 * dataset itself is read-only reference material. Mechanical fields only — the
 * data deliberately carries no rules prose.
 *
 * Slots are derived from the class's caster type + level via tables.json
 * (full/half/pact all differ), and spent slots live on the character.
 */

type Filter = "known" | "all";

const LEVEL_LABEL: Record<number, string> = {
  0: "Cantrips", 1: "1st Level", 2: "2nd Level", 3: "3rd Level", 4: "4th Level",
  5: "5th Level", 6: "6th Level", 7: "7th Level", 8: "8th Level", 9: "9th Level",
};

export const SpellsPanel = ({ character: c, api }: { character: Character; api: CharacterAPI }) => {
  const { spells, tables, classes } = useRules();
  const { push } = useDiceLog();
  const [filter, setFilter] = useState<Filter>("known");
  const [query, setQuery] = useState("");
  const [detail, setDetail] = useState<SpellData | null>(null);

  const caster = casterClass(c, classes);
  const sc = c.spellcasting ?? { known: [], prepared: [], slotsUsed: {} };

  const classSpells = useMemo(
    () => (spells && caster ? spellsForClass(spells, caster.name) : []),
    [spells, caster]
  );

  const visible = useMemo(() => {
    const q = query.trim().toLowerCase();
    return classSpells.filter((s) => {
      if (filter === "known" && !sc.known.includes(s.name)) return false;
      if (q && !s.name.toLowerCase().includes(q)) return false;
      return true;
    });
  }, [classSpells, filter, query, sc.known]);

  const byLevel = useMemo(() => {
    const groups = new Map<number, typeof visible>();
    for (const s of visible) {
      if (!groups.has(s.level)) groups.set(s.level, []);
      groups.get(s.level)!.push(s);
    }
    return [...groups.entries()].sort((a, b) => a[0] - b[0]);
  }, [visible]);

  if (!caster) {
    return (
      <div className="dim center" style={{ padding: "24px 12px", fontStyle: "italic", fontFamily: "var(--font-story)" }}>
        {c.classes[0]?.name ?? "This class"} does not cast spells.
      </div>
    );
  }

  const slots = slotsFor(caster.caster, caster.level, tables);
  const dc = spellSaveDC(c, caster.name);
  const atk = spellAttackBonus(c, caster.name);
  const ability = castingAbility(caster.name);

  const rollSpellAttack = (spellName: string) => {
    if (atk === null) return;
    push(`${spellName} (spell attack)`, rollD20(atk));
  };

  return (
    <div>
      {/* Casting stats strip */}
      <div className="spell-stats">
        <div className="spell-stat">
          <label>Ability</label>
          <div className="val">{ability}</div>
        </div>
        <div className="spell-stat">
          <label>Save DC</label>
          <div className="val">{dc}</div>
        </div>
        <div
          className="spell-stat is-roll"
          onClick={() => atk !== null && push("Spell attack", rollD20(atk))}
          title="Roll a spell attack"
        >
          <label>Attack</label>
          <div className="val">{atk !== null ? formatMod(atk) : "—"}</div>
        </div>
      </div>

      {/* Slot tracker — pips per level; click a filled pip to spend, refund arrow to recover. */}
      {Object.keys(slots).length > 0 && (
        <div className="slot-tracker">
          {Object.entries(slots).map(([lvl, max]) => {
            const used = Math.min(sc.slotsUsed[lvl] ?? 0, max);
            return (
              <div className="slot-row" key={lvl}>
                <span className="slot-label">{lvl === "0" ? "∞" : `L${lvl}`}</span>
                <span className="slot-pips">
                  {Array.from({ length: max }, (_, i) => (
                    <button
                      key={i}
                      className={`slot-pip ${i < max - used ? "" : "used"}`}
                      onClick={() => api.adjustSlot(lvl, i < max - used ? 1 : -1)}
                      title={i < max - used ? `Spend a level-${lvl} slot` : `Recover a level-${lvl} slot`}
                      aria-label={`Level ${lvl} slot ${i + 1}`}
                    />
                  ))}
                </span>
                <span className="slot-count mono">{max - used}/{max}</span>
              </div>
            );
          })}
        </div>
      )}

      {/* Filter + search */}
      <div className="spell-controls">
        <div className="spell-filter">
          <button className={filter === "known" ? "active" : ""} onClick={() => setFilter("known")}>
            Known ({sc.known.length})
          </button>
          <button className={filter === "all" ? "active" : ""} onClick={() => setFilter("all")}>
            All {caster.name} ({classSpells.length})
          </button>
        </div>
        <input
          placeholder="Search spells…"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          aria-label="Search spells"
        />
      </div>

      {byLevel.length === 0 && (
        <div className="dim center" style={{ padding: "20px 12px", fontStyle: "italic", fontFamily: "var(--font-story)" }}>
          {filter === "known"
            ? "No spells known yet — browse the full list and add some."
            : "No spells match."}
        </div>
      )}

      {byLevel.map(([level, list]) => (
        <div key={level}>
          <div className="spell-level-head">{LEVEL_LABEL[level] ?? `Level ${level}`}</div>
          {list.map((s) => {
            const known = sc.known.includes(s.name);
            const prepared = sc.prepared.includes(s.name);
            return (
              <div className={`spell-row ${known ? "known" : ""}`} key={s.name}>
                <button
                  className={`spell-prep ${prepared ? "on" : ""}`}
                  onClick={() => api.toggleSpellPrepared(s.name)}
                  title={prepared ? "Unprepare" : "Prepare"}
                  aria-label={`${prepared ? "Unprepare" : "Prepare"} ${s.name}`}
                  aria-pressed={prepared}
                >
                  <Icon name="star" size={12} />
                </button>
                <div className="spell-main">
                  <div className="spell-name">
                    <button
                      className="spell-name-btn"
                      onClick={() => setDetail(s)}
                      title={`${s.name} — details`}
                    >
                      {s.name}
                    </button>
                    {level > 0 && prepared && <span className="spell-tag">Prepared</span>}
                  </div>
                  <div className="spell-meta">
                    {s.casting_time} · {s.range} · {s.components} · {s.duration}
                  </div>
                </div>
                <button
                  className="spell-roll roll-btn"
                  onClick={() => rollSpellAttack(s.name)}
                  title={`Roll spell attack ${atk !== null ? formatMod(atk) : ""}`}
                >
                  {atk !== null ? formatMod(atk) : "—"}
                </button>
                <button
                  className={`spell-know ${known ? "on" : ""}`}
                  onClick={() => api.toggleSpellKnown(s.name)}
                  title={known ? `Forget ${s.name}` : `Learn ${s.name}`}
                  aria-pressed={known}
                >
                  <Icon name={known ? "check" : "add"} size={13} />
                </button>
              </div>
            );
          })}
        </div>
      ))}

      {detail && (
        <SpellDrawer character={c} spell={detail} api={api} onClose={() => setDetail(null)} />
      )}
    </div>
  );
};
