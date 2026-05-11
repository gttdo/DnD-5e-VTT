import type { Roll } from "../types/snapshots";
import type { ExtensionMessage } from "../types/messages";

/**
 * Watch the D&D Beyond Game Log right-side panel for new roll entries.
 *
 * The panel mounts and unmounts as the DM opens/closes it. We:
 *   1. Watch the document for the panel container to appear
 *   2. When it does, parse the existing entries (initial snapshot)
 *   3. Attach a MutationObserver to it so new entries stream live
 *   4. De-duplicate by entry text-hash because D&D Beyond reuses keys
 *
 * Each parsed entry is sent to the background worker as one
 * `rolls-batch` message (batched per mutation tick to keep traffic low).
 */

const send = (msg: ExtensionMessage): void => {
  chrome.runtime.sendMessage(msg).catch(() => void 0);
};

const seenKeys = new Set<string>();

const campaignIdFromUrl = (): number | null => {
  const m = location.pathname.match(/^\/campaigns\/(\d+)/);
  return m ? parseInt(m[1], 10) : null;
};

const parseEntry = (li: Element): Roll | null => {
  // Each entry is a <li> containing a series of <generic> spans we
  // mapped during the campaign-recon pass (see
  // docs/recon/dndbeyond-campaigns.md §4.6). We read the visible
  // text lines and walk through them.
  const text = (li as HTMLElement).innerText ?? "";
  const lines = text.split(/\n+/).map((s) => s.trim()).filter(Boolean);
  if (lines.length < 2) return null;

  // Pattern (best-effort): line 0 is character name, line 1 is action,
  // line 2 is action_type ("to hit" | "damage" | "roll" | "check" | "save").
  // Lines 3+ vary: "TO: target", die-label "D20", formula like "9 + 7",
  // dice notation "1d20+7", a result number, an annotation, then the
  // timestamp at the end ("M/D/YYYY h:mm AM/PM").

  const character_name = lines[0];
  const action = lines[1];
  const action_type = (lines[2] ?? "").toLowerCase();
  if (!character_name || !action) return null;

  // Defensive: skip "header" elements that aren't roll entries (some
  // entries lack a 3rd line for action_type but still log).
  const KNOWN_TYPES = new Set(["to hit", "damage", "roll", "check", "save", "save dc"]);
  // Treat missing/unknown action_type as "roll" rather than dropping.
  const normalizedType = KNOWN_TYPES.has(action_type) ? action_type : "roll";

  const tsRe = /^\d{1,2}\/\d{1,2}\/\d{4}\s+\d{1,2}:\d{2}\s+(AM|PM)$/i;
  const tsLine = [...lines].reverse().find((l) => tsRe.test(l)) ?? null;

  const target = lines.find((l) => /^TO:\s*/i.test(l))?.replace(/^TO:\s*/i, "") ?? null;
  const formula = lines.find((l) => /^-?\d+(\s*[+-]\s*\d+)+$/.test(l)) ?? null;
  const dice = lines.find((l) => /^\d+d\d+([+-]\d+)?$/i.test(l)) ?? null;
  const note = lines.find((l) => /^Rolled with /i.test(l)) ?? null;

  // Total: take the last bare integer that isn't part of formula/dice and
  // isn't the timestamp.
  let total: number | null = null;
  for (let i = lines.length - 1; i >= 0; i--) {
    const l = lines[i];
    if (l === tsLine) continue;
    if (l === formula) continue;
    if (l === dice) continue;
    if (/^-?\d+$/.test(l)) {
      total = parseInt(l, 10);
      break;
    }
  }

  // Build a stable key so repeated observer ticks don't flood us.
  const key = `${character_name}|${action}|${normalizedType}|${tsLine ?? ""}|${total ?? ""}|${formula ?? ""}`;

  return {
    campaign_dnd_id: campaignIdFromUrl(),
    character_name,
    action,
    action_type: normalizedType,
    target,
    formula,
    total,
    dice,
    note,
    observed_at: tsLine ?? new Date().toISOString(),
    key,
  };
};

const scanList = (list: Element): Roll[] => {
  const out: Roll[] = [];
  list.querySelectorAll("li").forEach((li) => {
    const r = parseEntry(li);
    if (!r) return;
    if (seenKeys.has(r.key)) return;
    seenKeys.add(r.key);
    out.push(r);
  });
  return out;
};

const flushIfAny = (rolls: Roll[]): void => {
  if (rolls.length === 0) return;
  send({ kind: "rolls-batch", payload: rolls });
};

let observer: MutationObserver | null = null;
let watchedRoot: Element | null = null;

const attachToGameLog = (root: Element): void => {
  if (root === watchedRoot) return;
  watchedRoot = root;
  if (observer) observer.disconnect();
  observer = new MutationObserver(() => {
    flushIfAny(scanList(root));
  });
  observer.observe(root, { childList: true, subtree: true });
  // Initial scan
  flushIfAny(scanList(root));
};

const findGameLogList = (): Element | null => {
  // The list lives inside the game-log slide-out panel. Class names
  // include "GameLog" / "Drawer" in production builds. Fall back to any
  // <ul>/<ol> inside an element whose accessible name is "Game Log".
  const labeled = [...document.querySelectorAll("[aria-label]")]
    .find((el) => /game\s*log/i.test(el.getAttribute("aria-label") ?? ""));
  if (labeled) {
    const list = labeled.querySelector("ul, ol");
    if (list) return list;
  }
  // Heuristic: a list whose <li>s have inner text starting with a
  // proper-cased name followed by an action and a timestamp.
  const lists = document.querySelectorAll("ul, ol");
  for (const list of lists) {
    const li = list.querySelector("li");
    if (!li) continue;
    const txt = (li as HTMLElement).innerText ?? "";
    if (
      txt.length > 12 &&
      /\d{1,2}\/\d{1,2}\/\d{4}\s+\d{1,2}:\d{2}\s+(AM|PM)/i.test(txt)
    ) {
      return list;
    }
  }
  return null;
};

let pollHandle: number | null = null;

export const installGameLogObserver = (): void => {
  // Stop any prior observer (e.g. on SPA route change).
  if (observer) observer.disconnect();
  observer = null;
  watchedRoot = null;
  seenKeys.clear();

  const tryAttach = () => {
    const list = findGameLogList();
    if (list) {
      attachToGameLog(list);
    }
  };

  tryAttach();
  // The game-log panel mounts/unmounts as the user toggles it. Poll
  // sparingly so we pick it up without burning CPU.
  if (pollHandle != null) window.clearInterval(pollHandle);
  pollHandle = window.setInterval(tryAttach, 2500);
};

export const stopGameLogObserver = (): void => {
  if (observer) observer.disconnect();
  observer = null;
  watchedRoot = null;
  if (pollHandle != null) window.clearInterval(pollHandle);
  pollHandle = null;
  seenKeys.clear();
};
