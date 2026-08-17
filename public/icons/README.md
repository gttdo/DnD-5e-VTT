# Icons — flat UI glyphs

Small **flat vector icons** (SVG) for D&D-specific UI concepts — damage types,
conditions, abilities, skills, spell schools, actions, class resources, item
categories, and more. Files here are served from the site root.

## Folder layout

Icons are grouped into **per-category subfolders** under `public/icons/`, so a
file is referenced by its subfolder path — e.g.
`public/icons/action_economy/econ_action.svg` → `/icons/action_economy/econ_action.svg`.

Exported so far:

- `action_economy/` — `econ_action`, `econ_bonus`, `econ_reaction`, `econ_movement`, `econ_ritual`
- `damage_types/` — `dmg_fire`, `dmg_cold`, `dmg_lightning`, `dmg_thunder`, `dmg_acid`, `dmg_poison`, `dmg_necrotic`, `dmg_radiant`, `dmg_psychic`, `dmg_force`, `dmg_bludgeoning`, `dmg_piercing`, `dmg_slashing` (see `damage_types/CREDITS.md` — some are CC-BY game-icons.net)
- `conditions/` — the 15 official + `banished` + `sleep` (17 total): `cond_blinded`, `cond_charmed`, `cond_deafened`, `cond_exhaustion`, `cond_frightened`, `cond_grappled`, `cond_incapacitated`, `cond_invisible`, `cond_paralyzed`, `cond_petrified`, `cond_poisoned`, `cond_prone`, `cond_restrained`, `cond_stunned`, `cond_unconscious`, `cond_banished`, `cond_sleep`. All `currentColor` (15 CC-BY game-icons.net — see `conditions/CREDITS.md`; `cond_exhaustion` + `cond_prone` are project-custom).
- `abilities/` — `abil_str` (biceps), `abil_dex` (acrobatic), `abil_con` (muscular-torso), `abil_int` (brain), `abil_wis` (owl), `abil_cha` (crowned-heart). CC-BY game-icons.net — see `abilities/CREDITS.md`. `currentColor`.
- `spell_schools/` — `school_abjuration`, `school_conjuration`, `school_divination`, `school_enchantment`, `school_evocation`, `school_illusion`, `school_necromancy`, `school_transmutation`. Project-original occult/alchemical sigils, smoothed + vectorized. `currentColor`.
- `skills/` — all 18 official skills: `skill_acrobatics`, `skill_animal_handling`, `skill_arcana`, `skill_athletics`, `skill_deception`, `skill_history`, `skill_insight`, `skill_intimidation`, `skill_investigation`, `skill_medicine`, `skill_nature`, `skill_perception`, `skill_performance`, `skill_persuasion`, `skill_religion`, `skill_sleight_of_hand`, `skill_stealth`, `skill_survival`. All CC-BY game-icons.net (see `skills/CREDITS.md`). `currentColor`.
- `actions/` — 15 standard combat actions + 5 attack types: `action_attack`, `action_dash`, `action_disengage`, `action_dodge`, `action_grapple`, `action_help`, `action_hide`, `action_improvise`, `action_influence`, `action_magic`, `action_ready`, `action_search`, `action_shove`, `action_study`, `action_utilize`, `attack_melee`, `attack_ranged`, `attack_unarmed`, `attack_thrown`, `attack_spell`. All CC-BY game-icons.net (see `actions/CREDITS.md`). `currentColor`.
- `weapon_properties/` — all 9 weapon properties: `wprop_finesse`, `wprop_ammunition`, `wprop_light`, `wprop_thrown`, `wprop_reach`, `wprop_heavy`, `wprop_two_handed`, `wprop_versatile`, `wprop_loading`. All CC-BY game-icons.net (see `weapon_properties/CREDITS.md`). `currentColor`.
- `game_state/` — 12 game-state concepts: `game_initiative`, `game_xp`, `game_level_up`, `game_hit_dice`, `game_inspiration`, `game_concentration`, `game_spell_slot`, `game_ac`, `game_rest_short`, `game_rest_long`, `game_passive_perception`, `game_loot`. Mostly CC-BY game-icons.net; `game_concentration` + `game_spell_slot` are project-original (see `game_state/CREDITS.md`). `currentColor`.
- `currency/` — 5 coin denominations: `coin_cp`, `coin_sp`, `coin_ep`, `coin_gp`, `coin_pp`. Identical silhouette (CC-BY game-icons.net `crown-coin`); the app tints each by metal color. See `currency/CREDITS.md`. `currentColor`.
- `board/` — 31 battle-map taxonomy icons: 5 token kinds (`tkind_*`), 6 spell-area shapes (`area_*`), 6 creature sizes (`size_*`), 14 creature types (`ctype_*`). Token kinds + creature types are CC-BY game-icons.net; area shapes + sizes are project-original geometric icons. See `board/CREDITS.md`. `currentColor`.

Remaining categories will land in their own subfolders as they're finished
(e.g. `damage_types/`, `conditions/`, `abilities/`, …). The `snake_case`
**filenames** stay exactly as the catalogue lists them; only the folder grouping
is added on top.

## Format

- **SVG**, drawn on a **24 × 24** grid, bold silhouette readable at **16 px**.
- **Monochrome using `currentColor`** — the app supplies the color and swaps it
  between light/dark themes. **Don't bake in fixed colors.**
- Transparent background, no text.

## Naming

Lowercase `snake_case`, grouped by prefix — e.g. `dmg_fire.svg`,
`cond_poisoned.svg`, `abil_str.svg`, `skill_stealth.svg`,
`school_evocation.svg`, `action_dash.svg`, `res_rage.svg`, `item_potion.svg`.

## The full list

See **`docs/icon-catalogue.md`** — ~189 icons in 12 categories, each with a
filename, description, a "Used in" note (where it renders), and an art-prompt
recipe. That doc has the product/design context to feed to AI or Figma.
