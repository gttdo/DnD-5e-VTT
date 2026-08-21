import { useEffect, useMemo, useRef, useState } from "react";
import { SheetDrawer } from "./ui/SheetDrawer";
import { Icon } from "./ui/Icon";
import type { GameLogEntry } from "../lib/gameLog";

/**
 * The table feed (#0041, slice 1c) — ONE stream for the whole table: rolls,
 * chat, and system events (scene changes, session boundaries), chronological,
 * append-only for everyone. Entries made outside a live session are shown
 * slightly dimmed: still visible, off the record.
 */

const relativeTime = (iso: string): string => {
  const secs = Math.max(0, Math.round((Date.now() - new Date(iso).getTime()) / 1000));
  if (secs < 60) return "just now";
  const mins = Math.round(secs / 60);
  if (mins < 60) return `${mins} min ago`;
  const hrs = Math.round(mins / 60);
  if (hrs < 24) return `${hrs} hr${hrs === 1 ? "" : "s"} ago`;
  return new Date(iso).toLocaleDateString(undefined, { month: "short", day: "numeric" });
};

type Filter = "all" | "chat" | "rolls";

interface RollBodyEntry {
  label: string;
  expression: string;
  total: number;
  detail: string;
}

const systemLine = (body: Record<string, unknown>): string => {
  switch (body.type) {
    case "session_started":
      return `Session ${body.number} started`;
    case "session_ended":
      return `Session ${body.number} ended`;
    case "scene_staged":
      return `Scene: ${body.scene}`;
    case "doc_presented":
      return `Presented: ${body.title || "a reading"}`;
    case "doc_dismissed":
      return "Reading dismissed";
    default:
      return String(body.type ?? "event");
  }
};

export const GameLog = ({
  entries,
  myUserId,
  onSend,
  onClose,
}: {
  entries: GameLogEntry[];
  myUserId: string | null;
  onSend: (text: string) => Promise<{ error: string | null }>;
  onClose: () => void;
}) => {
  const [filter, setFilter] = useState<Filter>("all");
  const [draft, setDraft] = useState("");
  const [sending, setSending] = useState(false);
  const listRef = useRef<HTMLDivElement | null>(null);

  const shown = useMemo(
    () =>
      entries.filter((e) => {
        if (filter === "chat") return e.kind === "chat";
        if (filter === "rolls") return e.kind === "roll";
        return true;
      }),
    [entries, filter]
  );

  // Keep the feed pinned to the newest entry — it reads bottom-up like chat.
  useEffect(() => {
    const el = listRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [shown.length]);

  const send = async () => {
    if (!draft.trim() || sending) return;
    setSending(true);
    const { error } = await onSend(draft);
    setSending(false);
    if (!error) setDraft("");
  };

  return (
    <SheetDrawer
      title="Game Log"
      onClose={onClose}
      footer={
        <div className="feed-composer">
          <input
            placeholder="Say something to the table…"
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault();
                void send();
              }
            }}
            maxLength={2000}
          />
          <button className="feed-send" onClick={() => void send()} disabled={!draft.trim() || sending} title="Send">
            <Icon name="forward" size={14} />
          </button>
        </div>
      }
    >
      <div className="feed-filters">
        {(["all", "chat", "rolls"] as Filter[]).map((f) => (
          <button key={f} className={filter === f ? "is-on" : ""} onClick={() => setFilter(f)}>
            {f === "all" ? "All" : f === "chat" ? "Chat" : "Rolls"}
          </button>
        ))}
      </div>

      {shown.length === 0 ? (
        <div className="gamelog-empty">
          <span className="gamelog-empty-icon">
            <Icon name={filter === "chat" ? "users" : "dice"} size={28} />
          </span>
          <div className="gamelog-empty-title">{filter === "chat" ? "No table talk yet" : "Nothing here yet"}</div>
          <p className="gamelog-empty-body">
            {filter === "chat"
              ? "Messages you send here reach the whole table — and go on the record during a session."
              : "Rolls, chat, and scene changes all land in this one stream."}
          </p>
        </div>
      ) : (
        <div className="feed-list" ref={listRef}>
          {shown.map((e) => {
            const offRecord = !e.session_id;
            if (e.kind === "system") {
              return (
                <div key={e.id} className="feed-system" title={offRecord ? "Off the record — no session was live" : undefined}>
                  <span>— {systemLine(e.body)} —</span>
                </div>
              );
            }
            if (e.kind === "chat") {
              const mine = e.author_id === myUserId;
              return (
                <div
                  key={e.id}
                  className={`feed-chat ${mine ? "is-mine" : ""} ${offRecord ? "is-offrecord" : ""}`}
                  title={offRecord ? "Off the record — no session was live" : undefined}
                >
                  {!mine && <div className="feed-author">{e.author_name}</div>}
                  <div className="feed-bubble">{String((e.body as { text?: string }).text ?? "")}</div>
                  <div className="feed-time">{relativeTime(e.created_at)}</div>
                </div>
              );
            }
            const rolls = ((e.body as { entries?: RollBodyEntry[] }).entries ?? []) as RollBodyEntry[];
            return (
              <article
                key={e.id}
                className={`gamelog-entry ${offRecord ? "is-offrecord" : ""}`}
                title={offRecord ? "Off the record — no session was live" : undefined}
              >
                {rolls.map((r, i) => (
                  <div key={i}>
                    <div className="gamelog-label">{e.author_name ? `${e.author_name} · ${r.label}` : r.label}</div>
                    <div className="gamelog-result">
                      <span className="gamelog-detail">{r.detail}</span>
                      <span className="gamelog-total">{r.total}</span>
                    </div>
                    <div className="gamelog-meta">
                      <span className="mono">{r.expression}</span>
                      <span>{relativeTime(e.created_at)}</span>
                    </div>
                  </div>
                ))}
              </article>
            );
          })}
        </div>
      )}
    </SheetDrawer>
  );
};
