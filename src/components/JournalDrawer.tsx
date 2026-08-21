import { useMemo, useState } from "react";
import { SheetDrawer } from "./ui/SheetDrawer";
import { Icon } from "./ui/Icon";
import { HandoutView } from "./HandoutView";
import { readHandoutMeta } from "../lib/handouts";
import type { CampaignDoc, DocShare } from "../state/useCampaign";

/**
 * The player's Journal (Story/Journal) — a read-only archive of everything the
 * DM has shared: read-alouds, handouts, and recaps, newest-first. Players
 * write in chat and read history in recaps; this is purely "what the DM handed
 * us." Phase 1 scale: each entry is dated, a search box filters by text, and
 * kind chips (All / Readings / Handouts / Recaps) cut a long list fast.
 */

const KIND_LABEL: Record<CampaignDoc["kind"], string> = {
  note: "Note",
  read_aloud: "Read-aloud",
  quest: "Quest",
  recap: "Recap",
  handout: "Handout",
};

type Filter = "all" | "read_aloud" | "handout" | "recap";

const relativeDate = (iso: string): string => {
  const then = new Date(iso).getTime();
  const days = Math.floor((Date.now() - then) / 86_400_000);
  if (days <= 0) return "today";
  if (days === 1) return "yesterday";
  if (days < 7) return `${days} days ago`;
  return new Date(iso).toLocaleDateString(undefined, { month: "short", day: "numeric" });
};

/** Text a handout contributes to search — its fields, not just the title. */
const handoutText = (meta: unknown): string => {
  const f = readHandoutMeta(meta).fields;
  return [f.title, f.subtitle, f.body, f.footer, ...f.lines].join(" ");
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
  const [filter, setFilter] = useState<Filter>("all");
  const [query, setQuery] = useState("");

  // Most-recent share time per doc, to date and order the archive.
  const sharedAt = useMemo(() => {
    const m = new Map<string, string>();
    for (const s of shares) {
      const cur = m.get(s.document_id);
      if (!cur || s.shared_at > cur) m.set(s.document_id, s.shared_at);
    }
    return m;
  }, [shares]);

  const entries = useMemo(() => {
    const q = query.trim().toLowerCase();
    return docs
      .filter((d) => sharedAt.has(d.id))
      .filter((d) => (filter === "all" ? true : d.kind === filter))
      .filter((d) => {
        if (!q) return true;
        const hay = (d.kind === "handout" ? d.title + " " + handoutText(d.meta) : d.title + " " + d.content).toLowerCase();
        return hay.includes(q);
      })
      .sort((a, b) => (sharedAt.get(b.id) ?? "").localeCompare(sharedAt.get(a.id) ?? ""));
  }, [docs, sharedAt, filter, query]);

  const anyShared = docs.some((d) => sharedAt.has(d.id));

  return (
    <SheetDrawer title="Journal" onClose={onClose}>
      {!anyShared ? (
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
        <>
          <div className="journal-search">
            <Icon name="search" size={14} />
            <input placeholder="Search the journal…" value={query} onChange={(e) => setQuery(e.target.value)} />
          </div>
          <div className="feed-filters">
            {(
              [
                ["all", "All"],
                ["read_aloud", "Readings"],
                ["handout", "Handouts"],
                ["recap", "Recaps"],
              ] as [Filter, string][]
            ).map(([f, label]) => (
              <button key={f} className={filter === f ? "is-on" : ""} onClick={() => setFilter(f)}>
                {label}
              </button>
            ))}
          </div>

          {entries.length === 0 ? (
            <div className="dim" style={{ fontSize: 13.5, padding: "16px 4px", textAlign: "center" }}>
              Nothing matches.
            </div>
          ) : (
            <div className="story-list">
              {entries.map((d) => (
                <div key={d.id} className={`story-doc ${d.kind === "read_aloud" ? "is-readaloud" : ""}`}>
                  <div className="story-dochead">
                    <span className="camped-kind is-players">{KIND_LABEL[d.kind]}</span>
                    <span className="story-doctitle">{d.title || "Untitled"}</span>
                    <span style={{ flex: 1 }} />
                    <span className="journal-date" title={new Date(sharedAt.get(d.id) ?? "").toLocaleString()}>
                      {relativeDate(sharedAt.get(d.id) ?? "")}
                    </span>
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
        </>
      )}
    </SheetDrawer>
  );
};
