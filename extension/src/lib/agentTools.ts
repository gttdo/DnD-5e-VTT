/**
 * Tools the AI DM can call. Each tool ships:
 *   - schema: the Anthropic tool definition (name, description, input schema)
 *   - run(input): the JS implementation; returns a string of tool output
 *     formatted for the model to read
 *
 * Tools intentionally return plain text (not JSON) — Claude reads the
 * output as if a player had read aloud a card, and the model handles
 * any presentation. Keeps prompt overhead low.
 *
 * The data the tools draw on lives in /public/data and is fetched
 * lazily on first use, then cached in a module-level map.
 */

export interface ToolSchema {
  name: string;
  description: string;
  input_schema: {
    type: "object";
    properties: Record<string, unknown>;
    required?: string[];
  };
}

export interface ToolCall {
  name: string;
  input: Record<string, unknown>;
}

export interface ToolResult {
  name: string;
  output: string;
  is_error?: boolean;
}

// ---------------------------------------------------------------------------
// Data loaders (lazy, cached)
// ---------------------------------------------------------------------------

const dataCache = new Map<string, unknown>();

const loadData = async <T>(file: string): Promise<T> => {
  if (dataCache.has(file)) return dataCache.get(file) as T;
  const url = chrome.runtime.getURL(`public/data/${file}`);
  const res = await fetch(url);
  if (!res.ok) throw new Error(`failed to load ${file}: ${res.status}`);
  const data = await res.json();
  dataCache.set(file, data);
  return data as T;
};

interface MonsterRow {
  name: string;
  cr: string;
  xp: number;
  type: string;
  size: string;
}

interface ConditionEntry {
  name: string;
  description: string;
}

interface SpellEntry {
  name: string;
  level: number;
  school: string;
  classes: string[];
  casting_time?: string;
  range?: string;
  components?: string;
  duration?: string;
  description?: string;
  ritual?: boolean;
  concentration?: boolean;
}

interface NameTables {
  [theme: string]: { first?: string[]; last?: string[]; full?: string[] };
}

// ---------------------------------------------------------------------------
// Tool: roll_dice
// ---------------------------------------------------------------------------

const rollOne = (sides: number): number => Math.floor(Math.random() * sides) + 1;

const runRollDice = ({ expression, label }: { expression: string; label?: string }): string => {
  const m = expression.replace(/\s+/g, "").match(/^(\d+)d(\d+)([+-]\d+)?$/i);
  if (!m) return `Invalid dice expression "${expression}". Use NdM+K, e.g. 1d20+5.`;
  const count = parseInt(m[1], 10);
  const sides = parseInt(m[2], 10);
  const modifier = m[3] ? parseInt(m[3], 10) : 0;
  if (count < 1 || count > 100 || sides < 2 || sides > 1000) {
    return `Refused: keep dice between 1d2 and 100d1000.`;
  }
  const rolls = Array.from({ length: count }, () => rollOne(sides));
  const sum = rolls.reduce((a, b) => a + b, 0);
  const total = sum + modifier;
  const tag = label ? `${label}: ` : "";
  const modText = modifier ? ` ${modifier >= 0 ? "+" : ""}${modifier}` : "";
  return `${tag}${expression} → [${rolls.join(", ")}]${modText} = **${total}**`;
};

// ---------------------------------------------------------------------------
// Tool: lookup_condition
// ---------------------------------------------------------------------------

const runLookupCondition = async ({ name }: { name: string }): Promise<string> => {
  const raw = await loadData<unknown>("conditions.json");
  let conds: ConditionEntry[] = [];
  if (Array.isArray(raw)) {
    conds = raw as ConditionEntry[];
  } else if (raw && typeof raw === "object") {
    // Either { conditions: [...] } or { [name]: description }
    const obj = raw as Record<string, unknown>;
    if (Array.isArray(obj.conditions)) {
      conds = obj.conditions as ConditionEntry[];
    } else {
      conds = Object.entries(obj).map(([k, v]) => ({
        name: k,
        description: typeof v === "string" ? v : JSON.stringify(v),
      }));
    }
  }
  const needle = name.toLowerCase();
  const hit = conds.find((c) => c.name.toLowerCase() === needle);
  if (!hit) {
    const close = conds
      .filter((c) => c.name.toLowerCase().includes(needle) || needle.includes(c.name.toLowerCase()))
      .slice(0, 5)
      .map((c) => c.name)
      .join(", ");
    return `No exact match for condition "${name}". ${close ? `Did you mean: ${close}?` : "Try Blinded, Charmed, Frightened, Grappled, Prone, etc."}`;
  }
  return `**${hit.name}**\n${hit.description}`;
};

