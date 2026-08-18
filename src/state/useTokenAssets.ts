import { useCallback, useEffect, useRef, useState } from "react";
import { supabase, supabaseConfigured } from "../lib/supabase";
import { useAuth } from "./useAuth";
import type { TokenSize } from "../lib/tokenSmith";
import type { TokenType, TokenDetails } from "../types/content";

export interface TokenAsset {
  id: string;
  owner_id: string;
  name: string;
  image_url: string;
  prompt: string | null;
  family: string | null;
  size_category: TokenSize;
  creature_type: string | null;
  /** monster | npc | item — null for a plain art token. */
  token_type: TokenType | null;
  /** Statblock / NPC profile / item details, keyed by token_type. */
  details: TokenDetails | null;
  /** A shared "premade" row every account can read (the seeded SRD library).
   *  Only the owner can edit/delete it. Optional for a pre-0031 schema. */
  is_public?: boolean;
  created_at: string;
  updated_at: string;
}

export interface NewTokenAssetInput {
  name: string;
  image_url: string;
  prompt?: string | null;
  family?: string | null;
  size_category?: TokenSize;
  creature_type?: string | null;
  token_type?: TokenType | null;
  details?: TokenDetails | null;
}

/**
 * The DM's personal token library — mirror of useMaps, scoped to token art.
 * Realtime + per-instance channel uuid so overlapping mounts (library screen
 * + generator dialog) don't collide on the subscription name.
 */
export const useTokenAssets = () => {
  const { user } = useAuth();
  const [assets, setAssets] = useState<TokenAsset[]>([]);
  const [loading, setLoading] = useState<boolean>(Boolean(user));
  const [error, setError] = useState<string | null>(null);
  const instanceId = useRef(crypto.randomUUID()).current;

  const refresh = useCallback(async () => {
    if (!user || !supabaseConfigured) {
      setAssets([]);
      setLoading(false);
      return;
    }
    setLoading(true);
    // Own rows PLUS the shared premade library (is_public). The RLS read policy
    // (0031) permits both; this widens the query to match. #135
    let { data, error } = await supabase
      .from("token_assets")
      .select("*")
      .or(`owner_id.eq.${user.id},is_public.eq.true`)
      .order("created_at", { ascending: false });
    // Pre-0031 schema (migration not yet applied): no is_public column — fall
    // back to own rows only so the library still loads during the deploy window.
    if (error && /is_public/i.test(error.message)) {
      ({ data, error } = await supabase
        .from("token_assets")
        .select("*")
        .eq("owner_id", user.id)
        .order("created_at", { ascending: false }));
    }
    if (error) {
      setError(error.message);
      setAssets([]);
    } else {
      setError(null);
      setAssets((data ?? []) as TokenAsset[]);
    }
    setLoading(false);
  }, [user]);

  useEffect(() => {
    refresh();
  }, [refresh]);

  useEffect(() => {
    if (!user || !supabaseConfigured) return;
    const channel = supabase
      .channel(`token_assets:${user.id}:${instanceId}`)
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "token_assets", filter: `owner_id=eq.${user.id}` },
        (payload) => {
          const t = payload.new as TokenAsset;
          setAssets((prev) => (prev.some((p) => p.id === t.id) ? prev : [t, ...prev]));
        }
      )
      .on(
        "postgres_changes",
        { event: "UPDATE", schema: "public", table: "token_assets", filter: `owner_id=eq.${user.id}` },
        (payload) => {
          const t = payload.new as TokenAsset;
          setAssets((prev) => prev.map((p) => (p.id === t.id ? t : p)));
        }
      )
      .on(
        "postgres_changes",
        { event: "DELETE", schema: "public", table: "token_assets", filter: `owner_id=eq.${user.id}` },
        (payload) => {
          const oldRow = payload.old as { id?: string };
          if (!oldRow.id) return;
          setAssets((prev) => prev.filter((p) => p.id !== oldRow.id));
        }
      )
      .subscribe();
    return () => {
      supabase.removeChannel(channel);
    };
  }, [user, instanceId]);

  const createAsset = useCallback(
    async (input: NewTokenAssetInput): Promise<{ asset: TokenAsset | null; error: string | null }> => {
      if (!user) return { asset: null, error: "Not signed in" };
      const { data, error } = await supabase
        .from("token_assets")
        .insert({
          owner_id: user.id,
          name: input.name,
          image_url: input.image_url,
          prompt: input.prompt ?? null,
          family: input.family ?? null,
          size_category: input.size_category ?? "medium",
          creature_type: input.creature_type ?? null,
          token_type: input.token_type ?? null,
          details: input.details ?? null,
        })
        .select()
        .single();
      if (error || !data) return { asset: null, error: error?.message ?? "Insert failed" };
      return { asset: data as TokenAsset, error: null };
    },
    [user]
  );

  const renameAsset = useCallback(async (id: string, name: string) => {
    const { error } = await supabase.from("token_assets").update({ name }).eq("id", id);
    return { error: error?.message ?? null };
  }, []);

  // Patch an existing asset — used by the studio's "edit / add stats" mode to
  // attach a stat block (and refreshed size/type) to a token made before stats
  // existed, without touching its art.
  const updateAsset = useCallback(
    async (
      id: string,
      patch: Partial<Pick<TokenAsset, "name" | "image_url" | "token_type" | "details" | "size_category" | "creature_type">>
    ) => {
      const { error } = await supabase.from("token_assets").update(patch).eq("id", id);
      return { error: error?.message ?? null };
    },
    []
  );

  const deleteAsset = useCallback(async (id: string) => {
    setAssets((prev) => prev.filter((a) => a.id !== id));
    const { error } = await supabase.from("token_assets").delete().eq("id", id);
    return { error: error?.message ?? null };
  }, []);

  return { assets, loading, error, createAsset, renameAsset, updateAsset, deleteAsset, refresh };
};
