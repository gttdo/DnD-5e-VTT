import type { Character } from "../types/character";

const KEY = "dnd-5e-vtt:character";

export const loadCharacter = (): Character | null => {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return null;
    return JSON.parse(raw) as Character;
  } catch {
    return null;
  }
};

export const saveCharacter = (c: Character): void => {
  try {
    localStorage.setItem(KEY, JSON.stringify(c));
  } catch {
    /* quota exceeded — ignore */
  }
};

export const clearCharacter = (): void => {
  localStorage.removeItem(KEY);
};
