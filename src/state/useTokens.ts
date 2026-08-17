import { useCallback, useEffect, useState } from "react";
import { supabase, supabaseConfigured } from "../lib/supabase";
import { useAuth } from "./useAuth";
import type { MonsterStatblock, SpellAreaShape } from "../types/content";
import type { TokenLoot } from "../lib/loot";

export type TokenSize = "tiny" | "small" | "medium" | "large" | "huge" | "gargantuan";

/** A placed token's board role. null/absent = a creature/PC/plain art token
 *  (the default): targetable, movable. 'prop' = scenery/container (not a combat
 *  target). 'spell' = a translucent area-effect footprint. */
export type TokenKind = "prop" | "spell";

/** The area footprint copied onto a placed spell token (frozen at cast/placement,
 *  like statblock in migration 0016), so the board sizes the render without a
 *  join back to the library asset. */
export interface TokenArea {
  shape?: SpellAreaShape;
  /** Feet — radius for sphere/cylinder/emanation, length for cube/cone/line. */
  size?: number;
  damageType?: string;
  level?: number;
  /** Rotation in degrees (0 = pointing right). Aims directional shapes — a cone
   *  or line — around the token's origin. Ignored for radial shapes. */
  facing?: number;
  /** A rare relocatable area (Moonbeam, Flaming Sphere). Most area spells are
   *  fixed once placed; this flag is what lets one be moved after casting. */
  movable?: boolean;
}

export interface Token {
  id: string;
  game_id: string;
  scene_id: string;
  label: string;
  x: number;
  y: number;
  color: string;
  image_url: string | null;
  character_id: string | null;
  controller: "dm" | "player" | "ai";
  size: TokenSize;
  token_id: string | null;
  created_by: string;
  created_at: string;
  updated_at: string;
  /** Rolled initiative; null means "not in the current combat". */
  initiative: number | null;
  /** DM-only: true = players neither see nor fight this token. */
  hidden: boolean;
  /** Monster stats copied at placement — drives the DM's in-combat HUD. */
  statblock: MonsterStatblock | null;
  /** Per-instance HP (each placed monster takes damage independently). Also
   *  mirrors a player character's HP onto the token so the whole table can see
   *  it (the owner's client keeps it synced; see TableCanvas). */
  hp_current: number | null;
  hp_max: number | null;
  /** A bound player character's level, mirrored onto the token so others can see
   *  it at a glance. Null for monsters/props. Optional for a pre-0022 schema. */
  char_level?: number | null;
  /** Active condition slugs shown as badges on the board (e.g. "paralyzed").
   *  Optional so reads tolerate a pre-migration schema. */
  conditions?: string[] | null;
  /** Coins + items carried by this token, taken when it's looted. Generated
   *  once (frozen) and stored as jsonb. Optional for a pre-migration schema. */
  loot?: TokenLoot | null;
  /** Board role — 'prop' | 'spell' | (null = creature/PC). Optional so reads
   *  tolerate a pre-0021 schema. See TokenKind. */
  kind?: TokenKind | null;
  /** Spell area footprint (only on 'spell' tokens). */
  area?: TokenArea | null;
  /** Hostility to the party — drives Opportunity Attacks (#101). null = unset
   *  (a statblock creature reads as hostile; a PC reads as party-side). DM sets
   *  it from the initiative tracker. Optional for a pre-0030 schema. */
  disposition?: "hostile" | "friendly" | null;
}

export interface NewToken {
  label: string;
  x?: number;
  y?: number;
  color?: string;
  image_url?: string | null;
  character_id?: string | null;
  controller?: "dm" | "player" | "ai";
  size?: TokenSize;
  token_id?: string | null;
  statblock?: MonsterStatblock | null;
  hp_current?: number | null;
  hp_max?: number | null;
  char_level?: number | null;
  kind?: TokenKind | null;
  area?: TokenArea | null;
  loot?: TokenLoot | null;
}

/**
 * Live-syncing tokens for one scene. Reads on mount, subscribes to
 * postgres_changes filtered to this scene_id, and applies inserts/updates/deletes
 * locally without a full refetch. Moves are applied optimistically so a drag
 * feels instant — the realtime echo lands as a no-op if we're already there.
 *
 * gameId is passed alongside sceneId because the tokens row carries both
 * (game_id is redundant but keeps some RLS + realtime filters simpler).
 */
