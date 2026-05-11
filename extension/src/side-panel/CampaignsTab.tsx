import { useState } from "react";
import { useAgentCampaigns } from "../state/useAgentCampaigns";
import type { AgentCampaign } from "../types/agentCampaign";

interface Props {
  onOpen: (campaign: AgentCampaign) => void;
}

export const CampaignsTab = ({ onOpen }: Props) => {
  const { campaigns, loaded, create, remove } = useAgentCampaigns();
  const [showCreate, setShowCreate] = useState(false);

  if (!loaded) return <div className="dim" style={{ padding: 12 }}>Loading…</div>;

  return (
    <div className="col" style={{ gap: 8 }}>
      <section className="panel">
        <div className="panel-title">
          AI DM Campaigns
          <button
            className="primary"
            style={{ fontSize: 10, padding: "3px 8px" }}
            onClick={() => setShowCreate(true)}
          >
            + New
          </button>
        </div>

        {campaigns.length === 0 && !showCreate && (
          <div className="dim" style={{ fontSize: 12, fontStyle: "italic" }}>
            No campaigns yet. Create one to start chatting with your AI DM.
          </div>
        )}

        {showCreate && <NewCampaignForm onCreate={async (name) => {
          const c = await create(name);
          setShowCreate(false);
          onOpen(c);
        }} onCancel={() => setShowCreate(false)} />}

        <div className="col" style={{ gap: 4, marginTop: campaigns.length > 0 ? 8 : 0 }}>
          {campaigns.map((c) => (
            <div
              key={c.id}
              style={{
                padding: 8,
                border: "1px solid var(--line)",
                borderRadius: 6,
                background: "rgba(0,0,0,0.15)",
                display: "grid",
                gridTemplateColumns: "1fr auto",
                gap: 6,
                cursor: "pointer",
              }}
              onClick={() => onOpen(c)}
            >
              <div style={{ minWidth: 0 }}>
                <div style={{ fontWeight: 600, fontSize: 13, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
                  {c.name}
                </div>
                <div className="dim" style={{ fontSize: 10 }}>
                  {c.messages.length} message{c.messages.length === 1 ? "" : "s"}
                  {c.dndbeyond_campaign_id ? ` · linked DDB #${c.dndbeyond_campaign_id}` : ""}
                </div>
              </div>
              <button
                className="ghost"
                style={{ fontSize: 10, padding: "2px 6px", color: "var(--accent)" }}
                onClick={(e) => {
                  e.stopPropagation();
                  if (confirm(`Delete "${c.name}"? This wipes the chat history.`)) void remove(c.id);
                }}
                title="Delete campaign"
              >
                ✕
              </button>
            </div>
          ))}
        </div>
      </section>
    </div>
  );
};

const NewCampaignForm = ({
  onCreate,
  onCancel,
}: {
  onCreate: (name: string) => Promise<void>;
  onCancel: () => void;
}) => {
  const [name, setName] = useState("");
  const [pending, setPending] = useState(false);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) return;
    setPending(true);
    try {
      await onCreate(name.trim());
    } finally {
      setPending(false);
    }
  };

  return (
    <form onSubmit={submit} className="col" style={{ gap: 6, marginTop: 4 }}>
      <input
        autoFocus
        placeholder="Campaign name"
        value={name}
        onChange={(e) => setName(e.target.value)}
      />
      <div style={{ display: "flex", gap: 4, justifyContent: "flex-end" }}>
        <button type="button" className="ghost" onClick={onCancel}>Cancel</button>
        <button type="submit" className="primary" disabled={pending || !name.trim()}>
          Create
        </button>
      </div>
    </form>
  );
};
