/**
 * The five coin denominations, their library glyph (public/icons/currency —
 * one silhouette the app tints per metal), metal colour, and full name.
 */
export const COINS = ["pp", "gp", "ep", "sp", "cp"] as const;
export type Coin = (typeof COINS)[number];

export const coinGlyph = (c: Coin): string => `/icons/currency/coin_${c}.svg`;

/** Metal tints — readable on both the dark and light themes. */
export const COIN_COLOR: Record<Coin, string> = {
  pp: "#cfd6de", // platinum — bright silver-white
  gp: "#e2b53c", // gold
  ep: "#c8bd7a", // electrum — pale gold/silver alloy
  sp: "#b9bfc4", // silver
  cp: "#c07b45", // copper
};

export const COIN_NAME: Record<Coin, string> = {
  pp: "Platinum",
  gp: "Gold",
  ep: "Electrum",
  sp: "Silver",
  cp: "Copper",
};
