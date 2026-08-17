import { useState } from "react";
import { supabase } from "../lib/supabase";
import { useTokenAssets, type TokenAsset } from "../state/useTokenAssets";
import { Dialog } from "./ui/Dialog";
import {
  TOKEN_SIZES,
  CREATURE_TYPES,
  TOKEN_FAMILY_PRESETS,
  buildTokenPrompt,
  findSize,
  findCreatureType,
  type TokenSize,
  type CreatureType,
  type TokenFamily,
} from "../lib/tokenSmith";
import { QUALITY_PRESETS, type MapQuality } from "../lib/cartographer";

interface Props {
  /** Optional: called after successful gen + library save, if the dialog was
   *  opened from an in-game context (add this token straight to the canvas). */
  applyToScene?: {
    onApply: (asset: TokenAsset) => Promise<{ error: string | null }>;
  };
  onClose: () => void;
}

interface GenerateResult {
  image_url: string;
  prompt: string;
}

/**
 * Token cartographer. Same architecture as GenerateMapDialog: single-shot
 * prompt template on the client, delegate the actual image gen to the
 * generate-image edge function (agnostic — takes a prompt + size + quality),
 * always save to the token library on success.
 */
export const GenerateTokenDialog = ({ applyToScene, onClose }: Props) => {
  const { createAsset } = useTokenAssets();
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [family, setFamily] = useState<TokenFamily>("portrait");
  const [creatureType, setCreatureType] = useState<CreatureType>("humanoid");
  const [size, setSize] = useState<TokenSize>("medium");
  const [quality, setQuality] = useState<MapQuality>("high");
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<GenerateResult | null>(null);
  const [savedAsset, setSavedAsset] = useState<TokenAsset | null>(null);
  const [error, setError] = useState<string | null>(null);

  const generate = async () => {
    setBusy(true);
    setError(null);
    setSavedAsset(null);
    try {
      const prompt = buildTokenPrompt({
        description,
        size,
        creatureType,
        family,
      });
      // Square 1024x1024 fits both portrait bust and top-down mini best.
      const { data, error } = await supabase.functions.invoke("generate-image", {
        body: { prompt, size: "1024x1024", quality },
      });
      if (error) {
        setError(error.message);
        return;
      }
      const payload = data as { image_url?: string; error?: string };
      if (payload.error) {
        setError(payload.error);
        return;
      }
      if (!payload.image_url) {
        setError("no image returned");
        return;
      }
      setResult({ image_url: payload.image_url, prompt });
      const derivedName =
        name.trim() ||
        (description.trim().slice(0, 40) ||
          `${findCreatureType(creatureType).label} · ${findSize(size).label.split(" ")[0]}`);
      const { asset, error: saveErr } = await createAsset({
        name: derivedName,
        image_url: payload.image_url,
        prompt,
        family,
        size_category: size,
        creature_type: creatureType,
      });
      if (saveErr) setError(`saved image but library save failed: ${saveErr}`);
      if (asset) setSavedAsset(asset);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  const applyAndClose = async () => {
    if (!savedAsset || !applyToScene) return;
    setBusy(true);
    const { error } = await applyToScene.onApply(savedAsset);
    setBusy(false);
    if (error) {
      setError(error);
      return;
    }
    onClose();
  };

  return (
    <Dialog
      onClose={onClose}
      size="md"
      title="Token Forge"
      subtitle={
        applyToScene
          ? "Saves to library and places on the active scene."
          : "Saves to library."
      }
    >
      {!result && (
          <>
            <label style={{ display: "flex", flexDirection: "column", gap: 4 }}>
              <span className="dim" style={{ fontSize: 11, letterSpacing: "0.16em", textTransform: "uppercase" }}>
                Token name (optional)
              </span>
              <input
                placeholder="e.g. Goblin Archer"
                value={name}
                onChange={(e) => setName(e.target.value)}
              />
            </label>

            <label style={{ display: "flex", flexDirection: "column", gap: 4 }}>
              <span className="dim" style={{ fontSize: 11, letterSpacing: "0.16em", textTransform: "uppercase" }}>
                Describe the creature
              </span>
              <textarea
                autoFocus
                rows={3}
                placeholder="e.g. a wiry goblin archer wearing patchwork leather armor, ragged hood, drawing a short bow, scarred grin"
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                style={{ resize: "vertical" }}
              />
            </label>

            <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
              {TOKEN_FAMILY_PRESETS.map((f) => (
                <button
                  type="button"
                  key={f.key}
                  onClick={() => setFamily(f.key)}
                  className={family === f.key ? "primary" : "ghost"}
                  style={{ fontSize: 12, textAlign: "left", flex: 1, minWidth: 200 }}
                  title={f.hint}
                >
                  <div style={{ fontWeight: 600 }}>{f.label}</div>
                  <div className="dim" style={{ fontSize: 10, marginTop: 2 }}>
                    {f.hint}
                  </div>
                </button>
              ))}
            </div>

            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 12 }}>
              <label style={{ display: "flex", flexDirection: "column", gap: 4 }}>
                <span className="dim" style={{ fontSize: 11, letterSpacing: "0.16em", textTransform: "uppercase" }}>
                  Creature type
                </span>
                <select value={creatureType} onChange={(e) => setCreatureType(e.target.value as CreatureType)}>
                  {CREATURE_TYPES.map((c) => (
                    <option key={c.key} value={c.key}>
                      {c.label}
                    </option>
                  ))}
                </select>
              </label>

              <label style={{ display: "flex", flexDirection: "column", gap: 4 }}>
                <span className="dim" style={{ fontSize: 11, letterSpacing: "0.16em", textTransform: "uppercase" }}>
                  Size (5e)
                </span>
                <select value={size} onChange={(e) => setSize(e.target.value as TokenSize)}>
                  {TOKEN_SIZES.map((s) => (
                    <option key={s.key} value={s.key}>
                      {s.label}
                    </option>
                  ))}
                </select>
              </label>

              <label style={{ display: "flex", flexDirection: "column", gap: 4 }}>
                <span className="dim" style={{ fontSize: 11, letterSpacing: "0.16em", textTransform: "uppercase" }}>
                  Quality
                </span>
                <select value={quality} onChange={(e) => setQuality(e.target.value as MapQuality)}>
                  {QUALITY_PRESETS.map((p) => (
                    <option key={p.key} value={p.key}>
                      {p.label} · {p.costHint}
                    </option>
                  ))}
                </select>
              </label>
            </div>

            <div className="dim" style={{ fontSize: 11 }}>
              Size determines the token's footprint on the grid — {findSize(size).cells}×{findSize(size).cells} cell{findSize(size).cells === 1 ? "" : "s"}. Every finished token is saved to your library.
            </div>

            <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
              <button
                className="primary"
                onClick={generate}
                disabled={busy}
                style={{ fontSize: 13, padding: "8px 16px" }}
              >
                {busy ? "Generating…" : "Generate token"}
              </button>
              {busy && (
                <span className="dim" style={{ fontSize: 12 }}>
                  Sculpting your creature… don't close this window.
                </span>
              )}
            </div>
          </>
        )}

        {result && (
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
                src={result.image_url}
                alt="Generated token preview"
                style={{ maxWidth: 400, maxHeight: "60vh", borderRadius: "50%" }}
              />
            </div>
            {savedAsset && (
              <div className="dim" style={{ fontSize: 11, textAlign: "center" }}>
                Saved to library as <strong style={{ color: "var(--cream)" }}>{savedAsset.name}</strong>.
              </div>
            )}
            <details style={{ fontSize: 11 }}>
              <summary className="dim" style={{ cursor: "pointer" }}>
                Prompt used
              </summary>
              <pre style={{ whiteSpace: "pre-wrap", fontSize: 11, color: "var(--text-dim)", marginTop: 4 }}>
                {result.prompt}
              </pre>
            </details>
            <div style={{ display: "flex", gap: 8 }}>
              {applyToScene && (
                <button
                  className="primary"
                  onClick={applyAndClose}
                  disabled={busy || !savedAsset}
                  style={{ fontSize: 13 }}
                >
                  Place on scene
                </button>
              )}
              <button
                className="ghost"
                onClick={() => {
                  setResult(null);
                  setSavedAsset(null);
                  generate();
                }}
                disabled={busy}
                style={{ fontSize: 13 }}
              >
                Regenerate
              </button>
              <button
                className="ghost"
                onClick={() => {
                  setResult(null);
                  setSavedAsset(null);
                }}
                disabled={busy}
                style={{ fontSize: 13 }}
              >
                Edit prompt
              </button>
              {!applyToScene && (
                <button
                  className="ghost"
                  onClick={onClose}
                  disabled={busy}
                  style={{ fontSize: 13, marginLeft: "auto" }}
                >
                  Done
                </button>
              )}
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
