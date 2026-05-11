import type { Character } from "../types/character";
import { useRoster } from "../state/useRoster";

export const RosterPanel = ({ onOpen }: { onOpen: (id: string) => void }) => {
  const { characters, loading, error, remove } = useRoster();

  return (
    <section className="panel">
      <div className="panel-title">
        My Characters <span className="dim mono" style={{ fontSize: 10 }}>{characters.length}</span>
      </div>
      {loading && <div className="dim">Loading…</div>}
      {error && <div className="panel-warn">{error}</div>}
      {!loading && characters.length === 0 && (
        <div className="dim" style={{ fontSize: 12, fontStyle: "italic" }}>
          No characters yet. The DM doesn't typically need their own — players use D&D Beyond.
        </div>
      )}
      <div className="col" style={{ gap: 6 }}>
        {characters.map((c) => (
          <CharacterCard key={c.id} character={c} onOpen={() => onOpen(c.id)} onDelete={() => {
            if (confirm(`Delete ${c.name}?`)) void remove(c.id);
          }} />
        ))}
      </div>
    </section>
  );
};

const CharacterCard = ({ character: c, onOpen, onDelete }: {
  character: Character;
  onOpen: () => void;
  onDelete: () => void;
}) => {
  const initials = c.name.split(/\s+/).map((w) => w[0]).filter(Boolean).slice(0, 2).join("").toUpperCase();
  const classes = c.classes.map((cl) => `${cl.name} ${cl.level}`).join("/");
  return (
    <div
      style={{
        display: "grid",
        gridTemplateColumns: "32px 1fr auto",
        gap: 8,
        alignItems: "center",
        padding: 8,
        border: "1px solid var(--line)",
        borderRadius: 6,
        background: "rgba(0,0,0,0.15)",
        cursor: "pointer",
      }}
      onClick={onOpen}
    >
      <div style={{
        width: 32, height: 32, borderRadius: "50%",
        background: "var(--bg-3)", border: "1.5px solid var(--gold)",
        display: "flex", alignItems: "center", justifyContent: "center",
        fontFamily: "var(--serif)", fontSize: 12, color: "var(--gold)",
      }}>
        {initials || "?"}
      </div>
      <div style={{ minWidth: 0 }}>
        <div style={{ fontWeight: 600, fontSize: 13, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
          {c.name}
        </div>
        <div className="dim" style={{ fontSize: 10 }}>
          L{c.level} · {c.species} · {classes}
        </div>
        <div className="dim mono" style={{ fontSize: 10 }}>
          HP {c.hp.current}/{c.hp.max} · AC {c.ac.override ?? c.ac.value}
        </div>
      </div>
      <button
        className="ghost"
        style={{ fontSize: 10, padding: "2px 6px", color: "var(--accent)" }}
        onClick={(e) => { e.stopPropagation(); onDelete(); }}
        title="Delete character"
      >
        ✕
      </button>
    </div>
  );
};
