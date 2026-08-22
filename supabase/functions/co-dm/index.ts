// co-dm — Supabase Edge Function
//
// The Co-DM, slice 3a (docs: the P3 proposal): a READER, not a generator.
// Assembles the DM's entire campaign — chapters (drafts included, labeled),
// scenes, documents (secrets included), region topology, what players have
// been shown, session recaps, and the recent log — and answers the DM's
// questions grounded in that material. Assist mode: conversation only, no
// table effects; tool-calls arrive in slice 3c behind the approval gate.
//
// Body: { game_id: string, messages: [{ role: "user"|"assistant", content: string }] }
// Returns: { text } or { error }
//
// Stateless by design: context is re-assembled from rows on every call — the
// database is the memory. Every read runs under the CALLER's JWT (RLS), and
// everything is game_id-scoped: two campaigns are two sealed rooms.
//
// Requires the ANTHROPIC_API_KEY project secret (shared with campaign-scribe).

import { createClient } from "npm:@supabase/supabase-js@2";

const ANTHROPIC_API_KEY = Deno.env.get("ANTHROPIC_API_KEY");
const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY")!;

const MODEL = "claude-sonnet-5";
const MAX_TURNS = 16; // verbatim conversation tail sent by the client

const CORS_HEADERS: Record<string, string> = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

interface Turn {
  role: "user" | "assistant";
  content: string;
}
interface Body {
  game_id: string;
  messages: Turn[];
}

