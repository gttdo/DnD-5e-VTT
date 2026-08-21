import { useEffect, useRef, useState } from "react";
import { SheetDrawer } from "./ui/SheetDrawer";
import { Icon } from "./ui/Icon";
import { askCoDM, type CoDMTurn } from "../lib/coDM";

/**
 * The Co-DM drawer (P3 slice 3a) — a DM-only second chair that has read the
 * whole campaign. Ask it anything; it answers grounded in your own notes and
 * secrets. Assist mode: conversation only — no table effects yet.
 *
 * Conversation is per-session UI state (in memory) for now; a durable
 * per-campaign thread arrives with the tool slices.
 */

const STARTERS = [
  "What's the party heading toward, and what have I prepped for it?",
  "Remind me of this scene's secret.",
  "Give me a name and a quirk for an innkeeper.",
  "What haven't the players discovered yet?",
];

export const CoDMDrawer = ({ gameId, onClose }: { gameId: string; onClose: () => void }) => {
  const [turns, setTurns] = useState<CoDMTurn[]>([]);
  const [draft, setDraft] = useState("");
  const [thinking, setThinking] = useState(false);
  const listRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    const el = listRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [turns.length, thinking]);

  const send = async (text: string) => {
    const q = text.trim();
    if (!q || thinking) return;
    const next: CoDMTurn[] = [...turns, { role: "user", content: q }];
    setTurns(next);
    setDraft("");
    setThinking(true);
    const { text: answer, error } = await askCoDM(gameId, next);
    setThinking(false);
    setTurns((prev) => [...prev, { role: "assistant", content: error ? `⚠︎ ${error}` : answer ?? "" }]);
  };

  return (
    <SheetDrawer
      title="Co-DM"
      onClose={onClose}
      footer={
        <div className="feed-composer">
          <input
            placeholder="Ask your Co-DM…"
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault();
                void send(draft);
              }
            }}
          />
          <button className="feed-send" onClick={() => void send(draft)} disabled={!draft.trim() || thinking} title="Ask">
            <Icon name="forward" size={14} />
          </button>
        </div>
      }
    >
      {turns.length === 0 && !thinking ? (
        <div className="codm-intro">
          <div className="codm-intro-icon">
            <Icon name="sparkles" size={26} />
          </div>
          <p className="codm-intro-lead">
            I've read your whole campaign — every scene, note, and secret. Ask me anything; only you see this.
          </p>
          <div className="codm-starters">
            {STARTERS.map((s) => (
              <button key={s} className="codm-starter" onClick={() => void send(s)}>
                {s}
              </button>
            ))}
          </div>
        </div>
      ) : (
        <div className="codm-thread" ref={listRef}>
          {turns.map((t, i) => (
            <div key={i} className={`codm-msg ${t.role === "user" ? "is-dm" : "is-ai"}`}>
              {t.role === "assistant" && <span className="codm-who">Co-DM</span>}
              <div className="codm-bubble">{t.content}</div>
            </div>
          ))}
          {thinking && (
            <div className="codm-msg is-ai">
              <span className="codm-who">Co-DM</span>
              <div className="codm-bubble codm-thinking">
                <span></span><span></span><span></span>
              </div>
            </div>
          )}
        </div>
      )}
    </SheetDrawer>
  );
};
