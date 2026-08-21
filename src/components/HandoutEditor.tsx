import { useRef, useState } from "react";
import { HANDOUT_TEMPLATES, readHandoutMeta, templateDef, type HandoutFields, type HandoutMeta, type HandoutTemplate } from "../lib/handouts";
import { presetsFor, samplePool } from "../lib/shopGoods";
import { HandoutView } from "./HandoutView";
import type { CampaignDoc } from "../state/useCampaign";

/**
 * The handout editor body (#0042) — fields on the left, the living artifact
 * on the right. Placeholders carry each template's sample so the DM always
 * sees what good looks like without inheriting text they didn't write.
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
      </div>

      <div className="handout-preview">
        {/* Empty fields preview the sample so the artifact never looks broken */}
        <HandoutView
          meta={
            meta.fields.title || meta.fields.body || meta.fields.lines.some((l) => l.trim()) || meta.fields.footer
              ? meta
              : { template: meta.template, fields: def.sample }
          }
          compact
        />
      </div>
    </div>
  );
};
