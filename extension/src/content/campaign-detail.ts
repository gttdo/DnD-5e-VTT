import type { CampaignDetailSnapshot, CampaignPartyMember } from "../types/snapshots";

/**
 * Scrape /campaigns/{id} into a `CampaignDetailSnapshot`.
 *
 * Selectors locked in against the live Borderland Heroes page; D&D Beyond
 * uses stable `.ddb-campaigns-*` class names. See
 * docs/recon/dndbeyond-campaigns.md for the structural map.
 *
 * Strategy:
 *   - Wait briefly for the React app to mount before parsing.
 *   - h1 → campaign name.
 *   - Anchor patterns: `.ddb-campaigns-character-card` per party member,
 *     each containing a 3-line text block we parse with a regex.
 *   - `.ddb-campaigns-detail-body-dm-notes-private` /
 *     `.ddb-campaigns-detail-body-dm-notes-public` for DM notes HTML.
 *   - Invite token extracted from any text matching /campaigns/join/{N}.
 *   - Description: the rich-text block above the sharing block. Selector
 *     fallback for now since the class name wasn't visible.
 */

const waitFor = async (
  predicate: () => boolean,
  { timeout = 10000, interval = 200 } = {}
): Promise<boolean> => {
  const start = Date.now();
  while (!predicate()) {
    if (Date.now() - start > timeout) return false;
    await new Promise((r) => setTimeout(r, interval));
  }
  return true;
};

/** Parse a card's innerText: 3 informative lines then action buttons. */
const parsePartyCard = (card: Element): CampaignPartyMember | null => {
  const linkEl = card.querySelector<HTMLAnchorElement>(
    "a.ddb-campaigns-character-card-header-upper-details-link"
  );
  if (!linkEl) return null;
  const href = linkEl.getAttribute("href") ?? "";
  const m = href.match(/^\/profile\/([^/]+)\/characters\/(\d+)/);
  if (!m) return null;
  const [, username, charIdStr] = m;
  const charId = parseInt(charIdStr, 10);

  const text = (card as HTMLElement).innerText ?? "";
  const lines = text
    .split(/\n+/)
    .map((s) => s.trim())
    .filter((s) => s.length > 0);

  // Skip empty/action lines at the start, then take the first 3 informative ones.
  const skip = new Set([
    "VIEW", "EDIT", "DEACTIVATE", "REMOVE", "UNASSIGN", "MORE",
  ]);
  const info = lines.filter((l) => !skip.has(l.toUpperCase())).slice(0, 3);

  const name = info[0] ?? "Unknown";
  // Pattern: "Lvl {N} | {Species} | {Class}[ / {Subclass}]"
  const levelLine = info[1] ?? "";
  const levelMatch = levelLine.match(/Lvl\s*(\d+)\s*\|\s*([^|]+?)\s*\|\s*(.+)/);
  let total_level = 1;
  let species = "";
  let className = "";
  let subclass: string | null = null;
  if (levelMatch) {
    total_level = parseInt(levelMatch[1], 10);
    species = levelMatch[2].trim();
    const classBlob = levelMatch[3].trim();
    // Split off subclass after " / " if present.
    const slashIdx = classBlob.indexOf(" / ");
    if (slashIdx >= 0) {
      className = classBlob.slice(0, slashIdx).trim();
      subclass = classBlob.slice(slashIdx + 3).trim();
    } else {
      className = classBlob;
    }
  }

  return {
    char_id: charId,
    username,
    name,
    total_level,
    species,
    class: className,
    subclass,
  };
};

const findDescription = (): string =>
  document.querySelector<HTMLElement>(
    ".ddb-campaigns-detail-header-secondary-description"
  )?.innerHTML.trim() ?? "";

export const scrapeCampaignDetail = async (
  campaignId: number
): Promise<CampaignDetailSnapshot | null> => {
  // Wait for the React app to populate the party + DM notes.
  await waitFor(
    () =>
      !!document.querySelector(".ddb-campaigns-character-card") ||
      !!document.querySelector(".ddb-campaigns-detail-body-dm-notes-container"),
    { timeout: 8000, interval: 200 }
  );

  const name = document.querySelector("h1")?.textContent?.trim() ?? "";

  // Party
  const cards = document.querySelectorAll(".ddb-campaigns-character-card");
  const party: CampaignPartyMember[] = [];
  cards.forEach((c) => {
    const member = parsePartyCard(c);
    if (member && !party.some((p) => p.char_id === member.char_id)) {
      party.push(member);
    }
  });

  // DM Notes
  const dm_notes_private_html =
    document.querySelector(".ddb-campaigns-detail-body-dm-notes-private")
      ?.innerHTML ?? null;
  const dm_notes_public_html =
    document.querySelector(".ddb-campaigns-detail-body-dm-notes-public")
      ?.innerHTML ?? null;

  // Invite token
  const inviteMatch = document.body.innerText.match(/campaigns\/join\/(\d+)/);
  const invite_token = inviteMatch ? inviteMatch[1] : null;

  // Description (best-effort large rich-text block outside the body listing)
  const description_html = findDescription();

  const snap: CampaignDetailSnapshot = {
    observed_at: new Date().toISOString(),
    id: campaignId,
    name,
    description_html,
    invite_token,
    party,
    dm_notes_private_html,
    dm_notes_public_html,
  };

  console.log("[dnd-ext] scrapeCampaignDetail →", {
    id: campaignId,
    name,
    party_count: party.length,
    invite_token,
    description_len: description_html.length,
    private_notes_len: dm_notes_private_html?.length ?? 0,
    public_notes_len: dm_notes_public_html?.length ?? 0,
  });

  return snap;
};
