import { useRef, useState } from "react";
import { HANDOUT_TEMPLATES, readHandoutMeta, templateDef, type HandoutFields, type HandoutMeta, type HandoutTemplate } from "../lib/handouts";
import { presetsFor, samplePool } from "../lib/shopGoods";
import { generateArt, uploadArt, type ArtAspect } from "../lib/art";
import { useToast } from "../state/Toast";
import { HandoutView } from "./HandoutView";
import type { CampaignDoc } from "../state/useCampaign";

/**
 * The handout editor body (#0042) — fields on the left, the living artifact
 * on the right. Placeholders carry each template's sample so the DM always
 * sees what good looks like without inheriting text they didn't write.
 *
 * The "art" template is different in kind: the artifact is a picture, so its
 * form is an image picker (upload / generate / paste) plus a caption, not the
 * typeset text fields.
 */

export const HandoutDocBody = ({
  doc,
  updateDoc,
}: {
  doc: CampaignDoc;
  updateDoc: (id: string, patch: { meta: Record<string, unknown> }) => Promise<{ error: string | null }>;
}) => {
  const [meta, setMeta] = useState<HandoutMeta>(() => readHandoutMeta(doc.meta));
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const save = (next: HandoutMeta) => {
    setMeta(next);
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => {
      void updateDoc(doc.id, { meta: next as unknown as Record<string, unknown> });
    }, 900);
  };
  // Image changes should persist immediately — no reason to debounce a click.
  const saveNow = (next: HandoutMeta) => {
    setMeta(next);
    if (timer.current) clearTimeout(timer.current);
    void updateDoc(doc.id, { meta: next as unknown as Record<string, unknown> });
  };
  const setTemplate = (template: HandoutTemplate) => save({ ...meta, template });
  const setField = (key: keyof HandoutFields, value: string | string[]) =>
    save({ ...meta, fields: { ...meta.fields, [key]: value } });

  const def = templateDef(meta.template);
  const label = (k: keyof HandoutFields) => def.labels[k];

  return (
    <div className="handout-editor">
      <div className="handout-form">
        <select
          className="handout-template-sel"
          value={meta.template}
          onChange={(e) => setTemplate(e.target.value as HandoutTemplate)}
          title={def.hint}
        >
          {HANDOUT_TEMPLATES.map((t) => (
            <option key={t.key} value={t.key}>
              {t.label}
            </option>
          ))}
        </select>

        {meta.template === "art" ? (
          <ArtForm
            gameId={doc.game_id}
            image={meta.image}
            onImage={(url) => saveNow({ ...meta, image: url })}
            caption={meta.fields.title}
            note={meta.fields.body}
            onCaption={(v) => setField("title", v)}
            onNote={(v) => setField("body", v)}
            captionPlaceholder={def.sample.title}
          />
        ) : (
          <>
            {label("title") && (
              <label className="handout-field">
                <span>{label("title")}</span>
                <input value={meta.fields.title} placeholder={def.sample.title} onChange={(e) => setField("title", e.target.value)} />
              </label>
            )}
            {label("subtitle") && (
              <label className="handout-field">
                <span>{label("subtitle")}</span>
                <input value={meta.fields.subtitle} placeholder={def.sample.subtitle} onChange={(e) => setField("subtitle", e.target.value)} />
              </label>
            )}
            {label("body") && (
              <label className="handout-field">
                <span>{label("body")}</span>
                <textarea rows={3} value={meta.fields.body} placeholder={def.sample.body} onChange={(e) => setField("body", e.target.value)} />
              </label>
            )}
            {label("lines") && (
              <label className="handout-field">
                <span>{label("lines")}</span>
                <textarea
                  rows={4}
                  value={meta.fields.lines.join("\n")}
                  placeholder={def.sample.lines.join("\n")}
                  onChange={(e) => setField("lines", e.target.value.split("\n"))}
                />
              </label>
            )}
            {label("lines") && presetsFor(meta.template).length > 0 && (
              <div className="handout-fillrow">
                {presetsFor(meta.template).map((p) => (
                  <button
                    key={p.key}
                    type="button"
                    title={`Stock the sheet with ${p.label.toLowerCase()} at book prices — prune and reprice freely`}
                    onClick={() =>
                      save({
                        ...meta,
                        fields: {
                          ...meta.fields,
                          lines: samplePool(p),
                          footer: meta.fields.footer || p.footer,
                        },
                      })
                    }
                  >
                    ⚒ Fill: {p.label}
                  </button>
                ))}
              </div>
            )}
            {label("footer") && (
              <label className="handout-field">
                <span>{label("footer")}</span>
                <input value={meta.fields.footer} placeholder={def.sample.footer} onChange={(e) => setField("footer", e.target.value)} />
              </label>
            )}
          </>
        )}
      </div>

      <div className="handout-preview">
        {/* Empty text fields preview the sample so the artifact never looks broken.
            Art previews itself (the empty state shows a placeholder). */}
        <HandoutView
          meta={
            meta.template === "art" ||
            meta.fields.title ||
            meta.fields.body ||
            meta.fields.lines.some((l) => l.trim()) ||
            meta.fields.footer
              ? meta
              : { template: meta.template, fields: def.sample }
          }
          compact
        />
      </div>
    </div>
  );
};