// ---------------------------------------------------------------------------
// Tool: lookup_spell
// ---------------------------------------------------------------------------

const runLookupSpell = async ({ name }: { name: string }): Promise<string> => {
  const data = await loadData<{ spells?: SpellEntry[] } | SpellEntry[]>("spells.json");
  const list = Array.isArray(data) ? data : (data.spells ?? []);
  const needle = name.toLowerCase();
  const hit = list.find((s) => s.name.toLowerCase() === needle);
  if (!hit) {
    const close = list
      .filter((s) => s.name.toLowerCase().includes(needle))
      .slice(0, 5)
      .map((s) => s.name)
      .join(", ");
    return `No exact match for spell "${name}". ${close ? `Did you mean: ${close}?` : ""}`;
  }
  const lv = hit.level === 0 ? "Cantrip" : `Level ${hit.level}`;
  const tags: string[] = [];
  if (hit.ritual) tags.push("ritual");
  if (hit.concentration) tags.push("concentration");
  const tagLine = tags.length ? ` (${tags.join(", ")})` : "";
  const parts = [
    `**${hit.name}** — ${lv} ${hit.school}${tagLine}`,
    hit.casting_time && `Cast: ${hit.casting_time}`,
    hit.range && `Range: ${hit.range}`,
    hit.components && `Components: ${hit.components}`,
    hit.duration && `Duration: ${hit.duration}`,
    hit.classes && `Classes: ${hit.classes.join(", ")}`,
    hit.description,
  ].filter(Boolean) as string[];
  return parts.join("\n");
};

// ---------------------------------------------------------------------------
// Tool: roll_encounter
// ---------------------------------------------------------------------------

const runRollEncounter = async ({
  party_level,
  party_size = 4,
  difficulty = "moderate",
  theme,
}: {
  party_level: number;
  party_size?: number;
  difficulty?: "low" | "moderate" | "high";
  theme?: string;
}): Promise<string> => {
  if (party_level < 1 || party_level > 20) return "party_level must be 1–20.";
  if (party_size < 1 || party_size > 8) return "party_size must be 1–8.";

  // 2024 DMG XP-per-character thresholds (per character, per difficulty).
  // Hardcoded so we don't need the file lookup to work.
  const PER_CHAR_BUDGETS: Record<number, [number, number, number]> = {
    1: [50, 75, 100], 2: [100, 150, 200], 3: [150, 225, 400], 4: [250, 375, 500],
    5: [500, 750, 1100], 6: [600, 1000, 1400], 7: [750, 1300, 1700], 8: [1000, 1700, 2100],
    9: [1300, 2000, 2600], 10: [1600, 2300, 3100], 11: [1900, 2900, 4100], 12: [2200, 3700, 4700],
    13: [2600, 4200, 5400], 14: [2900, 4900, 6200], 15: [3300, 5400, 7800], 16: [3800, 6100, 9800],
    17: [4500, 7200, 11700], 18: [5000, 8700, 14200], 19: [5500, 10700, 17200], 20: [6400, 13200, 22000],
  };

  const idx = difficulty === "low" ? 0 : difficulty === "high" ? 2 : 1;
  const perChar = PER_CHAR_BUDGETS[party_level][idx];
  const totalBudget = perChar * party_size;

  // Load monsters and pick within budget. Filter by theme if provided.
  const monsters = await loadData<{ monsters: MonsterRow[] }>("monsters.json");
  let pool = monsters.monsters;
  if (theme) {
    const t = theme.toLowerCase();
    pool = pool.filter(
      (m) =>
        m.type.toLowerCase().includes(t) ||
        m.name.toLowerCase().includes(t) ||
        m.size.toLowerCase() === t
    );
    if (pool.length === 0) {
      // Fall back to whole pool if theme filter empty.
      pool = monsters.monsters;
    }
  }

  // Greedy fill: try to land within 70%-100% of budget.
  // Strategy: shuffle pool, take monsters in order until adding the next
  // would exceed budget; pad with weaker ones if we're way under.
  const shuffled = [...pool].sort(() => Math.random() - 0.5);
  const picks: { monster: MonsterRow; count: number }[] = [];
  let spent = 0;
  const targetMin = totalBudget * 0.7;
  const targetMax = totalBudget * 1.05;

  for (const m of shuffled) {
    if (spent >= targetMin && Math.random() < 0.5) break;
    const remaining = targetMax - spent;
    const maxOfThis = Math.floor(remaining / m.xp);
    if (maxOfThis < 1) continue;
    // Prefer 1-3 of a kind for variety.
    const want = Math.min(maxOfThis, 1 + Math.floor(Math.random() * 3));
    picks.push({ monster: m, count: want });
    spent += m.xp * want;
    if (picks.length >= 4) break;
  }

  if (picks.length === 0) {
    return `No monsters fit the budget. Try a different difficulty or theme.`;
  }

  const lines = picks.map(
    (p) =>
      `- ${p.count}× **${p.monster.name}** (CR ${p.monster.cr}, ${p.monster.type}, ${p.monster.size}) — ${p.monster.xp * p.count} XP`
  );

  const partySummary = `Party L${party_level} × ${party_size} · ${difficulty} budget = ${totalBudget} XP`;
  return `${partySummary}\nEncounter (${spent} XP, ${Math.round((spent / totalBudget) * 100)}%):\n${lines.join("\n")}\n\nReminder: 5+ enemies = mob; consider mob attack rules. Telegraph any spell components.`;
};

