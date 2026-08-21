import { useMemo } from "react";
import { SheetDrawer } from "./ui/SheetDrawer";
import { Icon } from "./ui/Icon";
import { HandoutView } from "./HandoutView";
import type { CampaignDoc, DocShare } from "../state/useCampaign";

/**
 * The player's Journal (Story/Journal reconciliation) — a read-only archive of
 * everything the DM has shared with them: read-alouds, handouts, and recaps,
 * newest-first. There is no writing here — players write in chat; their
 * session history is the recaps. This is purely "what the DM handed us."
 *
 * A player's doc list is already RLS-scoped to shared docs, so we just order
 * it by when each was shared.
 */

const KIND_LABEL: Record<CampaignDoc["kind"], string> = {
  note: "Note",
  read_aloud: "Read-aloud",
  quest: "Quest",
  recap: "Recap",
  handout: "Handout",
};

export const JournalDrawer = ({
  docs,
  shares,
  onClose,
}: {
  docs: CampaignDoc[];
  shares: DocShare[];
  onClose: () => void;
}) => {
  // Most-recent share time per doc, to order the archive.
  const sharedAt = useMemo(() => {
    const m = new Map<string, string>();
    for (const s of shares) {
      const cur = m.get(s.document_id);
      if (!cur || s.shared_at > cur) m.set(s.document_id, s.shared_at);
    }
    return m;
  }, [shares]);

  const entries = useMemo(
    () =>
      docs
        .filter((d) => sharedAt.has(d.id))
        .sort((a, b) => (sharedAt.get(b.id) ?? "").localeCompare(sharedAt.get(a.id) ?? "")),
    [docs, sharedAt]
  );

  return (
    <SheetDrawer title="Journal" onClose={onClose}>
      {entries.length === 0 ? (
        <div className="gamelog-empty">
          <span className="gamelog-empty-icon">
            <Icon name="story" size={28} />
          </span>
          <div className="gamelog-empty-title">Nothing shared yet</div>
          <p className="gamelog-empty-body">
            When the DM shares a reading, handout, or recap, it lands here for you to read any time.
          </p>
        </div>
      ) : (
        <div className="story-list">
          {entries.map((d) => (
            <div key={d.id} className={`story-doc ${d.kind === "read_aloud" ? "is-readaloud" : ""}`}>
              <div className="story-dochead">
                <span className="camped-kind is-players">{KIND_LABEL[d.kind]}</span>
                <span className="story-doctitle">{d.title || "Untitled"}</span>
              </div>
              {d.kind === "handout" ? (
                <HandoutView meta={d.meta} compact />
              ) : (
                d.content.trim() && <div className={d.kind === "read_aloud" ? "story-ra" : "story-body"}>{d.content}</div>
              )}
            </div>
          ))}
        </div>
      )}
    </SheetDrawer>
  );
};
