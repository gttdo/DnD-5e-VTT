// Client-side PDF → text (#110, Import-from-PDF).
//
// A character-sheet PDF is read entirely in the browser: we pull out everything
// legible and hand it to the `parse-character-pdf` edge function, which runs an
// LLM to shape it into our builder state. Nothing but text leaves the device, and
// pdf.js is a ~1 MB dependency so it's imported lazily.
//
// Crucially, a D&D Beyond export (the most common import) is a FILLABLE FORM: the
// visible text layer holds only the blank template's captions ("STRENGTH",
// "CLASS & LEVEL"…), while the values the player typed live in the AcroForm
// field layer. So we read BOTH — the filled form fields (high-signal, e.g.
// "CharacterName: Leopold", "spellName0: Mage Hand") and the visible text.
//
// Skill proficiency is a special case: D&D Beyond stores it as a SEPARATE marker
// field per skill ("ArcanaProf: P", "AthleticsProf": empty). Correlating those
// with the right skill is too fragile to leave to the model, so we detect them
// deterministically here and hand over an explicit "PROFICIENT SKILLS:" line.

// Canonical skill names, keyed by a normalized (letters-only, lowercase) form so
// a marker prefix like "SleightOfHand" or "AnimalHandling" resolves cleanly.
const SKILL_NAMES = [
  "Acrobatics", "Animal Handling", "Arcana", "Athletics", "Deception", "History",
  "Insight", "Intimidation", "Investigation", "Medicine", "Nature", "Perception",
  "Performance", "Persuasion", "Religion", "Sleight of Hand", "Stealth", "Survival",
];
const normKey = (s: string): string => s.toLowerCase().replace(/[^a-z]/g, "");
const SKILL_BY_KEY: Record<string, string> = {};
for (const s of SKILL_NAMES) SKILL_BY_KEY[normKey(s)] = s;

/**
 * Extract everything legible from a character-sheet PDF: deterministically
 * detected proficient skills first, then filled form-field values (the real data
 * on a fillable sheet), then the visible text layer (which carries the data on a
 * flat/printed sheet). Pure image scans return little of either — the caller
 * flags that as "couldn't read it".
 */
export const extractPdfText = async (file: File): Promise<string> => {
  // Lazy so pdf.js only loads for the import flow, not the whole app.
  const pdfjs = await import("pdfjs-dist");
  // Vite resolves this to a hashed URL for the worker bundle.
  const workerUrl = (await import("pdfjs-dist/build/pdf.worker.min.mjs?url")).default;
  pdfjs.GlobalWorkerOptions.workerSrc = workerUrl;

  const buf = await file.arrayBuffer();
  const doc = await pdfjs.getDocument({ data: buf }).promise;

  const fieldLines: string[] = [];
  const seenFields = new Set<string>();
  const proficientSkills = new Set<string>();
  const textBlocks: string[] = [];

  for (let i = 1; i <= doc.numPages; i++) {
    const page = await doc.getPage(i);

    // 1) Filled form fields — the real values on a D&D Beyond / fillable sheet.
    try {
      const annotations = await page.getAnnotations();
      for (const a of annotations as Array<{ fieldName?: string; fieldValue?: unknown }>) {
        const name = a.fieldName?.trim();
        const value = a.fieldValue == null ? "" : String(a.fieldValue).replace(/\s+/g, " ").trim();

        // A "<Skill>Prof" marker with any non-empty, non-"Off" value = proficient.
        const profMatch = name?.match(/^(.*)Prof$/i);
        if (profMatch && value && value.toLowerCase() !== "off") {
          const canon = SKILL_BY_KEY[normKey(profMatch[1])];
          if (canon) {
            proficientSkills.add(canon);
            continue; // marker captured — don't dump it as a raw field line
          }
        }

        if (!name || !value || value === "Off") continue; // skip empty + unchecked boxes
        const key = `${name}=${value}`;
        if (seenFields.has(key)) continue; // fields can repeat across pages
        seenFields.add(key);
        fieldLines.push(`${name}: ${value}`);
      }
    } catch {
      /* no form layer on this page — fine */
    }

    // 2) Visible text layer — carries the data on a flat/printed sheet.
    const content = await page.getTextContent();
    const line = content.items
      .map((it) => ("str" in it ? it.str : ""))
      .join(" ")
      .replace(/\s+/g, " ")
      .trim();
    if (line) textBlocks.push(line);
  }
  await doc.destroy();

  const parts: string[] = [];
  if (proficientSkills.size) {
    parts.push(`PROFICIENT SKILLS: ${Array.from(proficientSkills).join(", ")}`);
  }
  if (fieldLines.length) parts.push(`FORM FIELDS:\n${fieldLines.join("\n")}`);
  if (textBlocks.length) parts.push(`SHEET TEXT:\n${textBlocks.join("\n\n")}`);
  return parts.join("\n\n");
};
