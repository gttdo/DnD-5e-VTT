import { useEffect, useRef, useState } from "react";
import { Button } from "./ui/Button";
import { Icon } from "./ui/Icon";
import { LibraryBanner } from "./ui/LibraryBanner";
import { useToast } from "../state/Toast";
import { supabase } from "../lib/supabase";
import { extractPdfText } from "../lib/pdfImport";
import { loadBackgrounds } from "../data/loader";
import type { BackgroundData } from "../data/loader";
import {
  type BuilderState,
  type ImportedCharacter,
  importedToBuilderState,
} from "../lib/characterBuilder";

/**
 * Import-from-PDF character creation (#110, 4th method). The whole read happens
 * in the browser: pdf.js pulls the sheet's text, the `parse-character-pdf` edge
 * function shapes it into our builder fields, and we hand a pre-filled
 * BuilderState up to the wizard's Review step so the player confirms before
 * saving. Only text ever leaves the device.
 */

interface Props {
  onImported: (state: BuilderState, notes: string[]) => void;
  onCancel: () => void;
}

type Phase = "idle" | "reading" | "parsing" | "error";

const PHASE_LABEL: Record<Exclude<Phase, "idle" | "error">, string> = {
  reading: "Reading the PDF…",
  parsing: "Understanding your character…",
};

