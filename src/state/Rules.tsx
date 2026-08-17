import { createContext, useContext, useEffect, useState, type ReactNode } from "react";
import {
  loadClasses,
  loadConditions,
  loadFeats,
  loadSpells,
  loadTables,
  loadBestiary,
  type ClassData,
  type ConditionData,
  type FeatData,
  type SpellData,
  type TablesData,
} from "../data/loader";
import type { MonsterStatblock } from "../types/content";

/**
 * The 5e reference data, fetched once and shared.
 *
 * These files ship in /public/data and were previously loaded by nothing —
 * 339 spells, 15 conditions, 17 feats and 19 lookup tables sitting unused. A
 * provider rather than per-component fetches so the payload is parsed once and
 * every consumer (sheet panels, the VTT rules drawer) reads the same objects.
 *
 * Data is the 2024 ruleset: backgrounds grant ability increases and an origin
 * feat, classes have Weapon Mastery, and species are "species" not "race".
 *
 * Everything is null until loaded — consumers should treat that as "not ready"
 * and render a fallback rather than blocking the whole sheet on a fetch.
 */

interface RulesValue {
  spells: SpellData[] | null;
  conditions: Record<string, ConditionData> | null;
  feats: Record<string, FeatData> | null;
  tables: TablesData | null;
  classes: Record<string, ClassData> | null;
  bestiary: MonsterStatblock[] | null;
  loading: boolean;
  error: string | null;
}

const RulesContext = createContext<RulesValue | null>(null);

export const RulesProvider = ({ children }: { children: ReactNode }) => {
  const [value, setValue] = useState<RulesValue>({
    spells: null,
    conditions: null,
    feats: null,
    tables: null,
    classes: null,
    bestiary: null,
    loading: true,
    error: null,
  });

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const [spells, conditions, feats, tables, classes, bestiary] = await Promise.all([
          loadSpells(),
          loadConditions(),
          loadFeats(),
          loadTables(),
          loadClasses(),
          loadBestiary(),
        ]);
        if (cancelled) return;
        setValue({ spells, conditions, feats, tables, classes, bestiary, loading: false, error: null });
      } catch (e) {
        if (cancelled) return;
        // Non-fatal: the sheet still works on the character's own data, it just
        // can't show reference material.
        setValue((v) => ({
          ...v,
          loading: false,
          error: e instanceof Error ? e.message : "Failed to load rules data",
        }));
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  return <RulesContext.Provider value={value}>{children}</RulesContext.Provider>;
};

export const useRules = (): RulesValue => {
  const ctx = useContext(RulesContext);
  if (!ctx) throw new Error("useRules must be used within RulesProvider");
  return ctx;
};
