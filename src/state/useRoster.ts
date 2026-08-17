import { useCallback, useEffect, useRef, useState } from "react";
import type { Character } from "../types/character";
import { supabase, supabaseConfigured } from "../lib/supabase";
import { useAuth } from "./useAuth";

const LOCAL_ROSTER_KEY = "dnd-5e-vtt:characters";
const MIGRATION_DONE_KEY = "dnd-5e-vtt:migration-done";
const ACTIVE_KEY = "dnd-5e-vtt:active-id";

interface LocalRoster {
  characters: Character[];
}

const readLocalRoster = (): Character[] => {
  try {
    const raw = localStorage.getItem(LOCAL_ROSTER_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as LocalRoster;
    return parsed.characters ?? [];
  } catch {
    return [];
  }
};

export const useRoster = () => {
  const { user } = useAuth();
  const [characters, setCharacters] = useState<Character[]>([]);
  // Which of the loaded characters this user actually owns (can write directly).
  // The roster can also surface party members' PCs via RLS read — those are
  // read-only here, so the VTT routes their HP changes through the apply-hp
  // function instead of a direct (RLS-blocked) update.
  const [ownedIds, setOwnedIds] = useState<Set<string>>(new Set());
  const [activeId, setActiveIdState] = useState<string | null>(() =>
    localStorage.getItem(ACTIVE_KEY)
  );
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Fetch the roster from Supabase whenever the user changes.
  const refresh = useCallback(async () => {
    if (!user || !supabaseConfigured) {
      setCharacters([]);
      setLoading(false);
      return;
    }
    setLoading(true);
    const { data, error } = await supabase
      .from("characters")
      .select("id, data, owner_id")
      .order("created_at", { ascending: true });
    if (error) {
      setError(error.message);
      setCharacters([]);
      setOwnedIds(new Set());
    } else {
      // The ROW id is canonical — it's what foreign keys (tokens.character_id)
      // actually reference. Historical rows can carry a stale data.id (e.g.
      // the fixed-id sample character migrated under an earlier account), and
      // trusting it made "place character" violate the tokens FK.
      setCharacters(
        (data ?? []).map((r) => ({ ...(r.data as Character), id: r.id as string }))
      );
      setOwnedIds(
        new Set((data ?? []).filter((r) => r.owner_id === user.id).map((r) => r.id as string))
      );
      setError(null);
    }
    setLoading(false);
  }, [user]);

  // One-time migration: push any localStorage characters into Supabase the
  // first time a user signs in. Keyed by user.id so it runs once per account.
  // Non-UUID ids (from the pre-cloud builder) get remapped to fresh UUIDs.
  const migrateLocalRoster = useCallback(async () => {
    if (!user) return;
    const flag = `${MIGRATION_DONE_KEY}:${user.id}`;
    if (localStorage.getItem(flag)) return;
    const localChars = readLocalRoster();
    if (localChars.length === 0) {
      localStorage.setItem(flag, "1");
      return;
    }
    const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
    const idRemap: Record<string, string> = {};
    const rows = localChars.map((c) => {
      const newId = UUID_RE.test(c.id) ? c.id : crypto.randomUUID();
      if (newId !== c.id) idRemap[c.id] = newId;
      const data: Character = { ...c, id: newId };
      return { id: newId, owner_id: user.id, name: c.name, data };
    });
    const { error } = await supabase.from("characters").insert(rows);
    if (error) {
      console.error("[migration] failed to push local characters:", error);
      return;
    }
    // Migration succeeded: fix the active-id pointer if it was remapped
    // and clear the local roster so we don't try again.
    const oldActive = localStorage.getItem(ACTIVE_KEY);
    if (oldActive && idRemap[oldActive]) {
      localStorage.setItem(ACTIVE_KEY, idRemap[oldActive]);
      setActiveIdState(idRemap[oldActive]);
    }
    localStorage.removeItem(LOCAL_ROSTER_KEY);
    localStorage.setItem(flag, "1");
  }, [user]);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      if (user) {
        await migrateLocalRoster();
      }
      if (!cancelled) await refresh();
    })();
    return () => {
      cancelled = true;
    };
  }, [user, migrateLocalRoster, refresh]);

  // The ids we currently track (own + party PCs read via RLS), kept in a ref so
  // the realtime handler can tell "a party PC I display changed" from "some
  // unrelated character changed" without re-subscribing on every roster edit.
  const trackedIdsRef = useRef<Set<string>>(new Set());
  useEffect(() => {
    trackedIdsRef.current = new Set(characters.map((c) => c.id));
  }, [characters]);

  // Realtime subscription: keep the roster in sync when a character we display
  // changes elsewhere. The owner-filtered listener covers our own characters
  // (including inserts/deletes across tabs). A second, unfiltered UPDATE
  // listener covers party members' PCs — e.g. the DM damaging one via apply-hp,
  // or the player editing their own sheet — so the table reflects it live. We
  // only refresh for ids we already track; refresh() re-reads under RLS, so an
  // unrelated event can at worst cost one no-op fetch, never leak data.
  useEffect(() => {
    if (!user || !supabaseConfigured) return;
    const channel = supabase
      .channel(`characters:${user.id}`)
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "characters", filter: `owner_id=eq.${user.id}` },
        () => refresh()
      )
      .on(
        "postgres_changes",
        { event: "UPDATE", schema: "public", table: "characters" },
        (payload) => {
          const row = payload.new as { id?: string; owner_id?: string } | null;
          // Only party PCs — our own characters are handled by the listener
          // above, so skip them here to avoid a double refresh.
          if (row?.id && row.owner_id !== user.id && trackedIdsRef.current.has(row.id)) refresh();
        }
      )
      .subscribe();
    return () => {
      supabase.removeChannel(channel);
    };
  }, [user, refresh]);

  const select = useCallback((id: string | null) => {
    if (id) localStorage.setItem(ACTIVE_KEY, id);
    else localStorage.removeItem(ACTIVE_KEY);
    setActiveIdState(id);
  }, []);

  const create = useCallback(
    async (c: Character) => {
      if (!user) return;
      // Optimistic local insert so the UI updates immediately.
      setCharacters((prev) => [...prev, c]);
      setOwnedIds((prev) => new Set(prev).add(c.id));
      const { error } = await supabase.from("characters").insert({
        id: c.id,
        owner_id: user.id,
        name: c.name,
        data: c,
      });
      if (error) {
        // Roll back the optimistic entry — a character that failed to save
        // must not linger looking real; placing it on a map would violate
        // the tokens_character_id foreign key.
        setCharacters((prev) => prev.filter((x) => x.id !== c.id));
        setError(error.message);
        await refresh();
      }
    },
    [user, refresh]
  );

  /**
   * Apply a mutation to one owned character and persist it — the write path the
   * in-game HUD uses to adjust HP from the table without mounting the full
   * per-character editor. Optimistic (local first), then saves the whole `data`
   * blob like the sheet does; the realtime subscription reconciles other tabs.
   */
  const updateCharacter = useCallback(
    async (id: string, mut: (c: Character) => Character) => {
      const current = characters.find((c) => c.id === id);
      if (!current) return;
      const next = mut(structuredClone(current));
      setCharacters((prev) => prev.map((c) => (c.id === id ? next : c)));
      if (!supabaseConfigured) return;
      const { error } = await supabase
        .from("characters")
        .update({ name: next.name, data: next })
        .eq("id", id);
      if (error) {
        setError(error.message);
        await refresh();
      }
    },
    [characters, refresh]
  );

  const remove = useCallback(
    async (id: string) => {
      setCharacters((prev) => prev.filter((c) => c.id !== id));
      setOwnedIds((prev) => {
        const next = new Set(prev);
        next.delete(id);
        return next;
      });
      if (activeId === id) {
        select(null);
      }
      const { error } = await supabase.from("characters").delete().eq("id", id);
      if (error) {
        setError(error.message);
        await refresh();
      }
    },
    [activeId, select, refresh]
  );

  return { characters, ownedIds, activeId, loading, error, create, remove, select, refresh, updateCharacter };
};
