import { useEffect, useMemo, useState } from "react";
import type { Character } from "../types/character";
import { useGames, type Game } from "../state/useGames";
import { useAuth } from "../state/useAuth";
import { supabase } from "../lib/supabase";
import { Card, CardBody } from "./ui/Card";
import { Button } from "./ui/Button";
import { EmptyState } from "./ui/EmptyState";
import { LibraryBanner } from "./ui/LibraryBanner";
import { useConfirm } from "../state/Confirm";

interface Props {
  characters: Character[];
  /** Prefill from an invite link (#/join/<code>). */
  initialJoinCode?: string | null;
  onOpenGame: (game: Game) => void;
  /** DM-only: open the Campaign Editor (docs/campaign-editor.md). */
  onManageGame: (game: Game) => void;
}

/** One member's face on a campaign card: a character portrait when readable,
 *  else an initial disc from their display name. */
interface MemberChip {
  userId: string;
  portrait: string | null;
  initial: string;
  role: "dm" | "player";
}

/**
 * Card meta for every campaign in one round trip each for members, profiles,
 * and characters. Portraits ride on characters.data.portrait and may be
 * unreadable under RLS for other players' private characters — the initial
 * disc is the graceful fallback.
 */
const useCampaignCardMeta = (games: Game[]) => {
  const [members, setMembers] = useState<Map<string, MemberChip[]>>(new Map());

  useEffect(() => {
    const ids = games.map((g) => g.id);
    if (!ids.length) {
      setMembers(new Map());
      return;
    }
    let cancelled = false;
    void (async () => {
      const { data: rows } = await supabase
        .from("game_members")
        .select("game_id, user_id, character_id, role")
        .in("game_id", ids);
      if (cancelled || !rows) return;
      const userIds = [...new Set(rows.map((r) => r.user_id as string))];
      const charIds = [...new Set(rows.map((r) => r.character_id as string | null).filter(Boolean))] as string[];
      const [{ data: profiles }, { data: chars }] = await Promise.all([
        userIds.length
          ? supabase.from("profiles").select("user_id, display_name").in("user_id", userIds)
          : Promise.resolve({ data: [] as Array<{ user_id: string; display_name: string | null }> }),
        charIds.length
          ? supabase.from("characters").select("id, data").in("id", charIds)
          : Promise.resolve({ data: [] as Array<{ id: string; data: { portrait?: string } | null }> }),
      ]);
      if (cancelled) return;
      const nameOf = new Map((profiles ?? []).map((p) => [p.user_id, p.display_name ?? ""]));
      const portraitOf = new Map((chars ?? []).map((c) => [c.id, (c.data as { portrait?: string } | null)?.portrait ?? null]));
      const next = new Map<string, MemberChip[]>();
      rows.forEach((r) => {
        const list = next.get(r.game_id as string) ?? [];
        const name = nameOf.get(r.user_id as string) ?? "";
        list.push({
          userId: r.user_id as string,
          portrait: r.character_id ? portraitOf.get(r.character_id as string) ?? null : null,
          initial: (name.trim()[0] ?? "?").toUpperCase(),
          role: (r.role as "dm" | "player") ?? "player",
        });
        next.set(r.game_id as string, list);
      });
      setMembers(next);
    })();
    return () => {
      cancelled = true;
    };
    // Refetch when the set of games changes, not on every parent render.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [games.map((g) => g.id).join(",")]);

  return members;
};

const TIERS = [
  { label: "Levels 1–4 · Local Heroes", min: 1, max: 4 },
  { label: "Levels 1–3 · Starter", min: 1, max: 3 },
  { label: "Levels 5–10 · Heroes of the Realm", min: 5, max: 10 },
  { label: "Levels 11–16 · Masters of the Realm", min: 11, max: 16 },
  { label: "Levels 17–20 · Masters of the World", min: 17, max: 20 },
] as const;

export const GamesScreen = ({ characters, initialJoinCode, onOpenGame, onManageGame }: Props) => {
  const { games, loading, error, createGame, joinByCode, leaveGame, deleteGame } = useGames();
  const { user } = useAuth();
  const [newName, setNewName] = useState("");
  const [tierIdx, setTierIdx] = useState(1); // default Levels 1–3
  const [joinCode, setJoinCode] = useState(initialJoinCode ?? "");
  const [joinCharacterId, setJoinCharacterId] = useState<string>("");
  const [pending, setPending] = useState(false);
  const [feedback, setFeedback] = useState<string | null>(null);
  const memberMeta = useCampaignCardMeta(games);

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newName.trim()) return;
    setPending(true);
    const tier = TIERS[tierIdx];
    const { game, error } = await createGame(newName.trim(), { level_min: tier.min, level_max: tier.max });
    setPending(false);
    if (error) setFeedback(`Couldn't create game: ${error}`);
    else {
      setFeedback(null);
      setNewName("");
      // Creating a campaign lands the DM in the Campaign Editor to start
      // writing it (docs/campaign-editor.md — entry point A).
      if (game) onManageGame(game);
    }
  };

  const handleJoin = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!joinCode.trim()) return;
    setPending(true);
    const { error } = await joinByCode(joinCode, joinCharacterId || null);
    setPending(false);
    if (error) setFeedback(`Couldn't join: ${error}`);
    else {
      setFeedback(`Joined!`);
      setJoinCode("");
    }
  };

  return (
    <div className="screen-enter" style={{ padding: 24 }}>
      <LibraryBanner
        image="/art/tavern.png"
        eyebrow="Your Table"
        title="Campaigns"
        subtitle={`${games.length} campaign${games.length === 1 ? "" : "s"}`}
      />

      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16, marginBottom: 24 }}>
        {/* Create */}
        <form className="panel" onSubmit={handleCreate}>
          <div className="panel-title">Run a game (as DM)</div>
          <div className="row" style={{ gap: 8 }}>
            <input
              placeholder="Campaign name (e.g. The Sunless Citadel)"
              value={newName}
              onChange={(e) => setNewName(e.target.value)}
              style={{ flex: 1 }}
            />
            <button className="primary" disabled={pending || !newName.trim()}>
              + Create
            </button>
          </div>
          <div className="row" style={{ gap: 8, marginTop: 8, alignItems: "center" }}>
            <span className="dim" style={{ fontSize: 11, letterSpacing: "0.1em", textTransform: "uppercase" }}>
              For
            </span>
            <select value={tierIdx} onChange={(e) => setTierIdx(Number(e.target.value))} style={{ flex: 1 }}>
              {TIERS.map((t, i) => (
                <option key={t.label} value={i}>
                  {t.label}
                </option>
              ))}
            </select>
          </div>
          <div className="dim" style={{ fontSize: 11, marginTop: 6 }}>
            You'll land in the Campaign Editor, with an invite link for your players.
          </div>
        </form>

        {/* Join */}
        <form className="panel" onSubmit={handleJoin}>
          <div className="panel-title">Join a game (as Player)</div>
          <div className="row" style={{ gap: 8, marginBottom: 6 }}>
            <input
              placeholder="Invite code"
              value={joinCode}
              onChange={(e) => setJoinCode(e.target.value.toUpperCase())}
              maxLength={6}
              style={{ width: 110, fontFamily: "JetBrains Mono, monospace", letterSpacing: "0.2em" }}
            />
            <select
              value={joinCharacterId}
              onChange={(e) => setJoinCharacterId(e.target.value)}
              style={{ flex: 1 }}
            >
              <option value="">— Bring a character (optional) —</option>
              {characters.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name} ({c.species} {c.classes.map((cl) => `${cl.name} ${cl.level}`).join("/")})
                </option>
              ))}
            </select>
            <button className="primary" disabled={pending || joinCode.length < 6}>
              Join
            </button>
          </div>
          <div className="dim" style={{ fontSize: 11 }}>
            You can swap which character you've brought after joining.
          </div>
        </form>
      </div>

      {feedback && (
        <div className="panel" style={{ marginBottom: 16, fontSize: 13, borderColor: "var(--gold)" }}>
          {feedback}
        </div>
      )}
      {error && (
        <div className="panel" style={{ marginBottom: 16, fontSize: 13, borderColor: "var(--accent)" }}>
          {error}
        </div>
      )}

      <div className="panel-title">Your campaigns</div>
      {loading && <div className="dim">Loading…</div>}
      {!loading && games.length === 0 && (
        <EmptyState icon="swords" title="No campaigns yet">
          Run a game as DM to get a shareable invite code, or join a friend's
          table with theirs.
        </EmptyState>
      )}
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(auto-fill, minmax(300px, 1fr))",
          gap: 16,
        }}
      >
        {games.map((g) => (
          <CampaignCard
            key={g.id}
            game={g}
            isOwner={g.dm_user_id === user?.id}
            members={memberMeta.get(g.id) ?? []}
            onOpen={() => onOpenGame(g)}
            onManage={() => onManageGame(g)}
            onLeave={() => leaveGame(g.id)}
            onDelete={() => deleteGame(g.id)}
          />
        ))}
      </div>
    </div>
  );
};

