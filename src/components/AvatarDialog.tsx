import { useRef, useState } from "react";
import type { Character } from "../types/character";
import { supabase } from "../lib/supabase";
import { buildCharacterPortraitPrompt, generateCharacterPortrait } from "../lib/classArt";
import { cropToSquareAvatar, MIN_AVATAR_PX } from "../lib/image";
import { useTokenAssets } from "../state/useTokenAssets";
import { useToast } from "../state/Toast";
import { Dialog } from "./ui/Dialog";
import { Icon } from "./ui/Icon";

/**
 * Set a character's avatar three ways — generate a bust portrait, pick from
 * the token library, or upload. The avatar IS the VTT token image, so uploads
 * are center-cropped to a square and size-checked (see lib/image), and the
 * candidate previews as a circle to match how a token renders.
 */

type Tab = "generate" | "library" | "upload";

interface Props {
  character: Character;
  onClose: () => void;
  onApply: (url: string) => void;
}

export const AvatarDialog = ({ character: c, onClose, onApply }: Props) => {
  const toast = useToast();
  const { assets } = useTokenAssets();
  const [tab, setTab] = useState<Tab>("generate");
  const [prompt, setPrompt] = useState(() => buildCharacterPortraitPrompt(c));
  const [generating, setGenerating] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [candidate, setCandidate] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement | null>(null);

  const generate = async () => {
    setGenerating(true);
    setCandidate(null);
    try {
      // Square 1:1 so it reads as a token, not a wide scene.
      const { url, error } = await generateCharacterPortrait(c, prompt);
      if (url) setCandidate(url);
      else toast.error(error ? `Couldn't generate: ${error}` : "Couldn't generate a portrait.");
    } catch (e) {
      // Never leave the button spinning if the request throws/times out.
      toast.error(e instanceof Error ? `Couldn't generate: ${e.message}` : "Couldn't generate a portrait.");
    } finally {
      setGenerating(false);
    }
  };

  const upload = async (file: File) => {
    setUploading(true);
    setCandidate(null);
    try {
      const blob = await cropToSquareAvatar(file); // throws if too small / unreadable
      const path = `character-bg/avatar-${c.id}-${Date.now()}.png`;
      const { error } = await supabase.storage.from("map-images").upload(path, blob, {
        cacheControl: "3600",
        upsert: true,
        contentType: "image/png",
      });
      if (error) {
        toast.error(
          error.message.toLowerCase().includes("row-level security")
            ? "Uploads aren't enabled yet — apply migration 0012_character_bg_upload.sql."
            : `Upload failed: ${error.message}`
        );
        return;
      }
      const { data } = supabase.storage.from("map-images").getPublicUrl(path);
      setCandidate(data.publicUrl);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Couldn't process that image.");
    } finally {
      setUploading(false);
    }
  };

  const apply = () => {
    if (!candidate) return;
    onApply(candidate);
    toast.success("Avatar updated.");
    onClose();
  };

  return (
    <Dialog onClose={onClose} size="lg" title="Change avatar" subtitle={`for ${c.name}`}>
      <div className="cbg-tabs">
        {([
          ["generate", "Generate", "sparkles"],
          ["library", "Library", "drama"],
          ["upload", "Upload", "add"],
        ] as const).map(([key, label, icon]) => (
          <button
            key={key}
            className={`cbg-tab ${tab === key ? "active" : ""}`}
            onClick={() => setTab(key)}
          >
            <Icon name={icon} size={14} />
            {label}
          </button>
        ))}
      </div>

      <div className="cbg-body">
        {tab === "generate" && (
          <div>
            <label className="cbg-label">
              Prompt <span className="dim">— pre-filled from your character; edit freely</span>
            </label>
            <textarea
              className="cbg-prompt"
              value={prompt}
              onChange={(e) => setPrompt(e.target.value)}
              rows={5}
            />
            <div className="row" style={{ gap: 8, marginTop: 8 }}>
              <button className="primary" onClick={generate} disabled={generating}>
                <Icon name="sparkles" size={14} />
                {generating ? "Generating…" : candidate ? "Regenerate" : "Generate"}
              </button>
              <button
                className="ghost"
                onClick={() => setPrompt(buildCharacterPortraitPrompt(c))}
                disabled={generating}
              >
                Reset prompt
              </button>
            </div>
          </div>
        )}

        {tab === "library" && (
          assets.length === 0 ? (
            <div className="dim" style={{ padding: "24px 4px", textAlign: "center", fontStyle: "italic", fontFamily: "var(--font-story)" }}>
              Your token library is empty. Generate one here, or create tokens in the Resources tab.
            </div>
          ) : (
            <div className="cbg-grid cbg-grid-round">
              {assets.map((a) => (
                <button
                  key={a.id}
                  className={`cbg-thumb is-round ${candidate === a.image_url ? "selected" : ""}`}
                  onClick={() => setCandidate(a.image_url)}
                  title={a.name}
                >
                  <img src={a.image_url} alt={a.name} loading="lazy" />
                </button>
              ))}
            </div>
          )
        )}

        {tab === "upload" && (
          <div
            className="cbg-drop"
            onDragOver={(e) => e.preventDefault()}
            onDrop={(e) => {
              e.preventDefault();
              const file = e.dataTransfer.files?.[0];
              if (file) void upload(file);
            }}
            onClick={() => fileRef.current?.click()}
          >
            <input
              ref={fileRef}
              type="file"
              accept="image/*"
              style={{ display: "none" }}
              onChange={(e) => {
                const file = e.target.files?.[0];
                if (file) void upload(file);
              }}
            />
            <Icon name="image" size={26} />
            <div className="cbg-drop-title">{uploading ? "Processing…" : "Drop an image, or click to choose"}</div>
            <div className="dim" style={{ fontSize: 12, maxWidth: 320 }}>
              At least {MIN_AVATAR_PX}px. It's center-cropped to a square and used
              as this character's token on the map.
            </div>
          </div>
        )}
      </div>

      <div className="cbg-foot">
        <div className="cbg-preview is-round">
          {candidate ? <img src={candidate} alt="Selected avatar" /> : <span className="dim">None</span>}
        </div>
        <div className="row" style={{ gap: 8 }}>
          <button className="ghost" onClick={onClose}>Cancel</button>
          <button className="primary" onClick={apply} disabled={!candidate}>
            Set as avatar
          </button>
        </div>
      </div>
    </Dialog>
  );
};
