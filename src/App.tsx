import { CharacterSheet } from "./components/CharacterSheet";
import { DiceLogOverlay } from "./components/DiceLogOverlay";
import { DiceLogProvider } from "./state/DiceLog";
import { useCharacter } from "./state/useCharacter";

function App() {
  const api = useCharacter();
  return (
    <DiceLogProvider>
      <CharacterSheet character={api.character} api={api} />
      <DiceLogOverlay />
    </DiceLogProvider>
  );
}

export default App;
