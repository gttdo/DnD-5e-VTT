import type { CampaignListSnapshot, CampaignSummary } from "../types/snapshots";

/**
 * Scrape /my-campaigns into a `CampaignListSnapshot`.
 *
 * Each card carries multiple action links — VIEW CAMPAIGN, LAUNCH VTT,
 * DEACTIVATE, DELETE — and all four contain the campaign id in their
 * href, so we anchor on any of those, dedupe by id, then read the card's
 * text for name / start date / player count / role.
 */

const waitFor = async (
  predicate: () => boolean,
  { timeout = 8000, interval = 200 } = {}
): Promise<boolean> => {
  const start = Date.now();
  while (!predicate()) {
    if (Date.now() - start > timeout) return false;
    await new Promise((r) => setTimeout(r, interval));
  }
  return true;
};

const extractCampaignId = (href: string): number | null => {
  const m = href.match(/\/campaigns\/(\d+)(?:\/|$)/);
  if (!m) return null;
  return parseInt(m[1], 10);
};

const findCardRoot = (anchor: HTMLAnchorElement): HTMLElement | null => {
  // Walk up until we find an ancestor that contains both "ROLE:" and the
  // campaign name (h2/h3/strong). The card is large but bounded.
  let cursor: HTMLElement | null = anchor.parentElement;
  for (let i = 0; i < 10 && cursor; i++) {
    const txt = cursor.innerText ?? "";
    if (txt.includes("ROLE:") && txt.length < 800) return cursor;
    cursor = cursor.parentElement;
  }
  return null;
};

export const scrapeCampaignList = async (): Promise<CampaignListSnapshot | null> => {
  await waitFor(
    () => document.querySelector('a[href^="/campaigns/"]') !== null,
    { timeout: 6000, interval: 200 }
  );

  // Collect every campaign id present on the page from card links.
  const campaigns = new Map<number, CampaignSummary>();
  const anchors = document.querySelectorAll<HTMLAnchorElement>(
    'a[href^="/campaigns/"]'
  );

  for (const a of anchors) {
    const id = extractCampaignId(a.getAttribute("href") ?? "");
    if (id == null) continue;
    if (campaigns.has(id)) continue;

    const card = findCardRoot(a);
    if (!card) continue;
    const text = (card.innerText ?? "").split(/\n+/).map((s) => s.trim()).filter(Boolean);

    // Name: the first line that isn't a known UI control.
    const skip = new Set([
      "VIEW CAMPAIGN", "LAUNCH VTT", "DEACTIVATE", "DELETE",
      "CONTENT SHARING ENABLED BY", "ACTIVE CAMPAIGNS",
    ]);
    const name =
      text.find(
        (l) =>
          !/^(ROLE:|Campaign Started|PLAYERS|CONTENT SHARING)/.test(l) &&
          !/^\d+$/.test(l) &&
          !skip.has(l.toUpperCase()) &&
          l.length > 0
      ) ?? "";

    const dateMatch = text.find((l) => /^Campaign Started/.test(l));
    const started_at = dateMatch
      ? (dateMatch.match(/Campaign Started\s+(\d{1,2}\/\d{1,2}\/\d{4})/)?.[1] ?? null)
      : null;

    const playersLineIdx = text.findIndex((l) => /^PLAYERS$/i.test(l));
    let player_count = 0;
    if (playersLineIdx > 0) {
      const prev = text[playersLineIdx - 1];
      const n = parseInt(prev, 10);
      if (Number.isFinite(n)) player_count = n;
    }

    const roleLine = text.find((l) => /^ROLE:/i.test(l)) ?? "";
    const role: "dm" | "player" = /DUNGEON MASTER/i.test(roleLine) ? "dm" : "player";

    const sharingLine = text.find((l) => /CONTENT SHARING ENABLED BY/i.test(l));
    const sharing = sharingLine
      ? { enabled: true, by: sharingLine.match(/BY\s+(\S+)/i)?.[1] }
      : undefined;

    campaigns.set(id, {
      id,
      name,
      player_count,
      role,
      started_at,
      content_sharing: sharing,
    });
  }

  const snap: CampaignListSnapshot = {
    observed_at: new Date().toISOString(),
    campaigns: [...campaigns.values()],
  };
  console.log("[dnd-ext] scrapeCampaignList →", snap);
  return snap;
};
