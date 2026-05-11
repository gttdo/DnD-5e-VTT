# D&D Beyond — Character Sheet Reconnaissance

Companion to `dndbeyond-campaigns.md`. Captures the structure of the
**character sheet** surfaces our extension will scrape. Recorded
2026-05-11 against two live characters:

- **Drashk** (`/characters/33746092`) — Goliath Barbarian 5, non-caster
- **Arthur Candrix** (`/characters/156061158`) — Tiefling Wizard 2, full caster

Both sheets are reachable at the canonical
`/profile/{username}/characters/{charId}` and the shortcut
`/characters/{charId}` — identical content.

---

## Critical finding: accessibility tree is incomplete

D&D Beyond renders most **numeric values** (ability mods, scores, save
bonuses, skill bonuses, HP totals) as **styled `<span>` elements
without aria labels**. Querying via Chrome's `find` / accessibility
tree returns the *labels* but not the *values*:

```
generic "Strength"          ← label
generic "str"               ← short label
button "plus"               ← +/- sign icon
[no aria value for "+4" or "18"]
```

This means the extension cannot rely on `aria-label` or role queries
for value extraction. Two viable strategies:

1. **Read `innerText` of stable container ancestors** and parse with
   regular expressions. `get_page_text()` reliably returns every value
   in a predictable order (see §2 below). This is the fastest path
   to MVP.
2. **Build CSS selectors against D&D Beyond's class names** (they use
   conventions like `.ddbc-character-name`, `.ct-quick-info__*`,
   `.ddbc-saving-throws-summary__ability-modifier`). More robust, but
   class names change between builds; we'd need a selector audit
   every few months.

**Recommended for v1:** strategy 1 (text-pattern parsing of bounded
sections) so we move fast; harden with strategy 2 in v2.

---

## 1. Top bar / header

`document.querySelector` anchor: search for the `<h1>` with the
character name, or the region matched by `find("Character header")`
(returned `ref_369` for Drashk).

**Text pattern (whitespace-collapsed):**
```
{name} Manage {gender} {species} {className} {classLevel}[ LVL {currentLevel} LVL {nextLevel}] {xpCurrent} / {xpNext} XP Share Short Rest Long Rest Campaign: {campaignName}
```

**Examples:**
```
Drashk Manage Male Goliath Barbarian 5 LVL 5 LVL 6 6,500 / 14,000 XP Share Short Rest Long Rest Campaign: Borderland Heroes

Arthur Candrix Manage Male Tiefling Wizard 2 Level 2 Short Rest Long Rest Campaign: Borderland Heroes
```

**Notes:**
- `Manage` is a button label
- The XP block (`6,500 / 14,000 XP` and `LVL 5 LVL 6`) only renders
  when XP is being tracked; Arthur's sheet shows only `Level 2` (no
  XP bar) — handle both cases.
- `Share` only appears for sheets the viewer owns/DMs; on a player's
  view of their own sheet it may differ.
- Campaign name is suffixed and clickable in DOM (anchor href is
  `/campaigns/{id}`) — parse the id from there for cross-reference.

---

## 2. Sheet body — text patterns

The body text dump follows a consistent left-to-right, top-to-bottom
order. Listing the patterns by region:

### 2.1 Ability Scores

```
Ability Scores
{Full}{short3}{modifier}{score}
```

Six lines, one per ability. Example: `Strengthstr+418` →
`{ Strength, str, +4, 18 }`.

**Regex:**
```js
/(Strength|Dexterity|Constitution|Intelligence|Wisdom|Charisma)(str|dex|con|int|wis|cha)([+-]\d+)(\d+)/g
```

### 2.2 Proficiency Bonus / Speed / Initiative / Inspiration

```
Proficiency Bonus Proficiency {+N} Bonus
Speed Walking {N}ft. Speed
Initiative Initiative {+N}
Inspiration Heroic Inspiration
```

- Inspiration line is just a label; whether it's enabled is encoded
  in the icon's CSS class (visible/hidden) — needs DOM, not text.

### 2.3 Hit Points

```
Hit Points Heal Damage Current {N} / Max Max hit points {N} Temp {N|--}
```

Where Temp `--` means zero.

### 2.4 Saving Throws

```
Saving Throws
{Full} Saving Throw{short3}{+N}
```

Six lines. Example: `Strength Saving Throwstr+7`.

**Proficiency state** (which saves get PB) is NOT in the text; encoded
via a class on the row indicator (typically a black dot vs empty
circle). Use the structural selector path.

