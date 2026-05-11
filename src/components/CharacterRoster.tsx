import type { Character } from "../types/character";

interface Props {
  characters: Character[];
  onOpen: (id: string) => void;
  onCreate: () => void;
  onDelete: (id: string) => void;
}

export const CharacterRoster = ({ characters, onOpen, onCreate, onDelete }: Props) => (
  <div style={{ minHeight: "100vh", padding: "32px 24px", maxWidth: 1100, margin: "0 auto" }}>
    <div className="row" style={{ justifyContent: "space-between", alignItems: "center", marginBottom: 24 }}>
      <div>
        <h1 style={{ fontSize: 32, color: "var(--gold)" }}>My Characters</h1>
        <div className="dim" style={{ marginTop: 4 }}>
          {characters.length} character{characters.length === 1 ? "" : "s"}
        </div>
      </div>
      <button className="primary" onClick={onCreate} style={{ padding: "10px 18px", fontSize: 14 }}>
        + Create a Character
      </button>
    </div>

    {characters.length === 0 ? (
      <div className="panel center" style={{ padding: 60 }}>
        <div className="dim" style={{ marginBottom: 16 }}>No characters yet.</div>
        <button className="primary" onClick={onCreate}>+ Create your first character</button>
      </div>
    ) : (
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(auto-fill, minmax(280px, 1fr))",
          gap: 16,
        }}
      >
        {characters.map((c) => {
          const initials = c.name
            .split(/\s+/)
            .map((w) => w[0])
            .filter(Boolean)
            .slice(0, 2)
            .join("")
            .toUpperCase();
          const classes = c.classes.map((cl) => `${cl.name} ${cl.level}`).join(" / ");
          return (
            <div
              key={c.id}
              className="panel"
              style={{ cursor: "pointer", display: "flex", flexDirection: "column", gap: 10 }}
              onClick={() => onOpen(c.id)}
            >
              <div className="row" style={{ gap: 12 }}>
                {c.portrait ? (
                  <img className="portrait" src={c.portrait} alt={c.name} />
                ) : (
                  <div className="portrait">{initials || "?"}</div>
                )}
                <div className="grow">
                  <div style={{ fontFamily: "Cinzel, serif", fontSize: 18, fontWeight: 700 }}>
                    {c.name}
                  </div>
                  <div className="dim" style={{ fontSize: 12 }}>
                    Level {c.level} · {c.species} · {classes}
                  </div>
                  <div className="dim" style={{ fontSize: 12 }}>
                    {c.background}
                  </div>
                </div>
              </div>
              <div className="row" style={{ justifyContent: "space-between", marginTop: 4 }}>
                <div className="dim mono" style={{ fontSize: 11 }}>
                  HP {c.hp.current}/{c.hp.max} · AC {c.ac.override ?? c.ac.value}
                </div>
                <div className="row" style={{ gap: 4 }}>
                  <button
                    className="ghost"
                    style={{ fontSize: 11 }}
                    onClick={(e) => {
                      e.stopPropagation();
                      onOpen(c.id);
                    }}
                  >
                    Open
                  </button>
                  <button
                    className="ghost"
                    style={{ fontSize: 11, color: "var(--accent)" }}
                    onClick={(e) => {
                      e.stopPropagation();
                      if (confirm(`Delete ${c.name}? This cannot be undone.`)) onDelete(c.id);
                    }}
                  >
                    Delete
                  </button>
                </div>
              </div>
            </div>
          );
        })}
      </div>
    )}
  </div>
);
