import { useState } from "react";
import type { Character } from "../types/character";
import { useGames, type Game } from "../state/useGames";

interface Props {
  characters: Character[];
  onBack: () => void;
  onOpenGame: (gameId: string) => void;
}

export const GamesScreen = ({ characters, onBack, onOpenGame }: Props) => {
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
    <div style={{ minHeight: "100vh", padding: "32px 24px", maxWidth: 1100, margin: "0 auto" }}>
      <div className="row" style={{ justifyContent: "space-between", marginBottom: 24 }}>
        <div>
          <h1 style={{ fontSize: 32, color: "var(--gold)" }}>Games</h1>
          <div className="dim" style={{ marginTop: 4 }}>
            {games.length} game{games.length === 1 ? "" : "s"}
          </div>
        </div>
        <button className="ghost" onClick={onBack}>← My Characters</button>
      </div>

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

      <div className="panel-title">Your games</div>
      {loading && <div className="dim">Loading…</div>}
      {!loading && games.length === 0 && (
        <div className="panel center" style={{ padding: 40 }}>
          <div className="dim">You haven't created or joined any games yet.</div>
        </div>
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
            onOpen={() => onOpenGame(g.id)}
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
  const [copied, setCopied] = useState(false);
  const copy = () => {
    void navigator.clipboard.writeText(game.join_code);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  };

  return (
    <div className="panel" style={{ display: "flex", flexDirection: "column", gap: 8 }}>
      <div className="row" style={{ justifyContent: "space-between" }}>
        <div style={{ fontFamily: "Cinzel, serif", fontSize: 18, fontWeight: 700 }}>
          {game.name}
        </div>
        <span
          className="dim mono"
          style={{
            fontSize: 10,
            letterSpacing: "0.1em",
            textTransform: "uppercase",
            color: game.my_role === "dm" ? "var(--gold)" : "var(--text-dim)",
          }}
        >
          {game.my_role}
        </span>
      </div>

      <div className="row" style={{ justifyContent: "space-between", gap: 8 }}>
        <div>
          <div className="dim" style={{ fontSize: 11 }}>INVITE CODE</div>
          <div
            className="mono"
            style={{
              fontSize: 22,
              fontWeight: 700,
              letterSpacing: "0.2em",
              color: "var(--gold)",
            }}
          >
            {game.join_code}
          </div>
        </div>
        <button onClick={copy} className="ghost" style={{ fontSize: 11 }}>
          {copied ? "✓ Copied" : "Copy"}
        </button>
      </div>

      <div className="row" style={{ justifyContent: "space-between", marginTop: 4 }}>
        <button onClick={onOpen}>Open</button>
        {game.my_role !== "dm" && (
          <button
            className="ghost"
            style={{ color: "var(--accent)", fontSize: 11 }}
            onClick={() => {
              if (confirm(`Leave "${game.name}"?`)) void onLeave();
            }}
          >
            Leave
          </button>
        )}
      </div>
    </div>
  );
};