// ---------------------------------------------------------------------------
// Tool: generate_npc
// ---------------------------------------------------------------------------

const runGenerateNpc = async ({
  theme = "standard",
  role,
}: {
  theme?: "standard" | "esoteric" | "mundane" | "strong" | "sinister" | "whimsical";
  role?: string;
}): Promise<string> => {
  const names = await loadData<NameTables>("names.json");
  const themeKey = theme in names ? theme : "standard" in names ? "standard" : Object.keys(names)[0];
  const tbl = names[themeKey] ?? {};
  const pick = <T>(arr: T[] | undefined): T | null =>
    !arr || arr.length === 0 ? null : arr[Math.floor(Math.random() * arr.length)];

  let fullName = pick(tbl.full);
  if (!fullName) {
    const f = pick(tbl.first);
    const l = pick(tbl.last);
    fullName = [f, l].filter(Boolean).join(" ") || "Unnamed Stranger";
  }

  // Traits — small fixed list, randomized to give the model seeds.
  const VOICES = ["gruff", "lilting", "clipped", "honey-warm", "rasping", "monotone", "musical"];
  const QUIRKS = [
    "constantly cleans their nails with a knife",
    "ends every sentence with a question",
    "mistakes the players for someone they once knew",
    "smells faintly of woodsmoke",
    "keeps a small bird on their shoulder",
    "speaks in slightly anachronistic proverbs",
    "writes everything down in a battered ledger",
    "looks past the speaker, never at them",
  ];
  const SECRETS = [
    "owes money to someone dangerous",
    "is in love with someone they shouldn't be",
    "is much older than they appear",
    "has a sibling on the other side of this conflict",
    "stole something small and significant from a recent encounter",
    "is the only one who knows a thing the party badly needs",
  ];

  const voice = VOICES[Math.floor(Math.random() * VOICES.length)];
  const quirk = QUIRKS[Math.floor(Math.random() * QUIRKS.length)];
  const secret = SECRETS[Math.floor(Math.random() * SECRETS.length)];

  return [
    `**${fullName}**${role ? ` (${role})` : ""}`,
    `Voice: ${voice}.`,
    `Quirk: ${quirk}.`,
    `Secret: ${secret}.`,
    `Theme: ${themeKey}.`,
  ].join("\n");
};

// ---------------------------------------------------------------------------
// Tool: set_dc
// ---------------------------------------------------------------------------

const runSetDc = ({
  difficulty,
}: {
  difficulty: "very_easy" | "easy" | "medium" | "hard" | "very_hard" | "nearly_impossible";
}): string => {
  const TABLE = {
    very_easy: 5, easy: 10, medium: 15, hard: 20, very_hard: 25, nearly_impossible: 30,
  };
  const dc = TABLE[difficulty];
  if (dc == null) return `Unknown difficulty "${difficulty}". Use very_easy / easy / medium / hard / very_hard / nearly_impossible.`;
  return `DC ${dc} (${difficulty.replace("_", " ")})`;
};

