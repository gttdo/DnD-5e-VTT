import { useCallback, useEffect, useMemo, useState } from "react";
import { supabase, supabaseConfigured } from "../lib/supabase";
import { useAuth } from "./useAuth";

/**
 * Campaign Editor data (docs/campaign-editor.md, slice 1a).
 *
 * Chapters group scenes in story-space and carry draft/published — the gate
 * between prep and play. Documents are the narrative atoms (note, read-aloud,
 * quest, recap) attachable at scene, chapter, session, or campaign level.
 */

export interface Chapter {
  id: string;
  game_id: string;
  title: string;
  position: number;
  region_map_id: string | null;
  status: "draft" | "published";
  created_by: string;
  created_at: string;
  updated_at: string;
}

export type DocKind = "note" | "read_aloud" | "quest" | "recap" | "handout";

export interface CampaignDoc {
  id: string;
  game_id: string;
  kind: DocKind;
  title: string;
  content: string;
  visibility: "dm" | "players";
  scene_id: string | null;
  chapter_id: string | null;
  session_id: string | null;
  position: number;
  /** Structured payload (#0042) — handouts store {template, fields} here. */
  meta?: Record<string, unknown>;
  created_by: string;
  created_at: string;
  updated_at: string;
}

export const useChapters = (gameId: string | null) => {
  const { user } = useAuth();
  const [chapters, setChapters] = useState<Chapter[]>([]);
  const [loading, setLoading] = useState(Boolean(gameId));

  useEffect(() => {
    if (!gameId || !supabaseConfigured) {
      setChapters([]);
      setLoading(false);
      return;
    }
    let cancelled = false;
    setLoading(true);
    void (async () => {
      const { data } = await supabase
        .from("chapters")
        .select("*")
        .eq("game_id", gameId)
        .order("position", { ascending: true });
      if (cancelled) return;
      setChapters((data ?? []) as Chapter[]);
      setLoading(false);
    })();
    const channel = supabase
      .channel(`chapters:${gameId}`)
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "chapters", filter: `game_id=eq.${gameId}` },
        (p) => {
          const c = p.new as Chapter;
          setChapters((prev) => (prev.some((x) => x.id === c.id) ? prev : [...prev, c].sort((a, b) => a.position - b.position)));
        }
      )
      .on(
        "postgres_changes",
        { event: "UPDATE", schema: "public", table: "chapters", filter: `game_id=eq.${gameId}` },
        (p) => {
          const c = p.new as Chapter;
          setChapters((prev) => prev.map((x) => (x.id === c.id ? c : x)).sort((a, b) => a.position - b.position));
        }
      )
      .on(
        "postgres_changes",
        { event: "DELETE", schema: "public", table: "chapters", filter: `game_id=eq.${gameId}` },
        (p) => {
          const old = p.old as { id?: string };
          if (old.id) setChapters((prev) => prev.filter((x) => x.id !== old.id));
        }
      )
      .subscribe();
    return () => {
      cancelled = true;
      supabase.removeChannel(channel);
    };
  }, [gameId]);

  const createChapter = useCallback(
    async (title: string): Promise<{ chapter: Chapter | null; error: string | null }> => {
      if (!user || !gameId) return { chapter: null, error: "Not signed in" };
      const position = chapters.length ? Math.max(...chapters.map((c) => c.position)) + 1 : 0;
      const { data, error } = await supabase
        .from("chapters")
        .insert({ game_id: gameId, title, position, created_by: user.id })
        .select()
        .single();
      if (error || !data) return { chapter: null, error: error?.message ?? "Insert failed" };
      // Optimistic append — never depend on the realtime echo for our own
      // writes (the INSERT handler dedupes when the echo lands).
      const created = data as Chapter;
      setChapters((prev) => (prev.some((x) => x.id === created.id) ? prev : [...prev, created].sort((a, b) => a.position - b.position)));
      return { chapter: created, error: null };
    },
    [user, gameId, chapters]
  );

  const updateChapter = useCallback(
    async (id: string, patch: Partial<Pick<Chapter, "title" | "status" | "position" | "region_map_id">>) => {
      setChapters((prev) => prev.map((c) => (c.id === id ? { ...c, ...patch } : c)).sort((a, b) => a.position - b.position));
      const { error } = await supabase.from("chapters").update(patch).eq("id", id);
      return { error: error?.message ?? null };
    },
    []
  );

  /** Swap positions with the neighbor above/below. */
  const moveChapter = useCallback(
    async (id: string, dir: -1 | 1) => {
      const idx = chapters.findIndex((c) => c.id === id);
      const other = chapters[idx + dir];
      if (idx < 0 || !other) return { error: null };
      const me = chapters[idx];
      // Optimistic swap; two updates (positions are unique per game only by
      // convention, so no constraint gymnastics needed).
      setChapters((prev) =>
        prev
          .map((c) => (c.id === me.id ? { ...c, position: other.position } : c.id === other.id ? { ...c, position: me.position } : c))
          .sort((a, b) => a.position - b.position)
      );
      await supabase.from("chapters").update({ position: other.position }).eq("id", me.id);
      await supabase.from("chapters").update({ position: me.position }).eq("id", other.id);
      return { error: null };
    },
    [chapters]
  );

  const deleteChapter = useCallback(async (id: string) => {
    // Scenes drop to Unfiled via ON DELETE SET NULL — never cascade.
    setChapters((prev) => prev.filter((c) => c.id !== id));
    const { error } = await supabase.from("chapters").delete().eq("id", id);
    return { error: error?.message ?? null };
  }, []);

  return { chapters, loading, createChapter, updateChapter, moveChapter, deleteChapter };
};

