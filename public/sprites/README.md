# Sprites — animation sprite sheets

Frame-by-frame **animation strips** (PNG), stepped by a `requestAnimationFrame`
loop in the app. Files here are served from the site root, so
`public/sprites/firebolt_sprite.png` is referenced in code as
`/sprites/firebolt_sprite.png`.

## What lives here

- **Spell / effect VFX** — `<name>_sprite.png` (e.g. `firebolt_sprite.png`,
  `magic_missile_sprite.png`, `cone_of_cold_sprite.png`,
  `misty_step_animation.png`). Registered in `src/components/SpellFx.tsx` (`SHEETS`).
- **Combat cursor sprites** — `sword_sprite.png`, `unarmed_strike_sprite.png`,
  `spell_casting_sprite.png`, `stealing_sprite.png`. Registered in
  `src/components/AttackCursor.tsx` (`SPRITES`).
- **Dice roll** — `dice_roll.png` (a 5×3 grid). Used by `DiceRollDialog.tsx`.

## Format

- **PNG horizontal strip**, one row of frames (unless a grid, like misty step /
  dice), transparent — or black-backed and dropped with `mix-blend-mode: screen`.
- **~256 px per frame** (spell VFX); strip ≈ frames × 256 wide.
- VFX art **points right** at 0° — the app rotates it to aim.

## Adding a new spell VFX

1. Drop `public/sprites/<name>_sprite.png`.
2. Add a `SHEETS` entry in `src/components/SpellFx.tsx` (`src`, `sheetW/sheetH`,
   `cols/rows`, `dispW`, optional `kind`/`anchorY`/`screen`/`frameSeq`).
3. Add a `vfx: "<name>"` on the spell in `src/lib/spellMechanics.ts`.

See `docs/illustration-catalogue.md` (Bucket 1) for the full to-make list.
