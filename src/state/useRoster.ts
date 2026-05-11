import { useCallback, useEffect, useState } from "react";
import type { Character } from "../types/character";
import { sampleCharacter } from "../data/sampleCharacter";
import {
  deleteCharacter as removeCharacter,
  getActiveId,
  listCharacters,
  setActiveId as persistActiveId,
  upsertCharacter,
} from "../lib/persistence";

const STORAGE_EVENT = "dnd-5e-vtt:roster-changed";

const seedIfEmpty = (): Character[] => {
  const list = listCharacters();
  if (list.length === 0) {
    upsertCharacter(sampleCharacter);
    return [sampleCharacter];
  }
  return list;
};

export const useRoster = () => {
  const [characters, setCharacters] = useState<Character[]>(() => seedIfEmpty());
  const [activeId, setActiveIdState] = useState<string | null>(() => getActiveId());

  useEffect(() => {
    const onChange = () => setCharacters(listCharacters());
    window.addEventListener(STORAGE_EVENT, onChange);
    return () => window.removeEventListener(STORAGE_EVENT, onChange);
  }, []);

  const refresh = useCallback(() => {
    setCharacters(listCharacters());
    window.dispatchEvent(new Event(STORAGE_EVENT));
  }, []);

  const create = useCallback(
    (c: Character) => {
      upsertCharacter(c);
      refresh();
    },
    [refresh]
  );

  const remove = useCallback(
    (id: string) => {
      removeCharacter(id);
      refresh();
      if (activeId === id) {
        setActiveIdState(null);
      }
    },
    [refresh, activeId]
  );

  const select = useCallback((id: string | null) => {
    persistActiveId(id);
    setActiveIdState(id);
  }, []);

  return { characters, activeId, create, remove, select, refresh };
};
