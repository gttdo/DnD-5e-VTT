// generate-statblock — Supabase Edge Function
//
// The "generate" half of the token studio's stat pipeline (the "lookup" half is
// the bundled SRD bestiary, done client-side). When a creature/NPC/item isn't
// found, the client calls this to draft structured details the DM then edits.
//
// Body: { kind: "monster" | "npc" | "item", name: string, description?: string,
//         cr?: string, size?: string, rarity?: string }
// Returns: { details: <MonsterStatblock | NpcProfile | MagicItem> } | { error }
//
// Guidance the model is held to: for a KNOWN SRD creature, use its real 2024
// stats; otherwise invent balanced, CR-appropriate numbers by the rules. Output
// game statistics (facts) and ORIGINAL / paraphrased prose only — never copy
// descriptive text from a published book. JSON only.
//
// Requires the OPENAI_API_KEY project secret. SUPABASE_URL / SUPABASE_ANON_KEY
// are provided by the runtime.

import { createClient } from "npm:@supabase/supabase-js@2";

const OPENAI_API_KEY = Deno.env.get("OPENAI_API_KEY");
const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY")!;
const MODEL = Deno.env.get("STATBLOCK_MODEL") ?? "gpt-4o-mini";

const CORS_HEADERS: Record<string, string> = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

type Kind = "monster" | "npc" | "item";

interface Body {
  kind: Kind;
  name: string;
  description?: string;
  cr?: string;
  size?: string;
  rarity?: string;
}

const SHARED_RULES = `You are a Dungeons & Dragons 2024 (5.5e) rules assistant that outputs ONLY a single JSON object — no markdown, no commentary.
Hard rules:
- If the named subject is a well-known SRD creature/item, use its correct, official statistics.
- Otherwise invent original, balanced statistics appropriate to the request, following 2024 encounter-building math.
- Output game STATISTICS (numbers) and ORIGINAL prose only. Never copy descriptive or flavor text from any published book; paraphrase in your own words and keep it brief.
- Ability scores are 1-30. Attack bonuses, save DCs, and damage must be internally consistent with the ability scores and proficiency/CR.
- Omit fields you don't need rather than inventing filler.`;

const MONSTER_SHAPE = `Return this shape (a MonsterStatblock):
{
  "name": string, "size": "tiny"|"small"|"medium"|"large"|"huge"|"gargantuan",
  "type": string, "subtype"?: string, "alignment"?: string,
  "ac": number, "acNote"?: string, "hp": number, "hitDice"?: string,
  "speed": { "walk"?: number, "fly"?: number, "swim"?: number, "climb"?: number, "burrow"?: number },
  "abilities": { "STR": number, "DEX": number, "CON": number, "INT": number, "WIS": number, "CHA": number },
  "saves"?: { "STR"?: number, ... }, "skills"?: [{ "name": string, "bonus": number }],
  "damageResistances"?: string[], "damageImmunities"?: string[], "damageVulnerabilities"?: string[],
  "conditionImmunities"?: string[], "senses"?: string[], "languages"?: string[],
  "cr": string, "proficiencyBonus"?: number,
  "traits"?: [{ "name": string, "text": string }],
  "actions"?: [{ "name": string, "text"?: string, "attackBonus"?: number, "reach"?: string, "damage"?: string, "damageType"?: string, "saveDc"?: number, "saveAbility"?: "STR"|"DEX"|"CON"|"INT"|"WIS"|"CHA" }],
  "bonusActions"?: [{ "name", "text" }], "reactions"?: [{ "name", "text" }],
  "legendaryActions"?: [{ "name", "text" }], "legendaryCount"?: number, "description"?: string
}`;

const NPC_SHAPE = `Return this shape (an NpcProfile):
{
  "name": string, "ancestry"?: string, "role"?: string, "appearance"?: string,
  "personalityTrait"?: string, "ideal"?: string, "bond"?: string, "flaw"?: string,
  "voice"?: string, "motivation"?: string, "secret"?: string, "description"?: string
}
Write vivid but concise, table-ready prose. secret is DM-facing.`;

const ITEM_SHAPE = `Return this shape (a MagicItem):
{
  "name": string, "itemType": string, "rarity": "common"|"uncommon"|"rare"|"very rare"|"legendary"|"artifact",
  "attunement"?: boolean, "attunementNote"?: string, "description": string,
  "damage"?: string, "damageType"?: string, "properties"?: string[], "armorClass"?: string,
  "charges"?: { "max": number, "recharge"?: string }, "weight"?: number, "cost"?: string
}`;

const shapeFor = (kind: Kind) =>
  kind === "monster" ? MONSTER_SHAPE : kind === "npc" ? NPC_SHAPE : ITEM_SHAPE;

const userPrompt = (b: Body): string => {
  const parts = [`Subject: ${b.name}`];
  if (b.description) parts.push(`Description/notes: ${b.description}`);
  if (b.cr) parts.push(`Target challenge rating: ${b.cr}`);
  if (b.size) parts.push(`Size: ${b.size}`);
  if (b.rarity) parts.push(`Rarity: ${b.rarity}`);
  return parts.join("\n");
};

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
  if (!body?.name?.trim()) return json({ error: "name required" }, 400);
  if (!["monster", "npc", "item"].includes(body.kind)) return json({ error: "invalid kind" }, 400);

  const system = `${SHARED_RULES}\n\n${shapeFor(body.kind)}`;

  const res = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${OPENAI_API_KEY}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: MODEL,
      temperature: 0.6,
      response_format: { type: "json_object" },
      messages: [
        { role: "system", content: system },
        { role: "user", content: userPrompt(body) },
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

  let details: unknown;
  try {
    details = JSON.parse(content);
  } catch {
    return json({ error: "model returned non-JSON" }, 502);
  }

  return json({ details });
});

function json(payload: unknown, status = 200): Response {
  return new Response(JSON.stringify(payload), {
    status,
    headers: { ...CORS_HEADERS, "Content-Type": "application/json" },
  });
}
