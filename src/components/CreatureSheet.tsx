import { useEffect } from "react";
import { createPortal } from "react-dom";
import { Icon } from "./ui/Icon";
import { abilityMod, formatMod } from "../lib/calc";
import { ABILITIES } from "../types/character";
import type { MonsterStatblock } from "../types/content";
import type { Speeds } from "../types/content";

/**
 * The DM's read-only creature sheet — a creature's full statblock (monster or
 * NPC). A right-side, NON-modal drawer (the same shell as the players'
 * SheetDrawer) so the board stays visible; it's the DM view (all stats), the
 * counterpart to the players' stat-hiding Examine card.
 */

const speedLine = (s: Speeds): string => {
  const parts: string[] = [];
  if (s.walk != null) parts.push(`${s.walk} ft`);
  if (s.fly != null) parts.push(`fly ${s.fly} ft${s.hover ? " (hover)" : ""}`);
  if (s.swim != null) parts.push(`swim ${s.swim} ft`);
  if (s.climb != null) parts.push(`climb ${s.climb} ft`);
  if (s.burrow != null) parts.push(`burrow ${s.burrow} ft`);
  return parts.length ? parts.join(", ") : "—";
};

const Section = ({ title, entries }: { title: string; entries?: { name: string; text: string }[] }) => {
  if (!entries || entries.length === 0) return null;
  return (
    <div className="csheet-sec">
      <h4 className="csheet-h">{title}</h4>
      {entries.map((e) => (
        <p className="csheet-entry" key={e.name}>
          <b>{e.name}.</b> {e.text}
        </p>
      ))}
    </div>
  );
};

export const CreatureSheet = ({
  m,
  name,
  image,
  onClose,
}: {
  m: MonsterStatblock;
  name: string;
  image?: string | null;
  onClose: () => void;
}) => {
  const size = m.size.charAt(0).toUpperCase() + m.size.slice(1);
  const subtitle = `${size} ${m.type}${m.subtype ? ` (${m.subtype})` : ""} · CR ${m.cr}${m.alignment ? ` · ${m.alignment}` : ""}`;
  const saveEntries = (Object.entries(m.saves ?? {}) as [string, number][]).filter(([, v]) => v != null);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  // Portaled to <body> like SheetDrawer: the HUD's backdrop-filter would
  // otherwise become the containing block and trap this fixed drawer.
  return createPortal(
    <aside className="sheet-drawer" aria-label="Creature sheet">
      <div className="sheet-drawer-bar">
        <span className="sheet-drawer-t">
          <Icon name="library" size={15} /> {name}
        </span>
        <button className="sheet-drawer-x" onClick={onClose} aria-label="Close the sheet">
          <Icon name="close" size={15} />
        </button>
      </div>
      <div className="sheet-drawer-body">
        <div className="csheet">
          {image && <img className="csheet-pf" src={image} alt="" />}
          <p className="csheet-subtitle">{subtitle}</p>

          <div className="csheet-core">
          <span><b>AC</b> {m.ac}{m.acNote ? ` (${m.acNote})` : ""}</span>
          <span><b>HP</b> {m.hp}{m.hitDice ? ` (${m.hitDice})` : ""}</span>
          <span><b>Speed</b> {speedLine(m.speed)}</span>
          {m.proficiencyBonus != null && <span><b>Prof</b> {formatMod(m.proficiencyBonus)}</span>}
        </div>

        <div className="csheet-abilities">
          {ABILITIES.map((ab) => {
            const score = m.abilities[ab] ?? 10;
            return (
              <div className="csheet-ab" key={ab}>
                <span className="csheet-ab-k">{ab}</span>
                <span className="csheet-ab-v">{score}</span>
                <span className="csheet-ab-m">{formatMod(abilityMod(score))}</span>
              </div>
            );
          })}
        </div>

        <div className="csheet-lines">
          {saveEntries.length > 0 && (
            <p className="csheet-line">
              <b>Saves</b> {saveEntries.map(([ab, v]) => `${ab} ${formatMod(v)}`).join(", ")}
            </p>
          )}
          {(m.skills?.length ?? 0) > 0 && (
            <p className="csheet-line">
              <b>Skills</b> {m.skills!.map((s) => `${s.name} ${formatMod(s.bonus)}`).join(", ")}
            </p>
          )}
          {(m.damageResistances?.length ?? 0) > 0 && (
            <p className="csheet-line"><b>Resistances</b> {m.damageResistances!.join(", ")}</p>
          )}
          {(m.damageImmunities?.length ?? 0) > 0 && (
            <p className="csheet-line"><b>Immunities</b> {m.damageImmunities!.join(", ")}</p>
          )}
          {(m.damageVulnerabilities?.length ?? 0) > 0 && (
            <p className="csheet-line"><b>Vulnerabilities</b> {m.damageVulnerabilities!.join(", ")}</p>
          )}
          {(m.conditionImmunities?.length ?? 0) > 0 && (
            <p className="csheet-line"><b>Condition Immunities</b> {m.conditionImmunities!.join(", ")}</p>
          )}
          {(m.senses?.length ?? 0) > 0 && <p className="csheet-line"><b>Senses</b> {m.senses!.join(", ")}</p>}
          {(m.languages?.length ?? 0) > 0 && <p className="csheet-line"><b>Languages</b> {m.languages!.join(", ")}</p>}
        </div>

        <Section title="Traits" entries={m.traits} />
        <Section
          title="Actions"
          entries={(m.actions ?? []).map((a) => ({
            name: a.name,
            text:
              a.text ??
              [
                a.attackBonus != null ? `${formatMod(a.attackBonus)} to hit` : null,
                a.reach || null,
                a.damage ? `${a.damage} ${a.damageType ?? ""}`.trim() : null,
              ]
                .filter(Boolean)
                .join(", "),
          }))}
        />
        <Section title="Bonus Actions" entries={m.bonusActions} />
        <Section title="Reactions" entries={m.reactions} />
        <Section
          title={m.legendaryCount ? `Legendary Actions (${m.legendaryCount})` : "Legendary Actions"}
          entries={m.legendaryActions}
        />
          <Section title="Mythic Actions" entries={m.mythicActions} />
        </div>
      </div>
    </aside>,
    document.body
  );
};
