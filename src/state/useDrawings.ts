import { useCallback, useEffect, useState } from "react";
import { supabase, supabaseConfigured } from "../lib/supabase";
import { useAuth } from "./useAuth";

/**
 * Live-syncing freehand drawings + shapes for one scene.
 *
 * Structurally a smaller useTokens: read on mount, subscribe to
 * postgres_changes for this scene, patch the local list on insert/delete.
 * A committed drawing never changes, so there's no UPDATE path — you draw it
 * or you erase it.
 */

export type DrawKind = "pen" | "rect" | "ellipse" | "arrow";

export interface Drawing {
  id: string;
  scene_id: string;
  game_id: string;
  kind: DrawKind;
  color: string;
  /** Flat SVG user coords. Pen: whole path; shapes: [x0,y0,x1,y1]. */
  points: number[];
  created_by: string;
  created_at: string;
}

export interface NewDrawing {
  kind: DrawKind;
  color: string;
  points: number[];
}

export const useDrawings = (gameId: string | null, sceneId: string | null) => {
  const { user } = useAuth();
  const [drawings, setDrawings] = useState<Drawing[]>([]);

  useEffect(() => {
    if (!sceneId || !supabaseConfigured) {
      setDrawings([]);
      return;
    }
    let cancelled = false;
    (async () => {
      const { data } = await supabase
        .from("drawings")
        .select("*")
        .eq("scene_id", sceneId)
        .order("created_at", { ascending: true });
      if (!cancelled) setDrawings((data ?? []) as Drawing[]);
    })();
    return () => {
      cancelled = true;
    };
  }, [sceneId]);

  useEffect(() => {
    if (!sceneId || !supabaseConfigured) return;
    const channel = supabase
      .channel(`drawings:${sceneId}`)
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "drawings", filter: `scene_id=eq.${sceneId}` },
        (payload) => {
          const d = payload.new as Drawing;
          setDrawings((prev) => (prev.some((p) => p.id === d.id) ? prev : [...prev, d]));
        }
      )
      .on(
        "postgres_changes",
        { event: "DELETE", schema: "public", table: "drawings", filter: `scene_id=eq.${sceneId}` },
        (payload) => {
          const old = payload.old as { id?: string };
          if (old.id) setDrawings((prev) => prev.filter((p) => p.id !== old.id));
        }
      )
      .subscribe();
    return () => {
      supabase.removeChannel(channel);
    };
  }, [sceneId]);

  const addDrawing = useCallback(
    async (input: NewDrawing): Promise<{ error: string | null }> => {
      if (!user || !gameId || !sceneId) return { error: "No active scene" };
      // Optimistic so the DM's own ink appears the instant they release; the
      // realtime INSERT echo replaces this temp row (deduped by id).
      const temp: Drawing = {
        id: `temp-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
        scene_id: sceneId,
        game_id: gameId,
        created_by: user.id,
        created_at: new Date(0).toISOString(),
        ...input,
      };
      setDrawings((prev) => [...prev, temp]);
      const { data, error } = await supabase
        .from("drawings")
        .insert({ scene_id: sceneId, game_id: gameId, created_by: user.id, ...input })
        .select()
        .single();
      if (error) {
        setDrawings((prev) => prev.filter((d) => d.id !== temp.id));
        return { error: error.message };
      }
      // Swap temp → real row (realtime echo may also arrive; dedupe by id).
      setDrawings((prev) => {
        const withoutTemp = prev.filter((d) => d.id !== temp.id);
        return withoutTemp.some((d) => d.id === (data as Drawing).id)
          ? withoutTemp
          : [...withoutTemp, data as Drawing];
      });
      return { error: null };
    },
    [user, gameId, sceneId]
  );

  const eraseDrawing = useCallback(async (id: string): Promise<{ error: string | null }> => {
    setDrawings((prev) => prev.filter((d) => d.id !== id));
    if (id.startsWith("temp-")) return { error: null };
    const { error } = await supabase.from("drawings").delete().eq("id", id);
    return { error: error?.message ?? null };
  }, []);

  const clearDrawings = useCallback(
    async (mineOnly: boolean): Promise<{ error: string | null }> => {
      if (!sceneId) return { error: "No active scene" };
      setDrawings((prev) => (mineOnly ? prev.filter((d) => d.created_by !== user?.id) : []));
      let q = supabase.from("drawings").delete().eq("scene_id", sceneId);
      if (mineOnly && user) q = q.eq("created_by", user.id);
      const { error } = await q;
      return { error: error?.message ?? null };
    },
    [sceneId, user]
  );

  return { drawings, addDrawing, eraseDrawing, clearDrawings };
};