const clip = (s: string | null | undefined, n: number): string =>
  (s ?? "").replace(/\s+/g, " ").trim().slice(0, n);

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: CORS_HEADERS });
  if (req.method !== "POST") return json({ error: "POST only" }, 405);
  if (!ANTHROPIC_API_KEY) {
    return json({ error: "ANTHROPIC_API_KEY not configured on the edge function" }, 500);
  }

  // Auth — the caller's own JWT scopes every read below.
  const authHeader = req.headers.get("Authorization");
  if (!authHeader) return json({ error: "not authenticated" }, 401);
  const db = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
    global: { headers: { Authorization: authHeader } },
  });
  const { data: { user }, error: userErr } = await db.auth.getUser();
  if (userErr || !user) return json({ error: "not authenticated" }, 401);

  let body: Body;
  try {
    body = await req.json();
  } catch {
    return json({ error: "invalid json" }, 400);
  }
  if (!body.game_id || !Array.isArray(body.messages) || body.messages.length === 0) {
    return json({ error: "game_id and messages required" }, 400);
  }

  // The DM gate — the Co-DM knows secrets; only the DM may talk to it.
  const { data: game } = await db
    .from("games")
    .select("id, name, description, dm_user_id, level_min, level_max, active_scene_id")
    .eq("id", body.game_id)
    .maybeSingle();
  if (!game) return json({ error: "game not found" }, 404);
  if (game.dm_user_id !== user.id) return json({ error: "the Co-DM speaks only to the DM" }, 403);

  // ---- Context assembly: the whole campaign, from rows -----------------------
  const gid = body.game_id;
  const [
    { data: chapters },
    { data: scenes },
    { data: docs },
    { data: regionMaps },
    { data: shares },
    { data: sessions },
  ] = await Promise.all([
    db.from("chapters").select("id, title, position, status").eq("game_id", gid).order("position"),
    db.from("scenes").select("id, name, description, chapter_id, image_url, cinematic_url").eq("game_id", gid).order("created_at"),
    db.from("campaign_documents").select("id, kind, title, content, scene_id, chapter_id, session_id, meta").eq("game_id", gid).order("position"),
    db.from("region_maps").select("id, name").eq("game_id", gid),
    db.from("document_shares").select("document_id, audience, recipient_id").eq("game_id", gid),
    db.from("sessions").select("id, number, started_at, ended_at").eq("game_id", gid).order("number"),
  ]);

  const { data: memory } = await db
    .from("campaign_memory")
    .select("content, created_at")
    .eq("game_id", gid)
    .order("created_at", { ascending: true });

  const sceneIds = (scenes ?? []).map((s) => s.id);
  const mapIds = (regionMaps ?? []).map((m) => m.id);
  const [{ data: sceneSpots }, { data: mapSpots }] = await Promise.all([
    sceneIds.length ? db.from("hotspots").select("scene_id, region_map_id, target_scene_id, target_map_id, label").in("scene_id", sceneIds) : Promise.resolve({ data: [] }),
    mapIds.length ? db.from("hotspots").select("scene_id, region_map_id, target_scene_id, target_map_id, label").in("region_map_id", mapIds) : Promise.resolve({ data: [] }),
  ]);
  const hotspots = [...(sceneSpots ?? []), ...(mapSpots ?? [])];

  // Recent log: the live session's entries if one is running, else the last 80.
  const liveSession = (sessions ?? []).find((s) => !s.ended_at) ?? null;
  const logQuery = db
    .from("game_log")
    .select("kind, author_name, body, created_at, session_id")
    .eq("game_id", gid)
    .order("created_at", { ascending: false })
    .limit(120);
  const { data: logDesc } = liveSession ? await logQuery.eq("session_id", liveSession.id) : await logQuery;
  const log = (logDesc ?? []).reverse();

  // ---- Render the world as text ----------------------------------------------
  const sceneName = new Map((scenes ?? []).map((s) => [s.id, s.name]));
  const mapName = new Map((regionMaps ?? []).map((m) => [m.id, m.name]));
  const sharedTo = new Map<string, string>();
  for (const s of shares ?? []) {
    sharedTo.set(s.document_id, s.audience === "party" ? "party" : "one player");
  }

  const docLine = (d: NonNullable<typeof docs>[number]): string => {
    const where = d.scene_id
      ? `scene "${sceneName.get(d.scene_id) ?? "?"}"`
      : d.chapter_id
        ? "chapter-level"
        : d.session_id
          ? "session recap"
          : "campaign-level";
    const seen = sharedTo.has(d.id) ? ` [SHARED with ${sharedTo.get(d.id)}]` : " [unshared — players have NOT seen this]";
    const content =
      d.kind === "handout"
        ? clip(JSON.stringify((d.meta as Record<string, unknown>) ?? {}), 400)
        : clip(d.content, 900);
    return `- [${d.kind} id:${d.id}] "${clip(d.title, 60) || "untitled"}" (${where})${seen}: ${content}`;
  };

  const world: string[] = [];
  world.push(
    `CAMPAIGN: ${game.name}${game.level_min != null && game.level_max != null ? ` (levels ${game.level_min}–${game.level_max})` : ""}. ${clip(game.description, 300)}`
  );

  for (const ch of chapters ?? []) {
    const chScenes = (scenes ?? []).filter((s) => s.chapter_id === ch.id);
    world.push(`\nCHAPTER ${ch.position + 1}: "${ch.title}" [${ch.status.toUpperCase()}${ch.status === "draft" ? " — players cannot reach these scenes yet" : ""}]`);
    for (const s of chScenes) {
      world.push(`  SCENE "${s.name}"${s.id === game.active_scene_id ? " [CURRENTLY STAGED]" : ""}: ${clip(s.description, 900) || "(no description written)"}`);
      for (const d of (docs ?? []).filter((d) => d.scene_id === s.id)) world.push(`    ${docLine(d)}`);
    }
    for (const d of (docs ?? []).filter((d) => d.chapter_id === ch.id)) world.push(`  ${docLine(d)}`);
  }
  const unfiled = (scenes ?? []).filter((s) => !s.chapter_id);
  if (unfiled.length) {
    world.push(`\nUNFILED SCENES (no chapter):`);
    for (const s of unfiled) {
      world.push(`  SCENE "${s.name}"${s.id === game.active_scene_id ? " [CURRENTLY STAGED]" : ""}: ${clip(s.description, 600) || "(no description written)"}`);
      for (const d of (docs ?? []).filter((d) => d.scene_id === s.id)) world.push(`    ${docLine(d)}`);
    }
  }
  const campaignDocs = (docs ?? []).filter((d) => !d.scene_id && !d.chapter_id && !d.session_id);
  if (campaignDocs.length) {
    world.push(`\nCAMPAIGN-LEVEL MATERIAL:`);
    for (const d of campaignDocs) world.push(docLine(d));
  }
  if (hotspots.length) {
    world.push(`\nWORLD MAP — travel pins:`);
    for (const h of hotspots) {
      const from = h.scene_id ? `scene "${sceneName.get(h.scene_id) ?? "?"}"` : `map "${mapName.get(h.region_map_id!) ?? "?"}"`;
      const to = h.target_scene_id ? `scene "${sceneName.get(h.target_scene_id) ?? "?"}"` : h.target_map_id ? `map "${mapName.get(h.target_map_id) ?? "?"}"` : "(unlinked)";
      world.push(`- "${h.label ?? "pin"}" on ${from} → ${to}`);
    }
  }
  if (memory && memory.length) {
    world.push(`\nESTABLISHED IN PLAY (facts you were told to remember):`);
    for (const m of memory) world.push(`- ${clip(m.content, 300)}`);
  }
  const recaps = (docs ?? []).filter((d) => d.kind === "recap" && d.session_id);
  if (recaps.length) {
    world.push(`\nSESSION RECAPS (the story so far):`);
    for (const r of recaps) world.push(`- ${clip(r.title, 50)}: ${clip(r.content, 700)}`);
  }
  if (log.length) {
    world.push(`\nRECENT TABLE LOG${liveSession ? ` (session ${liveSession.number}, LIVE NOW)` : ""}:`);
    for (const e of log) {
      const b = e.body as Record<string, unknown>;
      if (e.kind === "chat") world.push(`${e.author_name}: ${clip(String(b.text ?? ""), 160)}`);
      else if (e.kind === "roll") {
        const entries = (b.entries ?? []) as Array<{ label?: string; total?: number }>;
        world.push(entries.map((r) => `${e.author_name} rolled ${r.label ?? "dice"} → ${r.total}`).join("; "));
      } else if (b.type === "scene_staged") world.push(`[staged: ${b.scene}]`);
      else if (b.type === "doc_presented") world.push(`[shared with players: "${clip(String(b.title || ""), 60)}"]`);
    }
  }

  const system = [
    "You are the Co-DM — a quiet, reliable second chair for a Dungeon Master running a D&D 5e campaign on a virtual tabletop.",
    "You have read the DM's ENTIRE campaign below: every chapter (drafts included), scene, private note, secret, handout, recap, and the recent table log. The players see none of this exchange — you speak only to the DM, so secrets may be discussed freely.",
    "Your discipline:",
    "- GROUND everything in the DM's own material. Name the scene or document you're drawing from. If something isn't written anywhere, say so plainly ('you haven't written that') — never present invention as canon.",
    "- When asked to DRAFT (an NPC line, a name, a description), invent gladly and in the campaign's voice — clearly as a draft for the DM to use or discard, never as established fact.",
    "- Track what players KNOW: documents are marked shared or unshared. Don't confuse what's true with what's been revealed.",
    "- Be table-fast: answer in 2–5 sentences unless the DM asks for depth. No preamble, no filler.",
    "- Never invent rules text; for rules questions, reason from standard 5e practice and say when you're unsure.",
    "- You may PROPOSE actions the DM approves before anything happens; never act unprompted. Available tools:",
    "  • stage_scene — move the table to a different scene, when the DM's message makes clear the party is going there. Never a scene that isn't in the campaign.",
    "  • place_tokens — put a creature's tokens on the board, when the DM is setting up or starting an encounter. Read the scene's own notes for who and how many (e.g. a note saying 'four kobolds' → creature_name 'Kobold', count 4). One proposal per creature type; propose several if the encounter is mixed. You don't see the map, so you can't choose positions — the DM drags them into place.",
    "  • share_doc — show a player-facing document (a read-aloud, handout, or recap) to the players: it appears on every screen AND is filed in their journal. Propose it when it's the moment to read the boxed text or hand over a prop. Pass the document's id (shown as 'id:...' in the campaign above). Never share a private note, and don't re-share something already marked SHARED unless the DM wants it shown again.",
    "  • remember — save a durable fact that emerged in play and lives in no document yet: a promise made, a name the party gave someone, a consequence, an NPC's shifted attitude. Propose it when such a thing happens so you'll recall it later. Don't remember things already written in a note or the 'ESTABLISHED IN PLAY' list; keep each memory one crisp sentence.",
    "  When you propose, say in one sentence why.",
    "",
    "THE CAMPAIGN:",
    ...world,
  ].join("\n");

  // ---- Claude -----------------------------------------------------------------
  const turns = body.messages.slice(-MAX_TURNS).map((m) => ({
    role: m.role === "assistant" ? "assistant" : "user",
    content: clip(m.content, 4000),
  }));

  // The Co-DM may PROPOSE a scene change (3c) — a suggestion the DM approves,
  // never an autonomous act. Stateless payoff: no tool_result round-trip is
  // needed, because next turn re-reads the world and sees the staged scene.
  const tools = [
    {
      name: "stage_scene",
      description:
        "Propose moving the whole table to a different scene (everyone's view changes). Only when the DM's message makes clear the party is going there. The DM approves before it happens.",
      input_schema: {
        type: "object",
        properties: {
          scene_name: { type: "string", description: "the exact scene name, from the campaign above" },
          reason: { type: "string", description: "one short phrase: why now" },
        },
        required: ["scene_name"],
      },
    },
    {
      name: "place_tokens",
      description:
        "Propose placing a creature's tokens on the current battlemap — for setting up or starting an encounter. Read the scene's notes for who and how many. One creature type per call. The DM approves and positions them.",
      input_schema: {
        type: "object",
        properties: {
          creature_name: { type: "string", description: "the creature, e.g. 'Kobold' — matched against the DM's token library" },
          count: { type: "number", description: "how many (1–12)" },
          reason: { type: "string", description: "one short phrase: why now" },
        },
        required: ["creature_name", "count"],
      },
    },
    {
      name: "share_doc",
      description:
        "Propose showing a player-facing document (read-aloud, handout, or recap) to the players — live on every screen and filed in their journal. The DM approves.",
      input_schema: {
        type: "object",
        properties: {
          document_id: { type: "string", description: "the document's id, from 'id:...' in the campaign above" },
          reason: { type: "string", description: "one short phrase: why now" },
        },
        required: ["document_id"],
      },
    },
    {
      name: "remember",
      description:
        "Propose saving a durable fact established in play (a promise, a name, a consequence, a changed attitude) that isn't written anywhere yet. The DM approves; you'll recall it in future turns.",
      input_schema: {
        type: "object",
        properties: {
          content: { type: "string", description: "one crisp sentence to remember" },
          reason: { type: "string", description: "one short phrase: why it matters" },
        },
        required: ["content"],
      },
    },
  ];

  const resp = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "x-api-key": ANTHROPIC_API_KEY,
      "anthropic-version": "2023-06-01",
      "content-type": "application/json",
    },
    body: JSON.stringify({ model: MODEL, max_tokens: 1000, system, tools, messages: turns }),
  });
  if (!resp.ok) {
    const detail = await resp.text().catch(() => "");
    return json({ error: `anthropic ${resp.status}: ${clip(detail, 300)}` }, 502);
  }
  const data = (await resp.json()) as {
    content?: Array<{ type: string; text?: string; name?: string; input?: Record<string, unknown> }>;
  };
  const text = (data.content ?? [])
    .filter((c) => c.type === "text")
    .map((c) => c.text ?? "")
    .join("")
    .trim();
  const proposals = (data.content ?? [])
    .filter((c) => c.type === "tool_use" && c.name)
    .map((c) => ({ tool: c.name!, input: c.input ?? {} }));

  if (!text && proposals.length === 0) return json({ error: "empty response from the model" }, 502);
  return json({ text, proposals });
});

function json(payload: unknown, status = 200): Response {
  return new Response(JSON.stringify(payload), {
    status,
    headers: { ...CORS_HEADERS, "Content-Type": "application/json" },
  });
}
