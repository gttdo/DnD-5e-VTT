import { useState } from "react";
import type { Character } from "../types/character";
import { useGames, type Game } from "../state/useGames";
import { Card, CardBody, CardActions } from "./ui/Card";
import { Button } from "./ui/Button";
import { EmptyState } from "./ui/EmptyState";
import { LibraryBanner } from "./ui/LibraryBanner";
import { useConfirm } from "../state/Confirm";

interface Props {
  characters: Character[];
  onOpenGame: (game: Game) => void;
}

export const GamesScreen = ({ characters, onOpenGame }: Props) => {
  const { games, loading, error, createGame, joinByCode, leaveGame } = useGames();
  const [newName, setNewName] = useState("");
  const [joinCode, setJoinCode] = useState("");
  const [joinCharacterId, setJoinCharacterId] = useState<string>("");
  const [pending, setPending] = useState(false);
  const [feedback, setFeedback] = useState<string | null>(null);

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newName.trim()) return;
    setPending(true);
    const { error } = await createGame(newName.trim());
    setPending(false);
    if (error) setFeedback(`Couldn't create game: ${error}`);
    else {
      setFeedback(null);
      setNewName("");
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
        image="/art/login.png"
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
              placeholder="Game name (e.g. The Sunless Citadel)"
              value={newName}
              onChange={(e) => setNewName(e.target.value)}
              style={{ flex: 1 }}
            />
            <button className="primary" disabled={pending || !newName.trim()}>
              + Create
            </button>
          </div>
          <div className="dim" style={{ fontSize: 11, marginTop: 6 }}>
            You'll get a 6-character invite code to share with your players.
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
          gridTemplateColumns: "repeat(auto-fill, minmax(280px, 1fr))",
          gap: 16,
        }}
      >
        {games.map((g) => (
          <GameCard
            key={g.id}
            game={g}
            onOpen={() => onOpenGame(g)}
            onLeave={() => leaveGame(g.id)}
          />
        ))}
      </div>
    </div>
  );
};

const GameCard = ({
  game,
  onOpen,
  onLeave,
}: {
  game: Game;
  onOpen: () => void;
  onLeave: () => Promise<{ error: string | null }>;
}) => {
  const { confirm } = useConfirm();
  const [copied, setCopied] = useState(false);
  const copy = () => {
    void navigator.clipboard.writeText(game.join_code);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  };

  return (
    <Card>
      <CardBody>
        <div className="row" style={{ justifyContent: "space-between", alignItems: "flex-start" }}>
          <div
            style={{
              fontFamily: "var(--font-display)",
              fontSize: 17,
              fontWeight: 500,
              color: "var(--cream)",
              letterSpacing: "0.02em",
              flex: 1,
              minWidth: 0,
              overflow: "hidden",
              textOverflow: "ellipsis",
              whiteSpace: "nowrap",
            }}
          >
            {game.name}
          </div>
          <span
            className="mono"
            style={{
              fontSize: 10,
              letterSpacing: "0.14em",
              textTransform: "uppercase",
              padding: "2px 8px",
              borderRadius: 999,
              border: "1px solid",
              borderColor: game.my_role === "dm" ? "var(--candle)" : "var(--border)",
              color: game.my_role === "dm" ? "var(--candle)" : "var(--text-dim)",
              flexShrink: 0,
              marginLeft: 8,
            }}
          >
            {game.my_role}
          </span>
        </div>

        <div className="row" style={{ justifyContent: "space-between", alignItems: "flex-end", gap: 8, marginTop: 12 }}>
          <div>
            <div className="dim" style={{ fontSize: 10, letterSpacing: "0.18em", textTransform: "uppercase" }}>
              Invite Code
            </div>
            <div
              className="mono"
              style={{
                fontSize: 22,
                fontWeight: 700,
                letterSpacing: "0.22em",
                color: "var(--cream)",
                marginTop: 2,
              }}
            >
              {game.join_code}
            </div>
          </div>
          <Button
            variant="ghost"
            size="sm"
            icon={copied ? "check" : "copy"}
            onClick={copy}
          >
            {copied ? "Copied" : "Copy"}
          </Button>
        </div>
      </CardBody>
      <CardActions>
        <Button variant="primary" size="sm" block onClick={onOpen}>Open</Button>
        {game.my_role !== "dm" && (
          <Button
            variant="danger-ghost"
            size="sm"
            block
            onClick={async () => {
              if (await confirm({ title: "Leave game", message: `Leave "${game.name}"?`, confirmLabel: "Leave", danger: true })) {
                void onLeave();
              }
            }}
          >
            Leave
          </Button>
        )}
      </CardActions>
    </Card>
  );
};
