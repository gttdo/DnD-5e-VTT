import { useAgentCampaigns } from "../state/useAgentCampaigns";
import type { AgentCampaign } from "../types/agentCampaign";
import { FANTASY_FLAVORS } from "../data/campaignStyles";

interface Props {
  onOpen: (campaign: AgentCampaign) => void;
  onCreate: () => void;
}

export const CampaignsTab = ({ onOpen, onCreate }: Props) => {
  const { campaigns, loaded, remove } = useAgentCampaigns();

  if (!loaded) return <div className="dim" style={{ padding: 12 }}>Loading…</div>;

  return (
    <section className="panel">
      <div className="panel-title">
        AI DM Campaigns
        <button
          className="primary"
          style={{ fontSize: 10, padding: "3px 8px" }}
          onClick={onCreate}
        >
          + New
        </button>
      </div>

      {campaigns.length === 0 && (
        <div className="dim" style={{ fontSize: 12, fontStyle: "italic" }}>
          No campaigns yet. Create one to start chatting with your AI DM.
        </div>
      )}

      <div className="col" style={{ gap: 4 }}>
        {campaigns.map((c) => {
          const flavor = FANTASY_FLAVORS.find((f) => f.id === c.style?.flavor);
          return (
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
                  {flavor ? flavor.label : "Heroic Fantasy"} · {c.messages.length} msg{c.messages.length === 1 ? "" : "s"}
                  {c.dndbeyond_campaign_id ? ` · DDB #${c.dndbeyond_campaign_id}` : ""}
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
          );
        })}
      </div>
    </section>
  );
};
