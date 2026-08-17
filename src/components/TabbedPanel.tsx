import { useState } from "react";
import type { Character } from "../types/character";
import type { CharacterAPI } from "../state/useCharacter";
import { ActionsPanel } from "./ActionsPanel";
import { SpellsPanel } from "./SpellsPanel";
import { InventoryPanel } from "./InventoryPanel";
import { FeaturesPanel } from "./FeaturesPanel";
import { NotesPanel } from "./NotesPanel";

// Matches the reference's tab order: Actions · Spells · Inventory · Features…
const TABS = ["Actions", "Spells", "Inventory", "Features", "Notes"] as const;
type Tab = typeof TABS[number];

export const TabbedPanel = ({ character, api }: { character: Character; api: CharacterAPI }) => {
  const [tab, setTab] = useState<Tab>("Actions");

  return (
    <div className="panel" style={{ display: "flex", flexDirection: "column", minHeight: 0 }}>
      <div className="panel-tabs">
        {TABS.map((t) => (
          <button
            key={t}
            className={`panel-tab ${tab === t ? "active" : ""}`}
            onClick={() => setTab(t)}
          >
            {t}
          </button>
        ))}
      </div>
      <div style={{ overflowY: "auto", paddingRight: 4 }}>
        {tab === "Actions" && <ActionsPanel character={character} api={api} />}
        {tab === "Spells" && <SpellsPanel character={character} api={api} />}
        {tab === "Inventory" && <InventoryPanel character={character} api={api} />}
        {tab === "Features" && <FeaturesPanel character={character} api={api} />}
        {tab === "Notes" && <NotesPanel character={character} api={api} />}
      </div>
    </div>
  );
};
