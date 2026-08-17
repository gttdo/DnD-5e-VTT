// Cartographer — turns a short user description + a style preset into a
// gpt-image-1 prompt tuned for D&D battle maps.
//
// v1 is a deterministic template. This module is the seam where a smarter
// "agent" call (LLM prompt expansion using campaign context) can slot in
// later without changing the caller.

export type MapStyle =
  | "forest"
  | "dungeon"
  | "tavern"
  | "city"
  | "cavern"
  | "coast"
  | "snow"
  | "ruins"
  | "swamp"
  | "desert";

export interface StylePreset {
  key: MapStyle;
  label: string;
  /** One-line hint appended to the prompt to steer art direction. */
  hint: string;
}

// Ordered — first is the default in the UI. Each hint is deliberately verbose:
// it names specific top-down features, ground textures, and small props so the
// generated map has believable detail density instead of empty regions.
export const STYLE_PRESETS: StylePreset[] = [
  {
    key: "forest",
    label: "Forest",
    hint:
      "dense mixed woodland viewed from above — circular tree canopies of oak, pine, and birch clustered irregularly with clearings and narrow footpaths between them. Forest floor visible as leaf litter, fallen logs, mossy boulders, ferns and undergrowth. Root systems radiating from trunk bases. A meandering stream or wet patches. Deep forest greens, browns, ochres. Small details: mushroom rings, animal tracks, patches of wildflowers.",
  },
  {
    key: "dungeon",
    label: "Dungeon",
    hint:
      "stone dungeon interior — connected rectangular chambers and corridors carved from cut stone, mortared flagstone floor with worn traffic paths. Thick stone walls (drawn as darker outlines with mortar lines visible). Iron-bound wooden doors, rusted portcullis, arched openings. Details: braziers and iron sconces, scattered rubble, chains, bones, dark water puddles, mildew stains, cracks in the stonework. Cool grey and brown palette lit by warm torch pools.",
  },
  {
    key: "tavern",
    label: "Tavern interior",
    hint:
      "medieval fantasy tavern interior — wide wooden plank floor with round wooden tables and benches, a long bar counter with stools, stone hearth with fire, staircase to an upper floor, area rugs and barrels stacked in corners. Small details: mugs, spilled drinks, playing cards on tables, hanging lanterns, a hound sleeping by the fire. Warm amber palette.",
  },
  {
    key: "city",
    label: "City street",
    hint:
      "medieval fantasy city district viewed from above — cobblestone streets and narrow alleys between blocks of timber-and-plaster buildings with tiled or thatched roofs. Market stalls with awnings, wooden signposts, wells and fountains, wooden carts, stacked crates. Small details: laundry lines, potted plants, cats in alleys, cracked stones. Muted browns, terracottas, weathered wood.",
  },
  {
    key: "cavern",
    label: "Cavern",
    hint:
      "natural underground cavern viewed from above — irregular rocky floor with fissures, scattered stalagmites drawn from above as circular clusters, underground pools of dark water with faint blue-green glow, patches of moss and phosphorescent lichen. Rubble, mineral veins, stone bridges over chasms. Cool damp palette of slate blues, deep browns, cave greens.",
  },
  {
    key: "coast",
    label: "Coast",
    hint:
      "rocky shoreline transitioning from land to sea — wet sand and shell debris at the tide line, weathered rocks and tide pools, patches of dune grass, driftwood, coils of rope. A wooden pier or capsized boat as a focal point. Water shown as its surface only with subtle wave patterns and darker deep patches. Sea-worn palette of pale sand, greenish-blue water, weathered wood grey.",
  },
  {
    key: "snow",
    label: "Snowfield",
    hint:
      "windswept snowfield viewed from above — undulating drifts of powder with fine wind-blown texture, scattered evergreens at the edges shown as dark circular canopies dusted with white, a partially frozen stream cutting through, footprints and animal tracks in the snow, exposed patches of dark earth and rock. Cold overcast palette — dominant whites and pale blues with hints of grey and dark green.",
  },
  {
    key: "ruins",
    label: "Ruins",
    hint:
      "ancient collapsed stone ruins reclaimed by nature — broken walls of dressed stone half-buried in earth, toppled columns, cracked flagstones with grass and vines growing between them, weathered statuary fragments, sunken chambers. Vines, moss, and small trees taking root in the rubble. Weathered sandstone or granite palette against overgrown greens.",
  },
  {
    key: "swamp",
    label: "Swamp",
    hint:
      "murky bayou swamp viewed from above — cypress and mangrove trees on knotted root systems rising from black water. Patches of solid ground with mud, moss, and cattails. Fog wisps drifting over the surface. Fallen logs bridging water. Small details: frog and gator hints, floating lily pads, drifting spanish moss. Deep greens, browns, near-black water with mossy highlights.",
  },
  {
    key: "desert",
    label: "Desert",
    hint:
      "arid desert viewed from above — hard-packed sand and rocky ground with wind-carved ripples, scattered boulders, dry brush and tumbleweed clumps, sun-bleached bones, ancient standing stones or a partially buried statue as a focal point. A faint dry riverbed cutting through. Warm sun-baked palette of ochre, umber, pale sand, and rust-red rock.",
  },
];

export const findPreset = (key: string | undefined): StylePreset =>
  STYLE_PRESETS.find((p) => p.key === key) ?? STYLE_PRESETS[0];

// gpt-image-1 supported sizes. Landscape is the natural fit for a wider-than-tall
// grid; the app default is 30x20 cells (3:2) so 1536x1024 matches without crop.
export type MapSize = "1024x1024" | "1536x1024" | "1024x1536";
export const SIZE_PRESETS: Array<{ key: MapSize; label: string }> = [
  { key: "1536x1024", label: "Landscape (3:2)" },
  { key: "1024x1024", label: "Square (1:1)" },
  { key: "1024x1536", label: "Portrait (2:3)" },
];

