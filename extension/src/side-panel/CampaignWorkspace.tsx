import { useEffect, useMemo, useRef, useState } from "react";
import type { AgentCampaign, AgentMessage } from "../types/agentCampaign";
import type { CampaignDetailSnapshot, Roll, Surface } from "../types/snapshots";
import { useAgentCampaigns } from "../state/useAgentCampaigns";
import { useSettings } from "../state/useSettings";
import { buildSystemPrompt } from "../lib/dmAgent";
import { streamComplete, type ChatMessage, type ContentBlock } from "../lib/anthropic";
import { TOOL_SCHEMAS, runTool } from "../lib/agentTools";
import {
  FANTASY_FLAVORS,
  TONES,
  LETHALITY,
  DEFAULT_STYLE,
  type FantasyFlavorId,
  type ToneId,
  type LethalityId,
} from "../data/campaignStyles";

const LATEST_KEY = "latest-snapshots";

interface Props {
  campaign: AgentCampaign;
  onBack: () => void;
  onOpenSettings: () => void;
}

export const CampaignWorkspace = ({ campaign, onBack, onOpenSettings }: Props) => {
  const { update, appendMessage } = useAgentCampaigns();
  const { settings, hasKey } = useSettings();
  const [draft, setDraft] = useState("");
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [streamingText, setStreamingText] = useState("");
  const abortRef = useRef<AbortController | null>(null);
  const [editingOutline, setEditingOutline] = useState(false);
  const [outlineDraft, setOutlineDraft] = useState(campaign.outline);
  const [editingStyle, setEditingStyle] = useState(false);
  const [dndb, setDndb] = useState<CampaignDetailSnapshot | null>(null);
  const [recentRolls, setRecentRolls] = useState<Roll[]>([]);
  const [activeSurface, setActiveSurface] = useState<Surface | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);

  // Subscribe to extension storage so we can pull the linked D&D Beyond
  // campaign snapshot (or detect that the user is currently viewing one).
  useEffect(() => {
    const load = () => {
      chrome.storage.session.get(LATEST_KEY).then((out) => {
        const latest = (out[LATEST_KEY] ?? {}) as {
          campaign_detail?: Record<number, CampaignDetailSnapshot>;
          rolls?: Record<number, Roll[]>;
          last_surface?: Surface;
        };
        setActiveSurface(latest.last_surface ?? null);
        if (campaign.dndbeyond_campaign_id != null) {
          setDndb(latest.campaign_detail?.[campaign.dndbeyond_campaign_id] ?? null);
          setRecentRolls(latest.rolls?.[campaign.dndbeyond_campaign_id] ?? []);
        } else {
          setDndb(null);
          setRecentRolls([]);
        }
      });
    };
    load();
    const listener = (
      changes: Record<string, chrome.storage.StorageChange>,
      area: string
    ) => {
      if (area === "session" && changes[LATEST_KEY]) load();
    };
    chrome.storage.onChanged.addListener(listener);
    return () => chrome.storage.onChanged.removeListener(listener);
  }, [campaign.dndbeyond_campaign_id]);

  useEffect(() => {
    setOutlineDraft(campaign.outline);
  }, [campaign.id, campaign.outline]);

  // Auto-scroll the chat as messages land.
  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [campaign.messages.length]);

  const canLinkActive =
    activeSurface?.kind === "campaign-detail" &&
    campaign.dndbeyond_campaign_id !== activeSurface.campaignId;

  const handleLink = async () => {
    if (activeSurface?.kind !== "campaign-detail") return;
    await update(campaign.id, { dndbeyond_campaign_id: activeSurface.campaignId });
  };

  const handleUnlink = async () => {
    await update(campaign.id, { dndbeyond_campaign_id: null });
  };

  const handleSaveOutline = async () => {
    await update(campaign.id, { outline: outlineDraft });
    setEditingOutline(false);
  };

  const handleSend = async () => {
    if (!draft.trim() || sending) return;
    if (!hasKey) {
      setError("Set your Anthropic API key in Settings first.");
      return;
    }
    setError(null);
    setSending(true);
    setStreamingText("");

    const userMsg: AgentMessage = {
      id: crypto.randomUUID(),
      role: "user",
      content: draft.trim(),
      ts: Date.now(),
    };

    // Snapshot the conversation. Each pass through the tool loop appends
    // to `workingHistory` so the next API call sees the assistant's
    // previous tool_use + the user's tool_result blocks.
    const workingHistory: ChatMessage[] = campaign.messages.map((m) => ({
      role: m.role,
      content: m.content,
    }));
    workingHistory.push({ role: "user", content: userMsg.content });

    await appendMessage(campaign.id, userMsg);
    setDraft("");

    const controller = new AbortController();
    abortRef.current = controller;

    let inputTokensTotal = 0;
    let outputTokensTotal = 0;
    let lastTextThisTurn = ""; // for cancellation banking

    try {
      const system = buildSystemPrompt(campaign, dndb, recentRolls);
      const MAX_TOOL_ITERATIONS = 6;

      for (let iter = 0; iter < MAX_TOOL_ITERATIONS; iter++) {
        setStreamingText("");
        let liveText = "";
        let assistantContent: ContentBlock[] = [];
        const pendingToolCalls: Array<{ id: string; name: string; input: Record<string, unknown> }> = [];

        const stream = streamComplete({
          apiKey: settings.anthropic_api_key,
          model: settings.model,
          system,
          messages: workingHistory,
          maxTokens: 2048,
          tools: TOOL_SCHEMAS,
          signal: controller.signal,
        });

        for await (const chunk of stream) {
          if (chunk.delta) {
            liveText += chunk.delta;
            lastTextThisTurn = liveText;
            setStreamingText(liveText);
          }
          if (chunk.toolUse) {
            pendingToolCalls.push(chunk.toolUse);
          }
          if (chunk.done) {
            assistantContent = chunk.done.content;
            inputTokensTotal += chunk.done.inputTokens;
            outputTokensTotal += chunk.done.outputTokens;
          }
        }

        // Persist the assistant message. If we got block-structured
        // content (any tool_use, or text alongside tool_use), keep the
        // array shape so the next API call has matching tool_use ids.
        const hasTools = assistantContent.some((b) => b.type === "tool_use");
        const persistContent: string | ContentBlock[] = hasTools
          ? assistantContent
          : liveText;
        if (
          (typeof persistContent === "string" && persistContent.trim().length > 0) ||
          (Array.isArray(persistContent) && persistContent.length > 0)
        ) {
          await appendMessage(campaign.id, {
            id: crypto.randomUUID(),
            role: "assistant",
            content: persistContent,
            ts: Date.now(),
            usage: { input: inputTokensTotal, output: outputTokensTotal },
          });
        }
        workingHistory.push({ role: "assistant", content: persistContent });

        if (pendingToolCalls.length === 0) break;

        // Run each tool, gather results, hand them back as a user msg.
        const toolResults: ContentBlock[] = [];
        for (const tc of pendingToolCalls) {
          const r = await runTool({ name: tc.name, input: tc.input });
          toolResults.push({
            type: "tool_result",
            tool_use_id: tc.id,
            content: r.output,
            is_error: r.is_error,
          });
        }
        await appendMessage(campaign.id, {
          id: crypto.randomUUID(),
          role: "user",
          content: toolResults,
          ts: Date.now(),
        });
        workingHistory.push({ role: "user", content: toolResults });
        // loop continues — agent sees tool results and may either reply
        // with text or call more tools
      }
    } catch (e) {
      const aborted = (e as { name?: string })?.name === "AbortError";
      if (aborted) {
        if (lastTextThisTurn.trim().length > 0) {
          await appendMessage(campaign.id, {
            id: crypto.randomUUID(),
            role: "assistant",
            content: lastTextThisTurn + "\n\n*[cut short by DM]*",
            ts: Date.now(),
            usage: { input: inputTokensTotal, output: outputTokensTotal },
          });
        }
      } else {
        const msg = e instanceof Error ? e.message : String(e);
        setError(msg);
      }
    } finally {
      abortRef.current = null;
      setStreamingText("");
      setSending(false);
    }
  };

  const handleStop = () => {
    abortRef.current?.abort();
  };

  const tokenUsage = useMemo(() => {
    return campaign.messages.reduce(
      (acc, m) => ({
        input: acc.input + (m.usage?.input ?? 0),
        output: acc.output + (m.usage?.output ?? 0),
      }),
      { input: 0, output: 0 }
    );
  }, [campaign.messages]);

  return (
    <div style={{ display: "flex", flexDirection: "column", height: "100%" }}>
      <header style={{ padding: "6px 10px", borderBottom: "1px solid var(--line)" }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <button onClick={onBack} className="ghost" style={{ fontSize: 11, padding: "3px 8px" }}>
            ← All Campaigns
          </button>
          <button onClick={onOpenSettings} className="ghost" style={{ fontSize: 11, padding: "3px 8px" }} title="Settings">
            ⚙
          </button>
        </div>
        <div style={{ fontFamily: "var(--serif)", color: "var(--gold)", fontSize: 14, fontWeight: 700, marginTop: 4 }}>
          {campaign.name}
        </div>
        <div className="dim" style={{ fontSize: 9, fontFamily: "var(--mono)" }}>
          {campaign.messages.length} msgs · {tokenUsage.input}/{tokenUsage.output} tok
          {campaign.dndbeyond_campaign_id ? ` · linked DDB #${campaign.dndbeyond_campaign_id}` : ""}
        </div>
      </header>

      {/* Outline + link controls */}
      <div style={{ padding: 8, borderBottom: "1px solid var(--line)" }}>
        {!editingOutline ? (
          <div>
            <div className="row" style={{ justifyContent: "space-between", marginBottom: 4 }}>
              <span className="label">Outline</span>
              <button
                className="ghost"
                style={{ fontSize: 10, padding: "2px 6px" }}
                onClick={() => setEditingOutline(true)}
              >
                Edit
              </button>
            </div>
            <div className="dim" style={{ fontSize: 11, whiteSpace: "pre-wrap", maxHeight: 60, overflow: "hidden" }}>
              {campaign.outline || <em>No outline yet — paste your story beats.</em>}
            </div>
          </div>
        ) : (
          <div>
            <span className="label">Outline (markdown)</span>
            <textarea
              autoFocus
              value={outlineDraft}
              onChange={(e) => setOutlineDraft(e.target.value)}
              rows={6}
              style={{ resize: "vertical", marginTop: 2 }}
              placeholder="Chapter 1 — The Tower's Teeth. The party defends the keep against goblin raiders..."
            />
            <div style={{ display: "flex", justifyContent: "flex-end", gap: 4, marginTop: 4 }}>
              <button className="ghost" onClick={() => setEditingOutline(false)} style={{ fontSize: 11 }}>Cancel</button>
              <button className="primary" onClick={handleSaveOutline} style={{ fontSize: 11 }}>Save</button>
            </div>
          </div>
        )}

        <div className="row" style={{ gap: 4, marginTop: 6, flexWrap: "wrap" }}>
          {dndb && (
            <span className="dim" style={{ fontSize: 10 }}>
              ✓ {dndb.party.length} party · DM Notes
              {recentRolls.length > 0 && ` · ${recentRolls.length} live rolls`}
            </span>
          )}
          {canLinkActive && (
            <button className="ghost" onClick={handleLink} style={{ fontSize: 10, padding: "2px 6px" }}>
              Link to currently-open DDB campaign
            </button>
          )}
          {campaign.dndbeyond_campaign_id && (
            <button className="ghost" onClick={handleUnlink} style={{ fontSize: 10, padding: "2px 6px", color: "var(--accent)" }}>
              Unlink
            </button>
          )}
        </div>

        <div style={{ marginTop: 8, paddingTop: 8, borderTop: "1px solid var(--line)" }}>
          {!editingStyle ? (
            <StyleSummary
              campaign={campaign}
              onEdit={() => setEditingStyle(true)}
            />
          ) : (
            <StyleEditor
              campaign={campaign}
              onSave={async (style) => {
                await update(campaign.id, { style });
                setEditingStyle(false);
              }}
              onCancel={() => setEditingStyle(false)}
            />
          )}
        </div>
      </div>

      {/* Chat */}
      <div ref={scrollRef} style={{ flex: 1, overflowY: "auto", padding: 8, display: "flex", flexDirection: "column", gap: 8 }}>
        {campaign.messages.length === 0 && (
          <div className="dim" style={{ fontSize: 12, fontStyle: "italic", textAlign: "center", marginTop: 24 }}>
            Tell the AI DM what your players are doing, or ask it to set the scene for your next session.
          </div>
        )}
        {campaign.messages.map((m) => (
          <MessageBubble key={m.id} message={m} />
        ))}
        {sending && streamingText.length === 0 && (
          <div className="dim" style={{ fontSize: 11, fontStyle: "italic" }}>
            <span style={{ color: "var(--gold)" }}>DM</span> is thinking…
          </div>
        )}
        {sending && streamingText.length > 0 && (
          <StreamingBubble text={streamingText} />
        )}
        {error && <div className="panel-warn" style={{ fontSize: 11 }}>{error}</div>}
      </div>

      {/* Input */}
      <div style={{ padding: 8, borderTop: "1px solid var(--line)" }}>
        <textarea
          rows={3}
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) {
              e.preventDefault();
              void handleSend();
            }
          }}
          placeholder='Type a player action or "set the scene"…  (⌘+Enter to send)'
          style={{ resize: "vertical" }}
          disabled={sending}
        />
        <div className="row" style={{ justifyContent: "space-between", marginTop: 4 }}>
          {hasKey ? (
            <span className="dim mono" style={{ fontSize: 9 }}>{settings.model}</span>
          ) : (
            <button className="ghost" onClick={onOpenSettings} style={{ fontSize: 10, color: "var(--accent)" }}>
              Set API key first
            </button>
          )}
          {sending ? (
            <button
              className="primary"
              onClick={handleStop}
              style={{ background: "var(--accent)", borderColor: "var(--accent-2)" }}
            >
              ◼ Stop
            </button>
          ) : (
            <button
              className="primary"
              onClick={handleSend}
              disabled={!draft.trim() || !hasKey}
            >
              Send
            </button>
          )}
        </div>
      </div>
    </div>
  );
};

