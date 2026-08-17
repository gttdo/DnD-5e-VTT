# D&D 5e VTT — Illustration Catalogue (raster art)

Every **illustration** the VTT needs — the painterly, raster (PNG) art:
animated spell/effect sprite sheets, item & equipment art, and class & character
art. Different craft from the flat UI icons.

> Flat UI icons (damage types, conditions, skills, actions, etc.) live in a
> **separate** doc: `docs/icon-catalogue.md`.

Every entry has a **name**, a **`snake_case` filename**, a **one-line
description**, and an **art-prompt subject** for the section's prompt recipe.

---

## How to use this doc

- **Work by section** — each `###` is one batch.
- **Filenames**: lowercase `snake_case`. Effect sprite sheets →
  `public/sprites/<name>_sprite.png`. Other art (portraits, scenes, item art,
  class emblems/backdrops) → `public/art/<name>.png`. (Flat UI icons go in
  `public/icons/` — see the separate icon catalogue.)
- **Prompt recipe**: each section has a reusable recipe with `{subject}` +
  fixed style directives.
- **Progress**: tick the box as you finish each item.

---

## Product & design context (read before generating)

**What the app is.** A **Dungeons & Dragons 5e Virtual Tabletop (VTT)** — a web
app where a group plays tabletop D&D on a shared battle map. A **DM** runs
monsters/NPCs and the map; **players** each control a character. Core surfaces:
a top-down **battle map** with **tokens**, an in-game **HUD**, a **character
sheet**, and a **rules reference**.

**Visual identity.** Dark high-fantasy, **painterly** illustration with dramatic
lighting on **plain dark/soft-lit grounds** — the same look the app already
generates for map art, character portraits, tokens, and item art. New
illustrations should sit seamlessly next to that existing generated art so the
whole app feels like one world. **These are color raster pieces** (unlike the
monochrome UI icons in `icon-catalogue.md`) — bake in full color and rendering.

**Where these illustrations render (so you can judge size, framing & background):**
- **Spell / effect VFX** — play **on the battle map**, layered over the map art
  and tokens, then clear. They must read against *varied* map backgrounds, so
  keep them **transparent** (or black-backed → the app drops the black with
  `mix-blend-mode: screen`). Animated sprite strips that begin → peak →
  dissipate; art points **right** (the app rotates it to aim).
- **Item & equipment art** — shown as **object tokens on the board** and as
  **inventory thumbnails** on the character sheet. Centered single object on a
  dark ground, like the token studio output.
- **Class emblems** — small **badges** on the character sheet / character
  creation (class picker). Bold, readable at badge size.
- **Class backdrops** — the **full-bleed background** behind the character sheet
  (wide 21:9). Moody scene, subject off-center so sheet content stays legible.
- **Species / backgrounds / feats** — small emblems/vignettes in character
  creation and on the sheet.

Each section below has a **"Used in:"** line pinning down its exact home.

---

## Sizes & export specs

Illustrations are **raster (PNG)** with real pixel dimensions. Size changes by
type — VFX strips are wide multi-frame sheets; item/emblem art is square; class
backdrops are wide.

| Category | Format | Native size | Rendered at | Notes |
|---|---|---|---|---|
| **Spell / effect VFX** | PNG strip (transparent, or black-backed → dropped with `mix-blend-mode: screen`) | **per-frame ≈ 256 × 256**; strip = frames × 256 in **one row** (≈ 1536–2048 wide, 256–400 tall) | scaled to board cells (1 cell = 40px); a bolt ~120–160px, a big area up to ~480px | 6–8 frames typical, begin→peak→dissipate. Art **points right** at 0° (rotated to aim). Consistent baseline across frames. Cones/walls can be taller (e.g. 1536 × 1024). |
| **Item & equipment art** | PNG, square | **512 × 512** | token ≈ 40–80px; inventory thumb ≈ 48–64px | Centered object, painterly, dark ground. Interchangeable with token art. |
| **Class emblems** | PNG, square | **512 × 512** | 24–96px badges | Bold, reads small; transparent or dark shield ground. |
| **Class backdrops** | PNG, wide | **~1792 × 768** (21:9) | full-width sheet background | Matches the character-sheet backdrop aspect. |
| **Species / backgrounds / feats** | PNG, square | **256 – 512** | small emblems/vignettes | 256 for small emblems; 512 if you want larger reuse. |

**Rules of thumb**
- **VFX native ≈ 256 px/frame** is the sweet spot — good when a 60-ft cone fills
  ~480px, still light as a strip.
- **512 px** is the shared standard for square art (items, emblems) so they
  interchange with token art.
- Keep the **dark/plain ground** consistent so pieces sit together in libraries.

---

# 1. Spell / Effect VFX (animated sprite sheets)