export type MapQuality = "low" | "medium" | "high";
export const QUALITY_PRESETS: Array<{
  key: MapQuality;
  label: string;
  costHint: string;
}> = [
  { key: "low", label: "Draft", costHint: "~$0.01" },
  { key: "medium", label: "Standard", costHint: "~$0.04" },
  { key: "high", label: "High detail", costHint: "~$0.17" },
];

// Two style families cover almost every D&D map we've seen in the wild:
//   - "realistic":  photorealistic overhead like commercial VTT marketplace
//                   assets (2-Minute Tabletop, Forgotten Adventures, Czepeku,
//                   Owlbear Rodeo built-ins). Looks like an aerial drone shot.
//   - "illustrated": hand-drawn ink + watercolor with bold outlines, like
//                    published 5e adventure module maps (Icewind Dale,
//                    Waterdeep). Sepia/parchment palette, painterly.
//
// The wrapper for each is aggressive on purpose. gpt-image-1's default for
// "fantasy battle map" is generic cartoon illustration — palm trees from the
// side, isometric buildings, saturated colors, decorative borders. Every
// clause below fights a specific failure mode we've seen in testing.

export type MapFamily = "realistic" | "illustrated";

const REALISTIC_WRAPPER =
  "Overhead battle map for a virtual tabletop (VTT) — commercial marketplace " +
  "quality suitable for Roll20, Foundry, or Owlbear Rodeo. " +
  "The image is a photorealistic digital painting rendered as if photographed " +
  "from directly overhead by a drone: strictly orthographic top-down projection " +
  "with ZERO perspective, ZERO foreshortening, ZERO side views. Every object " +
  "is drawn only as its shape seen from directly above. Trees are circular " +
  "canopies with visible leaf clusters and dappled highlights. Standing " +
  "stones, boulders, and pillars show ONLY their flat tops. Water shows only " +
  "its surface with subtle ripples. Campfires show only the fire and smoke " +
  "ring. Buildings show only their roofs or, if open interiors, their floors. " +
  "Realistic natural ground materials with high textural detail: individual " +
  "grass blades in irregular clumps, natural stone patterns, cracked earth, " +
  "moss and lichen patches, mud streaks, sand grain, snow drift lines, worn " +
  "footpaths. Naturalistic muted color palette drawn from real-world earth " +
  "tones — never cartoon saturation. Soft, even, diffuse lighting from directly " +
  "overhead with no directional shadows. " +
  "The playable surface fills the entire image edge-to-edge. NO borders, NO " +
  "frames, NO vignetting, NO decorative margins, NO unusable padding, NO " +
  "titles, NO scale bar, NO north arrow, NO compass rose of any kind, NO " +
  "map legend, NO cartouche, NO text, letters, numbers, labels, watermarks, " +
  "or signatures anywhere. The image contains only the ground surface and " +
  "objects resting on it. " +
  "NOT cartoon, NOT illustrated children's-book art, NOT concept art, NOT " +
  "comic book, NOT anime, NOT chibi, NOT flat vector, NOT isometric, NOT " +
  "3/4 view, NOT stylized.";

const ILLUSTRATED_WRAPPER =
  "Overhead battle map in the hand-drawn style of a published Dungeons & " +
  "Dragons 5e adventure module (Wizards of the Coast, Kobold Press). " +
  "Ink line-work over digital watercolor: bold dark outlines defining walls, " +
  "rocks, and structures; muted parchment and sepia palette with cool grey " +
  "stonework and warm earth interiors; visible brush texture and subtle paper " +
  "grain. " +
  "STRICTLY top-down orthographic projection with zero perspective. Trees " +
  "are circular ink-outlined canopies. Stones and columns show only their " +
  "tops. Water is a flat wash with a darker ink line at the shoreline. " +
  "Very high detail density inside the play area: individual props (crates, " +
  "barrels, tools, bones, campfires, rugs, chairs), cracks in flagstones, " +
  "moss patches, rubble, torch sconces, chains. " +
  "The playable surface fills the entire image edge-to-edge. NO decorative " +
  "borders, NO frames, NO ornamental cartouche, NO titles, NO scale bar, " +
  "NO north arrow, NO compass rose, NO room labels, NO text, letters, or " +
  "numbers anywhere. " +
  "NOT cartoon, NOT children's book art, NOT flat vector, NOT anime, NOT " +
  "isometric, NOT 3/4 view.";

const wrapperFor = (family: MapFamily): string =>
  family === "illustrated" ? ILLUSTRATED_WRAPPER : REALISTIC_WRAPPER;

export const FAMILY_PRESETS: Array<{ key: MapFamily; label: string; hint: string }> = [
  {
    key: "realistic",
    label: "Realistic (photographic)",
    hint: "Aerial-photo look, real materials — like modern VTT marketplace maps.",
  },
  {
    key: "illustrated",
    label: "Illustrated (ink + watercolor)",
    hint: "Hand-drawn look — like published 5e module maps.",
  },
];

export interface BuildPromptInput {
  description: string;
  style: MapStyle;
  family?: MapFamily;
}

export const buildImagePrompt = ({
  description,
  style,
  family = "realistic",
}: BuildPromptInput): string => {
  const preset = findPreset(style);
  const desc = description.trim();
  const parts = [
    wrapperFor(family),
    `Scene: ${preset.label.toLowerCase()} — ${preset.hint}.`,
  ];
  if (desc) parts.push(`Specific details: ${desc}.`);
  return parts.join(" ");
};
