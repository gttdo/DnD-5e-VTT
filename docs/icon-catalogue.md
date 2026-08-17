# D&D 5e VTT — Icon Catalogue (flat UI glyphs)

Every small **flat UI icon** the VTT needs — the mono/duotone glyphs used across
the HUD, character sheet, and tooltips. Vector work (SVG).

> Illustrations (spell VFX sprites, item art, class & character art) live in a
> **separate** doc: `docs/illustration-catalogue.md`.

Every entry has a **name**, a **`snake_case` filename**, a **one-line
description**, and an **art-prompt subject** for the section's prompt recipe.
Taxonomies are pulled from the codebase, so the counts are authoritative.

---

## How to use this doc

- **Work top-to-bottom by section** — each `###` is one batch.
- **Filenames**: lowercase `snake_case` → `public/icons/<name>.svg`.
- **Prompt recipe**: each section has a reusable recipe with a `{subject}` slot +
  fixed style directives. Fill `{subject}` from each row.
- **Progress**: tick the box as you finish each item.

**Global prompt recipe (flat icons):**
> "A minimal flat vector icon of {subject}, {style} style, centered on a 24×24
> grid, bold silhouette readable at 16px, single flat color on transparent
> background, no text, no gradient, no drop shadow."

**Style legend:** `line` = thin outlined glyph · `duotone` = filled light/dark
two-tone · accent = one flat color that inherits `currentColor` (themes itself).

---

## Product & design context (read before generating)

**What the app is.** A **Dungeons & Dragons 5e Virtual Tabletop (VTT)** — a web
app where a group plays tabletop D&D on a shared battle map. A **DM** runs
monsters/NPCs and the map; **players** each control a character. Core surfaces:
a top-down **battle map** with **tokens**, an in-game **HUD** (bottom action
bar) bound to the selected token, a full **character sheet**, and a **rules
reference**. Think Owlbear Rodeo / Roll20 crossed with a Baldur's Gate–style HUD.

**Visual identity.** Dark high-fantasy with a warm **candle-gold** accent over
near-black/leather grounds (light "parchment" theme also exists). Existing UI
icons are thin **lucide** line glyphs; these custom icons add the **D&D-specific**
concepts lucide doesn't have. New icons should read as **one cohesive family**
with a consistent stroke weight and level of detail.

**Make them theme-aware (important).** Draw icons **monochrome using
`currentColor`** — the app supplies the color (candle-gold, a damage tint, a
state color) and swaps it between light/dark themes. **Don't bake in fixed
colors.** Where this doc lists a hex (e.g. damage-type tints), that's the color
the *app* applies at runtime for reference — the SVG itself should stay
single-color. "Duotone" here means two tones of the *same* `currentColor` (via
opacity/fill-rule), not two literal colors.

**Where these icons render (so you can judge size & clarity):**
- **In-game HUD** — the bottom action bar: action-economy glyphs, class-resource
  chips, the action hotbar, and menu tabs. Small (16–20px), often on a dark bar.
- **Character sheet** — ability blocks, the click-to-roll skills list, saving
  throws, senses, proficiencies, defenses (damage types), spell cards (school),
  inventory (item categories), the paper-doll (equip slots), rest/level-up.
- **Battle map tokens** — condition **badges** ride on tokens (tiniest render,
  ~14–16px — favor the simplest silhouettes for these).
- **Tooltips & rules reference** — conditions, actions, cover, etc.
- **Combat log & spell area tokens** — damage-type icons/tints.

Each category below has a **"Used in:"** line pinning down its exact home.

---

## Sizes & export specs

Icons are **vector (SVG)** so one file scales to every size — the number that
matters is the **design grid**. Draw at the grid, verify at the smallest render.

| Category | Format | Design grid | Rendered at | Notes |
|---|---|---|---|---|
| All flat UI icons | **SVG** | **24 × 24**, ~2px stroke | 14–20 px | Vector = one file, any size. Bold silhouette; 2px min stroke so it survives at 14px. Transparent, `currentColor`. |
| Condition badges (subset shown on tokens) | SVG | 24 × 24 | ~14–16 px on-board | The tightest read of the set — simplest silhouettes. |
| Class resource trackers | SVG | 24 × 24 | 16–20 px chips | May carry one class-accent color over the mono glyph. |
| Currency / coins | SVG | 24 × 24 | ~14–16 px | Two-tone (metal + rim) is fine. |
| Rarity frames | SVG | flexible (border/badge, not a glyph) | scales with the item card | Color-coded, no fixed px. |
| *If raster is ever required* | PNG | export **@1× 24 / @2× 48 / @3× 72** | — | SVG is strongly preferred for everything here. |