**Used in:** played **on the battle map** when a spell is cast — layered over the
map and tokens, then auto-removed. Projectiles fly caster→target, cones/lines
are aimed, bursts play in place. Must read over any map background.

On-board animations. **Prompt recipe (VFX strip):**
> "A horizontal sprite-sheet animation strip of {subject}, {N} evenly-spaced
> frames left→right showing the effect begin → peak → dissipate, top-down/side
> game VFX, vivid {color} magical energy, transparent background, no text, no
> border, frames aligned on a single baseline."

### 1.1 Done ✅ (reference for style/format)
`magic_missile_sprite.png` · `firebolt_sprite.png` · `cone_of_cold_sprite.png` ·
`misty_step_animation.png` · cursors: `sword_sprite.png`, `unarmed_strike_sprite.png`,
`spell_casting_sprite.png`, `stealing_sprite.png` · `dice_roll.png`.

### 1.2 Attack-roll spells (projectiles) — *point-right strips*
- [ ] `ray_of_frost_sprite.png` — a cold ray beam
- [ ] `eldritch_blast_sprite.png` — a crackling force beam
- [ ] `shocking_grasp_sprite.png` — an arc of lightning at the hand
- [ ] `chill_touch_sprite.png` — a spectral grasping hand
- [ ] `guiding_bolt_sprite.png` — a radiant descending bolt
- [ ] `chromatic_orb_sprite.png` — a shifting elemental orb
- [ ] `witch_bolt_sprite.png` — a sustained lightning tether
- [ ] `inflict_wounds_sprite.png` — a necrotic black-claw burst
- [ ] `scorching_ray_sprite.png` — three parallel fire rays
- [ ] `acid_arrow_sprite.png` — an acid dart with splash
- [ ] `produce_flame_sprite.png` — a hurled flame mote
- [ ] `thorn_whip_sprite.png` — a lashing vine whip

### 1.3 Save-based bursts / areas
- [ ] `fireball_sprite.png` — a 20-ft fire explosion (burst kind)
- [ ] `lightning_bolt_sprite.png` — a line of lightning (line kind)
- [ ] `burning_hands_sprite.png` — a short fire cone
- [ ] `thunderwave_sprite.png` — an expanding sonic cube
- [ ] `shatter_sprite.png` — a ringing sonic burst
- [ ] `sacred_flame_sprite.png` — a column of radiant flame
- [ ] `toll_the_dead_sprite.png` — a spectral bell toll
- [ ] `poison_spray_sprite.png` — a puff of green gas cone
- [ ] `wall_of_fire_sprite.png` — a standing fire wall (line, lingering)
- [ ] `flaming_sphere_sprite.png` — a rolling fire sphere (movable)
- [ ] `moonbeam_sprite.png` — a descending moonlight cylinder (movable)
- [ ] `cloud_of_daggers_sprite.png` — a whirl of spinning blades (cube)

### 1.4 Condition & control spells
- [ ] `hold_person_sprite.png` — golden restraining runes on a target
- [ ] `web_sprite.png` — spreading sticky webbing (cube, lingering)
- [ ] `entangle_sprite.png` — grasping vines from the ground (cube, lingering)
- [ ] `fear_sprite.png` — a dark frightening aura
- [ ] `sleep_sprite.png` — drifting sleep motes
- [ ] `command_sprite.png` — a compelling word glyph
- [ ] `banishment_sprite.png` — a target dissolving into a rift

### 1.5 Lingering utility areas (place-a-token)
- [ ] `darkness_sprite.png` — a sphere of magical darkness
- [ ] `fog_cloud_sprite.png` — a rolling fog sphere
- [ ] `spike_growth_sprite.png` — a field of ground spikes
- [ ] `silence_sprite.png` — a translucent hush dome
- [ ] `sleet_storm_sprite.png` — a swirling sleet cylinder

### 1.6 Movement / teleport & heal / cleanse (burst kind)
- [ ] `dimension_door_sprite.png` — a torn doorway of space
- [ ] `thunder_step_sprite.png` — a teleport + thunderclap
- [ ] `cure_wounds_sprite.png` — a warm healing bloom
- [ ] `healing_word_sprite.png` — soft ascending motes of light
- [ ] `mass_healing_word_sprite.png` — a wide healing pulse
- [ ] `prayer_of_healing_sprite.png` — a radiant blessing ring
- [ ] `lesser_restoration_sprite.png` — a cleansing sparkle
- [ ] `greater_restoration_sprite.png` — a brighter cleansing burst
- [ ] `remove_curse_sprite.png` — shattering dark chains

> Wiring one into the app: drop `public/sprites/<name>_sprite.png`, add a
> `SHEETS` entry in `src/components/SpellFx.tsx` (cols/rows/kind), and a `vfx:`
> on the spell in `src/lib/spellMechanics.ts`.

---

# 2. Item & Equipment Art

