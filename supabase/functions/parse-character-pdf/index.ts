// parse-character-pdf — Supabase Edge Function
//
// The brain of the "Import from PDF" character-creation method (#110). The client
// reads a character-sheet PDF to plain text (pdf.js, in the browser) and posts
// that text here; we run an LLM to shape it into the fields our character builder
// understands, constrained to the exact enums the app supports (12 classes, 9
// species, 4 SRD backgrounds, the 18 skills). The client then opens the builder
// pre-filled at the Review step so the player can confirm/fix before saving.
//
// Body: { text: string }
// Returns: { character: ImportedCharacter, notes: string[] } | { error }
//
// Requires the OPENAI_API_KEY project secret. SUPABASE_URL / SUPABASE_ANON_KEY
// are provided by the runtime.

import { createClient } from "npm:@supabase/supabase-js@2";

const OPENAI_API_KEY = Deno.env.get("OPENAI_API_KEY");
const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY")!;
const MODEL = Deno.env.get("PARSE_PDF_MODEL") ?? "gpt-4o-mini";

const CORS_HEADERS: Record<string, string> = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const CLASSES = ["Barbarian", "Bard", "Cleric", "Druid", "Fighter", "Monk", "Paladin", "Ranger", "Rogue", "Sorcerer", "Warlock", "Wizard"];
const SPECIES = ["Dragonborn", "Dwarf", "Elf", "Gnome", "Goliath", "Halfling", "Human", "Orc", "Tiefling"];
const BACKGROUNDS = ["Acolyte", "Artisan", "Charlatan", "Criminal", "Entertainer", "Farmer", "Guard", "Guide", "Hermit", "Merchant", "Noble", "Sage", "Sailor", "Scribe", "Soldier", "Wayfarer"];
const SKILLS = ["Acrobatics", "Animal Handling", "Arcana", "Athletics", "Deception", "History", "Insight", "Intimidation", "Investigation", "Medicine", "Nature", "Perception", "Performance", "Persuasion", "Religion", "Sleight of Hand", "Stealth", "Survival"];

const SYSTEM = `You read the extracted contents of a Dungeons & Dragons 5e character sheet (often a D&D Beyond export or a form-fillable PDF) and return ONLY a single JSON object — no markdown, no commentary — describing that character mapped onto a fixed set of options.

The input may begin with a "PROFICIENT SKILLS:" line — a comma-separated list already resolved to canonical skill names. When present, "skillProficiencies" MUST be exactly that list (do not add or drop any based on the numeric skill modifiers, which are present for every skill regardless of proficiency).

The input may also contain a "FORM FIELDS:" section of "FieldName: value" pairs pulled from a fillable PDF's form layer — this is the AUTHORITATIVE data, use it first. Common D&D Beyond field names: CharacterName, "CLASS  LEVEL" (e.g. "Wizard 1"), RACE/SPECIES (e.g. "Rock Gnome"), BACKGROUND, STR/DEX/CON/INT/WIS/CHA (final scores), and spellName0, spellName1, … (with a "=== CANTRIPS ===" / "=== 1st LEVEL ===" spellHeader marking which are cantrips vs leveled). A "SHEET TEXT:" section may follow with the visible page text.

Return exactly this shape (ImportedCharacter):
{
  "name": string,
  "className": one of ${JSON.stringify(CLASSES)},
  "species": one of ${JSON.stringify(SPECIES)},
  "background": one of ${JSON.stringify(BACKGROUNDS)},
  "alignment"?: string,
  "abilities": { "STR": number, "DEX": number, "CON": number, "INT": number, "WIS": number, "CHA": number },
  "skillProficiencies": string[] (subset of ${JSON.stringify(SKILLS)}),
  "cantrips": string[] (canonical 5e spell names, level-0),
  "spells": string[] (canonical 5e spell names, level 1+),
  "confidence": { "className": 0..1, "species": 0..1, "background": 0..1, "abilities": 0..1 }
}

Rules:
- You MUST pick the single CLOSEST allowed value for className, species, and background even if the sheet's exact wording differs (e.g. "High Elf" -> "Elf", "Folk Hero" -> "Soldier", "Wild Magic Sorcerer" -> "Sorcerer"). Never invent a value outside the allowed lists, and NEVER leave className/species/background null — always output the closest allowed value and use the confidence score to flag a weak match.
- BACKGROUND: read the "BACKGROUND" field if present; some exports leave it blank, so also infer it from a "Background Feature" trait name, background-granted proficiencies/equipment, or any background name in the text. Map older/variant names to the closest 2024 background, e.g. "Guild Artisan"/"Guild Merchant" -> "Artisan", "Folk Hero" -> "Farmer", "Outlander" -> "Guide", "Urchin" -> "Wayfarer", "Pirate" -> "Sailor", "Knight" -> "Noble", "Spy" -> "Criminal", "Gladiator" -> "Entertainer". Never leave it null; use low confidence when the match is loose.
- "abilities" are the FINAL ability scores shown on the sheet (including any racial/background/ASI bonuses), each an integer 1-30. If a score is missing, use 10.
- For skills: if a "PROFICIENT SKILLS:" line is present, copy it verbatim. Otherwise include only skills actually marked proficient, mapped to the exact spellings in the allowed list. Never mark a skill proficient just because it has a modifier value.
- cantrips and spells: list only spells the character knows/has prepared, using canonical names (e.g. "Fire Bolt", "Cure Wounds"). Empty arrays for non-casters or if none are legible.
- Omit optional fields you can't determine. If the text is clearly not a character sheet, return {"error":"not a character sheet"}.`;