const StreamingBubble = ({ text }: { text: string }) => (
  <div
    style={{
      alignSelf: "flex-start",
      maxWidth: "92%",
      padding: "8px 10px",
      borderRadius: 8,
      background: "rgba(212, 175, 55, 0.08)",
      border: "1px solid rgba(212, 175, 55, 0.25)",
      fontSize: 12,
      whiteSpace: "pre-wrap",
    }}
  >
    <div className="dim" style={{ fontSize: 9, letterSpacing: "0.16em", textTransform: "uppercase", marginBottom: 4 }}>
      AI DM <span style={{ color: "var(--gold)" }}>· writing</span>
    </div>
    {text}
    <span style={{ display: "inline-block", width: 6, height: 12, background: "var(--gold)", marginLeft: 2, verticalAlign: "text-bottom", animation: "blink 1s steps(2) infinite" }} />
  </div>
);

const StyleSummary = ({ campaign, onEdit }: { campaign: AgentCampaign; onEdit: () => void }) => {
  const style = campaign.style ?? DEFAULT_STYLE;
  const flavor = FANTASY_FLAVORS.find((f) => f.id === style.flavor);
  const tone = TONES.find((t) => t.id === style.tone);
  const leth = LETHALITY.find((l) => l.id === style.lethality);
  return (
    <div>
      <div className="row" style={{ justifyContent: "space-between", marginBottom: 4 }}>
        <span className="label">Style</span>
        <button
          className="ghost"
          style={{ fontSize: 10, padding: "2px 6px" }}
          onClick={onEdit}
        >
          Edit
        </button>
      </div>
      <div className="dim" style={{ fontSize: 11 }}>
        <span style={{ color: "var(--gold)" }}>{flavor?.label ?? style.flavor}</span>
        {" · "}
        <span>{tone?.label ?? style.tone}</span>
        {" · "}
        <span>{leth?.label ?? style.lethality}</span>
      </div>
    </div>
  );
};

