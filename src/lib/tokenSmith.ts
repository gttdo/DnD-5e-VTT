// tokenSmith — turns a short creature description into a gpt-image-1 prompt
// tuned for VTT tokens (circular portrait or top-down miniature).
//
// Same pattern as cartographer.ts: aggressive wrapper to fight gpt-image-1's
// default aesthetic, explicit anti-patterns for the failure modes we care
// about (backgrounds bleeding in, off-center, cropped features).

export type TokenSize =
  | "tiny"
  | "small"
  | "medium"
  | "large"
  | "huge"
  | "gargantuan";

export type TokenFamily = "portrait" | "topdown";

export type CreatureType =
  | "humanoid"
  | "beast"
  | "monster"
  | "undead"
  | "aberration"
  | "fiend"
  | "celestial"
  | "elemental"
  | "plant"
  | "ooze"
  | "construct"
  | "dragon"
  | "fey"
  | "giant";

// D&D 5e size categories → grid footprint in cells.
// Tiny is 2.5x2.5 ft (four per 5ft cell) but we snap to 1x1 for simplicity;
// visually rendered smaller inside the cell.
export interface SizeSpec {
  key: TokenSize;
  label: string;
  cells: number;   // NxN cells on the grid
  radius: number;  // fraction of one cell for visual radius (Tiny is smaller)
  description: string;
}

export const TOKEN_SIZES: SizeSpec[] = [
  { key: "tiny", label: "Tiny (2½ ft)", cells: 1, radius: 0.22, description: "cat, imp, sprite, mouse" },
  { key: "small", label: "Small (5 ft)", cells: 1, radius: 0.38, description: "goblin, halfling, kobold, dog" },
  { key: "medium", label: "Medium (5 ft)", cells: 1, radius: 0.42, description: "human, orc, elf, dwarf" },
  { key: "large", label: "Large (10 ft)", cells: 2, radius: 0.85, description: "ogre, warhorse, owlbear" },
  { key: "huge", label: "Huge (15 ft)", cells: 3, radius: 1.3, description: "young dragon, giant, treant" },
  { key: "gargantuan", label: "Gargantuan (20+ ft)", cells: 4, radius: 1.75, description: "ancient dragon, tarrasque, kraken" },
];

export const findSize = (key: string | undefined): SizeSpec =>
  TOKEN_SIZES.find((s) => s.key === key) ?? TOKEN_SIZES[2]; // default = medium

export const CREATURE_TYPES: Array<{ key: CreatureType; label: string; hint: string }> = [
  { key: "humanoid", label: "Humanoid", hint: "human, elf, orc, goblin, drow, tiefling" },
  { key: "beast", label: "Beast", hint: "wolf, bear, giant spider, dire boar" },
  { key: "monster", label: "Monstrosity", hint: "owlbear, chimera, manticore, hydra" },
  { key: "undead", label: "Undead", hint: "skeleton, zombie, wraith, vampire, lich" },
  { key: "aberration", label: "Aberration", hint: "mind flayer, aboleth, beholder" },
  { key: "fiend", label: "Fiend", hint: "demon, devil, imp, succubus" },
  { key: "celestial", label: "Celestial", hint: "angel, deva, unicorn, pegasus" },
  { key: "elemental", label: "Elemental", hint: "fire elemental, water elemental" },
  { key: "plant", label: "Plant", hint: "treant, myconid, shambling mound" },
  { key: "ooze", label: "Ooze", hint: "gelatinous cube, black pudding" },
  { key: "construct", label: "Construct", hint: "golem, animated armor, homunculus" },
  { key: "dragon", label: "Dragon", hint: "red dragon, wyvern, dragonborn" },
  { key: "fey", label: "Fey", hint: "dryad, pixie, satyr" },
  { key: "giant", label: "Giant", hint: "hill giant, frost giant, fire giant" },
];

