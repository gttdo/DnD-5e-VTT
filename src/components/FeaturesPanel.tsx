import type { Character, Feature } from "../types/character";
import type { CharacterAPI } from "../state/useCharacter";
import { useRules } from "../state/Rules";

/** "Magic Initiate (Cleric)" → "Magic Initiate" — feats.json keys by base name. */
const baseFeatName = (name: string) => name.replace(/\s*\(.*\)$/, "");

export const FeaturesPanel = ({ character: c, api }: { character: Character; api: CharacterAPI }) => {
  const { feats } = useRules();

  // Enrich feat cards from the dataset at render time. Characters saved before
  // the data was wired carry placeholder text ("See PHB Chapter 5") — the real
  // summary supersedes it without needing a data migration.
  const describe = (f: Feature): string => {
    if (f.source !== "feat") return f.description;
    const data = feats?.[baseFeatName(f.name)];
    if (!data) return f.description;
    const isPlaceholder = f.description.includes("See PHB");
    return isPlaceholder ? data.summary : f.description;
  };
  const featMeta = (f: Feature): string | null => {
    if (f.source !== "feat") return null;
    const data = feats?.[baseFeatName(f.name)];
    if (!data) return null;
    return data.prerequisite ? `${data.category} · requires ${data.prerequisite}` : data.category;
  };
  const grouped = {
    class: c.features.filter((f) => f.source === "class"),
    species: c.features.filter((f) => f.source === "species"),
    feat: c.features.filter((f) => f.source === "feat"),
    background: c.features.filter((f) => f.source === "background"),
    other: c.features.filter((f) => f.source === "other"),
  };

  const sections: Array<[string, typeof c.features]> = [
    ["Class Features", grouped.class],
    ["Species Traits", grouped.species],
    ["Feats", grouped.feat],
    ["Background", grouped.background],
    ["Other", grouped.other],
  ];

  return (
    <div>
      {sections.map(([label, list]) =>
        list.length > 0 ? (
          <div key={label}>
            <div className="panel-title" style={{ marginTop: 12 }}>{label}</div>
            {list.map((f) => (
              <div key={f.id} className="feature-card">
                <div className="head">
                  <div>
                    <span className="name">{f.name}</span>
                    {f.uses && (
                      <span className="use-pips" title={`${f.uses.current}/${f.uses.max} uses · recharge ${f.uses.recharge}`}>
                        {Array.from({ length: f.uses.max }, (_, i) => {
                          const used = i >= f.uses!.current;
                          return (
                            <span
                              key={i}
                              className={`use-pip ${used ? "used" : ""}`}
                              onClick={() => api.setFeatureUses(f.id, used ? i + 1 : i)}
                            />
                          );
                        })}
                        <span className="dim mono" style={{ marginLeft: 6, fontSize: 11 }}>
                          {f.uses.current}/{f.uses.max} · {f.uses.recharge === "short" ? "S.Rest" : f.uses.recharge === "long" ? "L.Rest" : f.uses.recharge}
                        </span>
                      </span>
                    )}
                  </div>
                  <span className="src">{featMeta(f) ?? f.sourceDetail}</span>
                </div>
                <div className="desc">{describe(f)}</div>
              </div>
            ))}
          </div>
        ) : null
      )}
    </div>
  );
};
