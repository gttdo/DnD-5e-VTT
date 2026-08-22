import { useMemo, useState } from "react";
import { SheetDrawer } from "./ui/SheetDrawer";
import { Icon } from "./ui/Icon";
import { HandoutView } from "./HandoutView";
import { readHandoutMeta } from "../lib/handouts";
import type { CampaignDoc, DocShare } from "../state/useCampaign";
import type { GameSession } from "../state/useSessions";

/**
 * The player's Journal (Story/Journal) — a read-only archive of everything the
 * DM has shared: read-alouds, handouts, and recaps. Players write in chat and
 * read history in recaps; this is purely "what the DM handed us."
 *
 * Phase 1: dated entries, text search, kind chips.
 * Phase 2: a "By session" view that groups artifacts under the session they
 * were shared in (the session_id captured on each share), matching the
 * Timeline mental model as the archive grows.
 */

const KIND_LABEL: Record<CampaignDoc["kind"], string> = {
  note: "Note",
  read_aloud: "Read-aloud",
  quest: "Quest",
  recap: "Recap",
  handout: "Handout",
};

type Filter = "all" | "read_aloud" | "handout" | "recap";
type View = "latest" | "session";

const relativeDate = (iso: string): string => {
  const then = new Date(iso).getTime();
  const days = Math.floor((Date.now() - then) / 86_400_000);
  if (days <= 0) return "today";
  if (days === 1) return "yesterday";
  if (days < 7) return `${days} days ago`;
  return new Date(iso).toLocaleDateString(undefined, { month: "short", day: "numeric" });
};

const handoutText = (meta: unknown): string => {
  const f = readHandoutMeta(meta).fields;
  return [f.title, f.subtitle, f.body, f.footer, ...f.lines].join(" ");
};

const JournalDoc = ({ doc, date }: { doc: CampaignDoc; date: string }) => (
  <div className={`story-doc ${doc.kind === "read_aloud" ? "is-readaloud" : ""}`}>
    <div className="story-dochead">
      <span className="camped-kind is-players">{KIND_LABEL[doc.kind]}</span>
      <span className="story-doctitle">{doc.title || "Untitled"}</span>
      <span style={{ flex: 1 }} />
      <span className="journal-date" title={new Date(date).toLocaleString()}>{relativeDate(date)}</span>
    </div>
    {doc.kind === "handout" ? (
      <HandoutView meta={doc.meta} compact />
    ) : (
      doc.content.trim() && <div className={doc.kind === "read_aloud" ? "story-ra" : "story-body"}>{doc.content}</div>
    )}
  </div>
);

export const JournalDrawer = ({
  docs,
  shares,
  sessions,
  onClose,
}: {
  docs: CampaignDoc[];
  shares: DocShare[];
  sessions: GameSession[];
  onClose: () => void;
}) => {
  const [filter, setFilter] = useState<Filter>("all");
  const [query, setQuery] = useState("");
  const [view, setView] = useState<View>("latest");

  // Most-recent share per doc → its time and the session it happened in.
  const shareOf = useMemo(() => {
    const m = new Map<string, { at: string; sessionId: string | null }>();
    for (const s of shares) {
      const cur = m.get(s.document_id);
      if (!cur || s.shared_at > cur.at) m.set(s.document_id, { at: s.shared_at, sessionId: s.session_id });
    }
    return m;
  }, [shares]);

  const entries = useMemo(() => {
    const q = query.trim().toLowerCase();
    return docs
      .filter((d) => shareOf.has(d.id))
      .filter((d) => (filter === "all" ? true : d.kind === filter))
      .filter((d) => {
        if (!q) return true;
        const hay = (d.kind === "handout" ? d.title + " " + handoutText(d.meta) : d.title + " " + d.content).toLowerCase();
        return hay.includes(q);
      })
      .sort((a, b) => (shareOf.get(b.id)?.at ?? "").localeCompare(shareOf.get(a.id)?.at ?? ""));
  }, [docs, shareOf, filter, query]);

  // Session view: group entries under the session they were shared in.
  const grouped = useMemo(() => {
    if (view !== "session") return [];
    const byNumber = new Map(sessions.map((s) => [s.id, s]));
    const groups = new Map<string, CampaignDoc[]>();
    for (const d of entries) {
      const key = shareOf.get(d.id)?.sessionId ?? "none";
      (groups.get(key) ?? groups.set(key, []).get(key)!).push(d);
    }
    // Order: highest session number first, "Off the record" last.
    return [...groups.entries()]
      .map(([key, ds]) => ({
        key,
        session: key === "none" ? null : byNumber.get(key) ?? null,
        docs: ds,
      }))
      .sort((a, b) => {
        if (!a.session) return 1;
        if (!b.session) return -1;
        return b.session.number - a.session.number;
      });
  }, [view, entries, sessions, shareOf]);

  const anyShared = docs.some((d) => shareOf.has(d.id));

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
          <div className="journal-controls">
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
            <button
              className="journal-view-toggle"
              onClick={() => setView((v) => (v === "latest" ? "session" : "latest"))}
              title="Switch between newest-first and grouped by session"
            >
              {view === "latest" ? "By session" : "Latest"}
            </button>
          </div>

          {entries.length === 0 ? (
            <div className="dim" style={{ fontSize: 13.5, padding: "16px 4px", textAlign: "center" }}>
              Nothing matches.
            </div>
          ) : view === "latest" ? (
            <div className="story-list">
              {entries.map((d) => (
                <JournalDoc key={d.id} doc={d} date={shareOf.get(d.id)!.at} />
              ))}
            </div>
          ) : (
            <div className="story-list">
              {grouped.map((g) => (
                <div key={g.key}>
                  <div className="journal-session-head">
                    {g.session ? (
                      <>
                        Session {g.session.number}
                        <span className="journal-session-date">
                          {new Date(g.session.started_at).toLocaleDateString(undefined, { month: "short", day: "numeric" })}
                        </span>
                      </>
                    ) : (
                      "Off the record"
                    )}
                  </div>
                  {g.docs.map((d) => (
                    <JournalDoc key={d.id} doc={d} date={shareOf.get(d.id)!.at} />
                  ))}
                </div>
              ))}
            </div>
          )}
        </>
      )}
    </SheetDrawer>
  );
};