**Rules of thumb**
- **Draw once, ship vector** — a single 24-grid SVG covers 14px chips *and* 20px tabs.
- **The limiting size is the smallest render** — test each icon at **16 px** before it's done.

---

### 1. Damage types (13) — *Style: duotone, tinted to the type's color*

**Used in:** damage lines in the combat/dice log, damage-type tags on weapons &
spells (character sheet + detail drawers), and the tint of spell area tokens on
the board.

- [ ] **Fire** — `dmg_fire.svg` — a flame · subject: *a curling flame* (tint `#e8663c`)
- [ ] **Cold** — `dmg_cold.svg` — an icy shard · *a jagged ice crystal* (`#5cc6e8`)
- [ ] **Lightning** — `dmg_lightning.svg` — a bolt · *a forked lightning bolt* (`#e8d24a`)
- [ ] **Thunder** — `dmg_thunder.svg` — a shockwave · *concentric sound-blast rings* (`#b58cff`)
- [ ] **Acid** — `dmg_acid.svg` — a corrosive droplet · *a dripping acid droplet with fumes* (`#8fd14a`)
- [ ] **Poison** — `dmg_poison.svg` — a toxic drop · *a skull-marked poison droplet* (`#7bd14a`)
- [ ] **Necrotic** — `dmg_necrotic.svg` — death energy · *a wilting skull wreathed in shadow* (`#7a4a8f`)
- [ ] **Radiant** — `dmg_radiant.svg` — holy light · *a radiant sunburst* (`#f2e08a`)
- [ ] **Psychic** — `dmg_psychic.svg` — mind energy · *a spiral of psychic energy over a brow* (`#e86ab0`)
- [ ] **Force** — `dmg_force.svg` — arcane force · *a faceted arcane force-orb* (`#9a8cff`)
- [ ] **Bludgeoning** — `dmg_bludgeoning.svg` — blunt impact · *a warhammer head / impact star* (`#b0a08a`)
- [ ] **Piercing** — `dmg_piercing.svg` — a spike · *a sharp arrowhead* (`#b0a08a`)
- [ ] **Slashing** — `dmg_slashing.svg` — a slash · *a curved sword-slash mark* (`#b0a08a`)

---

### 2. Conditions (16) — *Style: line, single accent*

**Used in:** condition **badges** on tokens on the battle map (the tiniest
render — favor the simplest silhouettes), condition chips on the character
sheet, and the conditions rules reference.

15 official + **banished** (Banishment spell).

- [ ] **Blinded** — `cond_blinded.svg` — *a crossed-out eye*
- [ ] **Charmed** — `cond_charmed.svg` — *a heart with a hypnotic swirl*
- [ ] **Deafened** — `cond_deafened.svg` — *a crossed-out ear*
- [ ] **Exhaustion** — `cond_exhaustion.svg` — *a drooping/sweating figure*
- [ ] **Frightened** — `cond_frightened.svg` — *a wide-eyed fearful face*
- [ ] **Grappled** — `cond_grappled.svg` — *a gripping hand / clamp*
- [ ] **Incapacitated** — `cond_incapacitated.svg` — *a slumped stunned figure*
- [ ] **Invisible** — `cond_invisible.svg` — *a dashed-outline figure*
- [ ] **Paralyzed** — `cond_paralyzed.svg` — *a rigid figure with lock marks*
- [ ] **Petrified** — `cond_petrified.svg` — *a stone-textured statue figure*
- [ ] **Poisoned** — `cond_poisoned.svg` — *a queasy figure with a bubble/skull*
- [ ] **Prone** — `cond_prone.svg` — *a fallen/lying figure*
- [ ] **Restrained** — `cond_restrained.svg` — *a figure bound by chains/webbing*
- [ ] **Stunned** — `cond_stunned.svg` — *stars circling a head*
- [ ] **Unconscious** — `cond_unconscious.svg` — *a knocked-out figure with "Z"s*
- [ ] **Banished** — `cond_banished.svg` — *a figure dissolving into a portal rift*

---

### 3. Ability scores (6) — *Style: duotone emblem*

**Used in:** the six ability-score blocks on the character sheet, and
save/ability-check labels in the HUD and dice log.

- [ ] **Strength** — `abil_str.svg` — *a flexed muscular arm*
- [ ] **Dexterity** — `abil_dex.svg` — *a running/leaping figure or feather*
- [ ] **Constitution** — `abil_con.svg` — *a stout heart / shield-heart*
- [ ] **Intelligence** — `abil_int.svg` — *a brain / open book*
- [ ] **Wisdom** — `abil_wis.svg` — *an eye within a droplet / owl*
- [ ] **Charisma** — `abil_cha.svg` — *a radiant speaking figure / mask*

