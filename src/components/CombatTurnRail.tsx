import { useState } from "react";
import type { Token } from "../state/useTokens";
import { Icon } from "./ui/Icon";
import { GameGlyph } from "./ui/GameGlyph";

/**
 * The single combat surface — a BG3-style bar across the top of the table that
 * REPLACES the old side Initiative panel. Lifecycle:
 *
 *   out of combat  → DM sees a "⚔ Roll for Initiative" pill (players see nothing)
 *   in combat      → the turn rail: order, active combatant, round. The DM drives
 *                    Prev / Next / End, and CLICKING A PORTRAIT opens a small
 *                    per-combatant popover (centre, disposition, set-initiative,
 *                    remove) — direct manipulation, no hunting for a tray.
 *
 * Everything is derived from useInitiative, which syncs over the scenes/tokens
 * realtime channels, so every screen shows the same turn.
 */

interface Props {
  inCombat: boolean;
  order: Token[];
  activeToken: Token | null;
  round: number;
  isDM: boolean;
  /** Combatants (players) who still owe an initiative roll. */
  pendingRolls: number;
  /** Start the fight: monsters/NPCs auto-roll, players roll their own. */
  onBegin: () => void;
  /** Force-roll everyone still blank (absent players / a shortcut). */
  onRollRemaining: () => void;
  onNext: () => void;
  onPrev: () => void;
  onEnd: () => void;
  onFocusToken: (t: Token) => void;
  dispositionOf: (t: Token) => "friendly" | "hostile";
  onToggleDisposition: (t: Token) => void;
  onRemove: (t: Token) => void;
  onSetInitiative: (tokenId: string, value: number | null) => void;
}

const initialsOf = (label: string) =>
  label.trim().split(/\s+/).slice(0, 2).map((w) => w[0]?.toUpperCase() ?? "").join("") || "?";

// Ring/tint keyed to a combatant's side, so the rail reads like the board:
// gold = a player character, red = hostile, green = friendly.
const sideClass = (t: Token): string =>
  t.character_id ? "is-pc" : t.disposition === "friendly" ? "is-friendly" : "is-hostile";

