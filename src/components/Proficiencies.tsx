import type { Character } from "../types/character";
import { totalWeight, carryingCapacity } from "../lib/calc";

export const Proficiencies = ({ character: c }: { character: Character }) => {
  const w = totalWeight(c);
  const cap = carryingCapacity(c);
  return (
    <>
      <div className="panel">
        <div className="panel-title">Proficiencies</div>
        <div className="kv">
          <span className="k">Armor</span><span>{c.proficiencies.armor.join(", ") || "—"}</span>
          <span className="k">Weapons</span><span>{c.proficiencies.weapons.join(", ") || "—"}</span>
          <span className="k">Tools</span><span>{c.proficiencies.tools.join(", ") || "—"}</span>
          <span className="k">Languages</span><span>{c.proficiencies.languages.join(", ") || "—"}</span>
        </div>
      </div>

      <div className="panel">
        <div className="panel-title">Defenses</div>
        <div className="kv">
          <span className="k">Resist</span><span>{c.defenses.resistances.join(", ") || "—"}</span>
          <span className="k">Immune</span><span>{c.defenses.immunities.join(", ") || "—"}</span>
          <span className="k">Vulnerable</span><span>{c.defenses.vulnerabilities.join(", ") || "—"}</span>
        </div>
      </div>

      <div className="panel">
        <div className="panel-title">Carrying</div>
        <div className="kv">
          <span className="k">Weight</span>
          <span className="mono">
            {w.toFixed(1)} / {cap} lb
            {w > cap ? <span style={{ color: "var(--accent)", marginLeft: 6 }}>OVER</span> : null}
          </span>
        </div>
      </div>
    </>
  );
};
