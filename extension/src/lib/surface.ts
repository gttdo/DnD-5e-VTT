import type { Surface } from "../types/snapshots";

/**
 * Classify a D&D Beyond URL into one of the surfaces we scrape.
 * Reads the path only — never inspects the DOM.
 */
export const detectSurface = (urlString: string): Surface => {
  const url = new URL(urlString);
  if (url.hostname !== "www.dndbeyond.com") return { kind: "unknown", url: urlString };

  const path = url.pathname;

  if (path === "/my-campaigns") {
    return { kind: "campaign-list", url: urlString };
  }

  // /campaigns/{id}  — exclude /campaigns/create, /campaigns/premade, /campaigns/join/*
  const campaignDetail = path.match(/^\/campaigns\/(\d+)\/?$/);
  if (campaignDetail) {
    return {
      kind: "campaign-detail",
      url: urlString,
      campaignId: parseInt(campaignDetail[1], 10),
    };
  }

  // /characters/{id} or /profile/{username}/characters/{id}
  const charA = path.match(/^\/characters\/(\d+)\/?$/);
  if (charA) {
    return {
      kind: "character-sheet",
      url: urlString,
      charId: parseInt(charA[1], 10),
    };
  }
  const charB = path.match(/^\/profile\/[^/]+\/characters\/(\d+)\/?$/);
  if (charB) {
    return {
      kind: "character-sheet",
      url: urlString,
      charId: parseInt(charB[1], 10),
    };
  }

  return { kind: "unknown", url: urlString };
};