const StyleEditor = ({
  campaign,
  onSave,
  onCancel,
}: {
  campaign: AgentCampaign;
  onSave: (style: { flavor: FantasyFlavorId; tone: ToneId; lethality: LethalityId }) => Promise<void>;
  onCancel: () => void;
}) => {
  const initial = campaign.style ?? DEFAULT_STYLE;
  const [flavor, setFlavor] = useState<FantasyFlavorId>(initial.flavor);
  const [tone, setTone] = useState<ToneId>(initial.tone);
  const [lethality, setLethality] = useState<LethalityId>(initial.lethality);

  return (
    <div className="col" style={{ gap: 6 }}>
      <span className="label">Style</span>
      <label className="col" style={{ gap: 2 }}>
        <span className="dim" style={{ fontSize: 10 }}>Fantasy Flavor</span>
        <select value={flavor} onChange={(e) => setFlavor(e.target.value as FantasyFlavorId)}>
          {FANTASY_FLAVORS.map((o) => <option key={o.id} value={o.id}>{o.label}</option>)}
        </select>
      </label>
      <label className="col" style={{ gap: 2 }}>
        <span className="dim" style={{ fontSize: 10 }}>Tone</span>
        <select value={tone} onChange={(e) => setTone(e.target.value as ToneId)}>
          {TONES.map((o) => <option key={o.id} value={o.id}>{o.label}</option>)}
        </select>
      </label>
      <label className="col" style={{ gap: 2 }}>
        <span className="dim" style={{ fontSize: 10 }}>Combat Lethality</span>
        <select value={lethality} onChange={(e) => setLethality(e.target.value as LethalityId)}>
          {LETHALITY.map((o) => <option key={o.id} value={o.id}>{o.label}</option>)}
        </select>
      </label>
      <div style={{ display: "flex", justifyContent: "flex-end", gap: 4 }}>
        <button className="ghost" onClick={onCancel} style={{ fontSize: 11 }}>Cancel</button>
        <button className="primary" onClick={() => void onSave({ flavor, tone, lethality })} style={{ fontSize: 11 }}>
          Save
        </button>
      </div>
    </div>
  );
};

