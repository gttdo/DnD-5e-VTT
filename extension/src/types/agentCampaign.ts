import type { ChatMessage } from "../lib/anthropic";
import type { CampaignStyle } from "../data/campaignStyles";

export interface AgentMessage extends ChatMessage {
  id: string;
  ts: number;
  /** When the assistant message includes token usage from the API. */
  usage?: { input: number; output: number };
}

export interface AgentCampaign {
  id: string;
  name: string;
  /** Free-form outline (markdown / plain text). Pre-loaded by the DM. */
  outline: string;
  /** Style preset (flavor + tone + lethality) influencing the system prompt. */
  style: CampaignStyle;
  /** If linked, the D&D Beyond campaign id we mirror context from. */
  dndbeyond_campaign_id: number | null;
  /** Chat history with the agent. */
  messages: AgentMessage[];
  created_at: number;
  updated_at: number;
}
