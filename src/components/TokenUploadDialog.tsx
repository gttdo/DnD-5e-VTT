import { useRef, useState } from "react";
import { supabase } from "../lib/supabase";
import { useToast } from "../state/Toast";
import { Dialog } from "./ui/Dialog";
import { Icon } from "./ui/Icon";
import type { NewTokenAssetInput, TokenAsset } from "../state/useTokenAssets";
import type { TokenSize } from "../lib/tokenSmith";

/**
 * Upload your own image as a library token (#16). The sibling of the Token Studio
 * "generate" path — drop in art you already have (a portrait, a map prop, a photo)
 * and it becomes a placeable asset that remembers its 5e size, just like a
 * generated one. Stored in the shared map-images bucket; the row is created via
 * the same createAsset the generator uses.
 */

const SIZES: { key: TokenSize; label: string; cells: string }[] = [
  { key: "tiny", label: "Tiny", cells: "½×½" },
  { key: "small", label: "Small", cells: "1×1" },
  { key: "medium", label: "Medium", cells: "1×1" },
  { key: "large", label: "Large", cells: "2×2" },
  { key: "huge", label: "Huge", cells: "3×3" },
  { key: "gargantuan", label: "Gargantuan", cells: "4×4" },
];

interface Props {
  onClose: () => void;
  createAsset: (input: NewTokenAssetInput) => Promise<{ asset: TokenAsset | null; error: string | null }>;
}

export const TokenUploadDialog = ({ onClose, createAsset }: Props) => {
  const toast = useToast();
  const [file, setFile] = useState<File | null>(null);
  const [preview, setPreview] = useState<string | null>(null);
  const [name, setName] = useState("");
  const [size, setSize] = useState<TokenSize>("medium");
  const [busy, setBusy] = useState(false);
  const [dragging, setDragging] = useState(false);
  const inputRef = useRef<HTMLInputElement | null>(null);

  const pick = (f: File) => {
    if (!f.type.startsWith("image/")) {
      toast.error("Please choose an image file.");
      return;
    }
    if (f.size > 15 * 1024 * 1024) {
      toast.error("That image is over 15 MB — try a smaller one.");
      return;
    }
    setFile(f);
    setPreview(URL.createObjectURL(f));
    if (!name.trim()) setName(f.name.replace(/\.[^.]+$/, "").replace(/[_-]+/g, " ").slice(0, 60));
  };

  const save = async () => {
    if (!file) return;
    setBusy(true);
    try {
      const ext = file.name.split(".").pop()?.toLowerCase() || "png";
      const path = `token-uploads/${crypto.randomUUID()}.${ext}`;
      const { error: upErr } = await supabase.storage.from("map-images").upload(path, file, {
        cacheControl: "31536000",
        upsert: true,
        contentType: file.type,
      });
      if (upErr) {
        toast.error(
          upErr.message.toLowerCase().includes("row-level security")
            ? "Uploads aren't enabled — check the map-images storage policy."
            : `Upload failed: ${upErr.message}`
        );
        return;
      }
      const { data } = supabase.storage.from("map-images").getPublicUrl(path);
      const { error } = await createAsset({
        name: name.trim() || "Uploaded token",
        image_url: data.publicUrl,
        size_category: size,
        token_type: null,
      });
      if (error) {
        toast.error(`Couldn't save to library: ${error}`);
        return;
      }
      toast.success("Added to your library.");
      onClose();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Couldn't upload that image.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <Dialog onClose={onClose} size="md" title="Upload a token" subtitle="Add your own art to the library.">
      <div style={{ display: "grid", gap: 14 }}>
        <div
          onClick={() => !busy && inputRef.current?.click()}
          onDragOver={(e) => { e.preventDefault(); if (!busy) setDragging(true); }}
          onDragLeave={() => setDragging(false)}
          onDrop={(e) => { e.preventDefault(); setDragging(false); const f = e.dataTransfer.files?.[0]; if (f) pick(f); }}
          style={{
            border: `2px dashed ${dragging ? "var(--gold)" : "var(--border)"}`,
            borderRadius: 14,
            background: dragging ? "color-mix(in srgb, var(--gold) 8%, var(--bg-1))" : "var(--bg-1)",
            padding: preview ? 12 : "36px 20px",
            textAlign: "center",
            cursor: busy ? "default" : "pointer",
            display: "grid",
            placeItems: "center",
            gap: 10,
          }}
        >
          <input
            ref={inputRef}
            type="file"
            accept="image/*"
            style={{ display: "none" }}
            onChange={(e) => { const f = e.target.files?.[0]; if (f) pick(f); e.target.value = ""; }}
          />
          {preview ? (
            <img src={preview} alt="Preview" style={{ maxWidth: 180, maxHeight: 180, borderRadius: 10, objectFit: "cover" }} />
          ) : (
            <>
              <div style={{ width: 52, height: 52, borderRadius: 13, display: "grid", placeItems: "center", background: "color-mix(in srgb, var(--gold) 14%, transparent)", color: "var(--gold)" }}>
                <Icon name="image" size={24} />
              </div>
              <div style={{ fontWeight: 600 }}>Drop an image, or click to choose</div>
              <div className="dim" style={{ fontSize: 12 }}>PNG or JPG, up to 15 MB. A square image reads best on the grid.</div>
            </>
          )}
          {preview && <div className="dim" style={{ fontSize: 12 }}>Click to choose a different image</div>}
        </div>

        <label style={{ display: "grid", gap: 4 }}>
          <span className="dim" style={{ fontSize: 12, textTransform: "uppercase", letterSpacing: 0.5 }}>Name</span>
          <input value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Ancient Oak, Barkeep, Trap" />
        </label>

        <label style={{ display: "grid", gap: 4 }}>
          <span className="dim" style={{ fontSize: 12, textTransform: "uppercase", letterSpacing: 0.5 }}>Grid size</span>
          <select value={size} onChange={(e) => setSize(e.target.value as TokenSize)}>
            {SIZES.map((s) => (
              <option key={s.key} value={s.key}>{s.label} · {s.cells} cell{s.cells === "1×1" ? "" : "s"}</option>
            ))}
          </select>
        </label>

        <div style={{ display: "flex", justifyContent: "flex-end", gap: 8 }}>
          <button className="ghost" onClick={onClose} disabled={busy}>Cancel</button>
          <button className="primary" onClick={save} disabled={!file || busy}>
            {busy ? "Uploading…" : "Add to library"}
          </button>
        </div>
      </div>
    </Dialog>
  );
};
