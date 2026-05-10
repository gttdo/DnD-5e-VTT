import type { Character } from "../types/character";
import type { CharacterAPI } from "../state/useCharacter";
import { TopBar } from "./TopBar";
import { AbilityScores } from "./AbilityScores";
import { Skills } from "./Skills";
import { Proficiencies } from "./Proficiencies";
import { TabbedPanel } from "./TabbedPanel";

export const CharacterSheet = ({ character, api }: { character: Character; api: CharacterAPI }) => (
  <div className="app">
    <TopBar character={character} api={api} />
    <div className="sheet">
      <div className="col">
        <AbilityScores character={character} />
        <Proficiencies character={character} />
      </div>
      <div className="col" style={{ minHeight: 0 }}>
        <Skills character={character} />
      </div>
      <div className="col" style={{ minHeight: 0 }}>
        <TabbedPanel character={character} api={api} />
      </div>
    </div>
  </div>
);
