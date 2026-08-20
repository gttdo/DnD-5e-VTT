import { useState } from "react";
import { generateScene, buildScenePrompt, SCENE_MOODS, type SceneMood } from "../lib/sceneSmith";
import { useMaps } from "../state/useMaps";
import { Dialog } from "./ui/Dialog";
import { GenerationProgress } from "./ui/GenerationProgress";

interface Props {
  /** Apply the finished backdrop to the active scene's cinematic face. */
  onApply: (url: string) => Promise<{ error: string | null }>;
  onClose: () => void;
}

/**
 * Scene generator (Phase 2) — paints a cinematic backdrop for the active scene's
 * cinematic face. The location analogue of the character-backdrop generator; see
 * lib/sceneSmith. Kept lean: describe the place, pick a mood, generate, apply.
 */
export const GenerateSceneDialog = ({ onApply, onClose }: Props) => {
  const { createMap } = useMaps();
  const [description, setDescription] = useState("");
  const [mood, setMood] = useState<SceneMood>("auto");
  const [busy, setBusy] = useState(false);
  const [url, setUrl] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const run = async () => {
    if (!description.trim() || busy) return;
    setBusy(true);
    setError(null);
    const { url: out, error: err } = await generateScene(description, mood);
    if (err) {
      setBusy(false);
      setError(err);
      return;
    }
    setUrl(out);
    // Save to the library as a cinematic asset so the backdrop is reusable via
    // "Set backdrop…" and never lost, even if the DM closes without applying.
    if (out) {
      await createMap({
        name: description.trim().slice(0, 40) || "Backdrop",
        image_url: out,
        prompt: buildScenePrompt(description, mood),
        size: "1536x1024",
        map_type: "cinematic",
      });
    }
    setBusy(false);
  };

  const apply = async () => {
    if (!url) return;
    setBusy(true);
    const { error: err } = await onApply(url);
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
      title="Generate a Backdrop"
      subtitle="Paint a cinematic backdrop for this scene's cinematic face — a place, not a map."
    >
      {!url && (
        <>
          <label style={{ display: "flex", flexDirection: "column", gap: 4 }}>
            <span className="dim" style={label}>Describe the place</span>
            <textarea
              autoFocus
              rows={3}
              placeholder="e.g. a torchlit tavern common room, timber beams, a roaring hearth, patrons at long tables"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              style={{ resize: "vertical" }}
            />
          </label>

          <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
            <span className="dim" style={label}>Mood</span>
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

          <div className="dim" style={{ fontSize: 11 }}>
            Generation takes ~15–40s. Wide 16:10, painted at medium quality to stay within the render budget.
          </div>

          <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
            <button
              className="primary"
              onClick={run}
              disabled={busy || !description.trim()}
              style={{ fontSize: 13, padding: "8px 16px" }}
            >
              {busy ? "Painting…" : "Generate backdrop"}
            </button>
          </div>
          {busy && (
            <div style={{ marginTop: 12 }}>
              <GenerationProgress aspect="1536 / 1024" maxWidth={360} />
            </div>
          )}
        </>
      )}

      {url && (
        <>
          <div
            style={{
              background: "var(--bg-1)",
              borderRadius: "var(--radius)",
              padding: 4,
              display: "flex",
              justifyContent: "center",
            }}
          >
            <img
              src={url}
              alt="Generated backdrop preview"
              style={{ maxWidth: "100%", maxHeight: "60vh", borderRadius: 4 }}
            />
          </div>
          <div style={{ display: "flex", gap: 8 }}>
            <button className="primary" onClick={apply} disabled={busy} style={{ fontSize: 13 }}>
              Use as backdrop
            </button>
            <button
              className="ghost"
              onClick={() => {
                setUrl(null);
                run();
              }}
              disabled={busy}
              style={{ fontSize: 13 }}
            >
              Regenerate
            </button>
            <button
              className="ghost"
              onClick={() => setUrl(null)}
              disabled={busy}
              style={{ fontSize: 13 }}
            >
              Edit prompt
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
