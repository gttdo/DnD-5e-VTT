import { useCallback, useEffect, useState } from "react";
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
      .select("data")
      .order("created_at", { ascending: true });
    if (error) {
      setError(error.message);
      setCharacters([]);
    } else {
      setCharacters((data ?? []).map((r) => r.data as Character));
      setError(null);
    }
    setLoading(false);
  }, [user]);

  // One-time migration: push any localStorage characters into Supabase the
  // first time a user signs in. Keyed by user.id so it runs once per account.
  const migrateLocalRoster = useCallback(async () => {
    if (!user) return;
    const flag = `${MIGRATION_DONE_KEY}:${user.id}`;
    if (localStorage.getItem(flag)) return;
    const localChars = readLocalRoster();
    if (localChars.length === 0) {
      localStorage.setItem(flag, "1");
      return;
    }
    const rows = localChars.map((c) => ({
      id: c.id,
      owner_id: user.id,
      name: c.name,
      data: c,
    }));
    const { error } = await supabase.from("characters").upsert(rows, { onConflict: "id" });
    if (!error) {
      localStorage.setItem(flag, "1");
    }
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

  // Realtime subscription: keep the roster in sync if another tab/device
  // edits a character owned by this user.
  useEffect(() => {
    if (!user || !supabaseConfigured) return;
    const channel = supabase
      .channel(`characters:${user.id}`)
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "characters", filter: `owner_id=eq.${user.id}` },
        () => refresh()
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
      const { error } = await supabase.from("characters").insert({
        id: c.id,
        owner_id: user.id,
        name: c.name,
        data: c,
      });
      if (error) {
        setError(error.message);
        await refresh();
      }
    },
    [user, refresh]
  );

  const remove = useCallback(
    async (id: string) => {
      setCharacters((prev) => prev.filter((c) => c.id !== id));
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

  return { characters, activeId, loading, error, create, remove, select, refresh };
};
