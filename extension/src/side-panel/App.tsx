import { useEffect, useState } from "react";
import type { Surface } from "../types/snapshots";

interface LatestSnapshots {
  campaign_list?: { campaigns: Array<{ id: number; name: string }> };
  campaign_detail?: Record<number, { id: number; name: string }>;
  character_sheet?: Record<number, { name: string; char_id: number }>;
  last_surface?: Surface;
  updated_at?: string;
}

const LATEST_KEY = "latest-snapshots";

const readLatest = async (): Promise<LatestSnapshots> => {
  const out = await chrome.storage.session.get(LATEST_KEY);
  return (out[LATEST_KEY] as LatestSnapshots) ?? {};
};

export const App = () => {
  const [latest, setLatest] = useState<LatestSnapshots>({});

  useEffect(() => {
    void readLatest().then(setLatest);
    const listener = (changes: { [k: string]: chrome.storage.StorageChange }, area: string) => {
      if (area === "session" && changes[LATEST_KEY]) {
        setLatest(changes[LATEST_KEY].newValue ?? {});
      }
    };
    chrome.storage.onChanged.addListener(listener);
    return () => chrome.storage.onChanged.removeListener(listener);
  }, []);

  const surface = latest.last_surface;
  const campaignCount = latest.campaign_list?.campaigns?.length ?? 0;
  const detailIds = Object.keys(latest.campaign_detail ?? {});
  const sheetIds = Object.keys(latest.character_sheet ?? {});

  return (
    <div style={{ padding: 16, minHeight: "100vh", display: "flex", flexDirection: "column", gap: 12 }}>
      <header>
        <h1 style={{ fontFamily: "var(--serif)", color: "var(--gold)", fontSize: 18, margin: 0 }}>
          D&D 5e VTT
        </h1>
        <div style={{ color: "var(--text-dim)", fontSize: 11, letterSpacing: "0.18em", textTransform: "uppercase" }}>
          DM Agent · Extension
        </div>
      </header>

      <Section title="Current Surface">
        {surface ? (
          <KV>
            <K>kind</K><V mono>{surface.kind}</V>
            {"campaignId" in surface && surface.campaignId != null ? (
              <>
                <K>campaign id</K>
                <V mono>{surface.campaignId}</V>
              </>
            ) : null}
            {"charId" in surface && surface.charId != null ? (
              <>
                <K>character id</K>
                <V mono>{surface.charId}</V>
              </>
            ) : null}
            <K>url</K>
            <V mono small>{truncate(surface.url, 60)}</V>
          </KV>
        ) : (
          <Empty>No D&D Beyond surface detected yet. Open a campaign or character sheet.</Empty>
        )}
      </Section>

      <Section title="Captured Snapshots">
        <KV>
          <K>my-campaigns</K><V mono>{campaignCount}</V>
          <K>campaign details</K><V mono>{detailIds.length ? detailIds.join(", ") : "—"}</V>
          <K>character sheets</K><V mono>{sheetIds.length ? sheetIds.join(", ") : "—"}</V>
        </KV>
        {latest.updated_at && (
          <div style={{ color: "var(--text-muted)", fontSize: 10, marginTop: 6 }}>
            updated {new Date(latest.updated_at).toLocaleTimeString()}
          </div>
        )}
      </Section>

      <Section title="Status">
        <div style={{ color: "var(--text-dim)", fontSize: 12 }}>
          v0.1 scaffold. URL routing live; real scrapers + Supabase sync in the next pass.
        </div>
      </Section>
    </div>
  );
};

// ---------- tiny presentational helpers ----------

const Section = ({ title, children }: { title: string; children: React.ReactNode }) => (
  <section
    style={{
      background: "var(--panel)",
      border: "1px solid var(--panel-border)",
      borderRadius: 8,
      padding: 12,
    }}
  >
    <div
      style={{
        fontFamily: "var(--serif)",
        fontSize: 10,
        letterSpacing: "0.18em",
        textTransform: "uppercase",
        color: "var(--text-dim)",
        marginBottom: 8,
        paddingBottom: 4,
        borderBottom: "1px solid var(--line)",
      }}
    >
      {title}
    </div>
    {children}
  </section>
);

const KV = ({ children }: { children: React.ReactNode }) => (
  <div style={{ display: "grid", gridTemplateColumns: "auto 1fr", gap: "4px 12px", fontSize: 12 }}>
    {children}
  </div>
);

const K = ({ children }: { children: React.ReactNode }) => (
  <span style={{ color: "var(--text-dim)" }}>{children}</span>
);

const V = ({ children, mono, small }: { children: React.ReactNode; mono?: boolean; small?: boolean }) => (
  <span
    style={{
      fontFamily: mono ? "var(--mono)" : undefined,
      fontSize: small ? 11 : undefined,
      wordBreak: "break-all",
    }}
  >
    {children}
  </span>
);

const Empty = ({ children }: { children: React.ReactNode }) => (
  <div style={{ color: "var(--text-muted)", fontSize: 12, fontStyle: "italic" }}>{children}</div>
);

const truncate = (s: string, n: number) => (s.length > n ? s.slice(0, n - 1) + "…" : s);
