import { useCallback, useEffect, useState } from "react";
import type { AgentCampaign, AgentMessage } from "../types/agentCampaign";

const STORAGE_KEY = "dm-agent-campaigns";

interface RosterShape {
  campaigns: AgentCampaign[];
}

const read = async (): Promise<AgentCampaign[]> => {
  const out = await chrome.storage.local.get(STORAGE_KEY);
  return ((out[STORAGE_KEY] as RosterShape | undefined)?.campaigns) ?? [];
};

const write = async (campaigns: AgentCampaign[]): Promise<void> => {
  await chrome.storage.local.set({ [STORAGE_KEY]: { campaigns } });
};

export const useAgentCampaigns = () => {
  const [campaigns, setCampaigns] = useState<AgentCampaign[]>([]);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    void read().then((cs) => {
      setCampaigns(cs);
      setLoaded(true);
    });
    const listener = (
      changes: Record<string, chrome.storage.StorageChange>,
      area: string
    ) => {
      if (area === "local" && changes[STORAGE_KEY]) {
        const next = (changes[STORAGE_KEY].newValue as RosterShape | undefined)?.campaigns ?? [];
        setCampaigns(next);
      }
    };
    chrome.storage.onChanged.addListener(listener);
    return () => chrome.storage.onChanged.removeListener(listener);
  }, []);

  const create = useCallback(async (name: string, outline = ""): Promise<AgentCampaign> => {
    const now = Date.now();
    const camp: AgentCampaign = {
      id: crypto.randomUUID(),
      name,
      outline,
      dndbeyond_campaign_id: null,
      messages: [],
      created_at: now,
      updated_at: now,
    };
    const next = [...campaigns, camp];
    setCampaigns(next);
    await write(next);
    return camp;
  }, [campaigns]);

  const update = useCallback(async (id: string, patch: Partial<AgentCampaign>) => {
    const next = campaigns.map((c) =>
      c.id === id ? { ...c, ...patch, updated_at: Date.now() } : c
    );
    setCampaigns(next);
    await write(next);
  }, [campaigns]);

  const remove = useCallback(async (id: string) => {
    const next = campaigns.filter((c) => c.id !== id);
    setCampaigns(next);
    await write(next);
  }, [campaigns]);

  const appendMessage = useCallback(async (id: string, msg: AgentMessage) => {
    const next = campaigns.map((c) =>
      c.id === id
        ? { ...c, messages: [...c.messages, msg], updated_at: Date.now() }
        : c
    );
    setCampaigns(next);
    await write(next);
  }, [campaigns]);

  return { campaigns, loaded, create, update, remove, appendMessage };
};