export const useCampaignDocs = (gameId: string | null) => {
  const { user } = useAuth();
  const [docs, setDocs] = useState<CampaignDoc[]>([]);
  const [loading, setLoading] = useState(Boolean(gameId));

  // Re-fetch on demand — a player gains read access to a doc the moment it's
  // shared, but that grant fires no doc INSERT/UPDATE, so the Journal calls
  // this when a new share arrives (Story/Journal).
  const reload = useCallback(async () => {
    if (!gameId || !supabaseConfigured) return;
    const { data } = await supabase.from("campaign_documents").select("*").eq("game_id", gameId).order("position", { ascending: true });
    setDocs((data ?? []) as CampaignDoc[]);
  }, [gameId]);

  useEffect(() => {
    if (!gameId || !supabaseConfigured) {
      setDocs([]);
      setLoading(false);
      return;
    }
    let cancelled = false;
    setLoading(true);
    void (async () => {
      const { data } = await supabase
        .from("campaign_documents")
        .select("*")
        .eq("game_id", gameId)
        .order("position", { ascending: true });
      if (cancelled) return;
      setDocs((data ?? []) as CampaignDoc[]);
      setLoading(false);
    })();
    const channel = supabase
      .channel(`campaign-docs:${gameId}`)
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "campaign_documents", filter: `game_id=eq.${gameId}` },
        (p) => {
          const d = p.new as CampaignDoc;
          setDocs((prev) => (prev.some((x) => x.id === d.id) ? prev : [...prev, d].sort((a, b) => a.position - b.position)));
        }
      )
      .on(
        "postgres_changes",
        { event: "UPDATE", schema: "public", table: "campaign_documents", filter: `game_id=eq.${gameId}` },
        (p) => {
          const d = p.new as CampaignDoc;
          // Don't clobber local optimistic edits with realtime echoes of OUR
          // own writes — content merges are last-write-wins by updated_at.
          setDocs((prev) => prev.map((x) => (x.id === d.id && x.updated_at <= d.updated_at ? d : x)));
        }
      )
      .on(
        "postgres_changes",
        { event: "DELETE", schema: "public", table: "campaign_documents", filter: `game_id=eq.${gameId}` },
        (p) => {
          const old = p.old as { id?: string };
          if (old.id) setDocs((prev) => prev.filter((x) => x.id !== old.id));
        }
      )
      .subscribe();
    return () => {
      cancelled = true;
      supabase.removeChannel(channel);
    };
  }, [gameId]);

  const createDoc = useCallback(
    async (
      init: Partial<Pick<CampaignDoc, "kind" | "title" | "content" | "visibility" | "scene_id" | "chapter_id" | "session_id" | "meta">>
    ): Promise<{ doc: CampaignDoc | null; error: string | null }> => {
      if (!user || !gameId) return { doc: null, error: "Not signed in" };
      const position = docs.length ? Math.max(...docs.map((d) => d.position)) + 1 : 0;
      // Read-alouds and handouts are meant for the table — default player-facing.
      const visibility =
        init.visibility ?? (init.kind === "read_aloud" || init.kind === "handout" ? "players" : "dm");
      const { data, error } = await supabase
        .from("campaign_documents")
        .insert({ game_id: gameId, position, created_by: user.id, ...init, visibility })
        .select()
        .single();
      if (error || !data) return { doc: null, error: error?.message ?? "Insert failed" };
      // Optimistic append — same reasoning as createChapter.
      const created = data as CampaignDoc;
      setDocs((prev) => (prev.some((x) => x.id === created.id) ? prev : [...prev, created].sort((a, b) => a.position - b.position)));
      return { doc: created, error: null };
    },
    [user, gameId, docs]
  );

  const updateDoc = useCallback(
    async (id: string, patch: Partial<Pick<CampaignDoc, "title" | "content" | "visibility" | "kind" | "scene_id" | "chapter_id" | "position" | "meta">>) => {
      setDocs((prev) => prev.map((d) => (d.id === id ? { ...d, ...patch, updated_at: new Date().toISOString() } : d)));
      const { error } = await supabase.from("campaign_documents").update(patch).eq("id", id);
      return { error: error?.message ?? null };
    },
    []
  );

  const deleteDoc = useCallback(async (id: string) => {
    setDocs((prev) => prev.filter((d) => d.id !== id));
    const { error } = await supabase.from("campaign_documents").delete().eq("id", id);
    return { error: error?.message ?? null };
  }, []);

  return { docs, loading, createDoc, updateDoc, deleteDoc, reload };
};

