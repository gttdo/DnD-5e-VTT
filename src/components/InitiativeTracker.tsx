import type { Token } from "../state/useTokens";
import type { UseInitiative } from "../state/useInitiative";
import { Icon } from "./ui/Icon";
import { GameGlyph } from "./ui/GameGlyph";
import { useToast } from "../state/Toast";

/**
 * Turn-order HUD for the table.
 *
 * Reads and writes through useInitiative, so every control here syncs to all
 * players at the table over the tokens/scenes realtime channels.
 *
 * Only the DM gets the controls that move the fight along (roll, next, end) —
 * players see the order and whose turn it is, which is the information they
 * actually need.
 */

interface Props {
  init: UseInitiative;
  isDM: boolean;
  /** Rolls initiative for a token — d20 plus its character's modifier. */
  rollFor: (t: Token) => number;
  onClose: () => void;
  /** Centres the view on a combatant when their row is clicked. */
  onFocusToken?: (t: Token) => void;
  /** A creature's hostility to the party (PCs are always "friendly"). */
  dispositionOf?: (t: Token) => "friendly" | "hostile";
  /** DM flips a creature hostile ↔ friendly — drives Opportunity Attacks. */
  onToggleDisposition?: (t: Token) => void;
  /** Combatants who still owe an initiative roll (players who haven't rolled). */
  pendingRolls?: number;
}

const initialsOf = (label: string) =>
  label.trim().split(/\s+/).slice(0, 2).map((w) => w[0]?.toUpperCase() ?? "").join("") || "?";

export const InitiativeTracker = ({ init, isDM, rollFor, onClose, onFocusToken, dispositionOf, onToggleDisposition, pendingRolls = 0 }: Props) => {
  const { order, activeToken, inCombat, round } = init;
  const toast = useToast();

  const columnsMissing = (error: string) =>
    error.includes("initiative") || error.includes("in_combat")
      ? "Combat columns are missing — apply migration 0008_initiative.sql to your database."
      : error;

  // Start the fight: monsters/NPCs auto-roll, players roll their own on their
  // screens (the ritual, #102).
  const begin = async () => {
    const error = await init.beginWithPlayerRolls(rollFor);
    if (error) toast.error(columnsMissing(error));
  };

  // Fill any blanks the DM wants to force — an absent player's token, or a "just
  // roll everyone" shortcut.
  const rollRemaining = async () => {
    const error = await init.rollAll(rollFor);
    if (error) toast.error(columnsMissing(error));
  };

  return (
    <aside className="init-tracker panel" aria-label="Initiative order">
      <header className="init-head">
        <span className="init-title">
          <GameGlyph src="/icons/game_state/game_initiative.svg" size={15} className="init-title-ico" />
          Initiative
          {inCombat && <span className="init-round">Round {round}</span>}
        </span>
        <button className="ghost" onClick={onClose} aria-label="Close" title="Close">
          <Icon name="close" size={12} />
        </button>
      </header>

      {order.length === 0 ? (
        <div className="init-empty">
          {isDM
            ? "Place tokens on the map, then roll for initiative to start a fight."
            : "The DM hasn't started a fight yet."}
        </div>
      ) : (
        <ol className="init-list">
          {order.map((t) => {
            const isActive = activeToken?.id === t.id;
            return (
              <li
                key={t.id}
                className={`init-row ${isActive ? "active" : ""}`}
                onClick={() => onFocusToken?.(t)}
                title={onFocusToken ? `Centre on ${t.label}` : undefined}
              >
                <span className="init-score" style={{ borderColor: t.color }}>
                  {t.initiative}
                </span>
                {t.image_url ? (
                  <img className="init-portrait" src={t.image_url} alt="" />
                ) : (
                  <span className="init-portrait" style={{ background: t.color, color: "#14100c" }}>
                    {initialsOf(t.label)}
                  </span>
                )}
                <span className="init-name">{t.label}</span>
                {isActive && <span className="init-turn">Turn</span>}
                {/* Hostility toggle — drives Opportunity Attacks. Only for
                    creatures the DM runs; PCs are always party-side. */}
                {isDM && onToggleDisposition && dispositionOf && !t.character_id && (() => {
                  const hostile = dispositionOf(t) === "hostile";
                  return (
                    <button
                      className={`init-disp ${hostile ? "is-hostile" : "is-friendly"}`}
                      onClick={(e) => {
                        e.stopPropagation();
                        onToggleDisposition(t);
                      }}
                      title={hostile ? `${t.label} is hostile — click to mark friendly` : `${t.label} is friendly — click to mark hostile`}
                      aria-label={hostile ? "Hostile to the party" : "Friendly to the party"}
                    >
                      <Icon name={hostile ? "swords" : "shield"} size={11} />
                    </button>
                  );
                })()}
                {isDM && (
                  <button
                    className="init-drop"
                    onClick={(e) => {
                      e.stopPropagation();
                      void init.setInitiative(t.id, null);
                    }}
                    title={`Remove ${t.label} from the order`}
                    aria-label={`Remove ${t.label} from the order`}
                  >
                    <Icon name="close" size={11} />
                  </button>
                )}
              </li>
            );
          })}
        </ol>
      )}

      {isDM && (
        <div className="init-actions">
          {!inCombat ? (
            <button className="primary" onClick={() => void begin()}>
              <Icon name="dice" size={13} />
              Roll for initiative
            </button>
          ) : (
            <>
              <button onClick={() => void init.previous()} title="Previous turn" aria-label="Previous turn">
                <Icon name="back" size={13} />
              </button>
              <button className="primary init-next" onClick={() => void init.next()}>
                Next turn
                <Icon name="forward" size={13} />
              </button>
              <button onClick={() => void init.end()} title="End combat">
                End
              </button>
            </>
          )}
        </div>
      )}

      {/* Players roll their own on their screens; the DM can force any who are
          absent (or short-circuit the whole roll) from here. */}
      {isDM && inCombat && pendingRolls > 0 && (
        <button className="init-pending" onClick={() => void rollRemaining()}>
          <Icon name="dice" size={12} />
          Waiting on {pendingRolls} to roll — roll for them
        </button>
      )}
    </aside>
  );
};
