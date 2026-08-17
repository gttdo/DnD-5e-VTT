# App artwork

Painterly **illustrations** (PNG) — decorative artwork, character portraits &
scenes, class backdrops, item/equipment art. Files in `public/` are served from
the site root, so `public/art/wizard.png` is referenced in code as
`/art/wizard.png`.

> This folder also holds the moved bundled art (portraits/scenes like
> `wizard.png`, `paladin.png`, `ice_dragon.png`, the class backdrops, the auth
> `login.png`, etc.). Animation sprite sheets live in `public/sprites/`; flat UI
> icons in `public/icons/`. See `docs/illustration-catalogue.md` for the full
> to-make list and prompt recipes.

Each slot below is optional — the app falls back to an SVG or plain background
when the file is absent, so you can add art incrementally.

## Expected files

| File | Used by | Recommended size / aspect | Notes |
|------|---------|---------------------------|-------|
| `auth-hero.png` | Auth screen left panel (`AuthScreen.tsx`) | ~1536×1024, landscape 3:2 | Keep the **left third** dark / low-detail — the caption sits there. Warm, cinematic, no text. |

More slots (landing hero, dividers, empty-state art, textures) will be added
here as those screens are built.

## House style (for whatever tool generates these)

Baldur's Gate 3 promotional key-art / D&D cover feel: warm chiaroscuro,
torch/candle glow against deep shadow, muted amber/ochre/sepia palette,
painterly. **No text, letters, logos, or watermarks** anywhere in the image.

### auth-hero.png suggested prompt

> Cinematic wide landscape painting in the style of Baldur's Gate 3 key art:
> a vast gothic cathedral hall at night, towering weathered stone pillars
> receding into shadow, a distant ornate altar bathed in warm candlelight,
> shafts of moonlight through high stained-glass windows with dust drifting
> in the beams, atmospheric fog softening the far reaches. Dramatic
> chiaroscuro, muted amber and sepia palette. Generous dark negative space in
> the left third for a text overlay. No text, no letters, no logos, no people
> in close-up. 3:2 landscape.
