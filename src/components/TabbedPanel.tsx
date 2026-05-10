import { useState } from "react";
import type { Character } from "../types/character";
import type { CharacterAPI } from "../state/useCharacter";
import { ActionsPanel } from "./ActionsPanel";
import { InventoryPanel } from "./InventoryPanel";
import { FeaturesPanel } from "./FeaturesPanel";
import { NotesPanel } from "./NotesPanel";

const TABS = ["Actions", "Inventory", "Features", "Notes"] as const;
type Tab = typeof TABS[number];

export const TabbedPanel = ({ character, api }: { character: Character; api: CharacterAPI }) => {
  const [tab, setTab] = useState<Tab>("Actions");

  return (
    <div className="panel" style={{ display: "flex", flexDirection: "column", minHeight: 0 }}>
      <div className="tabs">
        {TABS.map((t) => (
          <button
            key={t}
            className={`tab ${tab === t ? "active" : ""}`}
            onClick={() => setTab(t)}
          >
            {t}
          </button>
        ))}
      </div>
      <div style={{ flex: 1, overflowY: "auto", paddingRight: 4 }}>
        {tab === "Actions" && <ActionsPanel character={character} api={api} />}
        {tab === "Inventory" && <InventoryPanel character={character} api={api} />}
        {tab === "Features" && <FeaturesPanel character={character} api={api} />}
        {tab === "Notes" && <NotesPanel character={character} api={api} />}
      </div>
    </div>
  );
};
