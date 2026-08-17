import { useEffect, useState } from "react";
import { supabase, supabaseConfigured } from "../lib/supabase";

/**
 * Who owns each token at the table — the display name of the player behind a
 * character, and the DM's name. Used by the token info bar so the DM can see
 * "owned by Maera" on a player's token (and a player sees "DM" on the DM's).
 *
 * Reads game_members + profiles, both readable by any game member (RLS:
 * game_members_visible_to_members, profiles_game_visible). Fetched once per
 * game; membership rarely changes mid-session.
 */
export interface PartyOwners {
  /** character_id → owner display name. */
  ownerByCharacter: Map<string, string>;
  /** The DM's display name, for DM-controlled tokens. */
  dmName: string | null;
}

export const usePartyOwners = (gameId: string | null, dmUserId: string | null): PartyOwners => {
  const [owners, setOwners] = useState<PartyOwners>({ ownerByCharacter: new Map(), dmName: null });

  useEffect(() => {
    if (!gameId || !supabaseConfigured) return;
    let cancelled = false;
    void (async () => {
      const { data: members } = await supabase
        .from("game_members")
        .select("character_id, user_id, role")
        .eq("game_id", gameId);
      if (cancelled || !members) return;
      const userIds = [...new Set(members.map((m) => m.user_id))];
      const { data: profiles } = await supabase
        .from("profiles")
        .select("user_id, display_name")
        .in("user_id", userIds);
      if (cancelled) return;
      const nameByUser = new Map<string, string>();
      (profiles ?? []).forEach((p) => {
        if (p.display_name) nameByUser.set(p.user_id, p.display_name);
      });
      const ownerByCharacter = new Map<string, string>();
      members.forEach((m) => {
        if (m.character_id) ownerByCharacter.set(m.character_id, nameByUser.get(m.user_id) ?? "Player");
      });
      const dmName = dmUserId ? nameByUser.get(dmUserId) ?? "DM" : null;
      setOwners({ ownerByCharacter, dmName });
    })();
    return () => {
      cancelled = true;
    };
  }, [gameId, dmUserId]);

  return owners;
};
