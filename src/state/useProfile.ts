import { useCallback, useEffect, useState } from "react";
import { supabase, supabaseConfigured } from "../lib/supabase";
import { useAuth } from "./useAuth";

/**
 * The signed-in user's own profile — their display name (the handle shown
 * everywhere: header, party, game log, campaign cards). Set at signup to the
 * email prefix; this hook is how a user changes it later.
 *
 * profiles.display_name is already read across the app (usePartyPresence,
 * usePartyOwners, GamesScreen), so a rename here propagates without touching
 * those call sites.
 */
export const useProfile = () => {
  const { user } = useAuth();
  const [displayName, setDisplayName] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!user || !supabaseConfigured) {
      setDisplayName(null);
      setLoading(false);
      return;
    }
    let cancelled = false;
    void (async () => {
      const { data } = await supabase.from("profiles").select("display_name").eq("user_id", user.id).maybeSingle();
      if (!cancelled) {
        setDisplayName((data as { display_name?: string | null } | null)?.display_name ?? null);
        setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [user]);

  const rename = useCallback(
    async (name: string): Promise<{ error: string | null }> => {
      const trimmed = name.trim();
      if (!user) return { error: "Not signed in" };
      if (!trimmed) return { error: "Name can't be empty" };
      setDisplayName(trimmed); // optimistic
      const { error } = await supabase.from("profiles").update({ display_name: trimmed }).eq("user_id", user.id);
      return { error: error?.message ?? null };
    },
    [user]
  );

  return { displayName, loading, rename };
};
