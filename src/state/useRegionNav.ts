import { useCallback, useEffect, useState } from "react";
import { supabase, supabaseConfigured } from "../lib/supabase";
import { useAuth } from "./useAuth";
import type { Hotspot } from "./useHotspots";

/**
 * The Region Map navigator's data (IA rework). Region maps are game-scoped
 * navigation maps that NEST via hotspots: a pin on the Kingdom map can open the
 * City map (target_map_id) or travel to a scene (target_scene_id). The panel's
 * root is the oldest map in the game.
 */
export interface RegionMap {
  id: string;
  game_id: string;
  name: string;
  image_url: string;
  created_by: string;
  created_at: string;
  updated_at: string;
}

export const useRegionMaps = (gameId: string | null) => {
  const { user } = useAuth();
  const [regionMaps, setRegionMaps] = useState<RegionMap[]>([]);
  const [loading, setLoading] = useState(Boolean(gameId));

  useEffect(() => {
    if (!gameId || !supabaseConfigured) {
      setRegionMaps([]);
      setLoading(false);
      return;
    }
    let cancelled = false;
    setLoading(true);
    void (async () => {
      const { data } = await supabase
        .from("region_maps")
        .select("*")
        .eq("game_id", gameId)
        .order("created_at", { ascending: true });
      if (cancelled) return;
      setRegionMaps((data ?? []) as RegionMap[]);
      setLoading(false);
    })();
    const channel = supabase
      .channel(`region-maps:${gameId}`)
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "region_maps", filter: `game_id=eq.${gameId}` },
        (p) => {
          const m = p.new as RegionMap;
          setRegionMaps((prev) => (prev.some((x) => x.id === m.id) ? prev : [...prev, m]));
        }
      )
      .on(
        "postgres_changes",
        { event: "UPDATE", schema: "public", table: "region_maps", filter: `game_id=eq.${gameId}` },
        (p) => {
          const m = p.new as RegionMap;
          setRegionMaps((prev) => prev.map((x) => (x.id === m.id ? m : x)));
        }
      )
      .on(
        "postgres_changes",
        { event: "DELETE", schema: "public", table: "region_maps", filter: `game_id=eq.${gameId}` },
        (p) => {
          const old = p.old as { id?: string };
          if (old.id) setRegionMaps((prev) => prev.filter((x) => x.id !== old.id));
        }
      )
      .subscribe();
    return () => {
      cancelled = true;
      supabase.removeChannel(channel);
    };
  }, [gameId]);

  const createRegionMap = useCallback(
    async (name: string, imageUrl: string): Promise<{ map: RegionMap | null; error: string | null }> => {
      if (!user || !gameId) return { map: null, error: "Not signed in" };
      const { data, error } = await supabase
        .from("region_maps")
        .insert({ game_id: gameId, name, image_url: imageUrl, created_by: user.id })
        .select()
        .single();
      if (error || !data) return { map: null, error: error?.message ?? "Insert failed" };
      return { map: data as RegionMap, error: null };
    },
    [user, gameId]
  );

  const deleteRegionMap = useCallback(async (id: string) => {
    setRegionMaps((prev) => prev.filter((m) => m.id !== id));
    const { error } = await supabase.from("region_maps").delete().eq("id", id);
    return { error: error?.message ?? null };
  }, []);

  return { regionMaps, loading, createRegionMap, deleteRegionMap };
};

/** Hotspots living on one region map (same shape as scene hotspots). */
export const useMapHotspots = (regionMapId: string | null) => {
  const { user } = useAuth();
  const [hotspots, setHotspots] = useState<Hotspot[]>([]);

  useEffect(() => {
    if (!regionMapId || !supabaseConfigured) {
      setHotspots([]);
      return;
    }
    let cancelled = false;
    void (async () => {
      const { data } = await supabase
        .from("hotspots")
        .select("*")
        .eq("region_map_id", regionMapId)
        .order("created_at", { ascending: true });
      if (!cancelled) setHotspots((data ?? []) as Hotspot[]);
    })();
    const channel = supabase
      .channel(`map-hotspots:${regionMapId}`)
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "hotspots", filter: `region_map_id=eq.${regionMapId}` },
        (p) => {
          const h = p.new as Hotspot;
          setHotspots((prev) => (prev.some((x) => x.id === h.id) ? prev : [...prev, h]));
        }
      )
      .on(
        "postgres_changes",
        { event: "UPDATE", schema: "public", table: "hotspots", filter: `region_map_id=eq.${regionMapId}` },
        (p) => {
          const h = p.new as Hotspot;
          setHotspots((prev) => prev.map((x) => (x.id === h.id ? h : x)));
        }
      )
      .on(
        "postgres_changes",
        { event: "DELETE", schema: "public", table: "hotspots", filter: `region_map_id=eq.${regionMapId}` },
        (p) => {
          const old = p.old as { id?: string };
          if (old.id) setHotspots((prev) => prev.filter((x) => x.id !== old.id));
        }
      )
      .subscribe();
    return () => {
      cancelled = true;
      supabase.removeChannel(channel);
    };
  }, [regionMapId]);

  const createHotspot = useCallback(
    async (x: number, y: number): Promise<{ hotspot: Hotspot | null; error: string | null }> => {
      if (!user || !regionMapId) return { hotspot: null, error: "No map" };
      const { data, error } = await supabase
        .from("hotspots")
        .insert({ region_map_id: regionMapId, x, y, created_by: user.id })
        .select()
        .single();
      if (error || !data) return { hotspot: null, error: error?.message ?? "Insert failed" };
      return { hotspot: data as Hotspot, error: null };
    },
    [user, regionMapId]
  );

  const updateHotspot = useCallback(
    async (
      id: string,
      patch: Partial<Pick<Hotspot, "target_scene_id" | "target_map_id" | "label" | "x" | "y" | "hidden">>
    ) => {
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
