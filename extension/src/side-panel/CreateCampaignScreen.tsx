import { useEffect, useState } from "react";
import {
  DEFAULT_STYLE,
  FANTASY_FLAVORS,
  LETHALITY,
  TONES,
  type CampaignStyle,
  type FantasyFlavorId,
  type LethalityId,
  type ToneId,
} from "../data/campaignStyles";
import type { Surface } from "../types/snapshots";

const LATEST_KEY = "latest-snapshots";

interface Props {
  onCancel: () => void;
  onCreate: (input: {
    name: string;
    outline: string;
    style: CampaignStyle;
    dndbeyondId: number | null;
  }) => Promise<void>;
}

export const CreateCampaignScreen = ({ onCancel, onCreate }: Props) => {
  const [name, setName] = useState("");
  const [outline, setOutline] = useState("");
  const [flavor, setFlavor] = useState<FantasyFlavorId>(DEFAULT_STYLE.flavor);
  const [tone, setTone] = useState<ToneId>(DEFAULT_STYLE.tone);
  const [lethality, setLethality] = useState<LethalityId>(DEFAULT_STYLE.lethality);
  const [linkDdb, setLinkDdb] = useState(true);
  const [showAdvanced, setShowAdvanced] = useState(false);
  const [activeSurface, setActiveSurface] = useState<Surface | null>(null);
  const [pending, setPending] = useState(false);

  // Read the currently-active D&D Beyond surface for the auto-link offer.
  useEffect(() => {
    const load = () => {
      chrome.storage.session.get(LATEST_KEY).then((out) => {
        const latest = (out[LATEST_KEY] ?? {}) as { last_surface?: Surface };
        setActiveSurface(latest.last_surface ?? null);
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
  }, []);

  const activeCampaignId =
    activeSurface?.kind === "campaign-detail" ? activeSurface.campaignId : null;

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim() || pending) return;
    setPending(true);
    try {
      await onCreate({
        name: name.trim(),
        outline: outline.trim(),
        style: { flavor, tone, lethality },
        dndbeyondId: linkDdb ? activeCampaignId : null,
      });
    } finally {
      setPending(false);
    }
  };

  return (
    <div style={{ display: "flex", flexDirection: "column", minHeight: "100vh" }}>
      <header
        style={{
          padding: "6px 10px",
          borderBottom: "1px solid var(--line)",
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
        }}
      >
        <button onClick={onCancel} className="ghost" style={{ fontSize: 11, padding: "3px 8px" }}>
          ← Cancel
        </button>
        <div style={{ fontFamily: "var(--serif)", color: "var(--gold)", fontSize: 13, fontWeight: 700 }}>
          New Campaign
        </div>
        <span style={{ width: 60 }} /> {/* spacer */}
      </header>

      <form onSubmit={submit} style={{ flex: 1, overflowY: "auto", padding: 12, display: "flex", flexDirection: "column", gap: 12 }}>
        <label className="col">
          <span className="label">Campaign Name</span>
          <input
            autoFocus
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="The Sunless Citadel, Borderland Heroes, …"
            required
          />
        </label>

        <label className="col">
          <span className="label">Outline</span>
          <textarea
            value={outline}
            onChange={(e) => setOutline(e.target.value)}
            rows={8}
            style={{ resize: "vertical", lineHeight: 1.4 }}
            placeholder={`Paste your story beats, chapter headings, NPC notes, and hooks here.

Chapter 1 — The Tower's Teeth
- Party defends the keep against goblin raiders
- NPC Sergeant Shannik gives them a catapult to install
- Twist: one goblin is wearing a familiar pendant…

The agent uses this as the campaign's spine. You can edit it later from the workspace.`}
          />
          <div className="dim" style={{ fontSize: 10, marginTop: 4 }}>
            Optional. If you link a D&D Beyond campaign below, the agent also sees its DM Notes (Private + Public).
          </div>
        </label>

        <section className="panel" style={{ padding: 10, gap: 8, display: "flex", flexDirection: "column" }}>
          <div className="panel-title" style={{ marginBottom: 0, paddingBottom: 0, borderBottom: 0 }}>
            Style
            <button
              type="button"
              className="ghost"
              style={{ fontSize: 10, padding: "2px 6px" }}
              onClick={() => setShowAdvanced((s) => !s)}
            >
              {showAdvanced ? "Hide advanced" : "Show advanced"}
            </button>
          </div>

          <StyleSelect<FantasyFlavorId>
            label="Fantasy Flavor"
            value={flavor}
            options={FANTASY_FLAVORS}
            onChange={setFlavor}
          />

          {showAdvanced && (
            <>
              <StyleSelect<ToneId>
                label="Tone"
                value={tone}
                options={TONES}
                onChange={setTone}
              />
              <StyleSelect<LethalityId>
                label="Combat Lethality"
                value={lethality}
                options={LETHALITY}
                onChange={setLethality}
              />
            </>
          )}
        </section>

        {activeCampaignId != null && (
          <label
            className="panel"
            style={{
              padding: 10,
              display: "flex",
              alignItems: "flex-start",
              gap: 8,
              cursor: "pointer",
              borderColor: linkDdb ? "var(--gold)" : undefined,
            }}
          >
            <input
              type="checkbox"
              checked={linkDdb}
              onChange={(e) => setLinkDdb(e.target.checked)}
              style={{ width: "auto", marginTop: 2 }}
            />
            <div style={{ flex: 1 }}>
              <div className="label" style={{ marginBottom: 2 }}>
                Link to currently-open D&D Beyond campaign
              </div>
              <div className="dim" style={{ fontSize: 11 }}>
                Campaign <span className="mono">#{activeCampaignId}</span>. The agent will read the
                party roster and both DM Notes blocks as context.
              </div>
            </div>
          </label>
        )}

        <div style={{ display: "flex", justifyContent: "space-between", gap: 6, marginTop: 4 }}>
          <button type="button" className="ghost" onClick={onCancel}>Cancel</button>
          <button type="submit" className="primary" disabled={pending || !name.trim()}>
            {pending ? "Creating…" : "Create Campaign"}
          </button>
        </div>
      </form>
    </div>
  );
};

interface StyleSelectProps<Id extends string> {
  label: string;
  value: Id;
  options: ReadonlyArray<{ id: Id; label: string; blurb: string }>;
  onChange: (id: Id) => void;
}

function StyleSelect<Id extends string>({ label, value, options, onChange }: StyleSelectProps<Id>) {
  const selected = options.find((o) => o.id === value);
  return (
    <label className="col" style={{ gap: 4 }}>
      <span className="label">{label}</span>
      <select value={value} onChange={(e) => onChange(e.target.value as Id)}>
        {options.map((o) => (
          <option key={o.id} value={o.id}>{o.label}</option>
        ))}
      </select>
      {selected && (
        <div className="dim" style={{ fontSize: 11, fontStyle: "italic", lineHeight: 1.3 }}>
          {selected.blurb}
        </div>
      )}
    </label>
  );
}