**Used in:** as **object tokens on the board** (e.g. a dropped weapon, a chest)
and as **inventory thumbnails** on the character sheet / loot dialog. Seeds a
consistent default library alongside the in-app item-art generator.

Token/inventory art for gear — the *archetype set* to seed a consistent library
(overlaps with the in-app item-art generator).

**Prompt recipe (item art):**
> "A single Dungeons & Dragons {subject}, centered object token, painterly
> high-fantasy illustration on a plain dark softly-lit background, crisp focus,
> no character, no text, no border."

- [ ] **Weapons:** `item_art_sword`, `_greatsword`, `_dagger`, `_axe`, `_mace`,
  `_warhammer`, `_spear`, `_bow`, `_crossbow`, `_staff`, `_wand`, `_sling`
- [ ] **Armor:** `armor_padded`, `armor_leather`, `armor_chain_shirt`,
  `armor_scale`, `armor_breastplate`, `armor_half_plate`, `armor_chain_mail`,
  `armor_plate`, `shield_wooden`, `shield_metal`
- [ ] **Consumables:** `potion_healing`, `potion_generic`, `scroll_spell`,
  `oil_flask`, `alchemist_fire`, `holy_water`, `antitoxin`, `rations`, `torch`
- [ ] **Magic items:** `ring_generic`, `amulet_generic`, `cloak_generic`,
  `boots_generic`, `gauntlets_generic`, `rod_generic`, `orb_generic`,
  `wondrous_generic`
- [ ] **Treasure:** `gem_red`, `gem_blue`, `gem_green`, `art_object`,
  `coin_pile`, `gold_bar`

---

# 3. Class & Character Art

**Used in:** character creation and the character sheet — class **emblems** as
badges in the class picker/sheet, class **backdrops** as the sheet's full-bleed
background, and species/background/feat vignettes during creation.

### 3.1 Class emblems (12) — *square, one per class*
**Prompt recipe (class emblem):**
> "An iconic heraldic emblem for the D&D {class} class, a single bold symbol
> ({motif}), painterly metallic crest on a dark shield ground, no text."

- [ ] **Barbarian** `class_barbarian.png` — *a bloodied greataxe / feral totem*
- [ ] **Bard** `class_bard.png` — *a lute*
- [ ] **Cleric** `class_cleric.png` — *a radiant holy symbol*
- [ ] **Druid** `class_druid.png` — *an oak leaf / antler*
- [ ] **Fighter** `class_fighter.png` — *crossed sword & shield*
- [ ] **Monk** `class_monk.png` — *a fist in a ki circle*
- [ ] **Paladin** `class_paladin.png` — *a winged shield*
- [ ] **Ranger** `class_ranger.png` — *a bow + arrow over a leaf*
- [ ] **Rogue** `class_rogue.png` — *a hooded dagger*
- [ ] **Sorcerer** `class_sorcerer.png` — *a burst of innate arcane energy*
- [ ] **Warlock** `class_warlock.png` — *an eldritch eye / pact sigil*
- [ ] **Wizard** `class_wizard.png` — *an open spellbook + rune*

### 3.2 Class backdrops (12) — *wide 21:9 sheet backgrounds*
The app currently shares **4** images across all 12 classes (`src/lib/classArt.ts`).
Make a unique moody 21:9 scene per class → `class_bg_<class>.png` (× 12).

### 3.3 Species / ancestry (9) — *emblem or portrait bust*
- [ ] `species_dragonborn`, `species_dwarf`, `species_elf`, `species_gnome`,
  `species_goliath`, `species_halfling`, `species_human`, `species_orc`,
  `species_tiefling`

### 3.4 Backgrounds (4) — *small vignette*
- [ ] `bg_acolyte`, `bg_criminal`, `bg_sage`, `bg_soldier`

### 3.5 Feats (17) — *optional small emblems*
Origin: `feat_alert`, `feat_magic_initiate`, `feat_savage_attacker`, `feat_skilled`.
General: `feat_asi`, `feat_grappler`. Fighting Style: `feat_archery`,
`feat_defense`, `feat_great_weapon_fighting`, `feat_two_weapon_fighting`.
Epic Boon: `feat_combat_prowess`, `feat_dimensional_travel`, `feat_fate`,
`feat_irresistible_offense`, `feat_night_spirit`, `feat_spell_recall`,
`feat_truesight`.

---

## Summary counts (illustrations)

| Group | Count |
|---|---:|
| Spell/effect VFX (to make) | ~45 |
| Item & equipment art | ~45 |
| Class emblems | 12 |
| Class backdrops | 12 |
| Species | 9 |
| Backgrounds | 4 |
| Feats | 17 |
| **Total illustrations** | **~144** |

Highest-impact first: **VFX for the most-cast spells** (fireball, lightning bolt,
healing word, guiding bolt) and the **12 class emblems**.
