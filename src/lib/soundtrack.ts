/**
 * The ambience catalog (the Score bible → files). Each track has one or more
 * VARIANTS — alternate takes generated for variety — and the player picks one
 * at random each time a scene stages the track, so the same room doesn't loop
 * the identical recording every visit.
 *
 * A scene stores a track KEY (not a file path); the player resolves the key to
 * a random variant at play time. Files live in public/Soundtrack as .m4a.
 */

export interface AmbienceTrack {
  key: string;
  name: string;
  hint: string;
  /** Alternate takes (public paths). Empty = a planned slot with no audio yet. */
  variants: string[];
}

const f = (name: string) => `/Soundtrack/${name}.m4a`;

export const AMBIENCE_TRACKS: AmbienceTrack[] = [
  { key: "hearth", name: "The Hearth", hint: "tavern · social", variants: [f("The Hearth")] },
  { key: "open-road", name: "The Open Road", hint: "travel · wilderness", variants: [f("The Open Road")] },
  { key: "whispering-woods", name: "Whispering Woods", hint: "forest · night", variants: [f("Whispering Woods V1"), f("Whispering Woods V2")] },
  { key: "deep-dark", name: "The Deep Dark", hint: "dungeon", variants: [f("The Deep Dark V1"), f("The Deep Dark V2")] },
  { key: "blades-drawn", name: "Blades Drawn", hint: "combat", variants: [f("Blades Drawn V1"), f("Blades Drawn V2"), f("Blades Drawn V3"), f("Blades Drawn V4")] },
  { key: "final-stand", name: "The Final Stand", hint: "boss", variants: [f("The Final Stand V1"), f("The Final Stand V2")] },
  { key: "market-square", name: "Market Square", hint: "town", variants: [f("Market Square V1"), f("Market Square V2")] },
  { key: "dread", name: "Dread Approaches", hint: "horror · eerie", variants: [f("Dread Approaches V1"), f("Dread Approaches V2")] },
  { key: "sanctum", name: "Sanctum of Light", hint: "temple · sacred", variants: [f("Sanctum of Light V1"), f("Sanctum of Light V2")] },
  { key: "vast-horizons", name: "Vast Horizons", hint: "arrival · cinematic", variants: [f("Vast Horizons V1"), f("Vast Horizons V2")] },
  { key: "salt-tide", name: "Salt & Tide", hint: "coast · sea", variants: [f("Salt & Tide V1"), f("Salt & Tide V2")] },
  { key: "embers", name: "Embers & Rest", hint: "camp · rest", variants: [f("Embers & Rest V1"), f("Embers & Rest v2")] },
  { key: "trail", name: "The Trail of Clues", hint: "mystery", variants: [f("The Trail of Clues V1"), f("The Trail of Clues V2")] },
];

/** The key any scene swaps to when combat begins, unless it overrides it. */
export const DEFAULT_BATTLE_KEY = "blades-drawn";

export const trackByKey = (key: string | null | undefined): AmbienceTrack | null =>
  key ? AMBIENCE_TRACKS.find((t) => t.key === key) ?? null : null;

/** Which track KEY should play, given a scene's base + combat slots and combat
 *  state. Combat wins while the fight is on. Null → silence. */
export const effectiveAmbienceKey = (
  baseKey: string | null | undefined,
  combatKey: string | null | undefined,
  inCombat: boolean
): string | null => {
  if (inCombat) return combatKey || DEFAULT_BATTLE_KEY;
  return baseKey ?? null;
};

/**
 * Resolve a stored ambience value to a concrete file to play. Accepts a track
 * key (→ a RANDOM variant, for variety) or, for older data, a direct
 * /Soundtrack path (→ used as-is). `seed` lets callers vary the pick per play.
 */
export const resolveAmbience = (stored: string | null | undefined, seed = Math.random()): string | null => {
  if (!stored) return null;
  const track = trackByKey(stored);
  if (track) {
    if (track.variants.length === 0) return null;
    return track.variants[Math.floor(seed * track.variants.length) % track.variants.length];
  }
  // Legacy: a direct file path stored before variants existed.
  return stored.startsWith("/") ? stored : null;
};
