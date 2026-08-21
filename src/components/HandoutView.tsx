import { readHandoutMeta, splitLine, type HandoutMeta } from "../lib/handouts";

/**
 * Renders a handout as its in-world artifact (#0042) — light paper against
 * the app's dark ground, typeset client-side so the text stays crisp and
 * editable. One component, used everywhere a handout appears: the editor's
 * live preview, the Story drawer, and the Present overlay.
 */

export const HandoutView = ({ meta, compact = false }: { meta: unknown; compact?: boolean }) => {
  const { template, fields }: HandoutMeta = readHandoutMeta(meta);
  const rows = fields.lines.map(splitLine).filter((r) => r.item);

  return (
    <div className={`handout handout--${template} ${compact ? "is-compact" : ""}`}>
      {template === "letter" ? (
        <>
          {fields.title && <div className="handout-salutation">{fields.title}</div>}
          {fields.body && <div className="handout-script">{fields.body}</div>}
          {fields.footer && <div className="handout-signature">{fields.footer}</div>}
        </>
      ) : (
        <>
          {fields.title && <div className="handout-title">{fields.title}</div>}
          {fields.subtitle && <div className="handout-subtitle">{fields.subtitle}</div>}
          {(fields.title || fields.subtitle) && (rows.length > 0 || fields.body) && <div className="handout-rule" />}
          {fields.body && <div className="handout-body">{fields.body}</div>}
          {rows.length > 0 && (
            <div className="handout-lines">
              {rows.map((r, i) => (
                <div className="handout-line" key={i}>
                  <span className="handout-item">{r.item}</span>
                  {r.price && <span className="handout-dots" aria-hidden="true" />}
                  {r.price && <span className="handout-price">{r.price}</span>}
                </div>
              ))}
            </div>
          )}
          {fields.footer && <div className="handout-footer">{fields.footer}</div>}
        </>
      )}
    </div>
  );
};
