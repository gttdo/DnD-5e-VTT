import { useCallback, useEffect, useMemo, useState } from "react";
import { supabase, supabaseConfigured } from "../lib/supabase";
import { useAuth } from "./useAuth";

export interface Scene {
  id: string;
  game_id: string;
  name: string;
  /** The TACTICAL face — top-down battlemap drawn under the grid. */
  image_url: string | null;
  /** The CINEMATIC face — atmospheric backdrop of the same place (#Phase 1).
   *  Null until the DM sets one. Rendered full-bleed in cinematic mode, and
   *  blurred behind the grid in tactical mode (fills the letterbox margins). */
  cinematic_url?: string | null;
  /** Which face the DM is currently showing. 'tactical' preserves the old
   *  behavior and is the default for every pre-0035 scene. */
  mode?: "cinematic" | "tactical";
  grid_cols: number;
  grid_rows: number;
  map_id: string | null;
  /** Map-to-grid alignment (#115): the background image is drawn at this offset
   *  (SVG board units) and uniform scale so its baked-in grid lines up with the
   *  canonical overlay. Optional for a pre-0034 schema — defaults are 0/0/1
   *  (fills the board 1:1, the old behavior). */
  map_offset_x?: number;
  map_offset_y?: number;
  map_scale?: number;
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
export const useScenes = (
  gameId: string | null,
  initialActiveSceneId: string | null,
  opts?: { stageOnly?: boolean }
) => {
  // stageOnly (the projector): always resolve the game's stage, ignoring the
  // viewer's per-member override — the cast screen shows the DM's stage, never
  // whoever happens to be signed in on that device.
  const stageOnly = opts?.stageOnly ?? false;
  const { user } = useAuth();
  const [scenes, setScenes] = useState<Scene[]>([]);
  // The game-wide "stage" (games.active_scene_id) — the DM's default + what the
  // projector casts.
  const [activeSceneId, setActiveSceneId] = useState<string | null>(initialActiveSceneId);
  // This member's own override (game_members.current_scene_id). null = follow the
  // stage. When set, THIS client resolves to it instead (#Phase 3 per-player nav).
  const [myCurrentSceneId, setMyCurrentSceneId] = useState<string | null>(null);
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

  // Load + live-track THIS member's override (game_members.current_scene_id).
  // Filtered to my row; a DM "gather" or my own navigation both echo here.
  useEffect(() => {
    if (!gameId || !user || !supabaseConfigured || stageOnly) {
      setMyCurrentSceneId(null);
      return;
    }
    let cancelled = false;
    void (async () => {
      const { data } = await supabase
        .from("game_members")
        .select("current_scene_id")
        .eq("game_id", gameId)
        .eq("user_id", user.id)
        .maybeSingle();
      if (!cancelled) setMyCurrentSceneId((data as { current_scene_id?: string | null })?.current_scene_id ?? null);
    })();
    const channel = supabase
      .channel(`member-scene:${gameId}:${user.id}`)
      .on(
        "postgres_changes",
        {
          event: "UPDATE",
          schema: "public",
          table: "game_members",
          filter: `game_id=eq.${gameId}`,
        },
        (payload) => {
          const row = payload.new as { user_id?: string; current_scene_id?: string | null };
          if (row.user_id === user.id) setMyCurrentSceneId(row.current_scene_id ?? null);
        }
      )
      .subscribe();
    return () => {
      cancelled = true;
      supabase.removeChannel(channel);
    };
  }, [gameId, user, stageOnly]);

  // A member resolves to their own override when they have one, else the stage.
  // The projector (stageOnly) always shows the stage.
  const effectiveSceneId = stageOnly ? activeSceneId : myCurrentSceneId ?? activeSceneId;
  const activeScene = useMemo(
    () => scenes.find((s) => s.id === effectiveSceneId) ?? scenes[0] ?? null,
    [scenes, effectiveSceneId]
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

  // The cinematic backdrop face (#Phase 1). Optimistic, same as image_url.
  const setSceneCinematicUrl = useCallback(async (id: string, url: string | null) => {
    setScenes((prev) => prev.map((s) => (s.id === id ? { ...s, cinematic_url: url } : s)));
    const { error } = await supabase
      .from("scenes")
      .update({ cinematic_url: url })
      .eq("id", id);
    return { error: error?.message ?? null };
  }, []);

  // The DM flips a scene between its cinematic and tactical faces. Optimistic so
  // the DM's own board swaps instantly; the realtime echo carries it to players.
  const setSceneMode = useCallback(async (id: string, mode: "cinematic" | "tactical") => {
    setScenes((prev) => prev.map((s) => (s.id === id ? { ...s, mode } : s)));
    const { error } = await supabase.from("scenes").update({ mode }).eq("id", id);
    return { error: error?.message ?? null };
  }, []);

  // Grid + map-alignment layout (#115). Optimistic so the DM sees the map/grid
  // move live while calibrating; the realtime echo confirms for everyone.
  const updateSceneLayout = useCallback(
    async (
      id: string,
      patch: Partial<Pick<Scene, "grid_cols" | "grid_rows" | "map_offset_x" | "map_offset_y" | "map_scale">>
    ) => {
      setScenes((prev) => prev.map((s) => (s.id === id ? { ...s, ...patch } : s)));
      const { error } = await supabase.from("scenes").update(patch).eq("id", id);
      return { error: error?.message ?? null };
    },
    []
  );

  const deleteScene = useCallback(async (id: string) => {
    // Optimistic — the realtime DELETE echo will confirm.
    setScenes((prev) => prev.filter((s) => s.id !== id));
    const { error } = await supabase.from("scenes").delete().eq("id", id);
    return { error: error?.message ?? null };
  }, []);

  // The DM moves the STAGE (games.active_scene_id) — the default everyone
  // without an override follows, and what the projector casts. Also clears the
  // caller's own override so the DM follows the scene they just selected.
  const setActiveScene = useCallback(
    async (sceneId: string) => {
      if (!gameId) return { error: "No game" };
      setActiveSceneId(sceneId);
      if (user) {
        setMyCurrentSceneId(null);
        void supabase
          .from("game_members")
          .update({ current_scene_id: null })
          .eq("game_id", gameId)
          .eq("user_id", user.id);
      }
      const { error } = await supabase
        .from("games")
        .update({ active_scene_id: sceneId })
        .eq("id", gameId);
      return { error: error?.message ?? null };
    },
    [gameId, user]
  );

  // A member navigates THEMSELVES (hotspot travel, free-roam) — sets their own
  // override without touching the stage or anyone else.
  const navigateToScene = useCallback(
    async (sceneId: string) => {
      if (!gameId || !user) return { error: "Not signed in" };
      setMyCurrentSceneId(sceneId); // optimistic
      const { error } = await supabase
        .from("game_members")
        .update({ current_scene_id: sceneId })
        .eq("game_id", gameId)
        .eq("user_id", user.id);
      return { error: error?.message ?? null };
    },
    [gameId, user]
  );

  // A member drops their own override and rejoins the stage.
  const returnToStage = useCallback(async () => {
    if (!gameId || !user) return { error: "Not signed in" };
    setMyCurrentSceneId(null); // optimistic
    const { error } = await supabase
      .from("game_members")
      .update({ current_scene_id: null })
      .eq("game_id", gameId)
      .eq("user_id", user.id);
    return { error: error?.message ?? null };
  }, [gameId, user]);

  // The DM gathers everyone back to the stage by clearing every override.
  const gatherParty = useCallback(async () => {
    if (!gameId) return { error: "No game" };
    setMyCurrentSceneId(null); // optimistic for the DM's own view
    const { error } = await supabase
      .from("game_members")
      .update({ current_scene_id: null })
      .eq("game_id", gameId);
    return { error: error?.message ?? null };
  }, [gameId]);

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
    navigateToScene,
    returnToStage,
    gatherParty,
    /** True when this member is roaming off the DM's stage (has an override). */
    isRoaming: myCurrentSceneId != null && myCurrentSceneId !== activeSceneId,
    setSceneImageUrl,
    setSceneCinematicUrl,
    setSceneMode,
    updateSceneLayout,
  };
};
