import { useCallback, useEffect, useMemo, useState } from "react";
import { supabase, supabaseConfigured } from "../lib/supabase";
import { useAuth } from "./useAuth";

export interface Scene {
  id: string;
  game_id: string;
  name: string;
  image_url: string | null;
  grid_cols: number;
  grid_rows: number;
  map_id: string | null;
  created_by: string;
  created_at: string;
  updated_at: string;
  /** Combat state — see supabase/migrations/0008_initiative.sql */
  in_combat: boolean;
  round: number;
  turn_index: number;
  /** Fog of war — see supabase/migrations/0010_fog_of_war.sql */
  fog_enabled: boolean;
  /** Revealed cell indices (y * grid_cols + x). */
  fog_revealed: number[];
}

/**
 * Owns the scenes for one game and tracks which one is "active".
 *
 * The active scene id is a column on games (games.active_scene_id) so the DM's
 * choice is authoritative and every client sees the same thing. Both `scenes`
 * and the parent game's `active_scene_id` come in over realtime.
 */
export const useScenes = (gameId: string | null, initialActiveSceneId: string | null) => {
  const { user } = useAuth();
  const [scenes, setScenes] = useState<Scene[]>([]);
  const [activeSceneId, setActiveSceneId] = useState<string | null>(initialActiveSceneId);
  const [loading, setLoading] = useState(Boolean(gameId));
  const [error, setError] = useState<string | null>(null);

  // If the parent re-mounts us with a new game, sync the seed.
  useEffect(() => {
    setActiveSceneId(initialActiveSceneId);
  }, [initialActiveSceneId]);

  // Initial load
  useEffect(() => {
    if (!gameId || !supabaseConfigured) {
      setScenes([]);
      setLoading(false);
      return;
    }
    let cancelled = false;
    setLoading(true);
    (async () => {
      const { data, error } = await supabase
        .from("scenes")
        .select("*")
        .eq("game_id", gameId)
        .order("created_at", { ascending: true });
      if (cancelled) return;
      if (error) {
        setError(error.message);
        setScenes([]);
      } else {
        setError(null);
        setScenes((data ?? []) as Scene[]);
      }
      setLoading(false);
    })();
    return () => {
      cancelled = true;
    };
  }, [gameId]);

  // Realtime for scene rows
  useEffect(() => {
    if (!gameId || !supabaseConfigured) return;
    const channel = supabase
      .channel(`scenes:${gameId}`)
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "scenes", filter: `game_id=eq.${gameId}` },
        (payload) => {
          const s = payload.new as Scene;
          setScenes((prev) => (prev.some((p) => p.id === s.id) ? prev : [...prev, s]));
        }
      )
      .on(
        "postgres_changes",
        { event: "UPDATE", schema: "public", table: "scenes", filter: `game_id=eq.${gameId}` },
        (payload) => {
          const s = payload.new as Scene;
          setScenes((prev) => prev.map((p) => (p.id === s.id ? s : p)));
        }
      )
      .on(
        "postgres_changes",
        { event: "DELETE", schema: "public", table: "scenes", filter: `game_id=eq.${gameId}` },
        (payload) => {
          const oldRow = payload.old as { id?: string };
          if (!oldRow.id) return;
          setScenes((prev) => prev.filter((p) => p.id !== oldRow.id));
          setActiveSceneId((cur) => (cur === oldRow.id ? null : cur));
        }
      )
      .subscribe();
    return () => {
      supabase.removeChannel(channel);
    };
  }, [gameId]);

  // Realtime for the parent game's active_scene_id — so when the DM switches,
  // every player's canvas follows without a manual refresh.
  useEffect(() => {
    if (!gameId || !supabaseConfigured) return;
    const channel = supabase
      .channel(`game-active-scene:${gameId}`)
      .on(
        "postgres_changes",
        { event: "UPDATE", schema: "public", table: "games", filter: `id=eq.${gameId}` },
        (payload) => {
          const g = payload.new as { active_scene_id: string | null };
          setActiveSceneId(g.active_scene_id);
        }
      )
      .subscribe();
    return () => {
      supabase.removeChannel(channel);
    };
  }, [gameId]);

  const activeScene = useMemo(
    () => scenes.find((s) => s.id === activeSceneId) ?? scenes[0] ?? null,
    [scenes, activeSceneId]
  );

  const createScene = useCallback(
    async (name: string): Promise<{ scene: Scene | null; error: string | null }> => {
      if (!user || !gameId) return { scene: null, error: "Not signed in" };
      const { data, error } = await supabase
        .from("scenes")
        .insert({ game_id: gameId, name, created_by: user.id })
        .select()
        .single();
      if (error || !data) return { scene: null, error: error?.message ?? "Insert failed" };
      return { scene: data as Scene, error: null };
    },
    [user, gameId]
  );

  const renameScene = useCallback(async (id: string, name: string) => {
    const { error } = await supabase.from("scenes").update({ name }).eq("id", id);
    return { error: error?.message ?? null };
  }, []);

  const setSceneImageUrl = useCallback(async (id: string, imageUrl: string | null) => {
    // Optimistic so the DM's own view swaps instantly; realtime echo confirms.
    setScenes((prev) => prev.map((s) => (s.id === id ? { ...s, image_url: imageUrl } : s)));
    const { error } = await supabase
      .from("scenes")
      .update({ image_url: imageUrl })
      .eq("id", id);
    return { error: error?.message ?? null };
  }, []);

  const deleteScene = useCallback(async (id: string) => {
    // Optimistic — the realtime DELETE echo will confirm.
    setScenes((prev) => prev.filter((s) => s.id !== id));
    const { error } = await supabase.from("scenes").delete().eq("id", id);
    return { error: error?.message ?? null };
  }, []);

  const setActiveScene = useCallback(
    async (sceneId: string) => {
      if (!gameId) return { error: "No game" };
      // Optimistic so the DM's own canvas swaps instantly.
      setActiveSceneId(sceneId);
      const { error } = await supabase
        .from("games")
        .update({ active_scene_id: sceneId })
        .eq("id", gameId);
      return { error: error?.message ?? null };
    },
    [gameId]
  );

  return {
    scenes,
    activeScene,
    activeSceneId: activeScene?.id ?? null,
    loading,
    error,
    createScene,
    renameScene,
    deleteScene,
    setActiveScene,
    setSceneImageUrl,
  };
};
