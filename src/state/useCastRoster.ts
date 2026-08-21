import { useCallback, useEffect, useState } from "react";
import { supabase, supabaseConfigured } from "../lib/supabase";
import type { Character } from "../types/character";

/**
 * The Cast (campaign editor) — the DM's ledger of who belongs to this
 * campaign: each member, their display name, and the character they brought.
 * Instance state, never exported in packs. Distinct from the table's Party
 * panel (live presence — "the room"); this is the roster ("the ledger").
 */

export interface CastMember {
  user_id: string;
  role: "player" | "dm";
  name: string;
  character_id: string | null;
  /** Summary of the bound character, when one is brought and readable. */
  character: { name: string; line: string; portrait: string | null } | null;
}

const summarize = (c: Character): { name: string; line: string; portrait: string | null } => ({
  name: c.name,
  line: [c.species, c.classes?.map((cl) => `${cl.name} ${cl.level}`).join(" / ")].filter(Boolean).join(" · "),
  portrait: c.portrait ?? null,
});

export const useCastRoster = (gameId: string | null) => {
  const [members, setMembers] = useState<CastMember[]>([]);
  const [loading, setLoading] = useState(Boolean(gameId));

  const load = useCallback(async () => {
    if (!gameId || !supabaseConfigured) {
      setMembers([]);
      setLoading(false);
      return;
    }
    const { data: rows } = await supabase
      .from("game_members")
      .select("user_id, role, character_id")
      .eq("game_id", gameId);
    const userIds = (rows ?? []).map((r) => r.user_id as string);
    const charIds = (rows ?? []).map((r) => r.character_id as string | null).filter(Boolean) as string[];
    const [{ data: profiles }, { data: chars }] = await Promise.all([
      userIds.length
        ? supabase.from("profiles").select("user_id, display_name").in("user_id", userIds)
        : Promise.resolve({ data: [] as Array<{ user_id: string; display_name: string | null }> }),
      charIds.length
        ? supabase.from("characters").select("id, data").in("id", charIds)
        : Promise.resolve({ data: [] as Array<{ id: string; data: Character }> }),
    ]);
    const nameOf = new Map((profiles ?? []).map((p) => [p.user_id, p.display_name ?? "Adventurer"]));
    const charOf = new Map((chars ?? []).map((c) => [c.id, summarize(c.data as Character)]));
    setMembers(
      (rows ?? [])
        .map((r) => ({
          user_id: r.user_id as string,
          role: (r.role as "player" | "dm") ?? "player",
          name: nameOf.get(r.user_id as string) ?? "Adventurer",
          character_id: (r.character_id as string | null) ?? null,
          character: r.character_id ? charOf.get(r.character_id as string) ?? null : null,
        }))
        .sort((a, b) => (a.role === b.role ? a.name.localeCompare(b.name) : a.role === "dm" ? -1 : 1))
    );
    setLoading(false);
  }, [gameId]);

  useEffect(() => {
    void load();
  }, [load]);

  /** DM removes a member from the campaign (their seat, not their character). */
  const removeMember = useCallback(
    async (userId: string): Promise<{ error: string | null }> => {
      if (!gameId) return { error: "No game" };
      setMembers((prev) => prev.filter((m) => m.user_id !== userId));
      const { error } = await supabase.from("game_members").delete().eq("game_id", gameId).eq("user_id", userId);
      if (error) void load(); // restore on failure
      return { error: error?.message ?? null };
    },
    [gameId, load]
  );

  return { members, loading, removeMember, reload: load };
};