/**
 * The publish gate, player-side: the set of scene ids living in DRAFT
 * chapters. Pins targeting them are hidden from players and travel is
 * refused. Unfiled scenes (chapter_id null) are never in the set — they count
 * as published (pre-0041 behavior).
 *
 * Cheap by design: two small selects + realtime on chapters (a scene changing
 * chapters mid-session is rare; the next mount catches it).
 */
/**
 * Document shares (Story/Journal reconciliation) — who a doc has been shared
 * with. A doc is PRIVATE until shared; sharing targets the party or (later) a
 * specific player. The player Journal reads this; the editor shows share
 * status. Slice A ships party sharing only.
 */
export interface DocShare {
  id: string;
  document_id: string;
  game_id: string;
  audience: "party" | "player";
  recipient_id: string | null;
  /** The session live when this was shared (Journal grouping); null = off the record. */
  session_id: string | null;
  shared_at: string;
}

export const useDocShares = (gameId: string | null) => {
  const [shares, setShares] = useState<DocShare[]>([]);

  useEffect(() => {
    if (!gameId || !supabaseConfigured) {
      setShares([]);
      return;
    }
    let cancelled = false;
    void (async () => {
      const { data } = await supabase
        .from("document_shares")
        .select("*")
        .eq("game_id", gameId)
        .order("shared_at", { ascending: false });
      if (!cancelled) setShares((data ?? []) as DocShare[]);
    })();
    const channel = supabase
      .channel(`doc-shares:${gameId}`)
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "document_shares", filter: `game_id=eq.${gameId}` },
        (p) => {
          const s = p.new as DocShare;
          setShares((prev) => (prev.some((x) => x.id === s.id) ? prev : [s, ...prev]));
        }
      )
      .on(
        "postgres_changes",
        { event: "DELETE", schema: "public", table: "document_shares", filter: `game_id=eq.${gameId}` },
        (p) => {
          const old = p.old as { id?: string };
          if (old.id) setShares((prev) => prev.filter((x) => x.id !== old.id));
        }
      )
      .subscribe();
    return () => {
      cancelled = true;
      supabase.removeChannel(channel);
    };
  }, [gameId]);

  /** Share a doc with the whole party (Slice A). Idempotent via the unique key.
   *  `sessionId` stamps the live session for Journal-by-session grouping. */
  const shareWithParty = useCallback(
    async (documentId: string, sessionId?: string | null): Promise<{ error: string | null }> => {
      if (!gameId) return { error: "No game" };
      const { data, error } = await supabase
        .from("document_shares")
        .upsert(
          { document_id: documentId, game_id: gameId, audience: "party", recipient_id: null, session_id: sessionId ?? null },
          { onConflict: "document_id,audience,recipient_id" }
        )
        .select()
        .single();
      if (error) return { error: error.message };
      const row = data as DocShare;
      setShares((prev) => (prev.some((x) => x.id === row.id) ? prev : [row, ...prev]));
      return { error: null };
    },
    [gameId]
  );

  /** Share a doc PRIVATELY with one player (Slice B). Sharing to a player
   *  while it's already party-shared is allowed but redundant; the UI keeps
   *  the two audiences mutually exclusive. */
  const shareWithPlayer = useCallback(
    async (documentId: string, recipientId: string, sessionId?: string | null): Promise<{ error: string | null }> => {
      if (!gameId) return { error: "No game" };
      const { data, error } = await supabase
        .from("document_shares")
        .upsert(
          { document_id: documentId, game_id: gameId, audience: "player", recipient_id: recipientId, session_id: sessionId ?? null },
          { onConflict: "document_id,audience,recipient_id" }
        )
        .select()
        .single();
      if (error) return { error: error.message };
      const row = data as DocShare;
      setShares((prev) => (prev.some((x) => x.id === row.id) ? prev : [row, ...prev]));
      return { error: null };
    },
    [gameId]
  );

  /** Remove one share row — the party share (recipientId null) or a specific
   *  player's — leaving the doc's other shares intact. */
  const unshareOne = useCallback(async (documentId: string, recipientId: string | null): Promise<{ error: string | null }> => {
    setShares((prev) => prev.filter((s) => !(s.document_id === documentId && (s.recipient_id ?? null) === recipientId)));
    let q = supabase.from("document_shares").delete().eq("document_id", documentId);
    q = recipientId === null ? q.is("recipient_id", null) : q.eq("recipient_id", recipientId);
    const { error } = await q;
    return { error: error?.message ?? null };
  }, []);

  /** Un-share a doc entirely (removes all its share rows). */
  const unshare = useCallback(async (documentId: string): Promise<{ error: string | null }> => {
    setShares((prev) => prev.filter((s) => s.document_id !== documentId));
    const { error } = await supabase.from("document_shares").delete().eq("document_id", documentId);
    return { error: error?.message ?? null };
  }, []);

  return { shares, shareWithParty, shareWithPlayer, unshareOne, unshare };
};

