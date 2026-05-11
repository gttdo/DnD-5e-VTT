/**
 * Content script entrypoint. Injected into every dndbeyond.com page.
 * Detects the current surface from the URL and dispatches to the
 * appropriate scraper. Also listens for SPA navigations (history
 * pushState) so we re-route without a full page load.
 */

import { detectSurface } from "../lib/surface";
import type { Surface } from "../types/snapshots";
import type { ExtensionMessage } from "../types/messages";
import { scrapeCampaignList } from "./campaign-list";
import { scrapeCampaignDetail } from "./campaign-detail";
import { scrapeCharacterSheet } from "./character-sheet";

const send = (msg: ExtensionMessage): void => {
  // Fire-and-forget; the background worker may not always be alive.
  chrome.runtime.sendMessage(msg).catch(() => void 0);
};

let lastSurfaceKey = "";

const handle = async (surface: Surface): Promise<void> => {
  const key = `${surface.kind}:${surface.url}`;
  if (key === lastSurfaceKey) return;
  lastSurfaceKey = key;

  send({ kind: "surface-changed", surface });

  switch (surface.kind) {
    case "campaign-list": {
      const snap = await scrapeCampaignList();
      if (snap) send({ kind: "campaign-list", payload: snap });
      break;
    }
    case "campaign-detail": {
      const snap = await scrapeCampaignDetail(surface.campaignId);
      if (snap) send({ kind: "campaign-detail", payload: snap });
      break;
    }
    case "character-sheet": {
      const snap = await scrapeCharacterSheet(surface.charId);
      if (snap) send({ kind: "character-sheet", payload: snap });
      break;
    }
    case "unknown":
      // No-op — we just observe.
      break;
  }
};

const route = (): void => {
  const surface = detectSurface(location.href);
  void handle(surface);
};

// Initial route on injection.
route();

// React to SPA navigations. D&D Beyond uses history pushState in places.
const installNavigationListener = (): void => {
  const origPushState = history.pushState;
  history.pushState = function (...args: Parameters<typeof history.pushState>) {
    const ret = origPushState.apply(this, args);
    queueMicrotask(route);
    return ret;
  };
  window.addEventListener("popstate", () => queueMicrotask(route));
  // Some apps also navigate via location.replace; the URL change is
  // covered by popstate for back/forward but not replace — so poll
  // sparingly to catch the residual cases.
  let lastUrl = location.href;
  setInterval(() => {
    if (location.href !== lastUrl) {
      lastUrl = location.href;
      route();
    }
  }, 1500);
};

installNavigationListener();
