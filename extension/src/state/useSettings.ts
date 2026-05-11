import { useEffect, useState } from "react";
import { DEFAULT_MODEL } from "../lib/anthropic";

interface Settings {
  anthropic_api_key: string;
  model: string;
}

const KEY = "dm-agent-settings";
const DEFAULT: Settings = { anthropic_api_key: "", model: DEFAULT_MODEL };

export const useSettings = () => {
  const [settings, setSettings] = useState<Settings>(DEFAULT);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    chrome.storage.local.get(KEY).then((out) => {
      setSettings({ ...DEFAULT, ...(out[KEY] ?? {}) });
      setLoaded(true);
    });
    const listener = (changes: Record<string, chrome.storage.StorageChange>, area: string) => {
      if (area === "local" && changes[KEY]) {
        setSettings({ ...DEFAULT, ...(changes[KEY].newValue ?? {}) });
      }
    };
    chrome.storage.onChanged.addListener(listener);
    return () => chrome.storage.onChanged.removeListener(listener);
  }, []);

  const save = async (patch: Partial<Settings>) => {
    const next = { ...settings, ...patch };
    setSettings(next);
    await chrome.storage.local.set({ [KEY]: next });
  };

  return { settings, loaded, save, hasKey: settings.anthropic_api_key.length > 0 };
};
