import { useRef, useState } from "react";
import { supabase } from "../lib/supabase";
import { useMaps, type MapAsset } from "../state/useMaps";
import { Dialog } from "./ui/Dialog";
import { Icon } from "./ui/Icon";
import { GenerationProgress } from "./ui/GenerationProgress";
import {
  STYLE_PRESETS,
  SIZE_PRESETS,
  QUALITY_PRESETS,
  FAMILY_PRESETS,
  buildImagePrompt,
  findPreset,
  type MapStyle,
  type MapSize,
  type MapQuality,
  type MapFamily,
} from "../lib/cartographer";

interface Props {
  /**
   * When present the dialog is opened from an in-game context and offers to
   * apply the finished map to that scene in addition to saving it to the
   * library. When absent (opened from the Maps tab) it only saves.
   */
  applyToScene?: {
    onApply: (map: MapAsset) => Promise<{ error: string | null }>;
  };
  onClose: () => void;
}

interface GenerateResult {
  image_url: string;
  prompt: string;
  /** True when the image was uploaded by the user rather than AI-generated —
   *  the result view then offers "Choose another" instead of "Regenerate". */
  uploaded: boolean;
}

type Mode = "upload" | "generate";

// Reject absurd files early — the storage bucket and the browser both cope with
// large maps, but a 40 MB PNG helps no one.
const MAX_UPLOAD_BYTES = 20 * 1024 * 1024;

/**
 * Map studio. Bring your own battle map (Upload) or paint one with the
 * cartographer (Generate) — the same "upload first, generate as fallback"
 * shape as the Token Studio. Every finished map writes a row to the DM's
 * `maps` library; when opened from a game, "Use as background" also applies
 * the new map to the current scene.
 */
