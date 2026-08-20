import { useState } from "react";
import { generateLocation } from "../lib/locationSmith";
import { buildScenePrompt, SCENE_MOODS, type SceneMood } from "../lib/sceneSmith";
import {
  STYLE_PRESETS,
  FAMILY_PRESETS,
  buildImagePrompt,
  type MapStyle,
  type MapFamily,
} from "../lib/cartographer";
import { useMaps } from "../state/useMaps";
import { Dialog } from "./ui/Dialog";
import { GenerationProgress } from "./ui/GenerationProgress";

interface Props {
  /** Create the scene from the matched pair; returns any error. */
  onCreate: (name: string, cinematicUrl: string, battlemapUrl: string) => Promise<{ error: string | null }>;
  onClose: () => void;
}

interface Pair {
  cinematicUrl: string;
  battlemapUrl: string;
}

/**
 * "Generate a Location" (Phase 2 slice 4) — one description → a matched
 * cinematic backdrop + top-down battlemap of the same place, then a new scene
 * wearing both faces. Orchestrates the scene + map generators (locationSmith).
 */
export const GenerateLocationDialog = ({ onCreate, onClose }: Props) => {
  const { createMap } = useMaps();
  const [description, setDescription] = useState("");
  const [mood, setMood] = useState<SceneMood>("auto");
  const [style, setStyle] = useState<MapStyle>(STYLE_PRESETS[0].key);
  const [family, setFamily] = useState<MapFamily>("realistic");
  const [step, setStep] = useState<"backdrop" | "battlemap" | null>(null);
  const [busy, setBusy] = useState(false);
  const [pair, setPair] = useState<Pair | null>(null);
  const [error, setError] = useState<string | null>(null);

  const run = async () => {
    if (!description.trim() || busy) return;
    setBusy(true);
    setError(null);
    const res = await generateLocation(description, { mood, style, family }, setStep);
    setStep(null);
    if (res.error || !res.cinematicUrl || !res.battlemapUrl) {
      setBusy(false);
      setError(res.error ?? "Generation failed");
      return;
    }
    setPair({ cinematicUrl: res.cinematicUrl, battlemapUrl: res.battlemapUrl });
    // Save both to the library, typed, so they're reusable.
    const base = description.trim().slice(0, 40) || "Location";
    await createMap({
      name: `${base} · backdrop`,
      image_url: res.cinematicUrl,
      prompt: buildScenePrompt(description, mood),
      size: "1536x1024",
      map_type: "cinematic",
    });
    await createMap({
      name: `${base} · battlemap`,
      image_url: res.battlemapUrl,
      prompt: res.battlemapPrompt,
      family,
      style,
      size: "1536x1024",
      map_type: "battlemap",
    });
    setBusy(false);
  };

  const create = async () => {
    if (!pair) return;
    setBusy(true);
    const name = description.trim().slice(0, 60) || "New location";
    const { error: err } = await onCreate(name, pair.cinematicUrl, pair.battlemapUrl);
    setBusy(false);
    if (err) {
      setError(err);
      return;
    }
    onClose();
  };

  const label = { fontSize: 11, letterSpacing: "0.16em", textTransform: "uppercase" as const };

  return (
    <Dialog
      onClose={onClose}
      size="md"
      title="Generate a Location"
      subtitle="One description → a matched cinematic backdrop and battlemap, as a new scene."
    >
      {!pair && (
        <>
          <label style={{ display: "flex", flexDirection: "column", gap: 4 }}>
            <span className="dim" style={label}>Describe the place</span>
            <textarea
              autoFocus
              rows={3}
              placeholder="e.g. a ruined watchtower on a windswept cliff over a grey sea"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              style={{ resize: "vertical" }}
            />
          </label>

          <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
            <span className="dim" style={label}>Backdrop mood</span>
            <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
              {SCENE_MOODS.map((m) => (
                <button
                  type="button"
                  key={m.key}
                  onClick={() => setMood(m.key)}
                  className={mood === m.key ? "primary" : "ghost"}
                  style={{ fontSize: 12 }}
                  title={m.hint}
                >
                  {m.label}
                </button>
              ))}
            </div>
          </div>

          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
            <label style={{ display: "flex", flexDirection: "column", gap: 4 }}>
              <span className="dim" style={label}>Battlemap terrain</span>
              <select value={style} onChange={(e) => setStyle(e.target.value as MapStyle)}>
                {STYLE_PRESETS.map((p) => (
                  <option key={p.key} value={p.key}>
                    {p.label}
                  </option>
                ))}
              </select>
            </label>
            <label style={{ display: "flex", flexDirection: "column", gap: 4 }}>
              <span className="dim" style={label}>Battlemap style</span>
              <select value={family} onChange={(e) => setFamily(e.target.value as MapFamily)}>
                {FAMILY_PRESETS.map((p) => (
                  <option key={p.key} value={p.key}>
                    {p.label}
                  </option>
                ))}
              </select>
            </label>
          </div>

          <div className="dim" style={{ fontSize: 11 }}>
            Two renders, back to back — expect ~40–80s. Both are saved to your library.
          </div>

          <div>
            <button
              className="primary"
              onClick={run}
              disabled={busy || !description.trim()}
              style={{ fontSize: 13, padding: "8px 16px" }}
            >
              {busy ? "Generating…" : "Generate location"}
            </button>
          </div>
          {busy && (
            <div style={{ marginTop: 12 }}>
              <div className="dim" style={{ fontSize: 12, marginBottom: 8 }}>
                {step === "backdrop" ? "Painting the backdrop…" : "Drafting the battlemap…"}
              </div>
              <GenerationProgress aspect="1536 / 1024" maxWidth={360} />
            </div>
          )}
        </>
      )}

      {pair && (
        <>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
            <figure style={{ margin: 0 }}>
              <img
                src={pair.cinematicUrl}
                alt="Backdrop"
                style={{ width: "100%", borderRadius: 6, display: "block" }}
              />
              <figcaption className="dim" style={{ fontSize: 10, marginTop: 4, textAlign: "center" }}>
                Cinematic backdrop
              </figcaption>
            </figure>
            <figure style={{ margin: 0 }}>
              <img
                src={pair.battlemapUrl}
                alt="Battlemap"
                style={{ width: "100%", borderRadius: 6, display: "block" }}
              />
              <figcaption className="dim" style={{ fontSize: 10, marginTop: 4, textAlign: "center" }}>
                Tactical battlemap
              </figcaption>
            </figure>
          </div>
          <div style={{ display: "flex", gap: 8 }}>
            <button className="primary" onClick={create} disabled={busy} style={{ fontSize: 13 }}>
              Create scene
            </button>
            <button
              className="ghost"
              onClick={() => setPair(null)}
              disabled={busy}
              style={{ fontSize: 13 }}
            >
              Start over
            </button>
          </div>
        </>
      )}

      {error && (
        <div className="panel" style={{ borderColor: "var(--ember)", fontSize: 12 }}>
          {error}
        </div>
      )}
    </Dialog>
  );
};
