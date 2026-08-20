import type { PartyMember } from "../state/usePartyPresence";
import { Icon } from "./ui/Icon";

/**
 * The Party panel — the TABLE's social surface (IA: decoupled from the user's
 * own characters, which live in the separate Characters tray). Who's in the
 * game, who's online, where everyone is, the DM's "Bring here", and inviting
 * new players. Nothing personal lives here.
 */

interface Props {
  party: PartyMember[];
  myUserId: string | null;
  mySceneId: string | null;
  stageSceneId: string | null;
  sceneNameOf: (id: string) => string | null;
  isDM: boolean;
  joinCode?: string;
  onCopyInvite?: () => void;
  onBringHere?: (userId: string) => void;
  onClose: () => void;
}

export const PartyPanel = ({
  party,
  myUserId,
  mySceneId,
  stageSceneId,
  sceneNameOf,
  isDM,
  joinCode,
  onCopyInvite,
  onBringHere,
  onClose,
}: Props) => (
  <div className="party-tray panel">
    <div className="party-tray-head">
      <span>Party</span>
      <button className="ghost" onClick={onClose} aria-label="Close" title="Close">
        <Icon name="close" size={12} />
      </button>
    </div>

    {party.length === 0 ? (
      <div className="dim" style={{ fontSize: 12, padding: "10px 2px" }}>
        No one here yet — share the invite below.
      </div>
    ) : (
      <div className="party-members" style={{ border: "none", margin: 0, padding: 0 }}>
        {party.map((m) => {
          const where = m.current_scene_id ?? stageSceneId ?? null;
          const isMe = m.user_id === myUserId;
          const location = isMe
            ? null
            : where && where === mySceneId
              ? "With you"
              : (where && sceneNameOf(where)) ?? "Elsewhere";
          return (
            <div key={m.user_id} className="party-member">
              <span className={`party-dot ${m.online ? "is-on" : ""}`} title={m.online ? "Online" : "Offline"} />
              <span className="party-member-name">
                {m.name}
                {isMe && <span className="party-member-you"> · you</span>}
              </span>
              {m.role === "dm" && <span className="party-member-role">DM</span>}
              {location && <span className="party-member-where">{location}</span>}
              {isDM && !isMe && onBringHere && where !== mySceneId && (
                <button
                  className="party-member-bring"
                  title="Bring this player to your scene"
                  onClick={() => onBringHere(m.user_id)}
                >
                  Bring here
                </button>
              )}
            </div>
          );
        })}
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