export const GenerateMapDialog = ({ applyToScene, onClose }: Props) => {
  const { createMap } = useMaps();
  const [mode, setMode] = useState<Mode>("upload");
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [family, setFamily] = useState<MapFamily>("realistic");
  const [style, setStyle] = useState<MapStyle>(STYLE_PRESETS[0].key);
  const [size, setSize] = useState<MapSize>("1536x1024");
  const [quality, setQuality] = useState<MapQuality>("high");
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<GenerateResult | null>(null);
  const [savedMap, setSavedMap] = useState<MapAsset | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [dragOver, setDragOver] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  // ---- Upload ------------------------------------------------------------
  // A user-supplied battle map keeps its own aspect ratio (unlike a token,
  // which is cropped square) — so we upload the file as-is to the shared
  // map-images bucket and save a library row pointing at its public URL.
  const uploadMap = async (file: File) => {
    setBusy(true);
    setError(null);
    setSavedMap(null);
    try {
      if (!file.type.startsWith("image/")) throw new Error("That file isn't an image.");
      if (file.size > MAX_UPLOAD_BYTES) throw new Error("That image is over 20 MB — try a smaller one.");
      const ext = (file.name.split(".").pop() || "png").toLowerCase().replace(/[^a-z0-9]/g, "") || "png";
      const path = `map-uploads/${Date.now()}-${Math.floor(Math.random() * 1e6)}.${ext}`;
      const { error: upErr } = await supabase.storage.from("map-images").upload(path, file, {
        cacheControl: "3600",
        upsert: true,
        contentType: file.type,
      });
      if (upErr) throw new Error(`Upload failed: ${upErr.message}`);
      const { data } = supabase.storage.from("map-images").getPublicUrl(path);
      setResult({ image_url: data.publicUrl, prompt: "", uploaded: true });
      // Auto-save to library so the map is never lost.
      const fileBase = file.name.replace(/\.[^.]+$/, "").trim();
      const derivedName = name.trim() || fileBase || `Uploaded map · ${new Date().toLocaleDateString()}`;
      const { map, error: saveErr } = await createMap({
        name: derivedName,
        image_url: data.publicUrl,
      });
      if (saveErr) setError(`uploaded image but library save failed: ${saveErr}`);
      if (map) setSavedMap(map);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  // ---- Generate ----------------------------------------------------------
  const generate = async () => {
    setBusy(true);
    setError(null);
    setSavedMap(null);
    try {
      const prompt = buildImagePrompt({ description, style, family });
      const { data, error } = await supabase.functions.invoke("generate-image", {
        body: { prompt, size, quality },
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
      setResult({ image_url: payload.image_url, prompt, uploaded: false });
      // Auto-save to library so the map is never lost — even if the user
      // closes without applying to a scene.
      const derivedName =
        name.trim() ||
        (description.trim().slice(0, 40) ||
          `${findPreset(style).label} · ${new Date().toLocaleDateString()}`);
      const { map, error: saveErr } = await createMap({
        name: derivedName,
        image_url: payload.image_url,
        prompt,
        family,
        style,
        size,
      });
      if (saveErr) setError(`saved image but library save failed: ${saveErr}`);
      if (map) setSavedMap(map);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  const applyAndClose = async () => {
    if (!savedMap || !applyToScene) return;
    setBusy(true);
    const { error } = await applyToScene.onApply(savedMap);
    setBusy(false);
    if (error) {
      setError(error);
      return;
    }
    onClose();
  };

  const uploadLabel = { fontSize: 11, letterSpacing: "0.16em", textTransform: "uppercase" as const };

  return (
    <Dialog
      onClose={onClose}
      size="md"
      title="New Map"
      subtitle={
        applyToScene
          ? "Upload your own or generate one — saves to your library and applies to the active scene."
          : "Upload your own or generate one — saves to your library."
      }
    >
      {!result && (
        <div style={{ display: "flex", gap: 6 }}>
          <button
            type="button"
            className={mode === "upload" ? "primary" : "ghost"}
            onClick={() => setMode("upload")}
            style={{ fontSize: 13, flex: 1 }}
          >
            <Icon name="image" size={15} /> Upload
          </button>
          <button
            type="button"
            className={mode === "generate" ? "primary" : "ghost"}
            onClick={() => setMode("generate")}
            style={{ fontSize: 13, flex: 1 }}
          >
            <Icon name="sparkles" size={15} /> Generate
          </button>
        </div>
      )}

      {!result && (
        <label style={{ display: "flex", flexDirection: "column", gap: 4 }}>
          <span className="dim" style={uploadLabel}>Map name (optional)</span>
          <input
            placeholder="e.g. Moonlit Clearing"
            value={name}
            onChange={(e) => setName(e.target.value)}
          />
        </label>
      )}

      {/* ---- Upload mode ---- */}
      {!result && mode === "upload" && (
        <>
          <div
            role="button"
            tabIndex={0}
            onClick={() => !busy && fileRef.current?.click()}
            onKeyDown={(e) => {
              if ((e.key === "Enter" || e.key === " ") && !busy) fileRef.current?.click();
            }}
            onDragOver={(e) => {
              e.preventDefault();
              setDragOver(true);
            }}
            onDragLeave={() => setDragOver(false)}
            onDrop={(e) => {
              e.preventDefault();
              setDragOver(false);
              const file = e.dataTransfer.files?.[0];
              if (file && !busy) void uploadMap(file);
            }}
            style={{
              border: `2px dashed ${dragOver ? "var(--candle)" : "var(--border)"}`,
              borderRadius: "var(--radius)",
              padding: "36px 16px",
              textAlign: "center",
              cursor: busy ? "default" : "pointer",
              background: dragOver ? "var(--bg-1)" : "transparent",
              display: "flex",
              flexDirection: "column",
              alignItems: "center",
              gap: 8,
            }}
          >
            <Icon name="image" size={28} />
            <div style={{ fontSize: 13 }}>
              {busy ? "Uploading…" : "Click to choose an image, or drag one here"}
            </div>
            <div className="dim" style={{ fontSize: 11 }}>
              PNG or JPG · keeps its aspect ratio · up to 20 MB
            </div>
          </div>
          <input
            ref={fileRef}
            type="file"
            accept="image/*"
            hidden
            onChange={(e) => {
              const file = e.target.files?.[0];
              e.target.value = "";
              if (file) void uploadMap(file);
            }}
          />
        </>
      )}

      {/* ---- Generate mode ---- */}
      {!result && mode === "generate" && (
        <>
          <label className="col" style={{ display: "flex", flexDirection: "column", gap: 4 }}>
            <span className="dim" style={uploadLabel}>Describe the scene</span>
            <textarea
              autoFocus
              rows={3}
              placeholder="e.g. a moonlit clearing with a stone altar in the center, tall grass, ring of standing stones"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              style={{ resize: "vertical" }}
            />
          </label>

          <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
            {FAMILY_PRESETS.map((f) => (
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
              <span className="dim" style={uploadLabel}>Scene</span>
              <select value={style} onChange={(e) => setStyle(e.target.value as MapStyle)}>
                {STYLE_PRESETS.map((p) => (
                  <option key={p.key} value={p.key}>
                    {p.label}
                  </option>
                ))}
              </select>
            </label>

            <label style={{ display: "flex", flexDirection: "column", gap: 4 }}>
              <span className="dim" style={uploadLabel}>Aspect</span>
              <select value={size} onChange={(e) => setSize(e.target.value as MapSize)}>
                {SIZE_PRESETS.map((p) => (
                  <option key={p.key} value={p.key}>
                    {p.label}
                  </option>
                ))}
              </select>
            </label>

            <label style={{ display: "flex", flexDirection: "column", gap: 4 }}>
              <span className="dim" style={uploadLabel}>Quality</span>
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
            Generation takes ~15–40s. Every finished map is saved to your library.
          </div>

          <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
            <button
              className="primary"
              onClick={generate}
              disabled={busy}
              style={{ fontSize: 13, padding: "8px 16px" }}
            >
              {busy ? "Generating…" : "Generate map"}
            </button>
          </div>
          {busy && (
            <div style={{ marginTop: 12 }}>
              <GenerationProgress aspect={size.replace("x", " / ")} maxWidth={360} />
            </div>
          )}
        </>
      )}

      {/* ---- Result (shared) ---- */}
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
              alt={result.uploaded ? "Uploaded map preview" : "Generated map preview"}
              style={{ maxWidth: "100%", maxHeight: "60vh", borderRadius: 4 }}
            />
          </div>
          {savedMap && (
            <div className="dim" style={{ fontSize: 11 }}>
              Saved to library as <strong style={{ color: "var(--cream)" }}>{savedMap.name}</strong>.
            </div>
          )}
          {!result.uploaded && (
            <details style={{ fontSize: 11 }}>
              <summary className="dim" style={{ cursor: "pointer" }}>
                Prompt used
              </summary>
              <pre
                style={{
                  whiteSpace: "pre-wrap",
                  fontSize: 11,
                  color: "var(--text-dim)",
                  marginTop: 4,
                }}
              >
                {result.prompt}
              </pre>
            </details>
          )}
          <div style={{ display: "flex", gap: 8 }}>
            {applyToScene && (
              <button
                className="primary"
                onClick={applyAndClose}
                disabled={busy || !savedMap}
                style={{ fontSize: 13 }}
              >
                Use as background
              </button>
            )}
            {result.uploaded ? (
              <button
                className="ghost"
                onClick={() => {
                  setResult(null);
                  setSavedMap(null);
                  fileRef.current?.click();
                }}
                disabled={busy}
                style={{ fontSize: 13 }}
              >
                Choose another
              </button>
            ) : (
              <>
                <button
                  className="ghost"
                  onClick={() => {
                    setResult(null);
                    setSavedMap(null);
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
                    setSavedMap(null);
                  }}
                  disabled={busy}
                  style={{ fontSize: 13 }}
                >
                  Edit prompt
                </button>
              </>
            )}
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
