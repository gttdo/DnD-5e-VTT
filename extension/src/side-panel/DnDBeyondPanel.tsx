import { useEffect, useState } from "react";
import type {
  CampaignDetailSnapshot,
  CampaignListSnapshot,
  CharacterSheetSnapshot,
  Surface,
} from "../types/snapshots";

interface LatestSnapshots {
  campaign_list?: CampaignListSnapshot;
  campaign_detail?: Record<number, CampaignDetailSnapshot>;
  character_sheet?: Record<number, CharacterSheetSnapshot>;
  last_surface?: Surface;
  updated_at?: string;
}

const LATEST_KEY = "latest-snapshots";

export const DnDBeyondPanel = () => {
  const [latest, setLatest] = useState<LatestSnapshots>({});

  useEffect(() => {
    chrome.storage.session.get(LATEST_KEY).then((out) => {
      setLatest((out[LATEST_KEY] as LatestSnapshots) ?? {});
    });
    const listener = (
      changes: { [k: string]: chrome.storage.StorageChange },
      area: string
    ) => {
      if (area === "session" && changes[LATEST_KEY]) {
        setLatest(changes[LATEST_KEY].newValue ?? {});
      }
    };
    chrome.storage.onChanged.addListener(listener);
    return () => chrome.storage.onChanged.removeListener(listener);
  }, []);

  const surface = latest.last_surface;

  return (
    <section className="panel">
      <div className="panel-title">D&D Beyond · Live</div>
      {!surface || surface.kind === "unknown" ? (
        <div className="dim" style={{ fontSize: 12, fontStyle: "italic" }}>
          Open a D&D Beyond campaign or character sheet to populate this panel.
        </div>
      ) : surface.kind === "campaign-list" ? (
        <CampaignListView snap={latest.campaign_list} />
      ) : surface.kind === "campaign-detail" ? (
        <CampaignDetailView snap={latest.campaign_detail?.[surface.campaignId]} />
      ) : surface.kind === "character-sheet" ? (
        <CharacterSheetView snap={latest.character_sheet?.[surface.charId]} />
      ) : null}

      {latest.updated_at && (
        <div style={{ fontSize: 9, color: "var(--text-muted)", marginTop: 8, textAlign: "right" }}>
          synced {new Date(latest.updated_at).toLocaleTimeString()}
        </div>
      )}
    </section>
  );
};

const CampaignListView = ({ snap }: { snap: CampaignListSnapshot | undefined }) => {
  if (!snap) return <div className="dim">Reading…</div>;
  return (
    <div className="col" style={{ gap: 6 }}>
      <div className="dim" style={{ fontSize: 10, letterSpacing: "0.16em", textTransform: "uppercase" }}>
        My Campaigns
      </div>
      {snap.campaigns.length === 0 && <div className="dim">No campaigns visible</div>}
      {snap.campaigns.map((c) => (
        <div
          key={c.id}
          style={{
            padding: 8,
            border: "1px solid var(--line)",
            borderRadius: 6,
            background: "rgba(0,0,0,0.15)",
          }}
        >
          <div style={{ fontWeight: 600, fontSize: 12, display: "flex", justifyContent: "space-between" }}>
            <span>{c.name || "(unnamed)"}</span>
            <span className="dim mono" style={{ fontSize: 9, color: c.role === "dm" ? "var(--gold)" : undefined }}>
              {c.role.toUpperCase()}
            </span>
          </div>
          <div className="dim" style={{ fontSize: 10 }}>
            {c.player_count} player{c.player_count === 1 ? "" : "s"}
            {c.started_at ? ` · started ${c.started_at}` : ""}
          </div>
        </div>
      ))}
    </div>
  );
};