---

### 4. Skills (18) — *Style: line* (ability in parens)

**Used in:** the click-to-roll skills list on the character sheet (one per row),
and skill-check roll dialogs.

- [ ] **Acrobatics** — `skill_acrobatics.svg` — *a cartwheeling figure* (DEX)
- [ ] **Animal Handling** — `skill_animal_handling.svg` — *a paw + open hand* (WIS)
- [ ] **Arcana** — `skill_arcana.svg` — *an arcane rune circle* (INT)
- [ ] **Athletics** — `skill_athletics.svg` — *a climbing figure* (STR)
- [ ] **Deception** — `skill_deception.svg` — *a two-faced mask* (CHA)
- [ ] **History** — `skill_history.svg` — *a scroll / hourglass* (INT)
- [ ] **Insight** — `skill_insight.svg` — *an eye reading a heart* (WIS)
- [ ] **Intimidation** — `skill_intimidation.svg` — *a snarling fist* (CHA)
- [ ] **Investigation** — `skill_investigation.svg` — *a magnifying glass* (INT)
- [ ] **Medicine** — `skill_medicine.svg` — *a mortar & pestle / healing cross* (WIS)
- [ ] **Nature** — `skill_nature.svg` — *a leaf / oak tree* (INT)
- [ ] **Perception** — `skill_perception.svg` — *an alert eye + ear* (WIS)
- [ ] **Performance** — `skill_performance.svg` — *a lute / drama masks* (CHA)
- [ ] **Persuasion** — `skill_persuasion.svg` — *a handshake / speech bubble* (CHA)
- [ ] **Religion** — `skill_religion.svg` — *a holy symbol / prayer beads* (INT)
- [ ] **Sleight of Hand** — `skill_sleight_of_hand.svg` — *a hand slipping a coin* (DEX)
- [ ] **Stealth** — `skill_stealth.svg` — *a hooded crouching figure* (DEX)
- [ ] **Survival** — `skill_survival.svg` — *a compass / campfire + tracks* (WIS)

---

### 5. Spell schools (8) — *Style: duotone rune-emblem*

**Used in:** spell cards/list, the spell detail drawer (school label), and the
spellbook — to categorize each spell by school at a glance.

- [ ] **Abjuration** — `school_abjuration.svg` — *a protective ward shield*
- [ ] **Conjuration** — `school_conjuration.svg` — *a summoning portal ring*
- [ ] **Divination** — `school_divination.svg` — *an eye / crystal ball*
- [ ] **Enchantment** — `school_enchantment.svg` — *a hypnotic charm swirl*
- [ ] **Evocation** — `school_evocation.svg` — *an elemental energy burst*
- [ ] **Illusion** — `school_illusion.svg` — *overlapping ghost silhouettes*
- [ ] **Necromancy** — `school_necromancy.svg` — *a skull with rising wisp*
- [ ] **Transmutation** — `school_transmutation.svg` — *a shape morphing (circle→square)*

---

### 6. Action economy + standard actions + attack types — *Style: line*

**Used in:** the HUD action bar — economy glyphs mark whether an action costs an
action/bonus/reaction; the standard actions are the hotbar buttons + the
"Actions in Combat" reference; attack-type icons label weapon/spell attacks in
the sheet and HUD.

**Action economy (5):**
- [ ] **Action** — `econ_action.svg` — *a filled circle / bold star*
- [ ] **Bonus action** — `econ_bonus.svg` — *a small triangle / "+"*
- [ ] **Reaction** — `econ_reaction.svg` — *a curved return arrow*
- [ ] **Movement** — `econ_movement.svg` — *a boot / footprints*
- [ ] **Ritual (long cast)** — `econ_ritual.svg` — *an hourglass over a rune*

**Standard combat actions (15):**
- [ ] **Attack** — `action_attack.svg` — *crossed sword & axe*
- [ ] **Dash** — `action_dash.svg` — *a sprinting figure with speed lines*
- [ ] **Disengage** — `action_disengage.svg` — *a figure stepping back from a blade*
- [ ] **Dodge** — `action_dodge.svg` — *a figure weaving aside*
- [ ] **Grapple** — `action_grapple.svg` — *two figures locked / gripping arms*
- [ ] **Help** — `action_help.svg` — *a helping hand up*
- [ ] **Hide** — `action_hide.svg` — *a figure into shadow*
- [ ] **Improvise** — `action_improvise.svg` — *a lightbulb / question spark*
- [ ] **Influence** — `action_influence.svg` — *a speech bubble with a heart/coin*
- [ ] **Magic (cast)** — `action_magic.svg` — *a casting hand with sparkles*
- [ ] **Ready** — `action_ready.svg` — *a coiled spring / stopwatch + arrow*
- [ ] **Search** — `action_search.svg` — *a magnifier over ground*
- [ ] **Shove** — `action_shove.svg` — *a figure pushing another back*
- [ ] **Study** — `action_study.svg` — *an open book with an eye*
- [ ] **Utilize** — `action_utilize.svg` — *a hand using a gear/tool*

