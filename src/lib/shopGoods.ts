import type { HandoutTemplate } from "./handouts";

/**
 * Stock pools for handout auto-fill (#0042 follow-up) — the SRD-data half of
 * the handout plan. Standard 5e gear at book prices (game-mechanical facts),
 * plus house-written tavern fare and services. "Fill" samples a shopful so
 * every sheet comes out a little different; the DM prunes and reprices.
 *
 * Line format matches the handout parser: "Item — price".
 */

export interface StockPreset {
  key: string;
  label: string;
  /** Which templates this preset makes sense for. */
  templates: HandoutTemplate[];
  /** Suggested footer if the DM hasn't written one. */
  footer: string;
  pool: string[];
}

export const STOCK_PRESETS: StockPreset[] = [
  {
    key: "provisioner",
    label: "General goods",
    templates: ["price_sheet"],
    footer: "All sales final once you've gone underground.",
    pool: [
      "Rope, 50 ft — 1 gp",
      "Torch — 1 cp",
      "Rations, one day — 5 sp",
      "Waterskin — 2 sp",
      "Bedroll — 1 gp",
      "Lantern, hooded — 5 gp",
      "Oil, flask — 1 sp",
      "Tinderbox — 5 sp",
      "Sack — 1 cp",
      "Piton — 5 cp",
      "Shovel — 2 gp",
      "Crowbar — 2 gp",
      "Grappling hook — 2 gp",
      "Chalk, piece — 1 cp",
      "Mirror, steel — 5 gp",
      "Ten-foot pole — 5 cp",
      "Candle — 1 cp",
      "Chain, 10 ft — 5 gp",
      "Ball bearings, bag — 1 gp",
      "Backpack — 2 gp",
    ],
  },
  {
    key: "smith",
    label: "Blacksmith",
    templates: ["price_sheet"],
    footer: "Sharpening while you wait. Dents tell stories; we erase them anyway.",
    pool: [
      "Dagger — 2 gp",
      "Handaxe — 5 gp",
      "Mace — 5 gp",
      "Spear — 1 gp",
      "Shortsword — 10 gp",
      "Longsword — 15 gp",
      "Battleaxe — 10 gp",
      "Warhammer — 15 gp",
      "Greatsword — 50 gp",
      "Light crossbow — 25 gp",
      "Shortbow — 25 gp",
      "Arrows, 20 — 1 gp",
      "Shield — 10 gp",
      "Leather armor — 10 gp",
      "Chain shirt — 50 gp",
      "Scale mail — 50 gp",
      "Breastplate — 400 gp",
      "Chain mail — 75 gp",
      "Caltrops, bag — 1 gp",
      "Whetstone — 1 cp",
    ],
  },
  {
    key: "apothecary",
    label: "Apothecary",
    templates: ["price_sheet"],
    footer: "Shake well. If it hisses back, don't.",
    pool: [
      "Potion of healing — 50 gp",
      "Antitoxin, vial — 50 gp",
      "Alchemist's fire, flask — 50 gp",
      "Acid, vial — 25 gp",
      "Healer's kit — 5 gp",
      "Herbalism kit — 5 gp",
      "Perfume, vial — 5 gp",
      "Soap — 2 cp",
      "Poultice of dubious promise — 3 sp",
      "Smelling salts — 2 sp",
      "Candied ginger, pouch — 5 cp",
      "Sleep tincture, mild — 1 gp",
    ],
  },
  {
    key: "temple",
    label: "Temple rites",
    templates: ["services"],
    footer: "The house turns no honest traveler away.",
    pool: [
      "Blessing of the road — 10 gp",
      "Cure wounds — 25 gp",
      "Holy water, flask — 25 gp",
      "Lesser restoration — 40 gp",
      "Funeral rites — donation",
      "Consecration of arms — 15 gp",
      "A night's sanctuary — donation",
      "Prayer for the lost — 5 gp",
      "Remove curse — 90 gp",
      "Candle lit for the dead — 1 cp",
    ],
  },
  {
    key: "guild",
    label: "Guild services",
    templates: ["services"],
    footer: "Members in good standing pay half. Membership is not cheap.",
    pool: [
      "Scroll scribing, per page — 25 gp",
      "Identify an oddity — 20 gp",
      "Message carried, next town — 2 gp",
      "Map of the region, fair copy — 10 gp",
      "Translation, per page — 1 gp",
      "Appraisal, honest — 5 gp",
      "Appraisal, flattering — 8 gp",
      "Letter of introduction — 15 gp",
      "Storage, per month — 1 gp",
      "A quiet word in the right ear — negotiable",
    ],
  },
  {
    key: "tavern",
    label: "Tavern fare",
    templates: ["menu"],
    footer: "Rooms upstairs. Mind the third stair.",
    pool: [
      "Ale, honest — 4 cp",
      "Ale, the good barrel — 2 sp",
      "Wine, table — 2 sp",
      "Wine, the dusty bottle — 10 gp",
      "Bottomless stew — 3 sp",
      "River pie of the day — 6 sp",
      "Bread and dripping — 2 cp",
      "Roast fowl, half — 4 sp",
      "Cheese board, brave — 5 sp",
      "Traveler's breakfast — 2 sp",
      "Room, common — 5 sp",
      "Room, private — 2 gp",
      "Stable and feed — 5 sp",
      "Bath, hot — 3 cp",
    ],
  },
];

export const presetsFor = (template: HandoutTemplate): StockPreset[] =>
  STOCK_PRESETS.filter((p) => p.templates.includes(template));

/** Sample n lines from a preset's pool, order preserved (reads like a menu). */
export const samplePool = (preset: StockPreset, n = 8): string[] => {
  const picked = new Set<number>();
  const target = Math.min(n, preset.pool.length);
  while (picked.size < target) picked.add(Math.floor(Math.random() * preset.pool.length));
  return [...picked].sort((a, b) => a - b).map((i) => preset.pool[i]);
};
