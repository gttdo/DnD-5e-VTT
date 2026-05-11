import { useState } from "react";
import { CharacterSheet } from "./components/CharacterSheet";
import { CharacterRoster } from "./components/CharacterRoster";
import { CharacterBuilder } from "./components/CharacterBuilder";
import { DiceLogOverlay } from "./components/DiceLogOverlay";
import { DiceLogProvider } from "./state/DiceLog";
import { useCharacter } from "./state/useCharacter";
import { useRoster } from "./state/useRoster";

type Screen = "roster" | "builder" | "sheet";

function App() {
  const { characters, activeId, create, remove, select } = useRoster();
  const [screen, setScreen] = useState<Screen>(activeId ? "sheet" : "roster");
  const api = useCharacter(activeId);

  const openSheet = (id: string) => {
    select(id);
    setScreen("sheet");
  };

  const openBuilder = () => {
    setScreen("builder");
  };

  return (
    <DiceLogProvider>
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
          <div style={{
            position: "fixed", top: 8, left: 16, zIndex: 100,
          }}>
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
