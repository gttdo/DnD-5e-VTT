import { useRef, useState } from "react";
import type { Character } from "../types/character";
import { supabase } from "../lib/supabase";
import { buildCharacterScenePrompt, generateCharacterBackground } from "../lib/classArt";
import { useToast } from "../state/Toast";
import { Dialog } from "./ui/Dialog";
import { Icon } from "./ui/Icon";

/**
 * Set a character sheet's backdrop three ways: generate from an (editable,
 * pre-filled) prompt, pick a preset, or upload your own. Each tab produces a
 * candidate URL; one "Set as background" bar applies it (persists c.bgImage).
 *
 * Replaces the old one-shot "Regenerate art" button, which fired a fixed
 * prompt with no preview and no other options.
 */

const PRESETS = [
  "forest_mountain", "wizard", "paladin", "elf_hunter", "cleric_sands",
  "tavern", "ice_dragon", "fire_giant", "lich_king",
  "archer_v_kraken", "goliath_v_yeti", "warlock_v_horror",
];

type Tab = "generate" | "library" | "upload";

interface Props {
  character: Character;
  onClose: () => void;
  /** Persist the chosen URL onto the character (App owns the write). */
  onApply: (url: string) => void;
}

export const ChangeBackgroundDialog = ({ character: c, onClose, onApply }: Props) => {
  const toast = useToast();
  const [tab, setTab] = useState<Tab>("generate");
  const [prompt, setPrompt] = useState(() => buildCharacterScenePrompt(c));
  const [generating, setGenerating] = useState(false);
  const [uploading, setUploading] = useState(false);
  // The image about to be applied — set by any of the three tabs.
  const [candidate, setCandidate] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement | null>(null);

  const generate = async () => {
    setGenerating(true);
    setCandidate(null);
    const { url, error } = await generateCharacterBackground(c, prompt);
    setGenerating(false);
    if (url) setCandidate(url);
    else toast.error(error ? `Couldn't generate: ${error}` : "Couldn't generate an image.");
  };

  const upload = async (file: File) => {
    if (!file.type.startsWith("image/")) {
      toast.error("Please choose an image file.");
      return;
    }
    setUploading(true);
    setCandidate(null);
    const ext = file.name.split(".").pop()?.toLowerCase() || "png";
    const path = `character-bg/${c.id}-${Date.now()}.${ext}`;
    const { error } = await supabase.storage.from("map-images").upload(path, file, {
      cacheControl: "3600",
      upsert: true,
    });
    setUploading(false);
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
  };

  const apply = () => {
    if (!candidate) return;
    onApply(candidate);
    toast.success("Background updated.");
    onClose();
  };

  return (
    <Dialog onClose={onClose} size="lg" title="Change background" subtitle={`for ${c.name}`}>
      <div className="cbg-tabs">
        {([
          ["generate", "Generate", "sparkles"],
          ["library", "Library", "image"],
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
                onClick={() => setPrompt(buildCharacterScenePrompt(c))}
                disabled={generating}
                title="Reset the prompt to the auto-composed default"
              >
                Reset prompt
              </button>
            </div>
          </div>
        )}

        {tab === "library" && (
          <div className="cbg-grid">
            {PRESETS.map((name) => {
              const url = `/art/${name}.png`;
              return (
                <button
                  key={name}
                  className={`cbg-thumb ${candidate === url ? "selected" : ""}`}
                  onClick={() => setCandidate(url)}
                  title={name.replace(/_/g, " ")}
                >
                  <img src={url} alt={name} loading="lazy" />
                </button>
              );
            })}
          </div>
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
            <div className="cbg-drop-title">{uploading ? "Uploading…" : "Drop an image, or click to choose"}</div>
            <div className="dim" style={{ fontSize: 12 }}>Wide (21:9) images fill the sheet best.</div>
          </div>
        )}
      </div>

      {/* Candidate preview + apply — one bar for all three tabs. */}
      <div className="cbg-foot">
        <div className="cbg-preview">
          {candidate ? <img src={candidate} alt="Selected background" /> : <span className="dim">No image selected</span>}
        </div>
        <div className="row" style={{ gap: 8 }}>
          <button className="ghost" onClick={onClose}>Cancel</button>
          <button className="primary" onClick={apply} disabled={!candidate}>
            Set as background
          </button>
        </div>
      </div>
    </Dialog>
  );
};
