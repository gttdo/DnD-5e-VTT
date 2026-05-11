import type { Character } from "../types/character";

const ROSTER_KEY = "dnd-5e-vtt:characters";
const ACTIVE_KEY = "dnd-5e-vtt:active-id";
const LEGACY_KEY = "dnd-5e-vtt:character"; // pre-roster format

interface Roster {
  characters: Character[];
}

const readRoster = (): Roster => {
  try {
    const raw = localStorage.getItem(ROSTER_KEY);
    if (raw) return JSON.parse(raw) as Roster;
  } catch {
    /* fall through */
  }

  // Migrate legacy single-character storage if present.
  try {
    const legacy = localStorage.getItem(LEGACY_KEY);
    if (legacy) {
      const c = JSON.parse(legacy) as Character;
      const roster: Roster = { characters: [c] };
      localStorage.setItem(ROSTER_KEY, JSON.stringify(roster));
      localStorage.setItem(ACTIVE_KEY, c.id);
      localStorage.removeItem(LEGACY_KEY);
      return roster;
    }
  } catch {
    /* ignore */
  }

  return { characters: [] };
};

const writeRoster = (roster: Roster): void => {
  try {
    localStorage.setItem(ROSTER_KEY, JSON.stringify(roster));
  } catch {
    /* quota exceeded — ignore */
  }
};

export const listCharacters = (): Character[] => readRoster().characters;

export const getCharacter = (id: string): Character | null =>
  readRoster().characters.find((c) => c.id === id) ?? null;

export const upsertCharacter = (c: Character): void => {
  const roster = readRoster();
  const idx = roster.characters.findIndex((x) => x.id === c.id);
  if (idx >= 0) roster.characters[idx] = c;
  else roster.characters.push(c);
  writeRoster(roster);
};

export const deleteCharacter = (id: string): void => {
  const roster = readRoster();
  roster.characters = roster.characters.filter((c) => c.id !== id);
  writeRoster(roster);
  if (getActiveId() === id) setActiveId(null);
};

export const getActiveId = (): string | null => {
  try {
    return localStorage.getItem(ACTIVE_KEY);
  } catch {
    return null;
  }
};

export const setActiveId = (id: string | null): void => {
  try {
    if (id) localStorage.setItem(ACTIVE_KEY, id);
    else localStorage.removeItem(ACTIVE_KEY);
  } catch {
    /* ignore */
  }
};

export const clearAll = (): void => {
  localStorage.removeItem(ROSTER_KEY);
  localStorage.removeItem(ACTIVE_KEY);
  localStorage.removeItem(LEGACY_KEY);
};
