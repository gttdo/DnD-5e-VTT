/**
 * Typed message bus between content scripts, the background service worker,
 * and the side panel. All cross-context calls go through `sendMessage`.
 */

import type { Surface, CampaignListSnapshot, CampaignDetailSnapshot, CharacterSheetSnapshot } from "./snapshots";

export type ExtensionMessage =
  | { kind: "surface-changed"; surface: Surface }
  | { kind: "campaign-list"; payload: CampaignListSnapshot }
  | { kind: "campaign-detail"; payload: CampaignDetailSnapshot }
  | { kind: "character-sheet"; payload: CharacterSheetSnapshot }
  | { kind: "ping" };

export type ExtensionResponse =
  | { ok: true; data?: unknown }
  | { ok: false; error: string };
