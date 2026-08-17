# Spell icons

Full-colour raster spell icons (**PNG, 288×288**), exported from the project's
Figma file and grouped by spell level. Unlike the rest of `public/icons/` (which
is monochrome `currentColor` SVG line-art), these are finished colour
illustrations — one per spell.

> The source images placed in Figma are **144×144 native**; these files are a
> high-quality 2× upscale (Lanczos) to 288×288, so they carry no detail beyond
> the 144px source.

## Folder layout

Subfolder per level, `snake_case` filenames derived from the spell name:

- `cantrips/` — 25
- `level_1/` — 51
- `level_2/` — 42
- `level_3/` — 34
- `level_4/` — 21
- `level_5/` — 19
- `level_6/` — 20
- `level_9/` — 3

**215 icons total.** Filenames strip punctuation and lowercase everything, e.g.
`Tasha's Hideous Laughter → tashas_hideous_laughter.png`,
`Power Word: Ruin → power_word_ruin.png`, `Enlarge/Reduce → enlarge_reduce.png`.

## Notes

- Each file's bytes are the exact source image placed in Figma (verified: Figma's
  `imageHash` equals the SHA-1 of these bytes, so every export is matched to its
  spell with certainty — no guesswork by position).
- Provenance: project-supplied art (not game-icons.net). No third-party
  attribution applies.