After the six rows there may be an additional line like:
```
on DEX against effects that you can see while not blinded, deafened, or incapacitated
```
…which is a free-form **save modifier note** (Drashk has Danger Sense
which generates this). Treat any text between the last save line and
the `Senses` heading as `save_notes[]`.

### 2.5 Senses

```
Senses
{N} Passive Perception
{N} Passive Investigation
{N} Passive Insight
{Sense Name N ft.}    ← optional extras like "Darkvision 60 ft."
Senses
```

Arthur has `Darkvision 60 ft.`; Drashk shows `Additional Sense Types`
(empty extras).

### 2.6 Proficiencies & Languages

```
Proficiencies and Languages
Armor {comma-separated list}
Weapons {comma-separated list}
Tools {comma-separated list}
Languages {comma-separated list}
Proficiencies & Training
```

Lists may be empty (`None` for Wizard armor) or absent.

### 2.7 Skills (all 18)

```
Skills
ProficiencyProfModifierModSkillBonus     ← header row
{ABILITY3}{Skill Name}{+N}                ← one row per skill, 18 rows
Additional Skills
Skills
```

**Regex:**
```js
/^(STR|DEX|CON|INT|WIS|CHA)(Acrobatics|Animal Handling|Arcana|Athletics|Deception|History|Insight|Intimidation|Investigation|Medicine|Nature|Perception|Performance|Persuasion|Religion|Sleight of Hand|Stealth|Survival)([+-]\d+)$/
```

Proficiency state (none / proficient / expertise) is again encoded
in the row icon's CSS — needs DOM. Look for sibling element classes
like `.ct-skills__col--proficiency` containing a filled dot
(`prof`) or filled diamond (`expertise`).

### 2.8 AC / Defenses / Conditions

```
Armor Class Armor {N} Class
Defenses and Conditions
Defenses {comma-separated damage types}     ← "Cold" for Drashk; "Fire" for Arthur (tiefling)
Conditions Add Active Conditions             ← "Add Active Conditions" = none
```

If conditions ARE active they replace `Add Active Conditions` with the
list (e.g. `Prone, Restrained`). We didn't sample a character with
active conditions in this pass.

---

## 3. Right-side tabbed panel

Six tabs, ordered: **Actions · Spells (if caster) · Inventory · Features & Traits · Background · Notes · Extras**

`Spells` is conditional — only renders for caster classes. Selector
test: presence of `Spells` heading inside the tab list. The radios
have accessible labels like:
```
radio "Actions"
radio "Spells"   ← caster only
radio "Inventory"
radio "Features & Traits"
radio "Background"
radio "Notes"
radio "Extras"
```

### 3.1 Actions tab

The text layout of the attacks table:
```
Actions • Attacks per Action: {N}
Attack Range Hit/DC Damage Notes
{weapon name} {Melee Weapon|Ranged Weapon|Melee Attack} {range} {+N to hit} {dice notation} {properties, comma-separated}
…
Actions in Combat
{generic action list — Attack, Dash, Disengage, …}
{free-form Unarmed Strike block when applicable}
Bonus Actions
{name} {description}
…
Reactions
{name} {description}
…
Other
{name} {description}
…
Manage Custom
```

