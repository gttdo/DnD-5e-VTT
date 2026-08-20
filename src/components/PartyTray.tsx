import type { Character } from "../types/character";
import { Icon } from "./ui/Icon";

/**
 * Roster tray for the table — drag a character onto the map to place their
 * token, portrait and all.
 *
 * Drag is the primary gesture on desktop (you choose where it lands), but
 * HTML5 drag-and-drop doesn't fire for touch, so every row is also tappable
 * and drops the token at the centre of the scene. Neither path is a fallback
 * for the other; both are first-class.
 */

export const DRAG_MIME = "application/x-vtt-character";

interface Props {
  characters: Character[];
  /** Place at the grid centre — the tap path. */
  onPlace: (c: Character) => void;
  onClose: () => void;
}

const initialsOf = (name: string) =>
  name
    .split(/\s+/)
    .map((w) => w[0])
    .filter(Boolean)
    .slice(0, 2)
    .join("")
    .toUpperCase();

export const PartyTray = ({ characters, onPlace, onClose }: Props) => (
  <div className="party-tray panel">
    <div className="party-tray-head">
      <span>Your Characters</span>
      <button className="ghost" onClick={onClose} aria-label="Close" title="Close">
        <Icon name="close" size={12} />
      </button>
    </div>

    {characters.length === 0 ? (
      <div className="dim" style={{ fontSize: 12, padding: "10px 2px" }}>
        No characters yet — build one from the Characters tab.
      </div>
    ) : (
      <div className="party-tray-list">
        {characters.map((c) => (
          <button
            key={c.id}
            className="party-row"
            draggable
            onDragStart={(e) => {
              e.dataTransfer.setData(DRAG_MIME, c.id);
              e.dataTransfer.effectAllowed = "copy";
            }}
            onClick={() => onPlace(c)}
            title={`Drag ${c.name} onto the map, or click to place at centre`}
          >
            {c.portrait ? (
              <img className="party-portrait" src={c.portrait} alt="" />
            ) : (
              <span className="party-portrait">{initialsOf(c.name) || "?"}</span>
            )}
            <span className="party-row-text">
              <span className="party-name">{c.name}</span>
              <span className="party-sub">
                {c.species} · {c.classes.map((cl) => `${cl.name} ${cl.level}`).join(" / ")}
              </span>
            </span>
          </button>
        ))}
      </div>
    )}

  </div>
);
