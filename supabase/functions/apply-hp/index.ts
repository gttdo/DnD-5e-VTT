// apply-hp — Supabase Edge Function
//
// The "DM damages a player's PC" write path. Character HP lives in the
// characters row's `data` jsonb, and characters are owner-only for writes under
// RLS — so a DM (or any other table member) cannot reduce another player's PC
// HP directly. This function is the surgical exception: it runs with the
// service role, but only AFTER verifying the caller is a member of the game AND
// the target character is actually seated at that game. That keeps the blast
// radius to "people at your table can change the HP of PCs at your table" —
// which mirrors the member-wide write already granted on the tokens table.
//
// Body: { gameId: string, characterId: string, op: "damage" | "heal", amount: number }
// Returns: { hp: { current, max, temp } } | { error }
//
// SUPABASE_URL / SUPABASE_ANON_KEY / SUPABASE_SERVICE_ROLE_KEY are provided by
// the runtime — no extra secrets needed.

import { createClient } from "npm:@supabase/supabase-js@2";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY")!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

const CORS_HEADERS: Record<string, string> = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

interface HpState { current: number; max: number; temp: number }
interface Body { gameId: string; characterId: string; op: "damage" | "heal"; amount: number }

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { ...CORS_HEADERS, "Content-Type": "application/json" },
  });

// Same rules as the client's lib/hp — damage eats temp HP first, healing caps
// at max. Kept in sync by hand; both are tiny and pure.
const applyDamage = (hp: HpState, amount: number): HpState => {
  const amt = Math.max(0, Math.round(amount));
  const fromTemp = Math.min(hp.temp ?? 0, amt);
  const rem = amt - fromTemp;
  return { ...hp, temp: (hp.temp ?? 0) - fromTemp, current: Math.max(0, (hp.current ?? 0) - rem) };
};
const applyHeal = (hp: HpState, amount: number): HpState => {
  const amt = Math.max(0, Math.round(amount));
  return { ...hp, current: Math.min(hp.max ?? 0, (hp.current ?? 0) + amt) };
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: CORS_HEADERS });
  if (req.method !== "POST") return json({ error: "Method not allowed" }, 405);

  // Who's asking? Verify the JWT with an anon client bound to the caller's token.
  const authHeader = req.headers.get("Authorization");
  if (!authHeader) return json({ error: "Missing authorization" }, 401);
  const asUser = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
    global: { headers: { Authorization: authHeader } },
  });
  const { data: { user }, error: userErr } = await asUser.auth.getUser();
  if (userErr || !user) return json({ error: "Not authenticated" }, 401);

  let body: Body;
  try {
    body = await req.json();
  } catch {
    return json({ error: "Invalid JSON body" }, 400);
  }
  const { gameId, characterId, op, amount } = body;
  if (!gameId || !characterId || (op !== "damage" && op !== "heal")) {
    return json({ error: "gameId, characterId, and op ('damage'|'heal') are required" }, 400);
  }
  if (typeof amount !== "number" || !isFinite(amount) || amount < 0) {
    return json({ error: "amount must be a non-negative number" }, 400);
  }

  // Everything past auth uses the service role — but every read below is a
  // guard, not a grant: we only ever touch rows the caller is entitled to.
  const svc = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

  // Guard 1: the caller is a member of this game.
  const { data: membership, error: memErr } = await svc
    .from("game_members")
    .select("user_id")
    .eq("game_id", gameId)
    .eq("user_id", user.id)
    .maybeSingle();
  if (memErr) return json({ error: memErr.message }, 500);
  if (!membership) return json({ error: "You are not a member of this game" }, 403);

  // Guard 2: the target character is actually seated at this game.
  const { data: seat, error: seatErr } = await svc
    .from("game_members")
    .select("character_id")
    .eq("game_id", gameId)
    .eq("character_id", characterId)
    .maybeSingle();
  if (seatErr) return json({ error: seatErr.message }, 500);
  if (!seat) return json({ error: "That character is not in this game" }, 403);

  // Load, mutate, persist the HP inside the character's data blob.
  const { data: row, error: loadErr } = await svc
    .from("characters")
    .select("data")
    .eq("id", characterId)
    .single();
  if (loadErr || !row) return json({ error: loadErr?.message ?? "Character not found" }, 404);

  const data = (row.data ?? {}) as { hp?: HpState };
  const hp: HpState = { current: 0, max: 0, temp: 0, ...(data.hp ?? {}) };
  const nextHp = op === "damage" ? applyDamage(hp, amount) : applyHeal(hp, amount);

  const { error: writeErr } = await svc
    .from("characters")
    .update({ data: { ...data, hp: nextHp } })
    .eq("id", characterId);
  if (writeErr) return json({ error: writeErr.message }, 500);

  return json({ hp: nextHp });
});
