import type { Token } from "../state/useTokens";
import { Icon } from "./ui/Icon";
import { GameGlyph } from "./ui/GameGlyph";

/**
 * BG3-style turn rail — a horizontal strip across the top of the table during
 * combat. Shows the initiative order as portraits, the active combatant raised
 * and named, and a round counter. The DM drives the fight straight from here
 * (previous / next / end); players get the same read-only order they see in the
 * side tracker, but always visible instead of behind a toggle.
 *
 * Everything is derived from useInitiative, which syncs over the scenes/tokens
 * realtime channels — so the rail shows the same turn on every screen.
 */

interface Props {
  order: Token[];
  activeToken: Token | null;
  round: number;
  isDM: boolean;
  /** Combatants still waiting to roll (players who haven't rolled yet). */
  pendingRolls: number;
  onNext: () => void;
  onPrev: () => void;
  onEnd: () => void;
  onFocusToken: (t: Token) => void;
}

const initialsOf = (label: string) =>
  label.trim().split(/\s+/).slice(0, 2).map((w) => w[0]?.toUpperCase() ?? "").join("") || "?";

const dispositionClass = (t: Token): string =>
  t.character_id ? "is-pc" : t.disposition === "friendly" ? "is-friendly" : "is-hostile";

export const CombatTurnRail = ({
  order,
  activeToken,
  round,
  isDM,
  pendingRolls,
  onNext,
  onPrev,
  onEnd,
  onFocusToken,
}: Props) => {
  return (
    <div className="turn-rail" role="group" aria-label="Turn order">
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
              className={`turn-rail-item ${dispositionClass(t)} ${isActive ? "is-active" : ""} ${dead ? "is-down" : ""}`}
              onClick={() => onFocusToken(t)}
              title={`${t.label} · initiative ${t.initiative ?? "—"}`}
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
        {pendingRolls > 0 && (
          <li className="turn-rail-pending" title="Players still rolling initiative">
            <Icon name="dice" size={13} />
            <span>{pendingRolls} rolling…</span>
          </li>
        )}
      </ol>

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
  );
};
