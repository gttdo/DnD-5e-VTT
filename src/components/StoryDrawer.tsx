import { SheetDrawer } from "./ui/SheetDrawer";
import { Icon } from "./ui/Icon";
import { HandoutView } from "./HandoutView";
import { QuestView } from "./QuestView";
import type { CampaignDoc } from "../state/useCampaign";

/**
 * The DM's Story drawer at the table (Story/Journal) — this scene's prep,
 * ready to hand to players. Notes stay the DM's own; read-alouds, handouts,
 * and the latest recap carry ▶ Share, which shows the artifact live on every
 * screen AND files it in the party's Journal. One verb.
 */

const KIND_LABEL: Record<CampaignDoc["kind"], string> = {
  note: "Note",
  read_aloud: "Read-aloud",
  quest: "Quest",
  recap: "Recap",
  handout: "Handout",
};

const DocRow = ({
  doc,
  isShared,
  onShare,
}: {
  doc: CampaignDoc;
  isShared: boolean;
  onShare: (d: CampaignDoc) => void;
}) => {
  const shareable = doc.kind !== "note" && (doc.kind === "handout" || doc.kind === "quest" || Boolean(doc.content.trim()));
  return (
    <div className={`story-doc ${doc.kind === "read_aloud" ? "is-readaloud" : ""}`}>
      <div className="story-dochead">
        <span className={`camped-kind ${isShared ? "is-players" : ""}`}>{KIND_LABEL[doc.kind]}</span>
        <span className="story-doctitle">{doc.title || "Untitled"}</span>
        <span style={{ flex: 1 }} />
        {shareable &&
          (isShared ? (
            <button className="story-present is-shared" onClick={() => onShare(doc)} title="Already in the journal — show it again">
              ◉ Share again
            </button>
          ) : (
            <button className="story-present" onClick={() => onShare(doc)} title="Show on every player's screen and file it in their journal">
              ▶ Share
            </button>
          ))}
        {doc.kind === "note" && <span className="story-lock">🔒</span>}
      </div>
      {doc.kind === "handout" ? (
        <HandoutView meta={doc.meta} compact />
      ) : (
        <>
          {doc.content.trim() && <div className={doc.kind === "read_aloud" ? "story-ra" : "story-body"}>{doc.content}</div>}
          {doc.kind === "quest" && <QuestView meta={doc.meta} />}
        </>
      )}
    </div>
  );
};

export const StoryDrawer = ({
  sceneName,
  sceneDocs,
  campaignDocs,
  latestRecap,
  isShared,
  onShare,
  onClose,
}: {
  sceneName: string;
  sceneDocs: CampaignDoc[];
  campaignDocs: CampaignDoc[];
  latestRecap: CampaignDoc | null;
  isShared: (docId: string) => boolean;
  onShare: (doc: CampaignDoc) => void;
  onClose: () => void;
}) => {
  const empty = sceneDocs.length === 0 && campaignDocs.length === 0 && !latestRecap;
  return (
    <SheetDrawer title="Story" onClose={onClose}>
      {empty ? (
        <div className="gamelog-empty">
          <span className="gamelog-empty-icon">
            <Icon name="story" size={28} />
          </span>
          <div className="gamelog-empty-title">Nothing written yet</div>
          <p className="gamelog-empty-body">
            Prep this scene in the Campaign Editor — its notes and read-alouds surface here when you stage it, ready to share.
          </p>
        </div>
      ) : (
        <div className="story-list">
          {latestRecap && (
            <>
              <div className="story-section">Previously on…</div>
              <DocRow doc={latestRecap} isShared={isShared(latestRecap.id)} onShare={onShare} />
            </>
          )}
          {sceneDocs.length > 0 && (
            <>
              <div className="story-section">This scene — {sceneName}</div>
              {sceneDocs.map((d) => (
                <DocRow key={d.id} doc={d} isShared={isShared(d.id)} onShare={onShare} />
              ))}
            </>
          )}
          {campaignDocs.length > 0 && (
            <>
              <div className="story-section">Campaign</div>
              {campaignDocs.map((d) => (
                <DocRow key={d.id} doc={d} isShared={isShared(d.id)} onShare={onShare} />
              ))}
            </>
          )}
        </div>
      )}
    </SheetDrawer>
  );
};
