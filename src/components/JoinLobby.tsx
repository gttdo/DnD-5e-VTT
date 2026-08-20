import { useEffect, useState } from "react";
import { supabase } from "../lib/supabase";
import type { Game } from "../state/useGames";
import type { Character } from "../types/character";
import { Icon } from "./ui/Icon";

/**
 * The branded pre-join lobby — where an invite link (#/join/<code>) lands.
 *
 * A not-yet-member can't read the game through RLS, so the game's name, GM, and
 * scene art come from the `peek_game_by_code` SECURITY DEFINER RPC (safe to hand
 * to anyone holding the code — the same trust as the code itself). Joining goes
 * through the existing `join_game_by_code` RPC; once a member, we can read the
 * full game row and open the table directly.
 *
 * Rendered chrome-free (like the projector), only for a signed-in user — the
 * app's auth gate runs first and the invite hash survives sign-in.
 */

interface PeekInfo {
  game_id: string;
  name: string;
  dm_name: string;
  scene_image: string | null;
  scene_cinematic: string | null;
  scene_mode: string | null;
  player_count: number;
}

interface Props {
  code: string;
  characters: Character[];
  onEnter: (game: Game) => void;
  onCancel: () => void;
}

export const JoinLobby = ({ code, characters, onEnter, onCancel }: Props) => {
  const [status, setStatus] = useState<"loading" | "ready" | "notfound">("loading");
  const [info, setInfo] = useState<PeekInfo | null>(null);
  const [characterId, setCharacterId] = useState<string>("");
  const [joining, setJoining] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      const { data, error } = await supabase.rpc("peek_game_by_code", { _code: code });
      if (cancelled) return;
      const row = (Array.isArray(data) ? data[0] : data) as PeekInfo | undefined;
      if (error || !row) {
        setStatus("notfound");
        return;
      }
      setInfo(row);
      setStatus("ready");
    })();
    return () => {
      cancelled = true;
    };
  }, [code]);

  const join = async () => {
    if (!info || joining) return;
    setJoining(true);
    setError(null);
    const { error: joinErr } = await supabase.rpc("join_game_by_code", {
      _code: code,
      _character_id: characterId || null,
    });
    if (joinErr) {
      setError(joinErr.message);
      setJoining(false);
      return;
    }
    // Now a member — RLS lets us read the full row to open the table.
    const { data: game, error: readErr } = await supabase
      .from("games")
      .select("id, name, dm_user_id, join_code, created_at, active_scene_id")
      .eq("id", info.game_id)
      .single();
    if (readErr || !game) {
      setError(readErr?.message ?? "Joined, but couldn't open the table. Try the Campaigns list.");
      setJoining(false);
      return;
    }
    onEnter(game as Game);
  };

  const art = info?.scene_cinematic ?? info?.scene_image ?? null;

  return (
    <div className="join-lobby">
      {art && <div className="join-lobby-bg" style={{ backgroundImage: `url("${art}")` }} aria-hidden="true" />}
      <div className="join-lobby-scrim" aria-hidden="true" />

      <button className="join-lobby-back" onClick={onCancel} title="Back">
        <Icon name="back" size={14} />
        <span>Not now</span>
      </button>

      <div className="join-lobby-card">
        {status === "loading" && <div className="join-lobby-msg">Finding the table…</div>}

        {status === "notfound" && (
          <div className="join-lobby-msg">
            <strong>That invite didn’t work.</strong>
            <p>
              The code <b>{code.toUpperCase()}</b> doesn’t match a table. Ask your GM for a fresh link.
            </p>
            <button className="join-lobby-join" onClick={onCancel}>
              Back to my games
            </button>
          </div>
        )}

        {status === "ready" && info && (
          <>
            <div className="join-lobby-eyebrow">You’re invited to</div>
            <h1 className="join-lobby-title">{info.name}</h1>
            <div className="join-lobby-meta">
              <span>{info.dm_name}</span>
              <span className="join-lobby-dot">·</span>
              <span>
                {info.player_count} {info.player_count === 1 ? "player" : "players"} in
              </span>
            </div>

            <div
              className={`join-lobby-art ${art ? "" : "is-empty"}`}
              style={art ? { backgroundImage: `url("${art}")` } : undefined}
            >
              {!art && <Icon name="drama" size={30} />}
            </div>

            <label className="join-lobby-field">
              <span>Bring a character (optional)</span>
              <select value={characterId} onChange={(e) => setCharacterId(e.target.value)}>
                <option value="">— None for now —</option>
                {characters.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                  </option>
                ))}
              </select>
            </label>

            {error && <div className="join-lobby-error">{error}</div>}

            <button className="join-lobby-join" onClick={join} disabled={joining}>
              {joining ? "Joining…" : "Join Game"}
            </button>
          </>
        )}
      </div>
    </div>
  );
};
