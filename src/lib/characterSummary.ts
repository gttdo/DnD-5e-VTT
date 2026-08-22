import type { Ability, Character } from "../types/character";

/**
 * A compact, human-readable summary of a character — handed to Oculus in
 * general mode so he can help with the specific build the user is viewing
 * (#7 app-wide). Kept short on purpose; it rides in the request body.
 */
const ABILITIES: Ability[] = ["STR", "DEX", "CON", "INT", "WIS", "CHA"];

export const characterSummary = (c: Character): string => {
  const score = (a: Ability) => {
    const s = c.abilities?.[a];
    return s ? s.override ?? s.base + s.bonus : "?";
  };
  const classes = (c.classes ?? [])
    .map((k) => `${k.name} ${k.level}${k.subclass ? ` [${k.subclass}]` : ""}`)
    .join(" / ") || "no class yet";
  const abilities = ABILITIES.map((a) => `${a} ${score(a)}`).join(", ");
  return [
    `${c.name || "Unnamed"} — level ${c.level} ${c.species || ""}${c.lineage ? ` (${c.lineage})` : ""}, ${classes}`,
    c.background ? `background ${c.background}${c.alignment ? `, ${c.alignment}` : ""}.` : "",
    `AC ${c.ac?.override ?? c.ac?.value ?? "?"}, HP ${c.hp?.current ?? "?"}/${c.hp?.max ?? "?"}, speed ${c.speed ?? "?"}.`,
    `Abilities: ${abilities}.`,
    c.spellcasting ? "Has spellcasting." : "",
  ]
    .filter(Boolean)
    .join(" ");
};
