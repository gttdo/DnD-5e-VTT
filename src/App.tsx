import { useState } from "react";
import { CharacterSheet } from "./components/CharacterSheet";
import { CharacterRoster } from "./components/CharacterRoster";
import { CharacterBuilder } from "./components/CharacterBuilder";
import { GamesScreen } from "./components/GamesScreen";
import { DiceLogOverlay } from "./components/DiceLogOverlay";
import { AuthScreen } from "./components/AuthScreen";
import { DiceLogProvider } from "./state/DiceLog";
import { useCharacter } from "./state/useCharacter";
import { useRoster } from "./state/useRoster";
import { useAuth } from "./state/useAuth";

type Screen = "roster" | "games" | "builder" | "sheet";

function App() {
  const auth = useAuth();
  const { characters, activeId, loading: rosterLoading, create, remove, select } = useRoster();
  const [screen, setScreen] = useState<Screen>(activeId ? "sheet" : "roster");
  const api = useCharacter(activeId);

  if (auth.loading) {
    return (
      <div style={{ minHeight: "100vh", display: "grid", placeItems: "center" }}>
        <div className="dim">Loading…</div>
      </div>
    );
  }

  if (!auth.session) {
    return <AuthScreen />;
  }

  const openSheet = (id: string) => {
    select(id);
    setScreen("sheet");
  };

  return (
    <DiceLogProvider>
      {/* Persistent top nav */}
      <div
        style={{
          position: "fixed",
          top: 8,
          right: 12,
          zIndex: 100,
          display: "flex",
          alignItems: "center",
          gap: 8,
        }}
      >
        <span className="dim" style={{ fontSize: 12 }}>
          {auth.user?.email}
        </span>
        <button className="ghost" style={{ fontSize: 11, padding: "4px 10px" }} onClick={auth.signOut}>
          Sign out
        </button>
      </div>

      {/* Top-left nav (visible on roster + games) */}
      {(screen === "roster" || screen === "games") && (
        <div style={{ position: "fixed", top: 8, left: 16, zIndex: 100, display: "flex", gap: 4 }}>
          <button
            className={screen === "roster" ? "primary" : "ghost"}
            style={{ fontSize: 12, padding: "4px 10px" }}
            onClick={() => setScreen("roster")}
          >
            Characters
          </button>
          <button
            className={screen === "games" ? "primary" : "ghost"}
            style={{ fontSize: 12, padding: "4px 10px" }}
            onClick={() => setScreen("games")}
          >
            Games
          </button>
        </div>
      )}

      {screen === "roster" && (
        <CharacterRoster
          characters={characters}
          onOpen={openSheet}
          onCreate={() => setScreen("builder")}
          onDelete={(id) => {
            void remove(id);
            if (activeId === id) setScreen("roster");
          }}
        />
      )}

      {screen === "games" && (
        <GamesScreen
          characters={characters}
          onBack={() => setScreen("roster")}
          onOpenGame={(_gameId) => {
            // TODO: implement the in-game view (party panel, VTT canvas, etc.)
            alert("The in-game view is coming next — for now you can share the invite code from the card.");
          }}
        />
      )}

      {screen === "builder" && (
        <CharacterBuilder
          onCancel={() => setScreen("roster")}
          onFinish={(c) => {
            void create(c);
            select(c.id);
            setScreen("sheet");
          }}
        />
      )}

      {screen === "sheet" && (
        <>
          <div style={{ position: "fixed", top: 8, left: 16, zIndex: 100 }}>
            <button
              className="ghost"
              onClick={() => setScreen("roster")}
              style={{ fontSize: 12, padding: "4px 10px" }}
            >
              ← My Characters
            </button>
          </div>
          {api.loading || rosterLoading ? (
            <div style={{ minHeight: "100vh", display: "grid", placeItems: "center" }}>
              <div className="dim">Loading character…</div>
            </div>
          ) : (
            <CharacterSheet character={api.character} api={api} />
          )}
          <DiceLogOverlay />
        </>
      )}
    </DiceLogProvider>
  );
}

export default App;
