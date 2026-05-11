/**
 * Background service worker (MV3).
 *
 * Responsibilities for now:
 *   - Open the side panel when the toolbar icon is clicked.
 *   - Receive messages from content scripts and cache the latest snapshot
 *     of each surface in chrome.storage.session so the side panel can
 *     read it back. (Postgres writes come in a later commit.)
 *   - Log every message during dev so we can verify the pipeline.
 *
 * The service worker spins down when idle; do not rely on module-level
 * state for anything that must persist. Use chrome.storage instead.
 */

import type { ExtensionMessage } from "../types/messages";

// Open the side panel when the user clicks the toolbar icon.
chrome.action.onClicked.addListener(async (tab) => {
  if (tab.windowId == null) return;
  try {
    await chrome.sidePanel.open({ windowId: tab.windowId });
  } catch (e) {
    console.warn("[dnd-ext] sidePanel.open failed:", e);
  }
});

chrome.runtime.onInstalled.addListener(() => {
  // Allow the side panel to be opened on any tab.
  void chrome.sidePanel
    .setPanelBehavior({ openPanelOnActionClick: true })
    .catch((e) => console.warn("[dnd-ext] setPanelBehavior failed:", e));
  console.log("[dnd-ext] background installed");
});

const LATEST_KEY = "latest-snapshots";

interface LatestSnapshots {
  campaign_list?: unknown;
  campaign_detail?: Record<number, unknown>;
  character_sheet?: Record<number, unknown>;
  last_surface?: unknown;
  updated_at?: string;
}

const readLatest = async (): Promise<LatestSnapshots> => {
  const out = await chrome.storage.session.get(LATEST_KEY);
  return (out[LATEST_KEY] as LatestSnapshots) ?? {};
};

/**
 * Serialize writes through a single in-flight Promise so concurrent
 * `surface-changed` + `campaign-detail` messages can't clobber each
 * other's fields. Without this, both read the same snapshot, both
 * compute their delta, and the second `set` overwrites the first.
 */
let writeChain: Promise<void> = Promise.resolve();
const writeLatest = (mut: (l: LatestSnapshots) => LatestSnapshots): Promise<void> => {
  const next = writeChain.then(async () => {
    const cur = await readLatest();
    const out = mut(cur);
    out.updated_at = new Date().toISOString();
    await chrome.storage.session.set({ [LATEST_KEY]: out });
  });
  // Swallow errors in the chain so one bad write doesn't break the rest.
  writeChain = next.catch((e) => console.warn("[dnd-ext] writeLatest:", e));
  return next;
};

chrome.runtime.onMessage.addListener((message: ExtensionMessage, _sender, sendResponse) => {
  console.log("[dnd-ext] bg recv:", message.kind, message);

  switch (message.kind) {
    case "surface-changed":
      void writeLatest((l) => ({ ...l, last_surface: message.surface }));
      break;
    case "campaign-list":
      void writeLatest((l) => ({ ...l, campaign_list: message.payload }));
      break;
    case "campaign-detail":
      void writeLatest((l) => {
        const map = { ...(l.campaign_detail ?? {}) };
        const id = (message.payload as { id: number }).id;
        map[id] = message.payload;
        return { ...l, campaign_detail: map };
      });
      break;
    case "character-sheet":
      void writeLatest((l) => {
        const map = { ...(l.character_sheet ?? {}) };
        const id = (message.payload as { char_id: number }).char_id;
        map[id] = message.payload;
        return { ...l, character_sheet: map };
      });
      break;
    case "ping":
      sendResponse({ ok: true });
      return true; // keep channel open for async response
  }
  return undefined;
});
