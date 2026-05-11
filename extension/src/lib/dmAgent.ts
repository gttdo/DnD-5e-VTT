import type { AgentCampaign } from "../types/agentCampaign";
import type { CampaignDetailSnapshot, Roll } from "../types/snapshots";
import { DM_SKILL_PRIMER } from "../data/dmSkillPrimer";
import { stylePromptBlock, DEFAULT_STYLE } from "../data/campaignStyles";

/**
 * Assemble the system prompt for an agent turn.
 *
 * Layers (in order — most stable first):
 *   1. DM skill operating principles
 *   2. Campaign metadata: name, outline
 *   3. Party context: who's at the table (from the linked D&D Beyond
 *      campaign if available)
 *
 * Keep this dynamic — re-assemble on every send so updates to the
 * outline or party are picked up without restarting the conversation.
 */

export const buildSystemPrompt = (
  campaign: AgentCampaign,
  dndbeyondContext: CampaignDetailSnapshot | null,
  recentRolls: Roll[] = []
): string => {
  const parts: string[] = [DM_SKILL_PRIMER];

  parts.push("\n---\n## CAMPAIGN: " + campaign.name);

  const styleBlock = stylePromptBlock(campaign.style ?? DEFAULT_STYLE);
  if (styleBlock) {
    parts.push("\n### Style\n" + styleBlock);
  }

  if (campaign.outline?.trim()) {
    parts.push("\n### Outline\n" + campaign.outline.trim());
  }

  if (dndbeyondContext) {
    if (dndbeyondContext.party.length > 0) {
      const partyLines = dndbeyondContext.party.map((p) => {
        const subclass = p.subclass ? ` (${p.subclass})` : "";
        return `- **${p.name}** — ${p.species} ${p.class}${subclass}, Level ${p.total_level} (player: ${p.username})`;
      });
      parts.push("\n### Party\n" + partyLines.join("\n"));
    }

    if (dndbeyondContext.dm_notes_private_html) {
      // Strip HTML tags for the prompt — Claude doesn't need the formatting.
      const stripped = stripHtml(dndbeyondContext.dm_notes_private_html);
      if (stripped) {
        parts.push("\n### DM Notes (Private — D&D Beyond)\n" + stripped);
      }
    }
    if (dndbeyondContext.dm_notes_public_html) {
      const stripped = stripHtml(dndbeyondContext.dm_notes_public_html);
      if (stripped) {
        parts.push("\n### DM Notes (Public — D&D Beyond)\n" + stripped);
      }
    }
  }

  if (recentRolls.length > 0) {
    // Trim to the last ~15 rolls so we don't blow context on a long session.
    const tail = recentRolls.slice(-15);
    const lines = tail.map((r) => {
      const total = r.total != null ? ` = ${r.total}` : "";
      const target = r.target ? ` (${r.target})` : "";
      const formula = r.formula ? ` ${r.formula}` : r.dice ? ` ${r.dice}` : "";
      return `- [${r.observed_at}] ${r.character_name} · ${r.action} · ${r.action_type}${formula}${total}${target}`;
    });
    parts.push(
      "\n### Recent rolls (live from D&D Beyond game log)\n" +
      "Use these to ground your narration. If the most recent attack/check was \n" +
      "successful or failed, react to it specifically.\n" +
      lines.join("\n")
    );
  }

  return parts.join("\n");
};

const stripHtml = (html: string): string => {
  // Cheap-and-cheerful: drop tags, collapse whitespace.
  const text = html
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<\/(p|div|li|h[1-6])>/gi, "\n")
    .replace(/<li[^>]*>/gi, "- ")
    .replace(/<[^>]+>/g, "")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/[ \t]+/g, " ")
    .replace(/\n[ \t]+/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
  return text;
};
