import { useCallback, useEffect, useState } from "react";
import { supabase, supabaseConfigured } from "../lib/supabase";
import { useAuth } from "./useAuth";

/**
 * Hotspots for one scene — the navigable pins on a scene's backdrop (Phase 2).
 * Coordinates are normalized 0..1 of the backdrop. Scene-scoped + realtime, so
 * pins the DM places/links/moves appear live for every player on that scene.
 */
export interface Hotspot {
  id: string;
  /** Parent — a pin lives on a scene OR a region map (0040), never both. */
  scene_id: string | null;
  region_map_id?: string | null;
  /** Target — a pin leads to a scene OR drills into a deeper region map. */
  target_scene_id: string | null;
  target_map_id?: string | null;
  x: number;
  y: number;
  label: string | null;
  hidden: boolean;
  created_by: string;
  created_at: string;
  updated_at: string;
}

export const useHotspots = (sceneId: string | null) => {
  const { user } = useAuth();
  const [hotspots, setHotspots] = useState<Hotspot[]>([]);

  useEffect(() => {
    if (!sceneId || !supabaseConfigured) {
      setHotspots([]);
      return;
    }
    let cancelled = false;
    void (async () => {
      const { data } = await supabase
        .from("hotspots")
        .select("*")
        .eq("scene_id", sceneId)
        .order("created_at", { ascending: true });
      if (!cancelled) setHotspots((data ?? []) as Hotspot[]);
    })();
    return () => {
      cancelled = true;
    };
  }, [sceneId]);

  useEffect(() => {
    if (!sceneId || !supabaseConfigured) return;
    const channel = supabase
      .channel(`hotspots:${sceneId}`)
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "hotspots", filter: `scene_id=eq.${sceneId}` },
        (p) => {
          const h = p.new as Hotspot;
          setHotspots((prev) => (prev.some((x) => x.id === h.id) ? prev : [...prev, h]));
        }
      )
      .on(
        "postgres_changes",
        { event: "UPDATE", schema: "public", table: "hotspots", filter: `scene_id=eq.${sceneId}` },
        (p) => {
          const h = p.new as Hotspot;
          setHotspots((prev) => prev.map((x) => (x.id === h.id ? h : x)));
        }
      )
      .on(
        "postgres_changes",
        { event: "DELETE", schema: "public", table: "hotspots", filter: `scene_id=eq.${sceneId}` },
        (p) => {
          const old = p.old as { id?: string };
          if (old.id) setHotspots((prev) => prev.filter((x) => x.id !== old.id));
        }
      )
      .subscribe();
    return () => {
      supabase.removeChannel(channel);
    };
  }, [sceneId]);

  const createHotspot = useCallback(
    async (x: number, y: number): Promise<{ hotspot: Hotspot | null; error: string | null }> => {
      if (!user || !sceneId) return { hotspot: null, error: "No scene" };
      const { data, error } = await supabase
        .from("hotspots")
        .insert({ scene_id: sceneId, x, y, created_by: user.id })
        .select()
        .single();
      if (error || !data) return { hotspot: null, error: error?.message ?? "Insert failed" };
      return { hotspot: data as Hotspot, error: null };
    },
    [user, sceneId]
  );

  const updateHotspot = useCallback(
    async (
      id: string,
      patch: Partial<Pick<Hotspot, "target_scene_id" | "label" | "x" | "y" | "hidden">>
    ) => {
      // Optimistic so the DM's edits (link, rename, drag) feel instant.
      setHotspots((prev) => prev.map((h) => (h.id === id ? { ...h, ...patch } : h)));
      const { error } = await supabase.from("hotspots").update(patch).eq("id", id);
      return { error: error?.message ?? null };
    },
    []
  );

  const deleteHotspot = useCallback(async (id: string) => {
    setHotspots((prev) => prev.filter((h) => h.id !== id));
    const { error } = await supabase.from("hotspots").delete().eq("id", id);
    return { error: error?.message ?? null };
  }, []);

  return { hotspots, createHotspot, updateHotspot, deleteHotspot };
};