**Example attack row (Drashk's Greataxe):**
```
Greataxe Melee Weapon 5ft.Reach +7 1d12+4 Martial, Heavy, Two-Handed, Cleave
```

Range subcomponents:
- Melee weapons: `5ft.Reach` or just `5 (60)` (5 ft melee + 60 ft thrown — see Dagger)
- Ranged weapons: `30 (120)` (normal/long), or just `120ft.` for spell attacks

The dice notation may be a sub-grid: `1d12+4` is two stacked values
(`1d12+` line + `4` line in DOM). Parse by joining whitespace and
matching `\d+d\d+([+-]\d+)?`.

**Attacks per Action** is a number you want: it tells the agent how
many attacks the character gets when they take the Attack action
(Extra Attack triggers this). Drashk = 2; Arthur = 1.

**Bonus/Reaction/Other sections** are just labeled blocks of named
features with descriptions (sometimes including usage limits like
`Rage: 1 Bonus Action /Long Rest`).

### 3.2 Spells tab (caster only)

Header summary line:
```
Spells {+N} Modifier {+N} Spell Attack {N} Save DC Manage Spells
```

Arthur: `+4 Modifier +6 Spell Attack 14 Save DC`

Then a level filter (`All - 0 - 1st`) followed by one table per spell
level the character has access to.

**Cantrip table:**
```
Cantrip
Name Time Range Hit/DC Effect Notes
{At Will} {Spell Name}{Source} {Time} {Range} {Hit/DC} {Effect} {Notes}
```

**Leveled spell tables (per level):**
```
{N}st Level
Slots Name Time Range Hit/DC Effect Notes
{Cast} {Spell Name}{Source} {Time} {Range} {Hit/DC} {Effect} {Notes}
```

**Example (Arthur's Chromatic Orb):**
```
Cast Chromatic Orb Wizard 1A 90ft. +6 3d8* V/S/M
```

Fields:
- **Slots indicator / At Will button** — for cantrips it's `At Will`;
  for leveled spells it's `Cast` (a button — the actual remaining slot
  count is rendered as filled/unfilled dots in DOM and not in the
  text dump). Slot dots will need DOM.
- **Name** — spell name with the source list concatenated (e.g.
  `Fire BoltWizard`, `Thaumaturgy LegacyInfernal Legacy`). Source
  segments are sometimes prefixed with `Legacy`. Strip suffixes by
  splitting on capital letters or matching against a known source
  list.
- **Time** — abbreviated: `1A` = 1 Action, `1BA` = 1 Bonus Action,
  `1R` = 1 Reaction, plus minutes/hours for ritual.
- **Range** — `Self`, `Touch`, `30ft.`, `120ft.`, …
- **Hit/DC** — either `+N` (attack roll), `{ability3}{N}` (save DC,
  e.g. `wis14`, `con14`), or `--` for no roll.
- **Effect** — damage dice (`1d10`, `3d8*` — the `*` likely means
  scaling on higher slot), or labels like `Charmed*`, `Buff*`,
  `Utility`, `Control`.
- **Notes** — components (`V`, `V/S`, `V/S/M`), duration prefix `D:`
  (e.g. `D: 1m`, `D: 1h`, `D: 8h`), and area (e.g. `5ft.`, `15ft.`).

### 3.3 Inventory tab

```
Inventory
My Inventory | Party Inventory
Weight Carried: {N}lb. Unencumbered           ← or "Encumbered" etc.
{cp}{sp}{ep}{gp}{pp}                          ← the five coin counts run together
Manage Inventory
All | Equipment | Backpack | Attunement | Other Possessions
ActiveNameWeightQty Cost (gp)Notes
Equipment ({N}) {totalWeight}lb.
{active}{ItemName}{tags…}{weight}lb.{qty}{cost}{notes}
…
+ Add Equipment
Hide Contents Backpack ({N}) {weight}lb. ({carried}/{capacity} lb)
Inventory
+ Add items to your Backpack
Attunement
Attuned Items
…
```

**Currency** is rendered as five spans with coin icons separating them
— the text dump runs them together as a single string like `292110842`
which is unparseable from text alone. **Must use DOM** to extract the
five values; selectors target the per-coin `<span>` siblings
(typically `[data-cy*="pp"]`, `[data-cy*="gp"]`, etc., or read the
coin icon's alt text).

**Inventory rows** can have:
- An "Active/Equipped" toggle indicator (text `--` when not active)
- Item name (sometimes duplicated, sometimes followed by
  category tags like `LegacyGearAdventuring Gear`)
- Weight in `lb.`
- Quantity (integer, `--` when 1 implicit)
- Cost in gp (decimal — `0.2`, `0.5`, etc. allowed)
- Notes — properties (`Simple, Finesse, Light, Thrown, Nick, Range (20/60)`)
  or tags (`Utility`, `Container`, `Damage, Utility, Exploration, Combat`)

**Example row (Drashk's Dagger):**
```
Dagger Dagger 1lb. -- 2 Simple, Finesse, Light, Thrown, Nick, Range (20/60)
```

For the agent we mostly care about: name, qty, equipped state, type
(weapon vs armor vs gear), and any item that grants AC, damage, or
spells. Weight is secondary.

### 3.4 Features & Traits tab

```
Features and Traits
All | Class Features | Species Traits | Feats
Class Features
{Class} Features
{Feature Name} {source ref, e.g. "PHB, pg. 47"}
{description}
[{Feature Name}: {N} {Action Type}]    ← optional cost line
[Uses: {pips}/{Long Rest|Short Rest}]  ← optional usage tracker
…
Species Traits
{Species} (or just the trait list)
{Trait Name}{source ref, e.g. "EE" = Erlw Eberron? actually 2024 PHB?}
{description}
…
Feats
Manage Feats
{Feat Name}{source ref e.g. "TCoE, pg. 81"}
From{Source — e.g. "Barbarian"}
{description}
{optional sub-options}
```

**Source ref format:** `<sourcebook>, pg. <N>` (PHB, DMG, TCoE) or
two-letter codes (`EE` appears for the species traits — need to
confirm what `EE` decodes to, possibly a release marker).

**Usage trackers** show as `Uses: ▢ / Long Rest` where the boxes are
checkable in DOM but render only as label in text. Reading remaining
uses from the page text is unreliable; need DOM.

Drashk's class features in order:
- Hit Points
- Proficiencies
- Rage (Damage +2 — qualifier visible in text)
- Unarmored Defense
- Reckless Attack
- Danger Sense
- Primal Path (Path of the Berserker)
- Frenzy (subclass — appears in the same flat list)
- Ability Score Improvement (with selected Feat shown)
- Extra Attack
- Fast Movement

### 3.5 Background tab

(not scraped this pass — assumed to contain background name, feature,
personality traits, ideals, bonds, flaws, backstory, allies, organizations,
treasure — same fields as our internal `notes` object on Character.
Mostly free-form HTML; capture as `background_html`.)

### 3.6 Notes / Extras tabs

(not scraped this pass — Notes is freeform; Extras contains things
like Vehicles, Custom items. Treat as opaque HTML blobs for v1.)

---

## 4. Proposed extraction schema

```ts
interface DnDBeyondCharacterSnapshot {
  source_url: string;                            // /characters/33746092
  char_id: number;                               // 33746092
  username?: string;                             // optional, from canonical URL
  observed_at: string;                           // ISO timestamp

  name: string;
  gender?: string;                               // "Male" / "Female" / etc.
  species: string;
  classes: Array<{
    name: string;                                // "Barbarian"
    level: number;
    subclass?: string;                           // "Path of the Berserker"
  }>;
  total_level: number;
  xp?: { current: number; next: number };
  campaign?: { id: number; name: string };

  abilities: Record<"STR"|"DEX"|"CON"|"INT"|"WIS"|"CHA", {
    score: number;
    modifier: number;
  }>;

  proficiency_bonus: number;
  initiative_bonus: number;
  speed: { walking: number; flying?: number; swimming?: number; climbing?: number };
  inspiration: boolean;                          // best-effort from icon class
  hp: { current: number; max: number; temp: number };

  saves: Record<Ability, { bonus: number; proficient: boolean }>;
  save_notes: string[];                          // free-form notes like Danger Sense

  skills: Record<SkillName, {
    ability: Ability;
    bonus: number;
    proficient: boolean;
    expertise: boolean;
  }>;

  passive: { perception: number; investigation: number; insight: number };
  senses: string[];                              // "Darkvision 60 ft."
  ac: number;
  defenses: { resistances: string[]; immunities: string[]; vulnerabilities: string[] };
  conditions: string[];                          // active conditions

  proficiencies: {
    armor: string[];
    weapons: string[];
    tools: string[];
    languages: string[];
  };

  attacks_per_action: number;
  attacks: Array<{
    name: string;
    kind: "melee_weapon" | "ranged_weapon" | "melee_attack" | "spell";
    range: string;                               // "5ft.Reach" or "30 (120)"
    to_hit: number | null;                       // null for save-based
    damage: string | null;                       // "1d12+4"
    notes: string[];                             // ["Martial","Heavy","Two-Handed","Cleave"]
  }>;

  spells?: {
    modifier: number;
    spell_attack: number;
    save_dc: number;
    by_level: Record<number, Array<{
      name: string;
      source: string;                            // "Wizard", "Infernal Legacy"
      casting_time: string;                      // "1A", "1BA", "1R"
      range: string;
      hit_or_dc: string | null;                  // "+6", "wis14", null
      effect: string | null;                     // "1d10", "Charmed*", null
      notes: string;                             // "V/S/M", "D: 1h, V/S"
      at_will: boolean;
      slot_consumed?: boolean;                   // for leveled — best-effort
    }>>;
    slots?: Record<number, { max: number; remaining: number }>;
  };

  inventory: {
    weight_carried: number;
    encumbered: "unencumbered" | "encumbered" | "heavily_encumbered";
    currency: { cp: number; sp: number; ep: number; gp: number; pp: number };
    equipment: Array<{
      name: string;
      tags: string[];                            // ["Gear","Adventuring Gear"] or ["Medium Armor"]
      weight: number;
      qty: number;
      cost: number;
      notes: string[];
      active: boolean;
    }>;
    attuned: string[];                           // item names
  };

  features: Array<{
    source: "class" | "species" | "feat" | "background";
    source_detail: string;                       // "Barbarian 1", "Goliath", "TCoE p.81 (From Barbarian)"
    name: string;
    description_html: string;
    uses?: { max: number; remaining: number; recharge: "short" | "long" | "day" };
  }>;

  background_html?: string;
  notes_html?: string;
  extras_html?: string;
}
```

---

## 5. Selector cheat-sheet (provisional)

These are the **structural anchors** to use in the content script.
Class names below are observed at recon time; treat them as hints, not
guarantees — confirm during the implementation pass.

| Region | Anchor |
|---|---|
| Character name | `h1` inside `.ddbc-character-name__entity` or `[role="heading"][aria-level="1"]` near the top |
| Quick info (class/species/level) | element with text matching `(Male|Female|Other) {species} {class} {level}` |
| Ability score blocks | `.ddbc-ability-summary` (six instances) |
| HP tracker | region with accessible name "Hit Points" |
| AC | region with accessible name "Armor Class" |
| Initiative | element with text `Initiative` followed by sibling with `[+-]\d+` |
| Skills list | element with text "Skills" followed by 18 row children |
| Saving Throws | region with heading "Saving Throws" |
| Proficiencies | region after "Proficiencies and Languages" heading |
| Tabs | radio inputs with labels matching the six/seven tab names |
| Spells header | inside the `Spells` tab — element containing both "Spell Attack" and "Save DC" |

For each, prefer:
1. `find()` to locate the region by accessible label
2. `read_page(ref_id, depth: 3)` to inspect children
3. Pull `innerText` from the underlying DOM element via DevTools-style
   bridge in the extension

---

## 6. Implementation strategy for the extension

**Phase A — text-pattern scraper (1-2 days):**
1. On `/characters/{id}` page load, wait for `#character-tools-target`
   or `.ct-character-sheet` to mount (React app — observe for sentinel
   element).
2. For each major region, locate the **section root** by heading text
   match, then read its `innerText` and parse with regexes in §2.
3. Click each tab in turn (Actions → Inventory → Features → Spells if
   visible) and repeat parse, OR (better) **read the underlying React
   state directly** — see Phase B.
4. Compose into the `DnDBeyondCharacterSnapshot` shape and post to the
   background worker.

**Phase B — React state scraper (1 day, hardening):**
D&D Beyond's character sheet is a React/Redux app. The full character
data is in the Redux store, reachable via the React DevTools fiber
walker:

```ts
function findFiberRoot(el: Element): any {
  const key = Object.keys(el).find((k) => k.startsWith("__reactContainer$"));
  return key ? (el as any)[key] : null;
}
// then walk to find the store and dispatch
```

This bypasses the DOM-as-source-of-truth problem entirely — we'd get
the full structured character object with no parsing. It's also more
fragile to D&D Beyond minification changes; treat as an optimization
to layer on top of Phase A.

**Phase C — tab cycling (1 day):**
Some content only renders when the corresponding tab is selected. The
scraper needs to either (a) cycle through all tabs, snapshotting each,
or (b) trigger the tab-click programmatically without scrolling the
page. Phase B obviates this entirely since Redux carries all tabs'
data regardless of which one is visible.

---

## 7. Open questions / next recon pass

1. **Conditions when active** — need to see how the conditions panel
   renders the list when conditions are applied (currently empty for
   both sampled characters).
2. **Spell slots remaining** — confirm the slot dots are toggleable
   and how their state is encoded in DOM.
3. **Multiclass display** — neither sampled character is multiclassed.
   How is `Wizard 2 / Sorcerer 3` shown in the header?
4. **Spellcasting prep** — for prepared casters (Cleric, Druid), how
   are prepared spells distinguished from known? Test with Aurus.
5. **Custom rolls / dice macros** — D&D Beyond allows custom dice
   tags in descriptions; do these surface as `Roll` events in the
   game log?
6. **Player-visible vs DM-visible content sharing** — does the
   "Content Sharing" toggle on the campaign affect what we can scrape
   from another player's sheet?