**Attack & weapon types (5):**
- [ ] **Melee weapon** — `attack_melee.svg` — *a swung sword arc*
- [ ] **Ranged weapon** — `attack_ranged.svg` — *a drawn bow + arrow*
- [ ] **Unarmed strike** — `attack_unarmed.svg` — *a punching fist*
- [ ] **Thrown** — `attack_thrown.svg` — *a hurled dagger with motion arc*
- [ ] **Spell attack** — `attack_spell.svg` — *a magic bolt from fingertips*

---

### 7. Weapon properties (9) — *Style: line, small*

**Used in:** weapon rows on the character sheet / inventory and item detail
drawers — small tags on a weapon (finesse, heavy, thrown…).

- [ ] **Finesse** — `wprop_finesse.svg` — *a slender rapier*
- [ ] **Ammunition** — `wprop_ammunition.svg` — *a quiver of arrows*
- [ ] **Light** — `wprop_light.svg` — *a feather over a dagger*
- [ ] **Thrown** — `wprop_thrown.svg` — *a dagger in flight*
- [ ] **Reach** — `wprop_reach.svg` — *a long polearm*
- [ ] **Heavy** — `wprop_heavy.svg` — *a greatsword / weight*
- [ ] **Two-handed** — `wprop_two_handed.svg` — *two hands on a hilt*
- [ ] **Versatile** — `wprop_versatile.svg` — *a hand switching one/two-grip*
- [ ] **Loading** — `wprop_loading.svg` — *a crossbow being cranked*

---

### 8. Class resource trackers (~15) — *Style: duotone, class-flavored*

**Used in:** the HUD resource strip — spendable chips for the selected token's
limited-use class features (tap to spend a use of Rage, Ki, etc.).

- [ ] **Rage** — `res_rage.svg` — *a roaring red aura burst* (Barbarian)
- [ ] **Ki** — `res_ki.svg` — *a swirling ki orb* (Monk)
- [ ] **Channel Divinity** — `res_channel_divinity.svg` — *a radiant holy symbol* (Cleric/Paladin)
- [ ] **Action Surge** — `res_action_surge.svg` — *a double-arrow burst* (Fighter)
- [ ] **Second Wind** — `res_second_wind.svg` — *a healing breath / wind curl* (Fighter)
- [ ] **Bardic Inspiration** — `res_bardic_inspiration.svg` — *a musical note with sparkle* (Bard)
- [ ] **Wild Shape** — `res_wild_shape.svg` — *a figure morphing into a beast* (Druid)
- [ ] **Lay on Hands** — `res_lay_on_hands.svg` — *a glowing healing palm* (Paladin)
- [ ] **Sorcery Points** — `res_sorcery_points.svg` — *a font of arcane sparks* (Sorcerer)
- [ ] **Sneak Attack** — `res_sneak_attack.svg` — *a dagger with a target burst* (Rogue)
- [ ] **Cunning Action** — `res_cunning_action.svg` — *a quick-step boot* (Rogue)
- [ ] **Superiority Dice** — `res_superiority_dice.svg` — *a d8 with a sword* (Battle Master)
- [ ] **Breath Weapon** — `res_breath_weapon.svg` — *a dragon's cone breath* (Dragonborn)
- [ ] **Divine Sense** — `res_divine_sense.svg` — *a radiant detecting eye* (Paladin)
- [ ] **Generic resource** — `res_generic.svg` — *a plain resource pip* (fallback for the long tail: Flurry of Blows, Step of the Wind, Patient Defense, Vow of Enmity, Riposte…)

---

### 9. Game-state concepts + currency — *Style: line*

**Used in:** the HUD and character-sheet header (XP, level-up, rest, inspiration,
concentration, spell slots, AC), the initiative tracker, and inventory/loot
(coins by denomination).