export const CharacterImport = ({ onImported, onCancel }: Props) => {
  const toast = useToast();
  const [phase, setPhase] = useState<Phase>("idle");
  const [error, setError] = useState<string | null>(null);
  const [dragging, setDragging] = useState(false);
  const inputRef = useRef<HTMLInputElement | null>(null);
  const backgroundsRef = useRef<Record<string, BackgroundData> | null>(null);

  // Backgrounds are needed to reconcile the sheet's final ability scores back to
  // builder "base" scores. Prefetch so the hand-off is instant.
  useEffect(() => {
    void loadBackgrounds().then((b) => {
      backgroundsRef.current = b;
    });
  }, []);

  const busy = phase === "reading" || phase === "parsing";

  const handleFile = async (file: File) => {
    if (busy) return;
    setError(null);
    if (file.type !== "application/pdf" && !file.name.toLowerCase().endsWith(".pdf")) {
      setPhase("error");
      setError("That doesn't look like a PDF. Please choose a .pdf character sheet.");
      return;
    }
    if (file.size > 25 * 1024 * 1024) {
      setPhase("error");
      setError("That PDF is over 25 MB. Try exporting a smaller sheet.");
      return;
    }

    try {
      setPhase("reading");
      const text = await extractPdfText(file);
      if (text.replace(/\s/g, "").length < 40) {
        setPhase("error");
        setError(
          "Couldn't find readable text in that PDF — it may be a scanned image. Try a D&D Beyond export or a form-fillable sheet."
        );
        return;
      }

      setPhase("parsing");
      const { data, error: fnErr } = await supabase.functions.invoke("parse-character-pdf", {
        body: { text },
      });
      if (fnErr) {
        // supabase-js collapses any non-2xx into an opaque message; the real,
        // human-friendly reason (e.g. "not a character sheet") is in the JSON body.
        let msg = fnErr.message || "The importer service failed.";
        const ctx = (fnErr as { context?: Response }).context;
        if (ctx && typeof ctx.json === "function") {
          const body = await ctx.json().catch(() => null);
          if (body?.error) msg = body.error;
        }
        throw new Error(msg);
      }
      const payload = data as { character?: ImportedCharacter; notes?: string[]; error?: string };
      if (payload?.error) throw new Error(payload.error);
      if (!payload?.character) throw new Error("The importer returned nothing usable.");

      const state = importedToBuilderState(payload.character, backgroundsRef.current);
      const notes = payload.notes ?? [];
      toast.success("Sheet imported — review the details before saving.");
      onImported(state, notes);
    } catch (e) {
      setPhase("error");
      const msg = e instanceof Error ? e.message : "Something went wrong reading that PDF.";
      setError(msg);
      toast.error(msg);
    }
  };

  const onPick = () => inputRef.current?.click();

  return (
    <div className="screen-enter" style={{ padding: 24 }}>
      <LibraryBanner
        image="/art/book_wizard.png"
        eyebrow="New Character"
        title="Import from PDF"
        subtitle="Upload a character-sheet PDF and we'll read it into a playable character for you to review."
      >
        <Button variant="ghost" size="sm" icon="back" onClick={onCancel} disabled={busy}>
          Back
        </Button>
      </LibraryBanner>

      <div style={{ maxWidth: 620, margin: "0 auto" }}>
        <div
          onClick={busy ? undefined : onPick}
          onDragOver={(e) => {
            e.preventDefault();
            if (!busy) setDragging(true);
          }}
          onDragLeave={() => setDragging(false)}
          onDrop={(e) => {
            e.preventDefault();
            setDragging(false);
            const f = e.dataTransfer.files?.[0];
            if (f) void handleFile(f);
          }}
          style={{
            border: `2px dashed ${dragging ? "var(--gold)" : "var(--border)"}`,
            borderRadius: 16,
            background: dragging ? "color-mix(in srgb, var(--gold) 8%, var(--bg-1))" : "var(--bg-1)",
            padding: "44px 24px",
            textAlign: "center",
            cursor: busy ? "default" : "pointer",
            transition: "border-color .15s, background .15s",
          }}
        >
          <input
            ref={inputRef}
            type="file"
            accept="application/pdf,.pdf"
            style={{ display: "none" }}
            onChange={(e) => {
              const f = e.target.files?.[0];
              if (f) void handleFile(f);
              e.target.value = ""; // allow re-picking the same file
            }}
          />

          {busy ? (
            <div style={{ display: "grid", gap: 10, placeItems: "center" }}>
              <div
                style={{
                  width: 56,
                  height: 56,
                  borderRadius: 14,
                  display: "grid",
                  placeItems: "center",
                  background: "color-mix(in srgb, var(--gold) 14%, transparent)",
                  color: "var(--gold)",
                  animation: "pulse-soft 1.4s ease-in-out infinite",
                }}
              >
                <Icon name="sparkles" size={26} />
              </div>
              <div style={{ fontWeight: 600 }}>{PHASE_LABEL[phase as "reading" | "parsing"]}</div>
              <div className="dim" style={{ fontSize: 12 }}>
                This takes a few seconds — don't close this window.
              </div>
            </div>
          ) : (
            <div style={{ display: "grid", gap: 12, placeItems: "center" }}>
              <div
                style={{
                  width: 56,
                  height: 56,
                  borderRadius: 14,
                  display: "grid",
                  placeItems: "center",
                  background: "color-mix(in srgb, var(--gold) 14%, transparent)",
                  color: "var(--gold)",
                }}
              >
                <Icon name="image" size={26} />
              </div>
              <div style={{ fontWeight: 600, fontSize: 16 }}>Drop a character sheet PDF here</div>
              <div className="dim" style={{ fontSize: 13, maxWidth: 360, lineHeight: 1.5 }}>
                A D&D Beyond export or any form-fillable 5e sheet works best. Scanned images
                without a text layer can't be read.
              </div>
              <Button variant="primary" size="md" icon="package" onClick={(e) => { e.stopPropagation(); onPick(); }}>
                Choose a PDF
              </Button>
            </div>
          )}
        </div>

        {error && (
          <div
            style={{
              marginTop: 16,
              padding: "12px 14px",
              borderRadius: 10,
              border: "1px solid color-mix(in srgb, var(--ember, #c0392b) 40%, var(--border))",
              background: "color-mix(in srgb, var(--ember, #c0392b) 10%, transparent)",
              fontSize: 13,
              display: "flex",
              gap: 8,
              alignItems: "flex-start",
            }}
          >
            <Icon name="alert" size={16} />
            <span>{error}</span>
          </div>
        )}

        <p className="dim" style={{ fontSize: 12, marginTop: 18, lineHeight: 1.6, textAlign: "center" }}>
          We read only the text of your PDF to fill in the builder — you'll confirm every
          detail on the next screen before the character is saved.
        </p>
      </div>
    </div>
  );
};
