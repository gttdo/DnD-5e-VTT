import { useCallback, useEffect, useRef, useState } from "react";
import { supabase, supabaseConfigured } from "../lib/supabase";
import { useAuth } from "./useAuth";

export interface MapAsset {
  id: string;
  owner_id: string;
  name: string;
  image_url: string;
  prompt: string | null;
  family: string | null;
  style: string | null;
  size: string | null;
  /** Published to the shared library — readable by every account (#135/#137).
   *  Optional for a pre-0032 schema. */
  is_public?: boolean;
  created_at: string;
  updated_at: string;
}

export interface NewMapInput {
  name: string;
  image_url: string;
  prompt?: string | null;
  family?: string | null;
  style?: string | null;
  size?: string | null;
}

/**
 * The DM's personal map library. Owner-scoped (RLS enforces it). Realtime so
 * the library updates immediately when a generate-image call completes on this
 * or another device.
 */
export const useMaps = () => {
  const { user } = useAuth();
  const [maps, setMaps] = useState<MapAsset[]>([]);
  const [loading, setLoading] = useState<boolean>(Boolean(user));
  const [error, setError] = useState<string | null>(null);
  // Two components can mount useMaps concurrently (e.g. MapLibraryScreen and
  // its nested GenerateMapDialog). Supabase realtime rejects a second
  // subscription that reuses a channel name after subscribe(), so we tag
  // this instance's channel with a per-mount uuid.
  const instanceId = useRef(crypto.randomUUID()).current;

  const refresh = useCallback(async () => {
    if (!user || !supabaseConfigured) {
      setMaps([]);
      setLoading(false);
      return;
    }
    setLoading(true);
    // Own maps PLUS any published to the shared library (#135). Falls back to
    // own-only when the is_public column isn't there yet (pre-0032 deploy window).
    let { data, error } = await supabase
      .from("maps")
      .select("*")
      .or(`owner_id.eq.${user.id},is_public.eq.true`)
      .order("created_at", { ascending: false });
    if (error && /is_public/i.test(error.message)) {
      ({ data, error } = await supabase
        .from("maps")
        .select("*")
        .eq("owner_id", user.id)
        .order("created_at", { ascending: false }));
    }
    if (error) {
      setError(error.message);
      setMaps([]);
    } else {
      setError(null);
      setMaps((data ?? []) as MapAsset[]);
    }
    setLoading(false);
  }, [user]);

  useEffect(() => {
    refresh();
  }, [refresh]);

  // Realtime — a fresh insert (from GenerateMapDialog) should light up the
  // library without a manual reload. Patch state directly to avoid a refetch.
  useEffect(() => {
    if (!user || !supabaseConfigured) return;
    const channel = supabase
      .channel(`maps:${user.id}:${instanceId}`)
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "maps", filter: `owner_id=eq.${user.id}` },
        (payload) => {
          const m = payload.new as MapAsset;
          setMaps((prev) => (prev.some((p) => p.id === m.id) ? prev : [m, ...prev]));
        }
      )
      .on(
        "postgres_changes",
        { event: "UPDATE", schema: "public", table: "maps", filter: `owner_id=eq.${user.id}` },
        (payload) => {
          const m = payload.new as MapAsset;
          setMaps((prev) => prev.map((p) => (p.id === m.id ? m : p)));
        }
      )
      .on(
        "postgres_changes",
        { event: "DELETE", schema: "public", table: "maps", filter: `owner_id=eq.${user.id}` },
        (payload) => {
          const oldRow = payload.old as { id?: string };
          if (!oldRow.id) return;
          setMaps((prev) => prev.filter((p) => p.id !== oldRow.id));
        }
      )
      .subscribe();
    return () => {
      supabase.removeChannel(channel);
    };
  }, [user, instanceId]);

  const createMap = useCallback(
    async (input: NewMapInput): Promise<{ map: MapAsset | null; error: string | null }> => {
      if (!user) return { map: null, error: "Not signed in" };
      const { data, error } = await supabase
        .from("maps")
        .insert({
          owner_id: user.id,
          name: input.name,
          image_url: input.image_url,
          prompt: input.prompt ?? null,
          family: input.family ?? null,
          style: input.style ?? null,
          size: input.size ?? null,
        })
        .select()
        .single();
      if (error || !data) return { map: null, error: error?.message ?? "Insert failed" };
      return { map: data as MapAsset, error: null };
    },
    [user]
  );

  const renameMap = useCallback(async (id: string, name: string) => {
    const { error } = await supabase.from("maps").update({ name }).eq("id", id);
    return { error: error?.message ?? null };
  }, []);

  const deleteMap = useCallback(async (id: string) => {
    setMaps((prev) => prev.filter((m) => m.id !== id));
    const { error } = await supabase.from("maps").delete().eq("id", id);
    return { error: error?.message ?? null };
  }, []);

  // Publish/unpublish a map to the shared library (#137). Owner-only at the DB
  // (maps_owner_all). Optimistic so the badge flips instantly.
  const setMapPublic = useCallback(async (id: string, isPublic: boolean) => {
    setMaps((prev) => prev.map((m) => (m.id === id ? { ...m, is_public: isPublic } : m)));
    const { error } = await supabase.from("maps").update({ is_public: isPublic }).eq("id", id);
    return { error: error?.message ?? null };
  }, []);

  return { maps, loading, error, createMap, renameMap, deleteMap, setMapPublic, refresh };
};
