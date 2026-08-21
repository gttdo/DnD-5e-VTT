// generate-image — Supabase Edge Function
//
// Generic AI image generator for the whole app: monster/NPC/item/prop tokens,
// spell emblems, and battle maps. Callers vary size / quality / background.
//
// Body: { prompt: string, size?, quality? }
// Flow:
//   1. Verify the caller's JWT and load the user
//      2. POST /v1/images/generations to OpenAI — gpt-image-2 for opaque art
//      (tokens + maps), gpt-image-1.5 for transparent spell emblems.
//   3. Decode the returned base64 PNG
//   4. Upload to Storage bucket `map-images` under {owner_id}/{uuid}.png
//   5. Return the public URL
//
// The caller (client) is responsible for inserting the returned URL into the
// `maps` table (their library) and optionally attaching to a scene. This
// function is now decoupled from any specific game.
//
// The OpenAI key must be set as a Supabase project secret named OPENAI_API_KEY.
// SUPABASE_URL / SUPABASE_ANON_KEY / SUPABASE_SERVICE_ROLE_KEY are provided by
// the runtime automatically.

import { createClient } from "npm:@supabase/supabase-js@2";
import { decodeBase64 } from "jsr:@std/encoding/base64";

const OPENAI_API_KEY = Deno.env.get("OPENAI_API_KEY");
const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY")!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

const CORS_HEADERS: Record<string, string> = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

type Size = "1024x1024" | "1536x1024" | "1024x1536" | "auto";
type Quality = "low" | "medium" | "high" | "auto";

interface Body {
  prompt: string;
  size?: Size;
  quality?: Quality;
  /** "transparent" yields a PNG with no backdrop (spell emblems). Default opaque. */
  background?: "transparent" | "opaque";
  /** Matched faces (#matched-faces): condition generation on an existing image
   *  so a scene's backdrop + battlemap depict the SAME place. When set (and
   *  opaque), we route through the image-EDIT endpoint with this image as the
   *  reference instead of pure text-to-image. */
  reference_url?: string;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: CORS_HEADERS });
  }
  if (req.method !== "POST") return json({ error: "POST only" }, 405);

  if (!OPENAI_API_KEY) {
    return json(
      { error: "OPENAI_API_KEY not configured on the edge function" },
      500,
    );
  }

  // 1. Auth — verify the JWT the client sent us and identify the user.
  const authHeader = req.headers.get("Authorization");
  if (!authHeader) return json({ error: "not authenticated" }, 401);

  const supabaseUser = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
    global: { headers: { Authorization: authHeader } },
  });
  const { data: { user }, error: userErr } = await supabaseUser.auth.getUser();
  if (userErr || !user) return json({ error: "not authenticated" }, 401);

  // 2. Parse body.
  let body: Body;
  try {
    body = await req.json();
  } catch {
    return json({ error: "invalid json" }, 400);
  }
  const { prompt } = body;
  if (!prompt) return json({ error: "prompt required" }, 400);

  const size: Size = body.size ?? "1536x1024";
  const quality: Quality = body.quality ?? "high";

  const supabaseAdmin = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

  // 3. OpenAI call. gpt-image-1.5 for transparent spell emblems; gpt-image-2 for
  //    everything opaque (monster/NPC/item/prop tokens, and maps). The abort only
  //    trips on a genuinely hung call — NOT normal generation.
  const wantsTransparent = body.background === "transparent";
  const model = wantsTransparent ? "gpt-image-1.5" : "gpt-image-2";
  // Reference conditioning only applies to opaque art (never spell emblems).
  const referenceUrl = !wantsTransparent ? body.reference_url : undefined;

  const DEADLINE_MS = 280_000; // only catches a genuinely hung call
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), DEADLINE_MS);

  let openaiData: { data?: Array<{ b64_json?: string }> };
  try {
    let resp: Response;
    if (referenceUrl) {
      // Image EDIT — feed the counterpart image so the two faces of a scene
      // match. Multipart form-data; do NOT set Content-Type (fetch adds the
      // boundary). Fetch the reference from our own public bucket.
      const refResp = await fetch(referenceUrl, { signal: ctrl.signal });
      if (!refResp.ok) {
        return json({ error: `could not load reference image (${refResp.status})` }, 502);
      }
      const refBytes = new Uint8Array(await refResp.arrayBuffer());
      const form = new FormData();
      form.append("model", model);
      form.append("prompt", prompt);
      form.append("size", size);
      form.append("quality", quality);
      form.append("n", "1");
      form.append("image", new Blob([refBytes], { type: "image/png" }), "reference.png");
      resp = await fetch("https://api.openai.com/v1/images/edits", {
        method: "POST",
        headers: { Authorization: `Bearer ${OPENAI_API_KEY}` },
        body: form,
        signal: ctrl.signal,
      });
    } else {
      resp = await fetch("https://api.openai.com/v1/images/generations", {
        method: "POST",
        headers: { Authorization: `Bearer ${OPENAI_API_KEY}`, "Content-Type": "application/json" },
        body: JSON.stringify({
          model,
          prompt,
          size,
          quality,
          n: 1,
          ...(wantsTransparent ? { background: "transparent", output_format: "png" } : {}),
        }),
        signal: ctrl.signal,
      });
    }
    if (!resp.ok) {
      const txt = await resp.text();
      console.error("openai error:", resp.status, txt);
      return json({ error: `openai ${resp.status} (${model}): ${txt}` }, 502);
    }
    openaiData = await resp.json();
  } catch (e) {
    console.error("image generation failed:", String(e));
    return json({ error: `openai ${model} timed out or failed: ${String(e)}` }, 502);
  } finally {
    clearTimeout(timer);
  }

  const b64 = openaiData?.data?.[0]?.b64_json;
  if (!b64) return json({ error: "no image returned" }, 502);

  // 4. Base64 → bytes → storage. Path is per-owner; the bucket is public and
  //    filenames are UUIDs so the physical layout doesn't affect security.
  //    Use the native decoder — the old `Uint8Array.from(atob(b64), …)` ran a
  //    callback per byte over a multi-MB image, which blew the edge function's
  //    CPU/memory budget (WORKER_RESOURCE_LIMIT → 546) on high-quality art.
  const bytes = decodeBase64(b64);
  const filename = `${crypto.randomUUID()}.png`;
  const objectPath = `${user.id}/${filename}`;

  const { error: uploadErr } = await supabaseAdmin.storage
    .from("map-images")
    .upload(objectPath, bytes, {
      contentType: "image/png",
      // Long cache — the URL includes a random UUID, so a new gen = a new URL.
      cacheControl: "31536000",
    });

  if (uploadErr) return json({ error: `upload: ${uploadErr.message}` }, 500);

  // 6. Public URL for direct rendering in <image href="…">.
  const { data: pub } = supabaseAdmin.storage
    .from("map-images")
    .getPublicUrl(objectPath);

  return json({
    image_url: pub.publicUrl,
    object_path: objectPath,
    prompt,
    size,
    quality,
  });
});

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...CORS_HEADERS, "content-type": "application/json" },
  });
}