// ============================================================================
const ART_ASPECTS: Array<{ key: ArtAspect; label: string }> = [
  { key: "portrait", label: "Portrait" },
  { key: "landscape", label: "Scene" },
  { key: "square", label: "Square" },
];

const ArtForm = ({
  gameId,
  image,
  onImage,
  caption,
  note,
  onCaption,
  onNote,
  captionPlaceholder,
}: {
  gameId: string;
  image?: string;
  onImage: (url: string) => void;
  caption: string;
  note: string;
  onCaption: (v: string) => void;
  onNote: (v: string) => void;
  captionPlaceholder: string;
}) => {
  const toast = useToast();
  const fileRef = useRef<HTMLInputElement | null>(null);
  const [prompt, setPrompt] = useState("");
  const [aspect, setAspect] = useState<ArtAspect>("portrait");
  const [busy, setBusy] = useState<"upload" | "generate" | null>(null);
  const [urlDraft, setUrlDraft] = useState("");

  const doUpload = async (file: File) => {
    setBusy("upload");
    try {
      onImage(await uploadArt(file, gameId));
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Upload failed.");
    } finally {
      setBusy(null);
    }
  };

  const doGenerate = async () => {
    if (!prompt.trim()) return;
    setBusy("generate");
    try {
      onImage(await generateArt(prompt.trim(), aspect));
    } catch (e) {
      toast.error(e instanceof Error ? `Couldn't generate: ${e.message}` : "Couldn't generate art.");
    } finally {
      setBusy(null);
    }
  };

  return (
    <>
      <div className="handout-artctl">
        <input
          ref={fileRef}
          type="file"
          accept="image/*"
          hidden
          onChange={(e) => {
            const f = e.target.files?.[0];
            if (f) void doUpload(f);
            e.target.value = "";
          }}
        />
        <button type="button" className="handout-artbtn" disabled={busy !== null} onClick={() => fileRef.current?.click()}>
          {busy === "upload" ? "Uploading…" : "⤒ Upload image"}
        </button>
        {image && (
          <button type="button" className="handout-artbtn is-ghost" disabled={busy !== null} onClick={() => onImage("")}>
            Remove
          </button>
        )}
      </div>

      <label className="handout-field">
        <span>Generate from a prompt</span>
        <textarea
          rows={2}
          value={prompt}
          placeholder="A weathered ferryman with a lantern, hood up, standing at a foggy river crossing at dusk"
          onChange={(e) => setPrompt(e.target.value)}
        />
      </label>
      <div className="handout-artctl">
        <select className="handout-aspect" value={aspect} onChange={(e) => setAspect(e.target.value as ArtAspect)}>
          {ART_ASPECTS.map((a) => (
            <option key={a.key} value={a.key}>
              {a.label}
            </option>
          ))}
        </select>
        <button type="button" className="handout-artbtn" disabled={busy !== null || !prompt.trim()} onClick={() => void doGenerate()}>
          {busy === "generate" ? "Painting…" : "✦ Generate"}
        </button>
      </div>

      <label className="handout-field">
        <span>Or paste an image URL</span>
        <div className="handout-artctl">
          <input value={urlDraft} placeholder="https://…" onChange={(e) => setUrlDraft(e.target.value)} />
          <button
            type="button"
            className="handout-artbtn is-ghost"
            disabled={!urlDraft.trim()}
            onClick={() => {
              onImage(urlDraft.trim());
              setUrlDraft("");
            }}
          >
            Use
          </button>
        </div>
      </label>

      <label className="handout-field">
        <span>Caption</span>
        <input value={caption} placeholder={captionPlaceholder} onChange={(e) => onCaption(e.target.value)} />
      </label>
      <label className="handout-field">
        <span>Note (optional)</span>
        <input value={note} placeholder="A line shown under the art" onChange={(e) => onNote(e.target.value)} />
      </label>
    </>
  );
};
