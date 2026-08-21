// narrate — Supabase Edge Function
//
// Text → cinematic narration (the read-aloud voice). Calls ElevenLabs TTS,
// stores the mp3 in the public map-images bucket, returns its URL. The DM
// pre-generates a read-aloud's voice in the editor; the URL is cached on the
// doc and simply played when the text is Presented — no synth at the table.
//
// Body: { game_id: string, text: string, voice_id?: string }
// Returns: { url } or { error }
//
// Requires the ELEVENLABS_API_KEY project secret (scopes: Text to Speech +
// Voices:Read). SUPABASE_* are provided by the runtime.

import { createClient } from "npm:@supabase/supabase-js@2";

const ELEVENLABS_API_KEY = Deno.env.get("ELEVENLABS_API_KEY");
const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY")!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

// A deep, steady storyteller — a preset voice available on every account.
// ("George" — warm British narrator.) Overridable per call later.
const DEFAULT_VOICE_ID = "JBFqnCBsd6RMkjVDRZzb";
const MODEL_ID = "eleven_multilingual_v2";
const MAX_CHARS = 5000; // a read-aloud is ~25–90 words; this is a generous cap

const CORS_HEADERS: Record<string, string> = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

interface Body {
  game_id: string;
  text: string;
  voice_id?: string;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: CORS_HEADERS });
  if (req.method !== "POST") return json({ error: "POST only" }, 405);
  if (!ELEVENLABS_API_KEY) return json({ error: "ELEVENLABS_API_KEY not configured on the edge function" }, 500);

  const authHeader = req.headers.get("Authorization");
  if (!authHeader) return json({ error: "not authenticated" }, 401);
  const db = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
    global: { headers: { Authorization: authHeader } },
  });
  const { data: { user }, error: userErr } = await db.auth.getUser();
  if (userErr || !user) return json({ error: "not authenticated" }, 401);

  let body: Body;
  try { body = await req.json(); } catch { return json({ error: "invalid json" }, 400); }
  const text = (body.text ?? "").trim();
  if (!body.game_id || !text) return json({ error: "game_id and text required" }, 400);
  if (text.length > MAX_CHARS) return json({ error: `text too long (max ${MAX_CHARS} chars)` }, 400);

  // Only the game's DM generates narration (a prep action).
  const { data: game } = await db.from("games").select("dm_user_id").eq("id", body.game_id).maybeSingle();
  if (!game) return json({ error: "game not found" }, 404);
  if (game.dm_user_id !== user.id) return json({ error: "only the DM can generate narration" }, 403);

  const voiceId = body.voice_id || DEFAULT_VOICE_ID;

  // ElevenLabs TTS → mp3 bytes.
  let audio: Uint8Array;
  try {
    const resp = await fetch(`https://api.elevenlabs.io/v1/text-to-speech/${voiceId}`, {
      method: "POST",
      headers: {
        "xi-api-key": ELEVENLABS_API_KEY,
        "content-type": "application/json",
        accept: "audio/mpeg",
      },
      body: JSON.stringify({
        text,
        model_id: MODEL_ID,
        voice_settings: { stability: 0.5, similarity_boost: 0.75, style: 0.3 },
      }),
    });
    if (!resp.ok) {
      const detail = await resp.text().catch(() => "");
      return json({ error: `elevenlabs ${resp.status}: ${detail.slice(0, 300)}` }, 502);
    }
    audio = new Uint8Array(await resp.arrayBuffer());
  } catch (e) {
    return json({ error: `narration failed: ${String(e)}` }, 502);
  }
  if (audio.byteLength === 0) return json({ error: "no audio returned" }, 502);

  // Store in the public bucket; UUID filename → new gen is a new URL.
  const admin = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);
  const objectPath = `narration/${user.id}/${crypto.randomUUID()}.mp3`;
  const { error: uploadErr } = await admin.storage.from("map-images").upload(objectPath, audio, {
    contentType: "audio/mpeg",
    cacheControl: "31536000",
  });
  if (uploadErr) return json({ error: `upload failed: ${uploadErr.message}` }, 502);

  const { data } = admin.storage.from("map-images").getPublicUrl(objectPath);
  return json({ url: data.publicUrl });
});

function json(payload: unknown, status = 200): Response {
  return new Response(JSON.stringify(payload), {
    status,
    headers: { ...CORS_HEADERS, "Content-Type": "application/json" },
  });
}
