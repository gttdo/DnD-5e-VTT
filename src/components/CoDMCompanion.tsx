import { useEffect, useRef, useState } from "react";
import { Icon } from "./ui/Icon";
import { CompanionSprite, type CompanionArt, type CompanionState } from "./CompanionSprite";
import { askCoDM, type CoDMTurn, type CoDMProposal } from "../lib/coDM";
import type { DocKind } from "../state/useCampaign";

/**
 * The Co-DM companion (#7) — a floating buddy you call in. The sprite is the
 * button; clicking it opens a chat panel. It follows the DM across the editor
 * and the table (mounted in both), and the same shell serves players in a
 * limited, spoiler-safe mode (role="player").
 *
 * Table powers are optional: pass onProposal/onSaveToScene where they apply
 * (the table, or the editor's selected scene). Without onProposal, a proposed
 * action shows as a read-only suggestion rather than a runnable card.
 */

interface CoDMMsg extends CoDMTurn {
  proposals?: CoDMProposal[];
  done?: Record<number, string>;
}

export const CoDMCompanion = ({
  gameId,
  role = "dm",
  label = "Oculus",
  intro,
  starters = [],
  art,
  sceneName = null,
  onSaveToScene,
  onProposal,
  proposalLabel,
  nudgeSignal = null,
  nudgesToggleable = false,
  characterContext = undefined,
}: {
  gameId?: string;
  role?: "dm" | "player" | "general";
  label?: string;
  intro?: string;
  starters?: string[];
  art?: CompanionArt;
  characterContext?: string;
  sceneName?: string | null;
  onSaveToScene?: (kind: DocKind, content: string) => void;
  onProposal?: (p: CoDMProposal) => Promise<{ ok: boolean; message: string }>;
  proposalLabel?: (p: CoDMProposal) => string;
  /** A table moment worth a gentle suggestion (#7 slice 5). When its `key`
   *  changes and nudges are on, Oculus quietly checks if there's something to
   *  say; if so, he glows and the suggestion waits in the panel. */
  nudgeSignal?: { key: string; prompt: string } | null;
  /** Show the nudge on/off toggle (table only). */
  nudgesToggleable?: boolean;
}) => {
  const [open, setOpen] = useState(false);
  const [msgs, setMsgs] = useState<CoDMMsg[]>([]);
  const [draft, setDraft] = useState("");
  const [thinking, setThinking] = useState(false);
  const [talking, setTalking] = useState(false);
  const [savedIdx, setSavedIdx] = useState<Set<number>>(new Set());
  // Nudges: opt-in, per-device. `hasNudge` = an unseen suggestion is waiting.
  const [nudgesOn, setNudgesOn] = useState(() => localStorage.getItem("vtt:oculus-nudges") === "1");
  const [hasNudge, setHasNudge] = useState(false);
  const listRef = useRef<HTMLDivElement | null>(null);
  const talkTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const lastNudgeKey = useRef<string | null>(null);

  useEffect(() => {
    const el = listRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [msgs.length, thinking, open]);

  useEffect(() => () => { if (talkTimer.current) clearTimeout(talkTimer.current); }, []);

  useEffect(() => { localStorage.setItem("vtt:oculus-nudges", nudgesOn ? "1" : "0"); }, [nudgesOn]);

  // Opening the panel acknowledges any waiting nudge.
  useEffect(() => { if (open) setHasNudge(false); }, [open]);

  // A new signal → quietly ask Oculus if there's something worth surfacing.
  useEffect(() => {
    if (!nudgesOn || !nudgeSignal) return;
    if (lastNudgeKey.current === nudgeSignal.key) return;
    lastNudgeKey.current = nudgeSignal.key;
    let cancelled = false;
    void (async () => {
      const { text, proposals, error } = await askCoDM({ gameId, messages: [{ role: "user", content: nudgeSignal.prompt }], mode: role });
      if (cancelled || error) return;
      const say = (text ?? "").trim();
      // "NONE" (or an empty answer with no action) means nothing worth a nudge.
      if ((!say || /^none\b/i.test(say)) && (proposals?.length ?? 0) === 0) return;
      setMsgs((prev) => [...prev, { role: "assistant", content: say, proposals: proposals ?? [] }]);
      setHasNudge(true);
    })();
    return () => { cancelled = true; };
  }, [nudgeSignal, nudgesOn, gameId, role]);

  const spriteState: CompanionState =
    thinking ? "thinking" : talking ? "talking" : hasNudge && !open ? "nudge" : "idle";

  const send = async (text: string) => {
    const q = text.trim();
    if (!q || thinking) return;
    const next: CoDMMsg[] = [...msgs, { role: "user", content: q }];
    setMsgs(next);
    setDraft("");
    setThinking(true);
    const { text: answer, proposals, error } = await askCoDM({
      gameId,
      messages: next.map((m) => ({ role: m.role, content: m.content })),
      mode: role,
      characterContext,
    });
    setThinking(false);
    setMsgs((prev) => [
      ...prev,
      { role: "assistant", content: error ? `⚠︎ ${error}` : answer ?? "", proposals: error ? [] : proposals },
    ]);
    // Briefly animate "talking" after an answer lands.
    setTalking(true);
    if (talkTimer.current) clearTimeout(talkTimer.current);
    talkTimer.current = setTimeout(() => setTalking(false), 2200);
  };

  const act = async (msgIdx: number, propIdx: number, p: CoDMProposal) => {
    if (!onProposal) return;
    const { ok, message } = await onProposal(p);
    setMsgs((prev) =>
      prev.map((m, i) => (i === msgIdx ? { ...m, done: { ...(m.done ?? {}), [propIdx]: (ok ? "✓ " : "⚠︎ ") + message } } : m))
    );
  };
  const dismiss = (msgIdx: number, propIdx: number) => {
    setMsgs((prev) => prev.map((m, i) => (i === msgIdx ? { ...m, done: { ...(m.done ?? {}), [propIdx]: "Dismissed" } } : m)));
  };

  // Toggling nudges — Oculus says what it means, in his own voice.
  const toggleNudges = () => {
    const next = !nudgesOn;
    setNudgesOn(next);
    setMsgs((prev) => [
      ...prev,
      {
        role: "assistant",
        content: next
          ? "🔔 Nudges on. I'll keep watch and glow when I spot something worth doing — a reading to share, enemies a scene calls for — when you stage a scene or a fight starts. You always get the final say; I never act on my own."
          : "🔕 Nudges off. I'll stay quiet and only pipe up when you ask me.",
      },
    ]);
  };

  return (
    <div className={`cdm-companion ${open ? "is-open" : ""}`}>
      {open && (
        <div className="cdm-panel" role="dialog" aria-label={label}>
          <div className="cdm-panel-bar">
            <CompanionSprite state={spriteState} art={art} size={26} />
            <span className="cdm-panel-t">{label}</span>
            {nudgesToggleable && (
              <button
                className={`cdm-nudge-toggle ${nudgesOn ? "is-on" : ""}`}
                onClick={toggleNudges}
                title={nudgesOn ? "Nudges on — Oculus glows when he spots something worth doing" : "Nudges off — let Oculus suggest things as they come up"}
                aria-pressed={nudgesOn}
              >
                {nudgesOn ? "🔔" : "🔕"}
              </button>
            )}
            <button className="cdm-panel-x" onClick={() => setOpen(false)} aria-label="Close">
              <Icon name="close" size={15} />
            </button>
          </div>

          {msgs.length === 0 && !thinking ? (
            <div className="codm-intro">
              <p className="codm-intro-lead">{intro}</p>
              <div className="codm-starters">
                {starters.map((s) => (
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
                  {t.role === "assistant" && <span className="codm-who">{label}</span>}
                  {t.content && <div className="codm-bubble">{t.content}</div>}
                  {t.proposals?.map((p, pi) => (
                    <div key={pi} className="codm-proposal">
                      <div className="codm-proposal-t">{proposalLabel ? proposalLabel(p) : p.tool}</div>
                      {onProposal ? (
                        t.done?.[pi] ? (
                          <div className="codm-proposal-done">{t.done[pi]}</div>
                        ) : (
                          <div className="codm-proposal-btns">
                            <button className="y" onClick={() => void act(i, pi, p)}>✓ Do it</button>
                            <button className="n" onClick={() => dismiss(i, pi)}>Dismiss</button>
                          </div>
                        )
                      ) : (
                        <div className="codm-proposal-done">Suggestion — do this at the table.</div>
                      )}
                    </div>
                  ))}
                  {onSaveToScene && t.role === "assistant" && t.content && !t.content.startsWith("⚠︎") && sceneName && (
                    savedIdx.has(i) ? (
                      <span className="codm-saved">✓ Saved to {sceneName}</span>
                    ) : (
                      <span className="codm-save">
                        <span className="codm-save-label">Save to {sceneName}:</span>
                        <button onClick={() => { onSaveToScene("read_aloud", t.content); setSavedIdx((p) => new Set(p).add(i)); }}>
                          Read-aloud
                        </button>
                        <button onClick={() => { onSaveToScene("note", t.content); setSavedIdx((p) => new Set(p).add(i)); }}>
                          Note
                        </button>
                      </span>
                    )
                  )}
                </div>
              ))}
              {thinking && (
                <div className="codm-msg is-ai">
                  <span className="codm-who">{label}</span>
                  <div className="codm-bubble codm-thinking"><span></span><span></span><span></span></div>
                </div>
              )}
            </div>
          )}

          <div className="feed-composer cdm-composer">
            <input
              placeholder={role === "player" ? "Ask about the rules or the story…" : `Ask ${label}…`}
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); void send(draft); }
              }}
            />
            <button className="feed-send" onClick={() => void send(draft)} disabled={!draft.trim() || thinking} title="Ask">
              <Icon name="forward" size={14} />
            </button>
          </div>
        </div>
      )}

      <button
        className="cdm-fab"
        onClick={() => setOpen((v) => !v)}
        title={open ? `Close ${label}` : hasNudge ? `${label} has a suggestion` : `Ask ${label}`}
        aria-label={hasNudge ? `${label} has a suggestion` : label}
      >
        <CompanionSprite state={open ? spriteState : hasNudge ? "nudge" : "idle"} art={art} size={90} />
        {hasNudge && !open && <span className="cdm-fab-badge" aria-hidden="true" />}
      </button>
    </div>
  );
};