const CampaignDetailView = ({ snap }: { snap: CampaignDetailSnapshot | undefined }) => {
  if (!snap) return <div className="dim">Reading…</div>;
  return (
    <div className="col" style={{ gap: 8 }}>
      <div>
        <div style={{ fontFamily: "var(--serif)", fontSize: 15, fontWeight: 700, color: "var(--gold)" }}>
          {snap.name || "Unnamed Campaign"}
        </div>
        {snap.invite_token && (
          <div className="dim mono" style={{ fontSize: 9 }}>
            invite · {snap.invite_token.slice(-8)}
          </div>
        )}
      </div>

      <div className="col" style={{ gap: 0 }}>
        <div className="dim" style={{ fontSize: 10, letterSpacing: "0.16em", textTransform: "uppercase", marginBottom: 4 }}>
          Party ({snap.party.length})
        </div>
        {snap.party.map((p) => (
          <div
            key={p.char_id}
            style={{
              display: "grid",
              gridTemplateColumns: "1fr auto",
              gap: 4,
              padding: "4px 6px",
              borderBottom: "1px solid var(--line)",
              fontSize: 11,
            }}
          >
            <div>
              <div style={{ fontWeight: 600 }}>{p.name}</div>
              <div className="dim" style={{ fontSize: 10 }}>
                L{p.total_level} {p.species} {p.class}{p.subclass ? ` (${p.subclass})` : ""}
              </div>
            </div>
            <div className="dim mono" style={{ fontSize: 9, textAlign: "right", alignSelf: "center" }}>
              #{p.char_id}
            </div>
          </div>
        ))}
      </div>

      {snap.dm_notes_private_html && (
        <details>
          <summary className="dim" style={{ fontSize: 10, letterSpacing: "0.16em", textTransform: "uppercase", cursor: "pointer" }}>
            DM Notes (Private) · {snap.dm_notes_private_html.length.toLocaleString()} chars
          </summary>
          <div
            className="rich"
            style={{ fontSize: 11, maxHeight: 220, overflowY: "auto", padding: "4px 0" }}
            dangerouslySetInnerHTML={{ __html: snap.dm_notes_private_html }}
          />
        </details>
      )}
      {snap.dm_notes_public_html && (
        <details>
          <summary className="dim" style={{ fontSize: 10, letterSpacing: "0.16em", textTransform: "uppercase", cursor: "pointer" }}>
            DM Notes (Public) · {snap.dm_notes_public_html.length.toLocaleString()} chars
          </summary>
          <div
            className="rich"
            style={{ fontSize: 11, maxHeight: 220, overflowY: "auto", padding: "4px 0" }}
            dangerouslySetInnerHTML={{ __html: snap.dm_notes_public_html }}
          />
        </details>
      )}
    </div>
  );
};

const CharacterSheetView = ({ snap }: { snap: CharacterSheetSnapshot | undefined }) => {
  if (!snap) return <div className="dim">Reading…</div>;
  const cls = snap.classes[0];
  return (
    <div className="col" style={{ gap: 8 }}>
      <div>
        <div style={{ fontFamily: "var(--serif)", fontSize: 15, fontWeight: 700, color: "var(--gold)" }}>
          {snap.name}
        </div>
        <div className="dim" style={{ fontSize: 10 }}>
          L{snap.total_level} · {snap.species} · {cls.name}{cls.subclass ? ` (${cls.subclass})` : ""}
        </div>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 4 }}>
        <Stat label="HP" value={`${snap.hp.current}/${snap.hp.max}`} accent={snap.hp.current < snap.hp.max / 2} />
        <Stat label="AC" value={snap.ac} />
        <Stat label="Speed" value={`${snap.walking_speed}ft`} />
        <Stat label="Init" value={fmt(snap.initiative_bonus)} />
        <Stat label="Prof" value={fmt(snap.proficiency_bonus)} />
        <Stat label="Pass.Perc" value={snap.passive.perception} />
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 4 }}>
        {(["STR", "DEX", "CON", "INT", "WIS", "CHA"] as const).map((a) => (
          <Stat key={a} label={a} value={`${snap.abilities[a].score} ${fmt(snap.abilities[a].modifier)}`} />
        ))}
      </div>

      {snap.defenses.resistances.length > 0 && (
        <div className="dim" style={{ fontSize: 11 }}>
          <span style={{ color: "var(--gold)" }}>Resist:</span> {snap.defenses.resistances.join(", ")}
        </div>
      )}
      {snap.conditions.length > 0 && (
        <div style={{ fontSize: 11, color: "var(--accent)" }}>
          Conditions: {snap.conditions.join(", ")}
        </div>
      )}
    </div>
  );
};

const Stat = ({ label, value, accent }: { label: string; value: string | number; accent?: boolean }) => (
  <div
    style={{
      padding: "4px 6px",
      background: "rgba(0,0,0,0.2)",
      border: "1px solid var(--line)",
      borderRadius: 4,
      textAlign: "center",
    }}
  >
    <div className="dim" style={{ fontSize: 8, letterSpacing: "0.1em", textTransform: "uppercase" }}>{label}</div>
    <div className="mono" style={{ fontSize: 12, fontWeight: 700, color: accent ? "var(--accent)" : undefined }}>
      {value}
    </div>
  </div>
);

const fmt = (n: number): string => (n >= 0 ? `+${n}` : `${n}`);
