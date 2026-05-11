import { useState } from "react";
import { useAuth } from "../state/useAuth";
import { AuthScreen } from "./AuthScreen";
import { RosterPanel } from "./RosterPanel";
import { DnDBeyondPanel } from "./DnDBeyondPanel";
import { CampaignsTab } from "./CampaignsTab";
import { CampaignWorkspace } from "./CampaignWorkspace";
import { SettingsModal } from "./SettingsModal";
import { useAgentCampaigns } from "../state/useAgentCampaigns";
import type { AgentCampaign } from "../types/agentCampaign";

type Tab = "live" | "roster" | "campaigns";

export const App = () => {
  const auth = useAuth();
  const [tab, setTab] = useState<Tab>("campaigns");
  const [openCampaignId, setOpenCampaignId] = useState<string | null>(null);
  const [showSettings, setShowSettings] = useState(false);
  const { campaigns } = useAgentCampaigns();

  if (auth.loading) {
    return (
      <div style={{ minHeight: "100vh", display: "grid", placeItems: "center" }}>
        <div className="dim">Loading…</div>
      </div>
    );
  }

  if (!auth.session) {
    return <AuthScreen />;
  }

  const openCampaign: AgentCampaign | undefined =
    openCampaignId ? campaigns.find((c) => c.id === openCampaignId) : undefined;

  // If we have an open campaign, show the workspace as the full panel.
  if (openCampaign) {
    return (
      <div style={{ display: "flex", flexDirection: "column", minHeight: "100vh" }}>
        <CampaignWorkspace
          campaign={openCampaign}
          onBack={() => setOpenCampaignId(null)}
          onOpenSettings={() => setShowSettings(true)}
        />
        {showSettings && <SettingsModal onClose={() => setShowSettings(false)} />}
      </div>
    );
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", minHeight: "100vh" }}>
      <header style={{ padding: "8px 12px", borderBottom: "1px solid var(--line)" }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <div>
            <div style={{ fontFamily: "var(--serif)", color: "var(--gold)", fontSize: 14, fontWeight: 700 }}>
              D&D 5e VTT
            </div>
            <div className="dim" style={{ fontSize: 9, letterSpacing: "0.16em", textTransform: "uppercase" }}>
              DM Agent
            </div>
          </div>
          <div style={{ display: "flex", gap: 4, alignItems: "center" }}>
            <button
              className="ghost"
              style={{ fontSize: 11, padding: "3px 8px" }}
              onClick={() => setShowSettings(true)}
              title="Settings"
            >
              ⚙
            </button>
            <div style={{ textAlign: "right" }}>
              <div className="dim" style={{ fontSize: 9, maxWidth: 140, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                {auth.user?.email}
              </div>
              <button
                className="ghost"
                style={{ fontSize: 10, padding: "2px 6px", marginTop: 2 }}
                onClick={auth.signOut}
              >
                Sign out
              </button>
            </div>
          </div>
        </div>
      </header>

      <nav className="tabs" style={{ padding: "0 8px" }}>
        <button className={`tab ${tab === "campaigns" ? "active" : ""}`} onClick={() => setTab("campaigns")}>
          Campaigns
        </button>
        <button className={`tab ${tab === "live" ? "active" : ""}`} onClick={() => setTab("live")}>
          Live
        </button>
        <button className={`tab ${tab === "roster" ? "active" : ""}`} onClick={() => setTab("roster")}>
          Roster
        </button>
      </nav>

      <main style={{ flex: 1, overflowY: "auto", padding: 8, display: "flex", flexDirection: "column", gap: 8 }}>
        {tab === "campaigns" && <CampaignsTab onOpen={(c) => setOpenCampaignId(c.id)} />}
        {tab === "live" && <DnDBeyondPanel />}
        {tab === "roster" && <RosterPanel onOpen={() => { /* TODO: drill-in */ }} />}
      </main>

      {showSettings && <SettingsModal onClose={() => setShowSettings(false)} />}
    </div>
  );
};
