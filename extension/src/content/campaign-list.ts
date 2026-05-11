import type { CampaignListSnapshot } from "../types/snapshots";

/**
 * Scrape /my-campaigns into a `CampaignListSnapshot`.
 *
 * Stub for now — wired to a real parser in a follow-up commit.
 * See docs/recon/dndbeyond-campaigns.md §2 for the structural anchors.
 */
export const scrapeCampaignList = async (): Promise<CampaignListSnapshot | null> => {
  // TODO: locate each campaign card by anchoring on "View Campaign" links
  // whose href matches /^\/campaigns\/(\d+)$/, then read sibling fields.
  console.log("[dnd-ext] scrapeCampaignList — stub");
  return {
    observed_at: new Date().toISOString(),
    campaigns: [],
  };
};
