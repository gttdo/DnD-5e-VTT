import { useEffect, useRef, useState } from "react";
import { SheetDrawer } from "./ui/SheetDrawer";
import { Icon } from "./ui/Icon";
import { askCoDM, type CoDMTurn, type CoDMProposal } from "../lib/coDM";
import type { DocKind } from "../state/useCampaign";

/**
 * The Co-DM drawer (P3 slices 3a–3c) — a DM-only second chair that has read
 * the whole campaign. It answers (3a), drafts you can harvest onto a scene
 * (3b), and PROPOSES table actions as approval cards you must confirm (3c).
 * Nothing it proposes reaches the players without your click.
 *
 * Conversation is per-session UI state (in memory) for now; a durable
 * per-campaign thread arrives with a later slice.
 */

interface CoDMMsg extends CoDMTurn {
  proposals?: CoDMProposal[];
  /** Proposal outcomes once the DM acts, by proposal index → status line. */
  done?: Record<number, string>;
}

const STARTERS = [
  "What's the party heading toward, and what have I prepped for it?",
  "Remind me of this scene's secret.",
  "Give me a name and a quirk for an innkeeper.",
  "What haven't the players discovered yet?",
];

export const CoDMDrawer = ({
  gameId,
  sceneId,
  sceneName,
  onSaveToScene,
  onProposal,
  proposalLabel,
  onClose,
}: {
  gameId: string;
  /** Where "Save to scene" (3b) files a harvested draft; null if none staged. */
  sceneId: string | null;
  sceneName: string | null;
  /** Create a doc on the current scene from a drafted message. */
  onSaveToScene: (kind: DocKind, content: string) => void;
  /** Execute an approved proposal (3c). Returns a short status line. */
  onProposal: (p: CoDMProposal) => Promise<{ ok: boolean; message: string }>;
  /** Human-readable summary of a proposal for its approval card. */
  proposalLabel: (p: CoDMProposal) => string;
  onClose: () => void;
}) => {
  const [msgs, setMsgs] = useState<CoDMMsg[]>([]);
  const [draft, setDraft] = useState("");
  const [thinking, setThinking] = useState(false);
  const [savedIdx, setSavedIdx] = useState<Set<number>>(new Set());
  const listRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    const el = listRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [msgs.length, thinking]);

  const send = async (text: string) => {
    const q = text.trim();
    if (!q || thinking) return;
    const next: CoDMMsg[] = [...msgs, { role: "user", content: q }];
    setMsgs(next);
    setDraft("");
    setThinking(true);
    const { text: answer, proposals, error } = await askCoDM(
      gameId,
      next.map((m) => ({ role: m.role, content: m.content }))
    );
    setThinking(false);
    setMsgs((prev) => [
      ...prev,
      { role: "assistant", content: error ? `⚠︎ ${error}` : answer ?? "", proposals: error ? [] : proposals },
    ]);
  };

  const act = async (msgIdx: number, propIdx: number, p: CoDMProposal) => {
    const { ok, message } = await onProposal(p);
    setMsgs((prev) =>
      prev.map((m, i) => (i === msgIdx ? { ...m, done: { ...(m.done ?? {}), [propIdx]: (ok ? "✓ " : "⚠︎ ") + message } } : m))
    );
  };
  const dismiss = (msgIdx: number, propIdx: number) => {
    setMsgs((prev) => prev.map((m, i) => (i === msgIdx ? { ...m, done: { ...(m.done ?? {}), [propIdx]: "Dismissed" } } : m)));
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
      {msgs.length === 0 && !thinking ? (
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
          {msgs.map((t, i) => (
            <div key={i} className={`codm-msg ${t.role === "user" ? "is-dm" : "is-ai"}`}>
              {t.role === "assistant" && <span className="codm-who">Co-DM</span>}
              {t.content && <div className="codm-bubble">{t.content}</div>}
              {/* 3c — gated action proposals: nothing runs until the DM taps. */}
              {t.proposals?.map((p, pi) => (
                <div key={pi} className="codm-proposal">
                  <div className="codm-proposal-t">{proposalLabel(p)}</div>
                  {t.done?.[pi] ? (
                    <div className="codm-proposal-done">{t.done[pi]}</div>
                  ) : (
                    <div className="codm-proposal-btns">
                      <button className="y" onClick={() => void act(i, pi, p)}>✓ Do it</button>
                      <button className="n" onClick={() => dismiss(i, pi)}>Dismiss</button>
                    </div>
                  )}
                </div>
              ))}
              {/* 3b — harvest a drafted answer onto the current scene. */}
              {t.role === "assistant" && t.content && !t.content.startsWith("⚠︎") && sceneId && (
                savedIdx.has(i) ? (
                  <span className="codm-saved">✓ Saved to {sceneName}</span>
                ) : (
                  <span className="codm-save">
                    <span className="codm-save-label">Save to {sceneName}:</span>
                    <button
                      onClick={() => {
                        onSaveToScene("read_aloud", t.content);
                        setSavedIdx((p) => new Set(p).add(i));
                      }}
                    >
                      Read-aloud
                    </button>
                    <button
                      onClick={() => {
                        onSaveToScene("note", t.content);
                        setSavedIdx((p) => new Set(p).add(i));
                      }}
                    >
                      Note
                    </button>
                  </span>
                )
              )}
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
