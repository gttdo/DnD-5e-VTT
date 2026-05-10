import type { Character } from "../types/character";
import type { CharacterAPI } from "../state/useCharacter";

export const NotesPanel = ({ character: c, api }: { character: Character; api: CharacterAPI }) => {
  const setNote = (key: keyof Character["notes"], value: string) => {
    api.update((d) => {
      d.notes[key] = value;
      return d;
    });
  };

  const fields: Array<[keyof Character["notes"], string]> = [
    ["personality", "Personality Traits"],
    ["ideals", "Ideals"],
    ["bonds", "Bonds"],
    ["flaws", "Flaws"],
    ["backstory", "Backstory"],
    ["allies", "Allies & Organizations"],
    ["other", "Other Notes"],
  ];

  return (
    <div style={{ marginTop: 12 }}>
      {fields.map(([key, label]) => (
        <div key={key} style={{ marginBottom: 12 }}>
          <div className="panel-title" style={{ marginBottom: 4 }}>{label}</div>
          <textarea
            style={{ width: "100%", minHeight: 60, resize: "vertical" }}
            value={c.notes[key] ?? ""}
            onChange={(e) => setNote(key, e.target.value)}
          />
        </div>
      ))}
    </div>
  );
};
