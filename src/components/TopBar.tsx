import { useState } from "react";
import type { Character } from "../types/character";
import type { CharacterAPI } from "../state/useCharacter";
import { useRules } from "../state/Rules";
import { Icon } from "./ui/Icon";
import { RestDrawer, type RestKind } from "./RestDrawer";
import { ConditionsDrawer } from "./ConditionsDrawer";
import { LevelUpDrawer } from "./LevelUpDrawer";
import { eligibleByXp } from "../lib/levelUp";

interface Props {
  character: Character;
  api: CharacterAPI;
  /** Opens the avatar-change dialog. */
  onEditAvatar?: () => void;
}

/**
 * Sheet header: identity on the left, rest actions + conditions on the right.
 * Deliberately holds no stats — AC / Initiative / Speed / Prof / HP moved to
 * VitalStats so they sit under the name rather than across the sheet.
 *
 * Rest and Conditions open a right-side drawer instead of acting immediately
 * (see SheetDrawer) — a long rest resets a lot of state, so it should be a
 * deliberate confirm with the rule visible.
 */
export const TopBar = ({ character: c, api, onEditAvatar }: Props) => {
  const [rest, setRest] = useState<RestKind | null>(null);
  const [condOpen, setCondOpen] = useState(false);
  const [levelUpOpen, setLevelUpOpen] = useState(false);
  const { tables } = useRules();
  const canLevel = c.level < 20;
  const xpReady = eligibleByXp(c, tables);
  // XP needed for the next level, from the PHB experience table. Absent at
  // level 20 (nothing above it) or before the tables load.
  const nextLevelXp = tables?.experience?.[String(c.level + 1)];
  const initials = c.name
    .split(/\s+/)
    .map((w) => w[0])
    .filter(Boolean)
    .slice(0, 2)
    .join("")
    .toUpperCase();

  return (
    <div className="panel sheet-header">
      <div className="topbar-grid">
        {/* Portrait + identity */}
        <div className="row" style={{ gap: 12 }}>
          <button
            className="portrait-btn"
            onClick={onEditAvatar}
            title="Change avatar"
            aria-label="Change avatar"
          >
            {c.portrait ? (
              <img className="portrait" src={c.portrait} alt={c.name} />
            ) : (
              <div className="portrait">{initials || "?"}</div>
            )}
            <span className="portrait-edit" aria-hidden="true"><Icon name="image" size={12} /></span>
          </button>
          <div>
            <input
              className="char-name"
              value={c.name}
              onChange={(e) => api.setName(e.target.value)}
            />
            <div className="subline">
              {c.species}{c.lineage ? ` (${c.lineage})` : ""} · {c.classes.map((cl) => `${cl.name} ${cl.level}`).join(" / ")} · {c.background}
              {nextLevelXp !== undefined && (
                <span title={`${nextLevelXp - c.xp} XP to level ${c.level + 1}`}>
                  {" "}· XP {c.xp.toLocaleString()} / {nextLevelXp.toLocaleString()}
                </span>
              )}
            </div>
          </div>
        </div>

        {/* One uniform action row. Every control is a labelled button of the
            same shape — the old cluster mixed a text button, a bare icon
            circle, and a dashed pill on its own line. */}
        <div className="sheet-actions">
          {canLevel && (
            <button
              className={`sheet-action ${xpReady ? "is-ready" : ""}`}
              onClick={() => setLevelUpOpen(true)}
              title={
                xpReady
                  ? `You have enough XP for level ${c.level + 1}!`
                  : `Advance to level ${c.level + 1} (milestone levelling ignores XP)`
              }
            >
              <Icon name="sparkles" size={14} />
              Level Up
            </button>
          )}
          <button
            className="sheet-action"
            onClick={() => setRest("short")}
            title="Recover features that return on a short rest"
          >
            <Icon name="rest" size={14} />
            Short Rest
          </button>
          <button
            className="sheet-action"
            onClick={() => setRest("long")}
            title="Regain hit points, spell slots and long-rest features"
          >
            <Icon name="moon" size={14} />
            Long Rest
          </button>
          <button
            className={`sheet-action is-toggle ${c.inspiration ? "on" : ""}`}
            onClick={api.toggleInspiration}
            aria-pressed={c.inspiration}
            title={
              c.inspiration
                ? "You have Heroic Inspiration — spend it to reroll a d20 test and keep the new roll. Click to spend."
                : "Heroic Inspiration: when you have it, you can reroll a d20 test and keep the new roll. Click to grant."
            }
          >
            <Icon name="star" size={14} />
            Inspiration
          </button>
          <button
            className={`sheet-action ${c.conditions.length ? "has-count" : ""}`}
            onClick={() => setCondOpen(true)}
            title="Add or remove conditions"
          >
            <Icon name="alert" size={14} />
            Conditions
            {c.conditions.length > 0 && (
              <span className="sheet-action-count">{c.conditions.length}</span>
            )}
          </button>
        </div>

      </div>

      {rest && (
        <RestDrawer
          kind={rest}
          onConfirm={rest === "long" ? api.longRest : api.shortRest}
          onClose={() => setRest(null)}
        />
      )}
      {condOpen && (
        <ConditionsDrawer character={c} api={api} onClose={() => setCondOpen(false)} />
      )}
      {levelUpOpen && (
        <LevelUpDrawer character={c} onApply={api.applyLevelUp} onClose={() => setLevelUpOpen(false)} />
      )}
    </div>
  );
};