/**
 * The campaign card (user-supplied reference, 2026-08-20): avatar strip →
 * name → started date → player count → role → actions. Adapted to The
 * Table's dark/gold language; "View campaign" = Manage (the editor),
 * "Launch VTT" = Open table.
 */
const CampaignCard = ({
  game,
  isOwner,
  members,
  onOpen,
  onManage,
  onLeave,
  onDelete,
}: {
  game: Game;
  isOwner: boolean;
  members: MemberChip[];
  onOpen: () => void;
  onManage: () => void;
  onLeave: () => Promise<{ error: string | null }>;
  onDelete: () => Promise<{ error: string | null }>;
}) => {
  const { confirm } = useConfirm();
  const started = useMemo(
    () =>
      new Date(game.created_at).toLocaleDateString(undefined, {
        year: "numeric",
        month: "short",
        day: "numeric",
      }),
    [game.created_at]
  );
  const shown = members.slice(0, 5);
  const overflow = members.length - shown.length;

  return (
    <Card>
      <CardBody>
        <div className="campcard">
          {/* Member avatar strip */}
          <div className="campcard-avatars">
            {shown.length === 0 && <div className="campcard-avatar is-empty">?</div>}
            {shown.map((m) => (
              <div key={m.userId} className="campcard-avatar" title={m.initial}>
                {m.portrait ? <img src={m.portrait} alt="" /> : <span>{m.initial}</span>}
              </div>
            ))}
            {overflow > 0 && <div className="campcard-avatar is-more">+{overflow}</div>}
          </div>

          <div className="campcard-name">{game.name}</div>
          <div className="campcard-sub">Campaign started {started}</div>

          <div className="campcard-count">{members.filter((m) => m.role === "player").length}</div>
          <div className="campcard-count-label">
            {members.filter((m) => m.role === "player").length === 1 ? "Player" : "Players"}
          </div>

          <div className="campcard-role">
            Role: {game.my_role === "dm" ? "Dungeon Master" : "Player"}
            {game.level_min != null && game.level_max != null && (
              <span className="campcard-levels">
                Levels {game.level_min}–{game.level_max}
              </span>
            )}
          </div>

          <div className="campcard-divider" />

          <div className="campcard-actions">
            {isOwner && (
              <Button variant="ghost" size="sm" icon="edit" onClick={onManage}>
                Manage campaign
              </Button>
            )}
            <Button variant="primary" size="sm" icon="swords" onClick={onOpen}>
              Open table
            </Button>
          </div>
          <div className="campcard-actions is-quiet">
            {isOwner ? (
              <Button
                variant="danger-ghost"
                size="sm"
                onClick={async () => {
                  if (
                    await confirm({
                      title: "Delete campaign",
                      message: `Delete "${game.name}"? This permanently removes the campaign and all its scenes, chapters, documents, tokens, and player seats. This cannot be undone.`,
                      confirmLabel: "Delete campaign",
                      danger: true,
                    })
                  ) {
                    void onDelete();
                  }
                }}
              >
                Delete
              </Button>
            ) : (
              <Button
                variant="danger-ghost"
                size="sm"
                onClick={async () => {
                  if (await confirm({ title: "Leave game", message: `Leave "${game.name}"?`, confirmLabel: "Leave", danger: true })) {
                    void onLeave();
                  }
                }}
              >
                Leave
              </Button>
            )}
          </div>
        </div>
      </CardBody>
    </Card>
  );
};
