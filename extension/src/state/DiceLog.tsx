import { createContext, useCallback, useContext, useState, type ReactNode } from "react";
import type { RollResult } from "../lib/dice";

export interface LogEntry {
  id: string;
  label: string;
  result: RollResult;
  at: number;
}

interface DiceLogValue {
  entries: LogEntry[];
  push: (label: string, result: RollResult) => void;
  clear: () => void;
}

const DiceLogContext = createContext<DiceLogValue | null>(null);

export const DiceLogProvider = ({ children }: { children: ReactNode }) => {
  const [entries, setEntries] = useState<LogEntry[]>([]);

  const push = useCallback((label: string, result: RollResult) => {
    setEntries((prev) =>
      [
        { id: `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`, label, result, at: Date.now() },
        ...prev,
      ].slice(0, 50)
    );
  }, []);

  const clear = useCallback(() => setEntries([]), []);

  return (
    <DiceLogContext.Provider value={{ entries, push, clear }}>{children}</DiceLogContext.Provider>
  );
};

export const useDiceLog = (): DiceLogValue => {
  const ctx = useContext(DiceLogContext);
  if (!ctx) throw new Error("useDiceLog must be used within DiceLogProvider");
  return ctx;
};
