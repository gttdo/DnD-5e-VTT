// campaign-scribe — Supabase Edge Function
//
// The Campaign Editor's writing assistant (#0041 slice 1d): ONE assistant,
// many lenses. Drafts the campaign's narrative atoms at their canonical
// sizes (Heroes-of-the-Borderlands discipline: read-alouds ~25 words, recaps
// ~150 — small, labeled, atomic; essay-length output is a defect).
//
// Body: {
//   game_id: string,
//   mode: "read_aloud" | "recap",
//   scene_id?:   string,   // read_aloud — the scene whose description seeds it
//   session_id?: string,   // recap — the session whose log is summarized
//   genre?: "auto" | "drama" | "horror" | "action" | "comedy" | "fantasy",
//   instruction?: string,  // optional extra guidance from the DM
// }
// Returns: { text: string } or { error }
//
// Context assembly is server-side and RLS-scoped: every read goes through the
// caller's own JWT, so the function can never see (or leak) more than the DM
// could query themselves. Only the game's DM may call it.
//
// Requires a project secret named ANTHROPIC_API_KEY.

import { createClient } from "npm:@supabase/supabase-js@2";

const ANTHROPIC_API_KEY = Deno.env.get("ANTHROPIC_API_KEY");
const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY")!;

const MODEL = "claude-sonnet-5";

const CORS_HEADERS: Record<string, string> = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

interface Body {
  game_id: string;
  mode: "read_aloud" | "recap";
  scene_id?: string;
  session_id?: string;
  genre?: string;
  instruction?: string;
}

const GENRE_HINT: Record<string, string> = {
  drama: "Tone: grounded human drama — stakes are personal, feelings are real.",
  horror: "Tone: creeping dread — wrongness in small details, never gore for its own sake.",
  action: "Tone: momentum and danger — verbs first, short sentences, things about to move.",
  comedy: "Tone: light and wry — a wink in the prose, never a pratfall that breaks the world.",
  fantasy: "Tone: high fantasy wonder — the old magic is close to the surface here.",
};

