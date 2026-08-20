import type { Character } from "../types/character";
import type { PartyMember } from "../state/usePartyPresence";
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
  /** DM-only invite: the party panel is where "who's at my table?" lives, so
   *  it's also where inviting them lives (the raw code left the top bar). */
  isDM?: boolean;
  joinCode?: string;
  onCopyInvite?: () => void;
  /** Presence (#Phase 3b): the game's members with online + location. */
  party?: PartyMember[];
  myUserId?: string | null;
  /** Viewer-relative location labeling. */
  mySceneId?: string | null;
  stageSceneId?: string | null;
  sceneNameOf?: (id: string) => string | null;
}

const initialsOf = (name: string) =>
  name
    .split(/\s+/)
    .map((w) => w[0])
    .filter(Boolean)
    .slice(0, 2)
    .join("")
    .toUpperCase();

export const PartyTray = ({
  characters,
  onPlace,
  onClose,
  isDM,
  joinCode,
  onCopyInvite,
  party,
  myUserId,
  mySceneId,
  stageSceneId,
  sceneNameOf,
}: Props) => (
  <div className="party-tray panel">
    <div className="party-tray-head">
      <span>Party</span>
      <button className="ghost" onClick={onClose} aria-label="Close" title="Close">
        <Icon name="close" size={12} />
      </button>
    </div>

    {/* Who's at the table — presence (#Phase 3b). */}
    {party && party.length > 0 && (
      <div className="party-members">
        {party.map((m) => {
          const where = m.current_scene_id ?? stageSceneId ?? null;
          const isMe = m.user_id === myUserId;
          const location = isMe
            ? null
            : where && where === mySceneId
              ? "With you"
              : (where && sceneNameOf?.(where)) ?? "Elsewhere";
          return (
            <div key={m.user_id} className="party-member">
              <span className={`party-dot ${m.online ? "is-on" : ""}`} title={m.online ? "Online" : "Offline"} />
              <span className="party-member-name">
                {m.name}
                {isMe && <span className="party-member-you"> · you</span>}
              </span>
              {m.role === "dm" && <span className="party-member-role">DM</span>}
              {location && <span className="party-member-where">{location}</span>}
            </div>
          );
        })}
      </div>
    )}

    <div className="party-tray-sub">Your Characters</div>

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

    {isDM && joinCode && (
      <div className="party-invite">
        <button className="party-invite-btn" onClick={onCopyInvite}>
          <Icon name="copy" size={14} />
          Copy invite link
        </button>
        <div className="party-invite-code">
          or join with code <b>{joinCode}</b>
        </div>
      </div>
    )}
  </div>
);