export const findCreatureType = (key: string | undefined) =>
  CREATURE_TYPES.find((c) => c.key === key) ?? CREATURE_TYPES[0];

export const TOKEN_FAMILY_PRESETS: Array<{ key: TokenFamily; label: string; hint: string }> = [
  {
    key: "portrait",
    label: "Portrait (bust)",
    hint: "Circular bust portrait — Roll20/Owlbear VTT convention.",
  },
  {
    key: "topdown",
    label: "Top-down (miniature)",
    hint: "As seen from above like a mini on the table — matches the battle map.",
  },
];

// ---- Prompt wrappers ------------------------------------------------------

const PORTRAIT_WRAPPER =
  "Character portrait token for a virtual tabletop (VTT) — Roll20, Foundry, " +
  "or Owlbear Rodeo marketplace quality. " +
  "Circular bust portrait: the subject is centered and framed from mid-chest " +
  "up, facing forward or slightly angled, filling the circular composition. " +
  "SQUARE 1:1 aspect. The subject is centered against a SOLID PLAIN background " +
  "(neutral dark grey, deep navy, or matching mood color) — absolutely no " +
  "landscape, no scenery, no interior background, no environmental details. " +
  "The background must be a plain flat wash so the token reads cleanly at " +
  "small sizes against any map. " +
  "Detailed digital painting of the character — visible fabric, armor, skin " +
  "textures, weathered details, hair, expression. Dramatic three-quarter " +
  "lighting on the face. Naturalistic muted color palette, professional " +
  "character-art quality. " +
  "The image contains ONLY the character bust and the plain background. " +
  "NO text, letters, numbers, labels, name plates, borders, frames, " +
  "watermarks, or ornamental decorations of any kind. " +
  "NOT cartoon, NOT chibi, NOT anime, NOT children's book art, NOT flat " +
  "vector, NOT emoji, NOT concept sheet with multiple views.";

const TOPDOWN_WRAPPER =
  "Top-down miniature-view VTT token — a creature seen from directly overhead " +
  "as if it were a painted tabletop miniature on a battle map. Roll20/Foundry " +
  "quality. " +
  "SQUARE 1:1 aspect. STRICTLY orthographic top-down view: the creature is " +
  "drawn as its silhouette seen from directly above. Head visible on top of " +
  "the shoulders, arms/legs radiating outward, weapons and props visible from " +
  "above. NO side view, NO 3/4 view, NO isometric elements, NO perspective. " +
  "The creature is centered against a SOLID PLAIN background (neutral dark " +
  "grey, deep navy, or matching mood color) — no landscape, no scenery, no " +
  "ground textures. " +
  "Detailed painterly rendering — visible armor plates, cloth folds, hair, " +
  "creature textures. Soft even overhead lighting. Muted naturalistic palette. " +
  "The image contains ONLY the creature and the plain background. " +
  "NO text, letters, numbers, labels, borders, frames, watermarks, or " +
  "ornamental decorations. " +
  "NOT cartoon, NOT chibi, NOT anime, NOT flat vector.";

const wrapperFor = (family: TokenFamily): string =>
  family === "topdown" ? TOPDOWN_WRAPPER : PORTRAIT_WRAPPER;

// ---- API ------------------------------------------------------------------

export interface BuildTokenPromptInput {
  description: string;
  size: TokenSize;
  creatureType: CreatureType;
  family?: TokenFamily;
}

export const buildTokenPrompt = ({
  description,
  size,
  creatureType,
  family = "portrait",
}: BuildTokenPromptInput): string => {
  const sizeSpec = findSize(size);
  const type = findCreatureType(creatureType);
  const desc = description.trim();
  const parts = [
    wrapperFor(family),
    `Subject: a ${sizeSpec.label.split(" ")[0].toLowerCase()} ${type.label.toLowerCase()} (${type.hint.split(",")[0]}).`,
  ];
  if (desc) parts.push(`Specific details: ${desc}.`);
  return parts.join(" ");
};
