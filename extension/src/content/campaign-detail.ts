import type { CampaignDetailSnapshot } from "../types/snapshots";

/**
 * Scrape /campaigns/{id} into a `CampaignDetailSnapshot`.
 *
 * Stub for now — wired to a real parser in a follow-up commit.
 * See docs/recon/dndbeyond-campaigns.md §4 for the structural anchors:
 *   - header h1 → name
 *   - description region (after sharing + invite block)
 *   - invite link → token
 *   - "Active Characters" list (each card carries /profile/{u}/characters/{c} href)
 *   - "DM Notes (Private)" + "DM Notes (Public)" HTML
 */
export const scrapeCampaignDetail = async (
  campaignId: number
): Promise<CampaignDetailSnapshot | null> => {
  console.log("[dnd-ext] scrapeCampaignDetail — stub for id", campaignId);
  return {
    observed_at: new Date().toISOString(),
    id: campaignId,
    name: document.querySelector("h1")?.textContent?.trim() ?? "",
    description_html: "",
    invite_token: null,
    party: [],
    dm_notes_private_html: null,
    dm_notes_public_html: null,
  };
};