export const useTokens = (gameId: string | null, sceneId: string | null) => {
  const { user } = useAuth();
  const [tokens, setTokens] = useState<Token[]>([]);
  const [loading, setLoading] = useState(Boolean(sceneId));
  const [error, setError] = useState<string | null>(null);

  // Initial load whenever the scene changes.
  useEffect(() => {
    if (!sceneId || !supabaseConfigured) {
      setTokens([]);
      setLoading(false);
      return;
    }
    let cancelled = false;
    setLoading(true);
    (async () => {
      const { data, error } = await supabase
        .from("tokens")
        .select("*")
        .eq("scene_id", sceneId)
        .order("created_at", { ascending: true });
      if (cancelled) return;
      if (error) {
        setError(error.message);
        setTokens([]);
      } else {
        setError(null);
        setTokens((data ?? []) as Token[]);
      }
      setLoading(false);
    })();
    return () => {
      cancelled = true;
    };
  }, [sceneId]);

  // Realtime: patch the local list directly instead of refetching so moves are cheap.
  useEffect(() => {
    if (!sceneId || !supabaseConfigured) return;
    const channel = supabase
      .channel(`tokens:${sceneId}`)
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "tokens", filter: `scene_id=eq.${sceneId}` },
        (payload) => {
          const t = payload.new as Token;
          setTokens((prev) => (prev.some((p) => p.id === t.id) ? prev : [...prev, t]));
        }
      )
      .on(
        "postgres_changes",
        { event: "UPDATE", schema: "public", table: "tokens", filter: `scene_id=eq.${sceneId}` },
        (payload) => {
          const t = payload.new as Token;
          setTokens((prev) => prev.map((p) => (p.id === t.id ? t : p)));
        }
      )
      .on(
        "postgres_changes",
        // `replica identity full` on tokens is what makes payload.old carry
        // enough to identify the row on delete.
        { event: "DELETE", schema: "public", table: "tokens", filter: `scene_id=eq.${sceneId}` },
        (payload) => {
          const oldRow = payload.old as { id?: string };
          if (!oldRow.id) return;
          setTokens((prev) => prev.filter((p) => p.id !== oldRow.id));
        }
      )
      .subscribe();
    return () => {
      supabase.removeChannel(channel);
    };
  }, [sceneId]);

  const addToken = useCallback(
    async (input: NewToken): Promise<{ error: string | null }> => {
      if (!user || !gameId || !sceneId) return { error: "No active scene" };
      const { error } = await supabase.from("tokens").insert({
        game_id: gameId,
        scene_id: sceneId,
        label: input.label,
        x: input.x ?? 0,
        y: input.y ?? 0,
        color: input.color ?? "#c9a24a",
        image_url: input.image_url ?? null,
        character_id: input.character_id ?? null,
        controller: input.controller ?? "dm",
        size: input.size ?? "medium",
        token_id: input.token_id ?? null,
        created_by: user.id,
        // Only reference the monster columns when there's actually a statblock,
        // so plain/character tokens keep working before migration 0016 is run.
        ...(input.statblock != null ? { statblock: input.statblock } : {}),
        ...(input.hp_current != null ? { hp_current: input.hp_current } : {}),
        ...(input.hp_max != null ? { hp_max: input.hp_max } : {}),
        ...(input.char_level != null ? { char_level: input.char_level } : {}),
        // Prop/Spell board behavior (migration 0021). Only referenced when set,
        // so placement stays compatible with a pre-0021 schema.
        ...(input.kind != null ? { kind: input.kind } : {}),
        ...(input.area != null ? { area: input.area } : {}),
        ...(input.loot != null ? { loot: input.loot } : {}),
      });
      if (error) return { error: error.message };
      // Realtime INSERT event will populate the row; nothing else to do here.
      return { error: null };
    },
    [user, gameId, sceneId]
  );

  /** Optimistically patch a token (HP edits from the monster HUD). */
  const updateToken = useCallback(
    async (id: string, patch: Partial<Pick<Token, "hp_current" | "hp_max" | "conditions" | "loot" | "area" | "char_level" | "disposition">>): Promise<{ error: string | null }> => {
      setTokens((prev) => prev.map((t) => (t.id === id ? { ...t, ...patch } : t)));
      const { error } = await supabase.from("tokens").update(patch).eq("id", id);
      return { error: error?.message ?? null };
    },
    []
  );

  const moveToken = useCallback(
    async (id: string, x: number, y: number): Promise<{ error: string | null }> => {
      // Optimistic — don't wait on the network to redraw the piece. Capture the
      // prior cell so we can roll back if the DB rejects it (the move-guard
      // trigger: not your token). Without this, a rejected move lingers as a
      // ghost-move that vanishes only on refresh.
      const prevPos: { x: number; y: number }[] = [];
      setTokens((p) =>
        p.map((t) => {
          if (t.id !== id) return t;
          prevPos.push({ x: t.x, y: t.y });
          return { ...t, x, y };
        })
      );
      const { error } = await supabase.from("tokens").update({ x, y }).eq("id", id);
      if (error && prevPos.length) {
        const back = prevPos[0];
        setTokens((p) => p.map((t) => (t.id === id ? { ...t, x: back.x, y: back.y } : t)));
      }
      return { error: error?.message ?? null };
    },
    []
  );

  /** DM-only. Optimistic, like moveToken — hiding should feel instant.
   *  Hiding also clears initiative: a hidden token must leave the turn order
   *  (it's excluded from every client's combat pool, and a stale score would
   *  yank it straight back in on reveal). */
  const setTokenHidden = useCallback(
    async (id: string, hidden: boolean): Promise<{ error: string | null }> => {
      const patch = hidden ? { hidden, initiative: null } : { hidden };
      setTokens((prev) => prev.map((t) => (t.id === id ? { ...t, ...patch } : t)));
      const { error } = await supabase.from("tokens").update(patch).eq("id", id);
      if (error) {
        // Roll back — a token that looks hidden but isn't would mislead the DM.
        setTokens((prev) => prev.map((t) => (t.id === id ? { ...t, hidden: !hidden } : t)));
      }
      return { error: error?.message ?? null };
    },
    []
  );

  const deleteToken = useCallback(async (id: string): Promise<{ error: string | null }> => {
    setTokens((prev) => prev.filter((t) => t.id !== id));
    const { error } = await supabase.from("tokens").delete().eq("id", id);
    return { error: error?.message ?? null };
  }, []);

  return { tokens, loading, error, addToken, moveToken, deleteToken, setTokenHidden, updateToken };
};
