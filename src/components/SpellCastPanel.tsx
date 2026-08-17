import { useEffect } from "react";
import { type RollEntry, type RollTone, type AttackSpec, damageRoll } from "../lib/rolls";
import { spellMech, scaleCantrip } from "../lib/spellMechanics";
import { Icon } from "./ui/Icon";

/**
 * Quick-cast spell popover for the in-game HUD — spells grouped by level, each a
 * tile with a hover tooltip, cast in one click. Source-agnostic: a player
 * character (TableHud) and a monster statblock (MonsterHud) both normalize their
 * spells into `CastGroup[]` and hand them here.
 *
 * Attack-roll spells route through the real combat loop (onAttack → target →
 * roll vs AC → damage, with the casting-hand cursor); save spells roll their
 * damage for reference and announce the DC; heals roll healing; anything with no
 * known mechanics just announces the cast. Leveled spells spend a slot.
 */

export interface CastGroup {
  level: number; // 0 = cantrips
  max: number; // slots at this level (0 for cantrips / at-will)
  used: number; // slots already spent
  spells: string[]; // spell names
}

const levelLabel = (lvl: number) => (lvl === 0 ? "Cantrips" : `Level ${lvl}`);

export const SpellCastPanel = ({
  casterName,
  charLevel,
  attackBonus,
  saveDC,
  healMod,
  groups,
  onAttack,
  onRoll,
  onNote,
  onMove,
  onSpendSlot,
  onClose,
}: {
  casterName: string;
  charLevel: number;
  attackBonus: number;
  saveDC: number | null;
  healMod: number;
  groups: CastGroup[];
  onAttack: (spec: AttackSpec) => void;
  onRoll: (entries: RollEntry[], opts?: { tone?: RollTone; label?: string }) => void;
  onNote: (msg: string) => void;
  /** Movement/teleport spells (Misty Step) — pick a destination cell. */
  onMove?: (label: string) => void;
  onSpendSlot: (level: number) => void;
  onClose: () => void;
}) => {
  const sorted = [...groups].sort((a, b) => a.level - b.level);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  const cast = (name: string, level: number, remaining: number) => {
    if (level > 0 && remaining <= 0) {
      onNote(`No level ${level} slots left.`);
      return;
    }
    const mech = spellMech(name);
    const spend = () => level > 0 && onSpendSlot(level);

    if (mech?.kind === "attack" && mech.damage) {
      const dmg = mech.scales ? scaleCantrip(mech.damage, charLevel) : mech.damage;
      onAttack({ label: name, attackBonus, damage: dmg, damageType: mech.damageType });
      spend();
      onClose();
      return;
    }
    if (mech?.kind === "save" && mech.damage) {
      const dmg = mech.scales ? scaleCantrip(mech.damage, charLevel) : mech.damage;
      const dcTxt = saveDC != null ? ` DC ${saveDC}` : "";
      const roll = damageRoll(`${name} — ${mech.damageType} (${mech.save} save${dcTxt})`, dmg);
      onRoll([roll], { label: String(roll.result.total) });
      onNote(`${casterName} casts ${name} — ${mech.save} save${dcTxt}; ${roll.result.total} ${mech.damageType} on a failed save.`);
      spend();
      onClose();
      return;
    }
    if (mech?.kind === "heal" && mech.heal) {
      const expr = healMod !== 0 ? `${mech.heal}${healMod > 0 ? "+" : ""}${healMod}` : mech.heal;
      // Route through the target-picker so the caster chooses who to heal
      // (including themselves). The resolver restores HP to the chosen token.
      onAttack({ label: name, attackBonus: 0, heal: expr });
      spend();
      onClose();
      return;
    }
    if (mech?.kind === "condition") {
      // Save-or-be-conditioned: the resolver rolls the target's save vs DC.
      onAttack({ label: name, attackBonus: 0, condition: mech.condition ?? "", save: mech.save, dc: saveDC ?? undefined, restrictType: mech.onlyType });
      spend();
      onClose();
      return;
    }
    if (mech?.kind === "move") {
      onMove?.(name);
      spend();
      onClose();
      return;
    }
    onNote(`${casterName} casts ${name}${level > 0 && saveDC != null ? ` — save DC ${saveDC}` : ""}.`);
    spend();
    onClose();
  };

  return (
    <div className="spellcast" role="dialog" aria-label="Cast a spell">
      <div className="spellcast-head">
        <span>Available Spells</span>
        <div className="spellcast-meta">
          <span title="Spell attack bonus">✦ {attackBonus >= 0 ? "+" : ""}{attackBonus}</span>
          {saveDC != null && <span title="Spell save DC">DC {saveDC}</span>}
        </div>
        <button className="spellcast-x" onClick={onClose} aria-label="Close">
          <Icon name="close" size={14} />
        </button>
      </div>

      {sorted.length === 0 && <div className="spellcast-empty">No spells to cast.</div>}

      <div className="spellcast-body">
        {sorted.map((g) => {
          const remaining = Math.max(0, g.max - g.used);
          return (
            <div key={g.level} className="spellcast-group">
              <div className="spellcast-grouphd">
                <span>{levelLabel(g.level)}</span>
                {g.level > 0 && g.max > 0 && (
                  <span className="spellcast-slots" title={`${remaining} of ${g.max} slots left`}>
                    {Array.from({ length: g.max }).map((_, i) => (
                      <i key={i} className={i < remaining ? "on" : ""} />
                    ))}
                  </span>
                )}
              </div>
              <div className="spellcast-tiles">
                {g.spells.map((name) => {
                  const mech = spellMech(name);
                  const noSlots = g.level > 0 && remaining === 0;
                  return (
                    <button
                      key={name}
                      className={`spellcast-tile k-${mech?.kind ?? "utility"}`}
                      title={`${name}${mech?.damage ? ` — ${mech.damage} ${mech.damageType}` : ""}${mech?.kind === "attack" ? " · attack" : mech?.kind === "save" ? ` · ${mech.save} save` : ""}`}
                      onClick={() => cast(name, g.level, remaining)}
                      disabled={noSlots}
                      aria-label={name}
                    >
                      <Icon name="sparkles" size={16} />
                    </button>
                  );
                })}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
};
