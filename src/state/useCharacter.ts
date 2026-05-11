import { useCallback, useEffect, useState } from "react";
import type { Character, Condition, InventoryItem, Attack, Feature } from "../types/character";
import { sampleCharacter } from "../data/sampleCharacter";
import { getCharacter, upsertCharacter } from "../lib/persistence";

const STORAGE_EVENT = "dnd-5e-vtt:roster-changed";

export const useCharacter = (id: string | null) => {
  const [character, setCharacter] = useState<Character>(() => {
    if (id) {
      const stored = getCharacter(id);
      if (stored) return stored;
    }
    return sampleCharacter;
  });

  // Reload when the active ID changes.
  useEffect(() => {
    if (id) {
      const stored = getCharacter(id);
      if (stored) setCharacter(stored);
    }
  }, [id]);

  // Persist on every change.
  useEffect(() => {
    upsertCharacter(character);
    window.dispatchEvent(new Event(STORAGE_EVENT));
  }, [character]);

  const update = useCallback((mut: (draft: Character) => Character) => {
    setCharacter((prev) => mut(structuredClone(prev)));
  }, []);

  // ---------------- HP ----------------
  const heal = useCallback(
    (amount: number) =>
      update((d) => {
        d.hp.current = Math.min(d.hp.max, d.hp.current + amount);
        return d;
      }),
    [update]
  );

  const damage = useCallback(
    (amount: number) =>
      update((d) => {
        let remaining = amount;
        const fromTemp = Math.min(d.hp.temp, remaining);
        d.hp.temp -= fromTemp;
        remaining -= fromTemp;
        d.hp.current = Math.max(0, d.hp.current - remaining);
        return d;
      }),
    [update]
  );

  const setTempHp = useCallback(
    (amount: number) =>
      update((d) => {
        d.hp.temp = Math.max(d.hp.temp, amount); // temp HP doesn't stack — take the higher
        return d;
      }),
    [update]
  );

  const setMaxHp = useCallback(
    (max: number) =>
      update((d) => {
        d.hp.max = Math.max(1, max);
        d.hp.current = Math.min(d.hp.current, d.hp.max);
        return d;
      }),
    [update]
  );

  // ---------------- Rests ----------------
  const shortRest = useCallback(
    () =>
      update((d) => {
        d.features = d.features.map((f) =>
          f.uses && f.uses.recharge === "short" ? { ...f, uses: { ...f.uses, current: f.uses.max } } : f
        );
        return d;
      }),
    [update]
  );

  const longRest = useCallback(
    () =>
      update((d) => {
        d.hp.current = d.hp.max;
        d.hp.temp = 0;
        d.hitDiceUsed = Math.max(0, d.hitDiceUsed - Math.floor(d.level / 2));
        d.features = d.features.map((f) =>
          f.uses && (f.uses.recharge === "short" || f.uses.recharge === "long" || f.uses.recharge === "day")
            ? { ...f, uses: { ...f.uses, current: f.uses.max } }
            : f
        );
        return d;
      }),
    [update]
  );

  const toggleInspiration = useCallback(
    () =>
      update((d) => {
        d.inspiration = !d.inspiration;
        return d;
      }),
    [update]
  );

  const toggleCondition = useCallback(
    (cond: Condition) =>
      update((d) => {
        d.conditions = d.conditions.includes(cond)
          ? d.conditions.filter((c) => c !== cond)
          : [...d.conditions, cond];
        return d;
      }),
    [update]
  );

  const setFeatureUses = useCallback(
    (id: string, current: number) =>
      update((d) => {
        d.features = d.features.map((f) =>
          f.id === id && f.uses ? { ...f, uses: { ...f.uses, current: Math.max(0, Math.min(f.uses.max, current)) } } : f
        );
        return d;
      }),
    [update]
  );

  const addItem = useCallback(
    (item: InventoryItem) =>
      update((d) => {
        d.inventory.push(item);
        return d;
      }),
    [update]
  );

  const updateItem = useCallback(
    (id: string, patch: Partial<InventoryItem>) =>
      update((d) => {
        d.inventory = d.inventory.map((i) => (i.id === id ? { ...i, ...patch } : i));
        return d;
      }),
    [update]
  );

  const removeItem = useCallback(
    (id: string) =>
      update((d) => {
        d.inventory = d.inventory.filter((i) => i.id !== id);
        return d;
      }),
    [update]
  );

  const addAttack = useCallback(
    (atk: Attack) =>
      update((d) => {
        d.attacks.push(atk);
        return d;
      }),
    [update]
  );

  const updateAttack = useCallback(
    (id: string, patch: Partial<Attack>) =>
      update((d) => {
        d.attacks = d.attacks.map((a) => (a.id === id ? { ...a, ...patch } : a));
        return d;
      }),
    [update]
  );

  const removeAttack = useCallback(
    (id: string) =>
      update((d) => {
        d.attacks = d.attacks.filter((a) => a.id !== id);
        return d;
      }),
    [update]
  );

  const addFeature = useCallback(
    (feat: Feature) =>
      update((d) => {
        d.features.push(feat);
        return d;
      }),
    [update]
  );

  const removeFeature = useCallback(
    (id: string) =>
      update((d) => {
        d.features = d.features.filter((f) => f.id !== id);
        return d;
      }),
    [update]
  );

  const setName = useCallback(
    (name: string) =>
      update((d) => {
        d.name = name;
        return d;
      }),
    [update]
  );

  const setCurrency = useCallback(
    (coin: keyof Character["currency"], value: number) =>
      update((d) => {
        d.currency[coin] = Math.max(0, value);
        return d;
      }),
    [update]
  );

  return {
    character,
    update,
    heal,
    damage,
    setTempHp,
    setMaxHp,
    shortRest,
    longRest,
    toggleInspiration,
    toggleCondition,
    setFeatureUses,
    addItem,
    updateItem,
    removeItem,
    addAttack,
    updateAttack,
    removeAttack,
    addFeature,
    removeFeature,
    setName,
    setCurrency,
  };
};

export type CharacterAPI = ReturnType<typeof useCharacter>;