interface Body {
  text?: string;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: CORS_HEADERS });
  if (req.method !== "POST") return json({ error: "POST only" }, 405);
  if (!OPENAI_API_KEY) return json({ error: "OPENAI_API_KEY not configured" }, 500);

  const authHeader = req.headers.get("Authorization");
  if (!authHeader) return json({ error: "not authenticated" }, 401);
  const supabaseUser = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
    global: { headers: { Authorization: authHeader } },
  });
  const { data: { user }, error: userErr } = await supabaseUser.auth.getUser();
  if (userErr || !user) return json({ error: "not authenticated" }, 401);

  let body: Body;
  try {
    body = await req.json();
  } catch {
    return json({ error: "invalid json" }, 400);
  }
  const text = (body?.text ?? "").trim();
  if (!text) return json({ error: "no text extracted from the PDF — it may be a scanned image with no text layer" }, 400);
  // Guard the prompt size; character sheets are small, so a generous cap is safe.
  const clipped = text.slice(0, 24000);

  const res = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${OPENAI_API_KEY}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: MODEL,
      temperature: 0.1,
      response_format: { type: "json_object" },
      messages: [
        { role: "system", content: SYSTEM },
        { role: "user", content: `Character sheet text:\n\n${clipped}` },
      ],
    }),
  });

  if (!res.ok) {
    const detail = await res.text().catch(() => "");
    return json({ error: `OpenAI error ${res.status}`, detail: detail.slice(0, 500) }, 502);
  }

  const data = await res.json();
  const content = data?.choices?.[0]?.message?.content;
  if (!content) return json({ error: "no content from model" }, 502);

  let parsed: Record<string, unknown>;
  try {
    parsed = JSON.parse(content);
  } catch {
    return json({ error: "model returned non-JSON" }, 502);
  }
  if (parsed.error) return json({ error: String(parsed.error) }, 422);

  // Server-side clamp to the allowed enums so the client can trust the payload.
  const notes: string[] = [];
  const pickEnum = (val: unknown, allowed: string[], label: string): string | null => {
    if (typeof val === "string" && allowed.includes(val)) return val;
    notes.push(`Couldn't confidently read ${label}${typeof val === "string" ? ` ("${val}")` : ""} — please pick it.`);
    return null;
  };

  const abilitiesIn = (parsed.abilities ?? {}) as Record<string, unknown>;
  const abilities: Record<string, number> = {};
  for (const a of ["STR", "DEX", "CON", "INT", "WIS", "CHA"]) {
    const n = Number(abilitiesIn[a]);
    abilities[a] = Number.isFinite(n) ? Math.max(1, Math.min(30, Math.round(n))) : 10;
  }

  const skills = Array.isArray(parsed.skillProficiencies)
    ? (parsed.skillProficiencies as unknown[]).filter((s): s is string => typeof s === "string" && SKILLS.includes(s))
    : [];
  const cantrips = Array.isArray(parsed.cantrips)
    ? (parsed.cantrips as unknown[]).filter((s): s is string => typeof s === "string")
    : [];
  const spells = Array.isArray(parsed.spells)
    ? (parsed.spells as unknown[]).filter((s): s is string => typeof s === "string")
    : [];

  const character = {
    name: typeof parsed.name === "string" ? parsed.name.slice(0, 80) : "",
    className: pickEnum(parsed.className, CLASSES, "class"),
    species: pickEnum(parsed.species, SPECIES, "species"),
    background: pickEnum(parsed.background, BACKGROUNDS, "background"),
    alignment: typeof parsed.alignment === "string" ? parsed.alignment.slice(0, 40) : "",
    abilities,
    skillProficiencies: skills,
    cantrips,
    spells,
    confidence: (parsed.confidence ?? {}) as Record<string, number>,
  };

  return json({ character, notes });
});

function json(payload: unknown, status = 200): Response {
  return new Response(JSON.stringify(payload), {
    status,
    headers: { ...CORS_HEADERS, "Content-Type": "application/json" },
  });
}