- [ ] **Initiative** — `game_initiative.svg` — *a stopwatch with crossed swords*
- [ ] **XP** — `game_xp.svg` — *a rising star / gem*
- [ ] **Level up** — `game_level_up.svg` — *an upward chevron burst*
- [ ] **Hit dice** — `game_hit_dice.svg` — *a d10 with a heart*
- [ ] **Inspiration** — `game_inspiration.svg` — *a glowing d20 / spark*
- [ ] **Concentration** — `game_concentration.svg` — *a focused eye in a spiral*
- [ ] **Spell slot** — `game_spell_slot.svg` — *a glowing arcane pip/diamond*
- [ ] **AC / defense** — `game_ac.svg` — *a heater shield*
- [ ] **Short rest** — `game_rest_short.svg` — *a campfire*
- [ ] **Long rest** — `game_rest_long.svg` — *a crescent moon over a tent*
- [ ] **Passive perception** — `game_passive_perception.svg` — *a dashed eye*
- [ ] **Loot / treasure** — `game_loot.svg` — *an open treasure chest*

**Currency (5) — coin faces:**
- [ ] **Copper** — `coin_cp.svg` · **Silver** — `coin_sp.svg` · **Electrum** — `coin_ep.svg` · **Gold** — `coin_gp.svg` · **Platinum** — `coin_pp.svg` — *a coin, metal-tinted per type*

---

### 10. Item categories & types — *Style: duotone*

**Used in:** the inventory list + item detail drawers, the loot dialog, and the
item/token library (kind filters); rarity frames color-code item cards by rarity.

**Inventory buckets (6):**
- [ ] **Weapon** `item_weapon.svg` · **Armor** `item_armor.svg` · **Gear** `item_gear.svg` (pack) · **Tool** `item_tool.svg` · **Consumable** `item_consumable.svg` (potion) · **Treasure** `item_treasure.svg` (gem)

**Magic-item types (10):**
- [ ] **Wondrous** `item_wondrous.svg` (amulet/orb) · **Potion** `item_potion.svg` · **Scroll** `item_scroll.svg` · **Wand** `item_wand.svg` · **Rod** `item_rod.svg` · **Staff** `item_staff.svg` · **Ring** `item_ring.svg` · **Magic armor** `item_armor_magic.svg` · **Magic weapon** `item_weapon_magic.svg` · **Ammunition** `item_ammunition.svg`

**Rarity frames (6)** — *color-coded borders/badges, not glyphs:*
- [ ] common (grey) · uncommon (green) · rare (blue) · very rare (purple) · legendary (orange) · artifact (gold) → `rarity_<name>`

---

### 11. Equipment slots (9) — *Style: line (paper-doll)*

**Used in:** the paper-doll equipment screen — one placeholder glyph per empty
slot (head, hands, main/off hand, etc.).

- [ ] **Head** `slot_head.svg` (helmet) · **Amulet** `slot_amulet.svg` (necklace) · **Chest** `slot_chest.svg` (breastplate) · **Cloak** `slot_cloak.svg` (cape) · **Main hand** `slot_main.svg` (sword) · **Off hand** `slot_off.svg` (shield) · **Hands** `slot_hands.svg` (gauntlet) · **Boots** `slot_boots.svg` (boot) · **Ring** `slot_ring.svg`

---

### 12. Board taxonomy icons — *Style: line*

**Used in:** the token studio/library (kind filters, size & creature-type
pickers) and the spell-area picker (shapes) — labels for how tokens/areas are
classified.

- [ ] **Token kinds (5):** `tkind_monster` · `tkind_npc` · `tkind_item` · `tkind_prop` · `tkind_spell`
- [ ] **Spell area shapes (6):** `area_sphere` · `area_cube` · `area_cone` · `area_line` · `area_cylinder` · `area_emanation`
- [ ] **Creature sizes (6):** `size_tiny` · `size_small` · `size_medium` · `size_large` · `size_huge` · `size_gargantuan` (nested-square scale)
- [ ] **Creature types (14):** `ctype_<name>` for humanoid, beast, monstrosity, undead, aberration, fiend, celestial, elemental, plant, ooze, construct, dragon, fey, giant

---

## Summary counts (icons)

| Group | Count |
|---|---:|
| Damage types | 13 |
| Conditions | 16 |
| Ability scores | 6 |
| Skills | 18 |
| Spell schools | 8 |
| Action economy + actions + attack types | 25 |
| Weapon properties | 9 |
| Class resource trackers | ~15 |
| Game-state + currency | 17 |
| Item categories & types | 22 |
| Equip slots | 9 |
| Board taxonomy | 31 |
| **Total icons** | **~189** |

Highest-leverage first: **damage types, conditions, abilities, skills** — they
appear on almost every screen.
