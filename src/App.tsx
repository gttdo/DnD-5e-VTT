import { useState } from "react";
import { CharacterSheet } from "./components/CharacterSheet";
import { CharacterRoster } from "./components/CharacterRoster";
import { CharacterBuilder } from "./components/CharacterBuilder";
import { DiceLogOverlay } from "./components/DiceLogOverlay";
import { AuthScreen } from "./components/AuthScreen";
import { DiceLogProvider } from "./state/DiceLog";
import { useCharacter } from "./state/useCharacter";
import { useRoster } from "./state/useRoster";
import { useAuth } from "./state/useAuth";

type Screen = "roster" | "builder" | "sheet";

function App() {
  const auth = useAuth();
  const { characters, activeId, create, remove, select } = useRoster();
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

  const openBuilder = () => {
    setScreen("builder");
  };

  return (
    <DiceLogProvider>
      {/* Persistent top-right user menu */}
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

      {screen === "roster" && (
        <CharacterRoster
          characters={characters}
          onOpen={openSheet}
          onCreate={openBuilder}
          onDelete={(id) => {
            remove(id);
            if (activeId === id) setScreen("roster");
          }}
        />
      )}

      {screen === "builder" && (
        <CharacterBuilder
          onCancel={() => setScreen("roster")}
          onFinish={(c) => {
            create(c);
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
          <CharacterSheet character={api.character} api={api} />
          <DiceLogOverlay />
        </>
      )}
    </DiceLogProvider>
  );
}

export default App;