export const useDraftSceneIds = (gameId: string | null) => {
  const [draftChapterIds, setDraftChapterIds] = useState<Set<string>>(new Set());
  const [sceneChapters, setSceneChapters] = useState<Map<string, string | null>>(new Map());

  useEffect(() => {
    if (!gameId || !supabaseConfigured) {
      setDraftChapterIds(new Set());
      setSceneChapters(new Map());
      return;
    }
    let cancelled = false;
    void (async () => {
      const [{ data: chs }, { data: scs }] = await Promise.all([
        supabase.from("chapters").select("id, status").eq("game_id", gameId),
        supabase.from("scenes").select("id, chapter_id").eq("game_id", gameId),
      ]);
      if (cancelled) return;
      setDraftChapterIds(
        new Set(((chs ?? []) as Array<{ id: string; status: string }>).filter((c) => c.status === "draft").map((c) => c.id))
      );
      setSceneChapters(
        new Map(((scs ?? []) as Array<{ id: string; chapter_id: string | null }>).map((s) => [s.id, s.chapter_id]))
      );
    })();
    const channel = supabase
      .channel(`draft-gate:${gameId}`)
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "chapters", filter: `game_id=eq.${gameId}` },
        (p) => {
          const row = (p.new ?? p.old) as { id?: string; status?: string };
          if (!row.id) return;
          setDraftChapterIds((prev) => {
            const next = new Set(prev);
            if (p.eventType === "DELETE" || row.status === "published") next.delete(row.id!);
            else next.add(row.id!);
            return next;
          });
        }
      )
      .on(
        "postgres_changes",
        { event: "UPDATE", schema: "public", table: "scenes", filter: `game_id=eq.${gameId}` },
        (p) => {
          const s = p.new as { id: string; chapter_id: string | null };
          setSceneChapters((prev) => {
            const next = new Map(prev);
            next.set(s.id, s.chapter_id);
            return next;
          });
        }
      )
      .subscribe();
    return () => {
      cancelled = true;
      supabase.removeChannel(channel);
    };
  }, [gameId]);

  return useMemo(() => {
    const gated = new Set<string>();
    sceneChapters.forEach((chapterId, sceneId) => {
      if (chapterId && draftChapterIds.has(chapterId)) gated.add(sceneId);
    });
    return gated;
  }, [draftChapterIds, sceneChapters]);
};
