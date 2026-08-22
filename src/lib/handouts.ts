/**
 * Handout templates (#0042, docs/campaign-editor.md §7).
 *
 * A handout = a template + structured fields, rendered client-side as a
 * styled in-world artifact (HandoutView). Never raw image generation — image
 * models garble text; type is typeset. The starter library is exactly the
 * five artifacts observed in Heroes of the Borderlands: letter, notice,
 * tavern menu, price sheet, services sheet.
 *
 * Fields are ONE simple shape for every template:
 *   title    — the artifact's heading (shop name, "WANTED", letter subject…)
 *   subtitle — small line under the title (est. year, location, "by decree")
 *   body     — freeform paragraph(s)
 *   lines    — one entry per row; "Item — 3 gp" splits into item/price
 *   footer   — signature, reward line, proprietor…
 * Templates interpret the same fields differently; empty fields don't render.
 */

export type HandoutTemplate = "letter" | "notice" | "menu" | "price_sheet" | "services" | "art";

export interface HandoutFields {
  title: string;
  subtitle: string;
  body: string;
  lines: string[];
  footer: string;
}

export interface HandoutMeta {
  template: HandoutTemplate;
  fields: HandoutFields;
  /** Art template only: the illustration's public URL. */
  image?: string;
}

/** The "art" template shows a picture, not typeset paper (see HandoutView). */
export const isArt = (t: HandoutTemplate): boolean => t === "art";

export const EMPTY_FIELDS: HandoutFields = { title: "", subtitle: "", body: "", lines: [], footer: "" };

export const HANDOUT_TEMPLATES: Array<{
  key: HandoutTemplate;
  label: string;
  hint: string;
  /** Per-template labels for the shared fields (empty label = field unused). */
  labels: Partial<Record<keyof HandoutFields, string>>;
  sample: HandoutFields;
}> = [
  {
    key: "letter",
    label: "Letter",
    hint: "A sealed letter or note — salutation, message, signature.",
    labels: { title: "Addressed to", body: "The message", footer: "Signed" },
    sample: {
      title: "To the strangers at the ford",
      subtitle: "",
      body: "Word travels faster than boots. If you found the skiff, you know my brother did not drown. Come to the mill after dark — and come unseen.",
      lines: [],
      footer: "— P.",
    },
  },
  {
    key: "notice",
    label: "Notice",
    hint: "A posted proclamation or wanted bill — title, decree, reward.",
    labels: { title: "Headline", subtitle: "Posted by", body: "The notice", footer: "Reward" },
    sample: {
      title: "WANTED",
      subtitle: "By order of the Castellan",
      body: "Kobold raiders have struck the river road twice this tenday. Able hands are sought to end the menace at its nest.",
      lines: [],
      footer: "Reward: 50 gold pieces, paid on proof.",
    },
  },
  {
    key: "menu",
    label: "Tavern menu",
    hint: "Fare and drink with prices — one line per item: “Ale — 4 cp”.",
    labels: { title: "Establishment", subtitle: "Tagline", lines: "Fare (one per line)", footer: "House note" },
    sample: {
      title: "The Drowned Bell",
      subtitle: "Est. before the flood",
      body: "",
      lines: ["Bottomless soup — 1 gp", "River eel pie — 6 sp", "Ale, honest — 4 cp", "Wine, questionable — 2 sp"],
      footer: "The bell rings itself. Pay it no mind.",
    },
  },
  {
    key: "price_sheet",
    label: "Price sheet",
    hint: "A merchant's goods and prices — one line per item.",
    labels: { title: "Shop", subtitle: "Proprietor", lines: "Goods (one per line)", footer: "Terms" },
    sample: {
      title: "Verdant Provisions",
      subtitle: "Prop. G. Thistledown",
      body: "",
      lines: ["Rope, 50 ft — 1 gp", "Torch, bundle of 6 — 5 sp", "Rations, one day — 5 sp", "Lantern, hooded — 5 gp"],
      footer: "No refunds once you've gone underground.",
    },
  },
  {
    key: "services",
    label: "Services",
    hint: "Temple or guild services with rates — one line per service.",
    labels: { title: "House", subtitle: "Order", lines: "Services (one per line)", footer: "Blessing" },
    sample: {
      title: "Temple of the Dawn",
      subtitle: "Order of the First Light",
      body: "",
      lines: ["Blessing of the road — 10 gp", "Cure wounds — 25 gp", "Holy water, flask — 25 gp", "Funeral rites — donation"],
      footer: "The Dawn turns no honest traveler away.",
    },
  },
  {
    key: "art",
    label: "Art / reveal",
    hint: "A full illustration to reveal to the party — an NPC's face, a location, an item. Upload, generate, or paste a URL.",
    labels: { title: "Caption", body: "Note (optional)" },
    sample: {
      title: "The one who waits at the ford",
      subtitle: "",
      body: "",
      lines: [],
      footer: "",
    },
  },
];

export const templateDef = (key: HandoutTemplate) =>
  HANDOUT_TEMPLATES.find((t) => t.key === key) ?? HANDOUT_TEMPLATES[0];

/** Parse a "Item — 3 gp" (or "Item - 3 gp") row into name + price. */
export const splitLine = (line: string): { item: string; price: string } => {
  const m = line.match(/^(.*?)\s*[—–-]\s*([^—–-]+)$/);
  return m ? { item: m[1].trim(), price: m[2].trim() } : { item: line.trim(), price: "" };
};

/** Read a doc's meta into a well-formed HandoutMeta (tolerant of junk). */
export const readHandoutMeta = (meta: unknown): HandoutMeta => {
  const m = (meta ?? {}) as Partial<HandoutMeta>;
  const f = (m.fields ?? {}) as Partial<HandoutFields>;
  return {
    template: (m.template as HandoutTemplate) ?? "letter",
    image: typeof m.image === "string" ? m.image : undefined,
    fields: {
      title: f.title ?? "",
      subtitle: f.subtitle ?? "",
      body: f.body ?? "",
      lines: Array.isArray(f.lines) ? f.lines.map(String) : [],
      footer: f.footer ?? "",
    },
  };
};
