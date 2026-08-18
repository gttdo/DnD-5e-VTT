import { useCallback, useEffect, useState } from "react";
import { supabase, supabaseConfigured } from "../lib/supabase";
import { useAuth } from "./useAuth";

export interface Game {
  id: string;
  name: string;
  dm_user_id: string;
  join_code: string;
  created_at: string;
  active_scene_id: string | null;
  /** Filled in by joining game_members for the current user */
  my_role?: "player" | "dm";
  my_character_id?: string | null;
}

/** Generate a 6-char A-Z + 2-9 code, no easily-confused chars. */
const generateJoinCode = (): string => {
  const ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  let s = "";
  for (let i = 0; i < 6; i++) {
    s += ALPHABET[Math.floor(Math.random() * ALPHABET.length)];
  }
  return s;
};

export const useGames = () => {
  const { user } = useAuth();
  const [games, setGames] = useState<Game[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    if (!user || !supabaseConfigured) {
      setGames([]);
      setLoading(false);
      return;
    }
    setLoading(true);
    // Fetch every game where the user is a member (covers both DM and player).
    // Members carry role + character_id; the join gives us the rest.
    const { data, error } = await supabase
      .from("game_members")
      .select(
        "role, character_id, games!inner(id, name, dm_user_id, join_code, created_at, active_scene_id)"
      )
      .eq("user_id", user.id);
    if (error) {
      setError(error.message);
      setGames([]);
    } else {
      const mapped: Game[] = (data ?? []).map((row) => {
        const g = (row as { games: Game }).games;
        return {
          ...g,
          my_role: (row as { role: "player" | "dm" }).role,
          my_character_id: (row as { character_id: string | null }).character_id,
        };
      });
      setGames(mapped.sort((a, b) => b.created_at.localeCompare(a.created_at)));
      setError(null);
    }
    setLoading(false);
  }, [user]);

  useEffect(() => {
    refresh();
  }, [refresh]);

  // Realtime: refresh when membership changes (someone joins/leaves any of
  // our games). Watching game_members covers the cases we care about.
  useEffect(() => {
    if (!user || !supabaseConfigured) return;
    const channel = supabase
      .channel(`games-membership:${user.id}`)
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "game_members" },
        () => refresh()
      )
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "games" },
        () => refresh()
      )
      .subscribe();
    return () => {
      supabase.removeChannel(channel);
    };
  }, [user, refresh]);

  const createGame = useCallback(
    async (name: string): Promise<{ game: Game | null; error: string | null }> => {
      if (!user) return { game: null, error: "Not signed in" };
      // Try a few codes in case of collision (the DB has a unique constraint).
      for (let attempt = 0; attempt < 5; attempt++) {
        const code = generateJoinCode();
        const { data, error } = await supabase
          .from("games")
          .insert({ name, dm_user_id: user.id, join_code: code })
          .select()
          .single();
        if (!error && data) {
          // Make the DM also a game member with role 'dm' so they can read
          // realtime updates and see their own game in the membership list.
          await supabase.from("game_members").insert({
            game_id: data.id,
            user_id: user.id,
            role: "dm",
          });
          await refresh();
          return { game: data as Game, error: null };
        }
        // 23505 = unique_violation; retry with a new code. Anything else bail.
        if (error && !error.message.includes("duplicate") && !error.message.includes("unique")) {
          return { game: null, error: error.message };
        }
      }
      return { game: null, error: "Could not generate a unique join code" };
    },
    [user, refresh]
  );

  const joinByCode = useCallback(
    async (code: string, characterId: string | null): Promise<{ error: string | null }> => {
      if (!user) return { error: "Not signed in" };
      // Go through the SECURITY DEFINER RPC — a direct upsert to game_members
      // from the client trips RLS in a few edge cases (stale JWT, row already
      // exists as a different role). The function centralizes the join logic.
      const { error } = await supabase.rpc("join_game_by_code", {
        _code: code.trim().toUpperCase(),
        _character_id: characterId,
      });
      if (error) return { error: error.message };
      await refresh();
      return { error: null };
    },
    [user, refresh]
  );

  const leaveGame = useCallback(
    async (gameId: string): Promise<{ error: string | null }> => {
      if (!user) return { error: "Not signed in" };
      const { error } = await supabase
        .from("game_members")
        .delete()
        .eq("game_id", gameId)
        .eq("user_id", user.id);
      if (error) return { error: error.message };
      await refresh();
      return { error: null };
    },
    [user, refresh]
  );

  // Delete a whole campaign — DM/owner only (RLS: games_dm_all restricts it to
  // dm_user_id). The game's scenes, tokens, and memberships all cascade away
  // with the row (on delete cascade), so nothing is orphaned.
  const deleteGame = useCallback(
    async (gameId: string): Promise<{ error: string | null }> => {
      if (!user) return { error: "Not signed in" };
      const { error } = await supabase.from("games").delete().eq("id", gameId);
      if (error) return { error: error.message };
      await refresh();
      return { error: null };
    },
    [user, refresh]
  );

  const setMyCharacter = useCallback(
    async (gameId: string, characterId: string | null): Promise<{ error: string | null }> => {
      if (!user) return { error: "Not signed in" };
      const { error } = await supabase
        .from("game_members")
        .update({ character_id: characterId })
        .eq("game_id", gameId)
        .eq("user_id", user.id);
      if (error) return { error: error.message };
      await refresh();
      return { error: null };
    },
    [user, refresh]
  );

  return {
    games,
    loading,
    error,
    createGame,
    joinByCode,
    leaveGame,
    deleteGame,
    setMyCharacter,
    refresh,
  };
};
