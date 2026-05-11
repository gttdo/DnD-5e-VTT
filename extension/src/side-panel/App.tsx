import { useState } from "react";
import { useAuth } from "../state/useAuth";
import { AuthScreen } from "./AuthScreen";
import { RosterPanel } from "./RosterPanel";
import { DnDBeyondPanel } from "./DnDBeyondPanel";

type Tab = "live" | "roster" | "campaigns";

export const App = () => {
  const auth = useAuth();
  const [tab, setTab] = useState<Tab>("live");

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
      </header>

      <nav className="tabs" style={{ padding: "0 8px" }}>
        <button className={`tab ${tab === "live" ? "active" : ""}`} onClick={() => setTab("live")}>
          Live
        </button>
        <button className={`tab ${tab === "roster" ? "active" : ""}`} onClick={() => setTab("roster")}>
          Roster
        </button>
        <button className={`tab ${tab === "campaigns" ? "active" : ""}`} onClick={() => setTab("campaigns")}>
          Campaigns
        </button>
      </nav>

      <main style={{ flex: 1, overflowY: "auto", padding: 8, display: "flex", flexDirection: "column", gap: 8 }}>
        {tab === "live" && <DnDBeyondPanel />}
        {tab === "roster" && <RosterPanel onOpen={() => { /* TODO: drill-in view */ }} />}
        {tab === "campaigns" && (
          <section className="panel">
            <div className="panel-title">Campaigns</div>
            <div className="dim" style={{ fontSize: 12 }}>
              The AI DM workspace will live here — campaign outlines, agent chat, encounter manager.
              Coming up next.
            </div>
          </section>
        )}
      </main>
    </div>
  );
};