// ---------------------------------------------------------------------------
// Registry
// ---------------------------------------------------------------------------

export const TOOL_SCHEMAS: ToolSchema[] = [
  {
    name: "roll_dice",
    description:
      "Roll dice and return the result. Use this for adjudicating any chance outcome the DM didn't already give you — improvised damage, random encounters, NPC reactions, save-or-suck effects. ALWAYS use this rather than describing a roll abstractly.",
    input_schema: {
      type: "object",
      properties: {
        expression: { type: "string", description: 'Dice notation, e.g. "1d20+5", "4d6", "2d8+3"' },
        label: { type: "string", description: "Short label for the roll, shown in the result." },
      },
      required: ["expression"],
    },
  },
  {
    name: "set_dc",
    description:
      "Convert a difficulty descriptor into the canonical DC from the 2024 DMG table. Call this whenever you're about to set a DC so you stay on the canonical 5/10/15/20/25/30 ladder.",
    input_schema: {
      type: "object",
      properties: {
        difficulty: {
          type: "string",
          enum: ["very_easy", "easy", "medium", "hard", "very_hard", "nearly_impossible"],
        },
      },
      required: ["difficulty"],
    },
  },
  {
    name: "lookup_condition",
    description:
      "Look up the exact mechanical effects of a D&D 5e (2024) condition (Blinded, Charmed, Frightened, Grappled, Prone, etc.). Call this before adjudicating any effect that imposes a condition.",
    input_schema: {
      type: "object",
      properties: { name: { type: "string", description: "Condition name." } },
      required: ["name"],
    },
  },
  {
    name: "lookup_spell",
    description:
      "Look up a spell's level, school, casting time, range, components, duration, and effect. Use when a PC casts a spell, when an NPC threatens to, or when the DM asks about a spell's mechanics.",
    input_schema: {
      type: "object",
      properties: { name: { type: "string", description: "Spell name." } },
      required: ["name"],
    },
  },
  {
    name: "roll_encounter",
    description:
      "Generate a balanced combat encounter for the party. Returns a monster list with CR/XP that fits the difficulty budget. Use this when the DM asks for an encounter, or when the agent is improvising one.",
    input_schema: {
      type: "object",
      properties: {
        party_level: { type: "integer", description: "Average level of the party (1–20)." },
        party_size: { type: "integer", description: "Number of PCs (default 4)." },
        difficulty: {
          type: "string",
          enum: ["low", "moderate", "high"],
          description: "DMG 2024 difficulty tier (default moderate).",
        },
        theme: {
          type: "string",
          description: 'Optional creature theme filter, e.g. "undead", "goblin", "giant".',
        },
      },
      required: ["party_level"],
    },
  },
  {
    name: "generate_npc",
    description:
      "Generate a quick NPC seed: name, voice adjective, behavioral quirk, secret. Use when the DM asks for an NPC on the fly or when you need a named bystander in a scene.",
    input_schema: {
      type: "object",
      properties: {
        theme: {
          type: "string",
          enum: ["standard", "esoteric", "mundane", "strong", "sinister", "whimsical"],
          description: "Tone of the NPC (default standard).",
        },
        role: { type: "string", description: 'Optional role hint, e.g. "innkeeper", "spy", "town guard".' },
      },
    },
  },
];

export const runTool = async (call: ToolCall): Promise<ToolResult> => {
  try {
    switch (call.name) {
      case "roll_dice":
        return { name: call.name, output: runRollDice(call.input as { expression: string; label?: string }) };
      case "set_dc":
        return { name: call.name, output: runSetDc(call.input as { difficulty: any }) };
      case "lookup_condition":
        return { name: call.name, output: await runLookupCondition(call.input as { name: string }) };
      case "lookup_spell":
        return { name: call.name, output: await runLookupSpell(call.input as { name: string }) };
      case "roll_encounter":
        return { name: call.name, output: await runRollEncounter(call.input as any) };
      case "generate_npc":
        return { name: call.name, output: await runGenerateNpc(call.input as any) };
      default:
        return { name: call.name, output: `Unknown tool: ${call.name}`, is_error: true };
    }
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return { name: call.name, output: `Tool error: ${msg}`, is_error: true };
  }
};
