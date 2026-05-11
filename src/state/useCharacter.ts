import { useCallback, useEffect, useRef, useState } from "react";
import type { Character, Condition, InventoryItem, Attack, Feature } from "../types/character";
import { sampleCharacter } from "../data/sampleCharacter";
import { supabase, supabaseConfigured } from "../lib/supabase";

export const useCharacter = (id: string | null) => {
  const [character, setCharacter] = useState<Character>(sampleCharacter);
  const [loading, setLoading] = useState<boolean>(!!id);
  const saveTimer = useRef<number | null>(null);
  const lastSavedSerialized = useRef<string>("");

  // Load the character whenever the active id changes.
  useEffect(() => {
    let cancelled = false;
    if (!id) {
      setLoading(false);
      return;
    }
    if (!supabaseConfigured) {
      setLoading(false);
      return;
    }
    setLoading(true);
    supabase
      .from("characters")
      .select("data")
      .eq("id", id)
      .single()
      .then(({ data, error }) => {
        if (cancelled) return;
        if (!error && data) {
          const c = data.data as Character;
          setCharacter(c);
          lastSavedSerialized.current = JSON.stringify(c);
        }
        setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [id]);

  // Debounced cloud-save on changes.
  useEffect(() => {
    if (!id || !supabaseConfigured) return;
    const serialized = JSON.stringify(character);
    if (serialized === lastSavedSerialized.current) return;
    if (saveTimer.current != null) window.clearTimeout(saveTimer.current);
    saveTimer.current = window.setTimeout(async () => {
      const { error } = await supabase
        .from("characters")
        .update({ name: character.name, data: character })
        .eq("id", id);
      if (!error) {
        lastSavedSerialized.current = serialized;
      }
    }, 600);
    return () => {
      if (saveTimer.current != null) window.clearTimeout(saveTimer.current);
    };
  }, [character, id]);

  // Realtime: if this character is updated from another session, refresh.
  useEffect(() => {
    if (!id || !supabaseConfigured) return;
    const channel = supabase
      .channel(`character:${id}`)
      .on(
        "postgres_changes",
        { event: "UPDATE", schema: "public", table: "characters", filter: `id=eq.${id}` },
        (payload) => {
          const incoming = JSON.stringify((payload.new as { data: Character }).data);
          // Ignore echoes of our own writes.
          if (incoming === lastSavedSerialized.current) return;
          setCharacter((payload.new as { data: Character }).data);
          lastSavedSerialized.current = incoming;
        }
      )
      .subscribe();
    return () => {
      supabase.removeChannel(channel);
    };
  }, [id]);

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
        d.hp.temp = Math.max(d.hp.temp, amount);
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
    (featureId: string, current: number) =>
      update((d) => {
        d.features = d.features.map((f) =>
          f.id === featureId && f.uses
            ? { ...f, uses: { ...f.uses, current: Math.max(0, Math.min(f.uses.max, current)) } }
            : f
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
    (itemId: string, patch: Partial<InventoryItem>) =>
      update((d) => {
        d.inventory = d.inventory.map((i) => (i.id === itemId ? { ...i, ...patch } : i));
        return d;
      }),
    [update]
  );

  const removeItem = useCallback(
    (itemId: string) =>
      update((d) => {
        d.inventory = d.inventory.filter((i) => i.id !== itemId);
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
    (atkId: string, patch: Partial<Attack>) =>
      update((d) => {
        d.attacks = d.attacks.map((a) => (a.id === atkId ? { ...a, ...patch } : a));
        return d;
      }),
    [update]
  );

  const removeAttack = useCallback(
    (atkId: string) =>
      update((d) => {
        d.attacks = d.attacks.filter((a) => a.id !== atkId);
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
    (featId: string) =>
      update((d) => {
        d.features = d.features.filter((f) => f.id !== featId);
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
    loading,
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
