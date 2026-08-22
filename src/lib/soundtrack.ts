/**
 * The bundled ambience catalog (the Score bible → files). Each scene picks one
 * by URL; the player loops it through the Ambiance channel. Tracks live in
 * public/Soundtrack as compressed .m4a; add a file and its entry lights up.
 * Only tracks whose file actually ships will play — the rest are ready slots.
 */

export interface AmbienceTrack {
  key: string;
  name: string;
  url: string;
  /** The scene mood/type this track suits — shown as a hint in the picker. */
  hint: string;
  /** True once the audio file exists in the repo (others are planned slots). */
  ready: boolean;
}

const file = (name: string) => `/Soundtrack/${name}.m4a`;

export const AMBIENCE_TRACKS: AmbienceTrack[] = [
  { key: "hearth", name: "The Hearth", url: file("The Hearth"), hint: "tavern · social", ready: true },
  { key: "open-road", name: "The Open Road", url: file("The Open Road"), hint: "travel · wilderness", ready: false },
  { key: "whispering-woods", name: "Whispering Woods", url: file("Whispering Woods"), hint: "forest · night", ready: false },
  { key: "deep-dark", name: "The Deep Dark", url: file("The Deep Dark"), hint: "dungeon", ready: false },
  { key: "blades-drawn", name: "Blades Drawn", url: file("Blades Drawn"), hint: "combat", ready: false },
  { key: "final-stand", name: "The Final Stand", url: file("The Final Stand"), hint: "boss", ready: false },
  { key: "market-square", name: "Market Square", url: file("Market Square"), hint: "town", ready: false },
  { key: "dread", name: "Dread Approaches", url: file("Dread Approaches"), hint: "horror · eerie", ready: false },
  { key: "sanctum", name: "Sanctum of Light", url: file("Sanctum of Light"), hint: "temple · sacred", ready: false },
  { key: "vast-horizons", name: "Vast Horizons", url: file("Vast Horizons"), hint: "arrival · cinematic", ready: false },
  { key: "salt-tide", name: "Salt & Tide", url: file("Salt & Tide"), hint: "coast · sea", ready: false },
  { key: "embers", name: "Embers & Rest", url: file("Embers & Rest"), hint: "camp · rest", ready: false },
  { key: "trail", name: "The Trail of Clues", url: file("The Trail of Clues"), hint: "mystery", ready: false },
];

export const trackByUrl = (url: string | null | undefined): AmbienceTrack | null =>
  url ? AMBIENCE_TRACKS.find((t) => t.url === url) ?? null : null;