export const CombatTurnRail = ({
  inCombat,
  order,
  activeToken,
  round,
  isDM,
  pendingRolls,
  onBegin,
  onRollRemaining,
  onNext,
  onPrev,
  onEnd,
  onFocusToken,
  dispositionOf,
  onToggleDisposition,
  onRemove,
  onSetInitiative,
}: Props) => {
  // Which combatant's manage-popover is open (DM only). Clicking its portrait
  // toggles it; clicking the backdrop or another portrait moves/closes it.
  const [openId, setOpenId] = useState<string | null>(null);
  const openCombatant = openId ? order.find((t) => t.id === openId) ?? null : null;

  // Pre-combat: the DM's start control lives where the rail will be. Players see
  // nothing until the fight begins.
  if (!inCombat) {
    if (!isDM) return null;
    return (
      <div className="turn-rail is-pre">
        <button className="turn-rail-begin" onClick={onBegin}>
          <GameGlyph src="/icons/game_state/game_initiative.svg" size={16} />
          Roll for Initiative
        </button>
      </div>
    );
  }

  const clickPortrait = (t: Token) => {
    // The DM manages a combatant straight from its portrait; players just centre.
    if (isDM) setOpenId((cur) => (cur === t.id ? null : t.id));
    else onFocusToken(t);
  };

  return (
    <div className="turn-rail" role="group" aria-label="Turn order">
      <div className="turn-rail-bar">
        <div className="turn-rail-round" title={`Round ${round}`}>
          <GameGlyph src="/icons/game_state/game_initiative.svg" size={16} />
          <span className="turn-rail-round-n">{round}</span>
          <span className="turn-rail-round-l">Round</span>
        </div>

        <ol className="turn-rail-list">
          {order.map((t) => {
            const isActive = activeToken?.id === t.id;
            const dead = (t.hp_current ?? 1) <= 0;
            return (
              <li
                key={t.id}
                className={`turn-rail-item ${sideClass(t)} ${isActive ? "is-active" : ""} ${dead ? "is-down" : ""} ${openId === t.id ? "is-managing" : ""}`}
                onClick={() => clickPortrait(t)}
                title={isDM ? `${t.label} — click to manage` : `Centre on ${t.label}`}
              >
                <span className="turn-rail-score">{t.initiative}</span>
                {t.image_url ? (
                  <img className="turn-rail-portrait" src={t.image_url} alt="" />
                ) : (
                  <span className="turn-rail-portrait" style={{ background: t.color, color: "#14100c" }}>
                    {initialsOf(t.label)}
                  </span>
                )}
                {isActive && <span className="turn-rail-name">{t.label}</span>}
              </li>
            );
          })}
          {pendingRolls > 0 &&
            (isDM ? (
              <li className="turn-rail-pending">
                <button className="turn-rail-pending-btn" onClick={onRollRemaining} title="Roll initiative for players who haven't yet">
                  <Icon name="dice" size={13} /> Roll {pendingRolls}
                </button>
              </li>
            ) : (
              <li className="turn-rail-pending" title="Players still rolling initiative">
                <Icon name="dice" size={13} />
                <span>{pendingRolls} rolling…</span>
              </li>
            ))}
        </ol>

        {/* Driving the fight — Prev / Next / End — is the DM's alone. Players get
            the read-only order (and can still click a portrait to centre it). */}
        {isDM && (
          <div className="turn-rail-controls">
            <button onClick={onPrev} title="Previous turn" aria-label="Previous turn">
              <Icon name="back" size={14} />
            </button>
            <button className="turn-rail-next" onClick={onNext} title="Next turn">
              Next
              <Icon name="forward" size={14} />
            </button>
            <button className="turn-rail-end" onClick={onEnd} title="End combat" aria-label="End combat">
              <Icon name="close" size={13} />
            </button>
          </div>
        )}
      </div>

      {/* Per-combatant manage popover (DM) — opened by clicking a portrait. */}
      {isDM && openCombatant && (
        <>
          <div className="turn-rail-pop-backdrop" onPointerDown={() => setOpenId(null)} />
          <div className="turn-rail-pop" role="dialog" aria-label={`Manage ${openCombatant.label}`}>
            <div className="turn-rail-pop-head">
              {openCombatant.image_url ? (
                <img className="turn-rail-pop-port" src={openCombatant.image_url} alt="" />
              ) : (
                <span className="turn-rail-pop-port" style={{ background: openCombatant.color, color: "#14100c" }}>
                  {initialsOf(openCombatant.label)}
                </span>
              )}
              <span className="turn-rail-pop-name">{openCombatant.label}</span>
              <label className="turn-rail-pop-init" title="Initiative">
                <span>Init</span>
                <input
                  type="number"
                  value={openCombatant.initiative ?? 0}
                  onChange={(e) =>
                    onSetInitiative(openCombatant.id, e.target.value === "" ? null : parseInt(e.target.value, 10))
                  }
                />
              </label>
            </div>

            {/* Disposition — non-PC only; drives Opportunity Attacks. */}
            {!openCombatant.character_id && (
              <div className="turn-rail-pop-disp" role="group" aria-label="Disposition">
                {(["friendly", "hostile"] as const).map((side) => {
                  const on = dispositionOf(openCombatant) === side;
                  return (
                    <button
                      key={side}
                      className={`turn-rail-pop-side is-${side} ${on ? "is-on" : ""}`}
                      onClick={() => {
                        if (!on) onToggleDisposition(openCombatant);
                      }}
                      aria-pressed={on}
                    >
                      <Icon name={side === "hostile" ? "swords" : "shield"} size={13} />
                      {side === "hostile" ? "Hostile" : "Friendly"}
                    </button>
                  );
                })}
              </div>
            )}

            <div className="turn-rail-pop-actions">
              <button
                onClick={() => {
                  onFocusToken(openCombatant);
                  setOpenId(null);
                }}
              >
                <Icon name="select" size={13} /> Centre on token
              </button>
              <button
                className="turn-rail-pop-remove"
                onClick={() => {
                  onRemove(openCombatant);
                  setOpenId(null);
                }}
              >
                <Icon name="close" size={13} /> Remove from combat
              </button>
            </div>
          </div>
        </>
      )}
    </div>
  );
};