const MessageBubble = ({ message }: { message: AgentMessage }) => {
  const isUser = message.role === "user";

  // User message whose content is purely tool_result blocks: render as
  // compact tool-result rows rather than a giant user bubble. This is
  // the "agent ran a tool" moment, not the human DM speaking.
  if (
    isUser &&
    Array.isArray(message.content) &&
    message.content.every((b) => b.type === "tool_result")
  ) {
    return (
      <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
        {message.content.map((b, i) =>
          b.type === "tool_result" ? (
            <ToolResultRow key={i} content={b.content} isError={b.is_error} />
          ) : null
        )}
      </div>
    );
  }

  return (
    <div
      style={{
        alignSelf: isUser ? "flex-end" : "flex-start",
        maxWidth: "92%",
        padding: "8px 10px",
        borderRadius: 8,
        background: isUser ? "rgba(192, 57, 43, 0.18)" : "rgba(212, 175, 55, 0.08)",
        border: `1px solid ${isUser ? "rgba(192, 57, 43, 0.4)" : "rgba(212, 175, 55, 0.25)"}`,
        fontSize: 12,
        whiteSpace: "pre-wrap",
      }}
    >
      <div className="dim" style={{ fontSize: 9, letterSpacing: "0.16em", textTransform: "uppercase", marginBottom: 4 }}>
        {isUser ? "DM" : "AI DM"}
      </div>
      <MessageContent content={message.content} />
    </div>
  );
};

