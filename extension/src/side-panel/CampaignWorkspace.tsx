import { useEffect, useMemo, useRef, useState } from "react";
import type { AgentCampaign, AgentMessage } from "../types/agentCampaign";
import type { CampaignDetailSnapshot, Surface } from "../types/snapshots";
import { useAgentCampaigns } from "../state/useAgentCampaigns";
import { useSettings } from "../state/useSettings";
import { buildSystemPrompt } from "../lib/dmAgent";
import { complete, type ChatMessage } from "../lib/anthropic";
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
  const [editingOutline, setEditingOutline] = useState(false);
  const [outlineDraft, setOutlineDraft] = useState(campaign.outline);
  const [editingStyle, setEditingStyle] = useState(false);
  const [dndb, setDndb] = useState<CampaignDetailSnapshot | null>(null);
  const [activeSurface, setActiveSurface] = useState<Surface | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);

  // Subscribe to extension storage so we can pull the linked D&D Beyond
  // campaign snapshot (or detect that the user is currently viewing one).
  useEffect(() => {
    const load = () => {
      chrome.storage.session.get(LATEST_KEY).then((out) => {
        const latest = (out[LATEST_KEY] ?? {}) as {
          campaign_detail?: Record<number, CampaignDetailSnapshot>;
          last_surface?: Surface;
        };
        setActiveSurface(latest.last_surface ?? null);
        if (campaign.dndbeyond_campaign_id != null) {
          setDndb(latest.campaign_detail?.[campaign.dndbeyond_campaign_id] ?? null);
        } else {
          setDndb(null);
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

    const userMsg: AgentMessage = {
      id: crypto.randomUUID(),
      role: "user",
      content: draft.trim(),
      ts: Date.now(),
    };

    // Build the message array we'll actually send (snapshot the current
    // history + the new user message before persisting, to avoid races).
    const history: ChatMessage[] = campaign.messages.map((m) => ({
      role: m.role,
      content: m.content,
    }));
    history.push({ role: "user", content: userMsg.content });

    await appendMessage(campaign.id, userMsg);
    setDraft("");

    try {
      const system = buildSystemPrompt(campaign, dndb);
      const result = await complete({
        apiKey: settings.anthropic_api_key,
        model: settings.model,
        system,
        messages: history,
        maxTokens: 2048,
      });

      const assistantMsg: AgentMessage = {
        id: crypto.randomUUID(),
        role: "assistant",
        content: result.content,
        ts: Date.now(),
        usage: { input: result.inputTokens, output: result.outputTokens },
      };
      await appendMessage(campaign.id, assistantMsg);
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      setError(msg);
    } finally {
      setSending(false);
    }
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
              ✓ Reading {dndb.party.length} party + DM Notes from D&D Beyond
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
        {sending && (
          <div className="dim" style={{ fontSize: 11, fontStyle: "italic" }}>
            <span style={{ color: "var(--gold)" }}>DM</span> is thinking…
          </div>
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
          <button
            className="primary"
            onClick={handleSend}
            disabled={sending || !draft.trim() || !hasKey}
          >
            Send
          </button>
        </div>
      </div>
    </div>
  );
};

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
      {message.content}
    </div>
  );
};