const clip = (s: string | null | undefined, n: number): string =>
  (s ?? "").replace(/\s+/g, " ").trim().slice(0, n);

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: CORS_HEADERS });
  if (req.method !== "POST") return json({ error: "POST only" }, 405);

  if (!ANTHROPIC_API_KEY) {
    return json({ error: "ANTHROPIC_API_KEY not configured on the edge function" }, 500);
  }

  // 1. Auth — verify the JWT and identify the caller.
  const authHeader = req.headers.get("Authorization");
  if (!authHeader) return json({ error: "not authenticated" }, 401);
  const db = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
    global: { headers: { Authorization: authHeader } },
  });
  const { data: { user }, error: userErr } = await db.auth.getUser();
  if (userErr || !user) return json({ error: "not authenticated" }, 401);

  // 2. Body.
  let body: Body;
  try {
    body = await req.json();
  } catch {
    return json({ error: "invalid json" }, 400);
  }
  if (!body.game_id || !body.mode) return json({ error: "game_id and mode required" }, 400);

  // 3. The game — and the DM gate. All further reads are RLS-scoped anyway;
  //    this check just gives a clean error instead of empty context.
  const { data: game } = await db
    .from("games")
    .select("id, name, description, dm_user_id, level_min, level_max")
    .eq("id", body.game_id)
    .maybeSingle();
  if (!game) return json({ error: "game not found" }, 404);
  if (game.dm_user_id !== user.id) return json({ error: "only the DM can use the Scribe" }, 403);

  // 4. Shared campaign context.
  const levelBand =
    game.level_min != null && game.level_max != null
      ? `for character levels ${game.level_min}–${game.level_max}`
      : "";
  const { data: campaignDocs } = await db
    .from("campaign_documents")
    .select("kind, title, content")
    .eq("game_id", body.game_id)
    .is("scene_id", null)
    .is("chapter_id", null)
    .is("session_id", null)
    .neq("kind", "recap")
    .order("position", { ascending: true })
    .limit(6);
  const campaignBlock = (campaignDocs ?? [])
    .filter((d) => d.content?.trim())
    .map((d) => `- [${d.kind}] ${clip(d.title, 60)}: ${clip(d.content, 400)}`)
    .join("\n");

  const genreLine = GENRE_HINT[body.genre ?? ""] ?? "";
  const instructionLine = body.instruction ? `The DM adds: ${clip(body.instruction, 300)}` : "";

  let system: string;
  let userPrompt: string;

  if (body.mode === "read_aloud") {
    if (!body.scene_id) return json({ error: "scene_id required for read_aloud" }, 400);
    const { data: scene } = await db
      .from("scenes")
      .select("name, description")
      .eq("id", body.scene_id)
      .maybeSingle();
    if (!scene) return json({ error: "scene not found" }, 404);
    const { data: sceneDocs } = await db
      .from("campaign_documents")
      .select("kind, title, content, visibility")
      .eq("scene_id", body.scene_id)
      .order("position", { ascending: true })
      .limit(6);
    const sceneBlock = (sceneDocs ?? [])
      .filter((d) => d.content?.trim())
      .map((d) => `- [${d.kind}${d.visibility === "dm" ? ", DM-only" : ""}] ${clip(d.content, 300)}`)
      .join("\n");

    system = [
      "You are the Scribe — the campaign editor's writing assistant for a D&D 5e virtual tabletop.",
      "Write BOXED READ-ALOUD TEXT: the words a Dungeon Master reads aloud as the party arrives somewhere.",
      "Discipline (professional-module standard): about 25 words. Never exceed 60. One or two sentences.",
      "Second person, present tense, concrete and sensory. No game mechanics, no dice, no stat references.",
      "Describe only what the characters can perceive on arrival — never reveal DM-only secrets, only hint at their surface signs.",
      genreLine,
      "Output ONLY the read-aloud text itself — no title, no quotes, no preamble.",
    ]
      .filter(Boolean)
      .join("\n");
    userPrompt = [
      `Campaign: ${game.name} ${levelBand}. ${clip(game.description, 200)}`,
      campaignBlock ? `Campaign background:\n${campaignBlock}` : "",
      `Scene: ${scene.name}.`,
      `Scene description (the DM's canonical prep — draft from this):\n${clip(scene.description, 1200) || "(none written — evoke the scene from its name alone)"}`,
      sceneBlock ? `Existing scene material (stay consistent, do not repeat):\n${sceneBlock}` : "",
      instructionLine,
      "Write the arrival read-aloud now.",
    ]
      .filter(Boolean)
      .join("\n\n");
  } else if (body.mode === "recap") {
    if (!body.session_id) return json({ error: "session_id required for recap" }, 400);
    const { data: session } = await db
      .from("sessions")
      .select("id, number, started_at, ended_at")
      .eq("id", body.session_id)
      .maybeSingle();
    if (!session) return json({ error: "session not found" }, 404);

    const { data: log } = await db
      .from("game_log")
      .select("kind, author_name, body, created_at")
      .eq("session_id", body.session_id)
      .order("created_at", { ascending: true })
      .limit(400);
    const lines = (log ?? [])
      .map((e) => {
        const b = e.body as Record<string, unknown>;
        if (e.kind === "chat") return `${e.author_name}: ${clip(String(b.text ?? ""), 200)}`;
        if (e.kind === "roll") {
          const entries = (b.entries ?? []) as Array<{ label?: string; total?: number }>;
          return entries.map((r) => `${e.author_name} rolled ${r.label ?? "dice"} → ${r.total}`).join("; ");
        }
        if (b.type === "scene_staged") return `[The party moves to: ${b.scene}]`;
        if (b.type === "doc_presented") return `[The DM read aloud: "${clip(String(b.title || b.content || ""), 80)}"]`;
        return null;
      })
      .filter(Boolean)
      .join("\n");

    // The previous recap, for continuity of voice and thread.
    const { data: prevRecaps } = await db
      .from("campaign_documents")
      .select("content, created_at")
      .eq("game_id", body.game_id)
      .eq("kind", "recap")
      .neq("session_id", body.session_id)
      .order("created_at", { ascending: false })
      .limit(1);
    const prev = prevRecaps?.[0]?.content;

    system = [
      "You are the Scribe — the campaign editor's writing assistant for a D&D 5e virtual tabletop.",
      'Write a PLAYER-FACING SESSION RECAP — the "previously on…" a DM reads to open the next session.',
      "Discipline: 120–180 words. Past tense, vivid but economical, the campaign's voice.",
      "Only what happened at the table — never invent events, never reveal DM secrets or unexplored threads.",
      "Names matter: credit the characters for what they did. A memorable table quote may be woven in if one exists.",
      "End on the open thread or cliffhanger the session actually left, if any.",
      genreLine,
      "Output ONLY the recap text — no title, no preamble.",
    ]
      .filter(Boolean)
      .join("\n");
    userPrompt = [
      `Campaign: ${game.name} ${levelBand}. ${clip(game.description, 200)}`,
      campaignBlock ? `Campaign background:\n${campaignBlock}` : "",
      prev ? `Previous recap (for continuity):\n${clip(prev, 800)}` : "",
      `Session ${session.number} log (chronological):\n${lines || "(the log is empty — say the session was quiet and brief)"}`,
      instructionLine,
      `Write the recap of Session ${session.number} now.`,
    ]
      .filter(Boolean)
      .join("\n\n");
  } else {
    return json({ error: `unknown mode: ${body.mode}` }, 400);
  }

  // 5. Claude.
  const resp = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "x-api-key": ANTHROPIC_API_KEY,
      "anthropic-version": "2023-06-01",
      "content-type": "application/json",
    },
    body: JSON.stringify({
      model: MODEL,
      max_tokens: 700,
      system,
      messages: [{ role: "user", content: userPrompt }],
    }),
  });
  if (!resp.ok) {
    const detail = await resp.text().catch(() => "");
    return json({ error: `anthropic ${resp.status}: ${clip(detail, 300)}` }, 502);
  }
  const data = (await resp.json()) as { content?: Array<{ type: string; text?: string }> };
  const text = (data.content ?? [])
    .filter((c) => c.type === "text")
    .map((c) => c.text ?? "")
    .join("")
    .trim();
  if (!text) return json({ error: "empty response from the model" }, 502);

  return json({ text });
});

function json(payload: unknown, status = 200): Response {
  return new Response(JSON.stringify(payload), {
    status,
    headers: { ...CORS_HEADERS, "Content-Type": "application/json" },
  });
}