const MessageContent = ({ content }: { content: AgentMessage["content"] }) => {
  if (typeof content === "string") return <>{content}</>;
  if (!Array.isArray(content)) return null;
  return (
    <>
      {content.map((b, i) => {
        if (b.type === "text") return <span key={i}>{b.text}</span>;
        if (b.type === "tool_use") return <ToolUseTag key={i} name={b.name} input={b.input} />;
        if (b.type === "tool_result") {
          return <ToolResultRow key={i} content={b.content} isError={b.is_error} />;
        }
        return null;
      })}
    </>
  );
};

const ToolUseTag = ({ name, input }: { name: string; input: Record<string, unknown> }) => {
  const arg = Object.entries(input)
    .map(([k, v]) => `${k}=${typeof v === "string" ? v : JSON.stringify(v)}`)
    .join(", ");
  return (
    <span
      style={{
        display: "inline-block",
        margin: "4px 4px 4px 0",
        padding: "2px 8px",
        background: "rgba(96, 165, 250, 0.12)",
        border: "1px solid rgba(96, 165, 250, 0.35)",
        borderRadius: 999,
        fontSize: 10,
        fontFamily: "var(--mono)",
        color: "var(--blue, #93c5fd)",
      }}
      title="Tool the agent decided to call"
    >
      🔧 {name}({arg})
    </span>
  );
};

const ToolResultRow = ({ content, isError }: { content: string; isError?: boolean }) => (
  <div
    style={{
      alignSelf: "flex-start",
      maxWidth: "92%",
      padding: "4px 10px",
      borderLeft: `2px solid ${isError ? "var(--accent)" : "rgba(96, 165, 250, 0.55)"}`,
      background: "rgba(96, 165, 250, 0.05)",
      fontSize: 11,
      color: "var(--text-dim)",
      whiteSpace: "pre-wrap",
      fontFamily: "var(--mono)",
    }}
  >
    {content}
  </div>
);
