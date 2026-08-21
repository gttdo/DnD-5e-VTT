import { SheetDrawer } from "./ui/SheetDrawer";
import { Icon } from "./ui/Icon";
import type { CampaignDoc } from "../state/useCampaign";
import { HandoutView } from "./HandoutView";

/**
 * The Story drawer (#0041, slice 1e) — the DM's prep, delivered at the table.
 * When a scene is staged, its documents surface here: DM notes to read
 * quietly, read-alouds to ▶ Present onto every player's screen. This is the
 * moment the Campaign Editor pays off in play.
 *
 * Players can open it too — they just see only player-facing material (RLS
 * already filters their doc list), with no Present controls.
 */

const KIND_LABEL: Record<CampaignDoc["kind"], string> = {
  note: "Note",
  read_aloud: "Read-aloud",
  quest: "Quest",
  recap: "Recap",
  handout: "Handout",
};

const DocRow = ({ doc, isDM, onPresent }: { doc: CampaignDoc; isDM: boolean; onPresent: (d: CampaignDoc) => void }) => {
  const presentable = doc.kind === "handout" || Boolean(doc.content.trim());
  return (
    <div className={`story-doc ${doc.kind === "read_aloud" ? "is-readaloud" : ""}`}>
      <div className="story-dochead">
        <span className={`camped-kind ${doc.visibility === "players" ? "is-players" : ""}`}>{KIND_LABEL[doc.kind]}</span>
        <span className="story-doctitle">{doc.title || "Untitled"}</span>
        <span style={{ flex: 1 }} />
        {isDM && doc.visibility === "players" && presentable && (
          <button className="story-present" onClick={() => onPresent(doc)} title="Show this on every player's screen">
            ▶ Present
          </button>
        )}
        {isDM && doc.visibility === "dm" && <span className="story-lock">🔒</span>}
      </div>
      {doc.kind === "handout" ? (
        <HandoutView meta={doc.meta} compact />
      ) : (
        doc.content.trim() && <div className={doc.kind === "read_aloud" ? "story-ra" : "story-body"}>{doc.content}</div>
      )}
    </div>
  );
};

export const StoryDrawer = ({
  sceneName,
  sceneDocs,
  campaignDocs,
  latestRecap,
  isDM,
  onPresent,
  onClose,
}: {
  sceneName: string;
  sceneDocs: CampaignDoc[];
  campaignDocs: CampaignDoc[];
  latestRecap: CampaignDoc | null;
  isDM: boolean;
  onPresent: (doc: CampaignDoc) => void;
  onClose: () => void;
}) => {
  const empty = sceneDocs.length === 0 && campaignDocs.length === 0 && !latestRecap;
  return (
    <SheetDrawer title="Story" onClose={onClose}>
      {empty ? (
        <div className="gamelog-empty">
          <span className="gamelog-empty-icon">
            <Icon name="library" size={28} />
          </span>
          <div className="gamelog-empty-title">Nothing written yet</div>
          <p className="gamelog-empty-body">
            {isDM
              ? "Prep this scene in the Campaign Editor — its notes and read-alouds will surface here when you stage it."
              : "The DM hasn't shared any story material yet."}
          </p>
        </div>
      ) : (
        <div className="story-list">
          {latestRecap && (
            <>
              <div className="story-section">Previously on…</div>
              <DocRow doc={latestRecap} isDM={isDM} onPresent={onPresent} />
            </>
          )}
          {sceneDocs.length > 0 && (
            <>
              <div className="story-section">This scene — {sceneName}</div>
              {sceneDocs.map((d) => (
                <DocRow key={d.id} doc={d} isDM={isDM} onPresent={onPresent} />
              ))}
            </>
          )}
          {campaignDocs.length > 0 && (
            <>
              <div className="story-section">Campaign</div>
              {campaignDocs.map((d) => (
                <DocRow key={d.id} doc={d} isDM={isDM} onPresent={onPresent} />
              ))}
            </>
          )}
        </div>
      )}
    </SheetDrawer>
  );
};
