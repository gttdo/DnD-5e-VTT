# D&D Beyond — Campaign Surface Reconnaissance

Reconnaissance for the browser extension that will read D&D Beyond
state into our DM-assistant agent. Captured 2026-05-11 against the
live site, from the perspective of a logged-in DM viewing their own
campaign **"Borderland Heroes"** (campaign id `7220122`).

This doc focuses on **where the data lives** and **how to extract it
from the DOM**. CSS class names are not captured because D&D Beyond
mangles them per build; rely on **structure + accessible labels +
href patterns** for selectors instead.

---

## 1. URL map

| URL | Purpose | Auth |
|---|---|---|
| `/my-campaigns` | List of campaigns the user is in (DM or player) | required |
| `/campaigns/create` | Create-campaign form | required |
| `/campaigns/premade` | Premade-campaign picker | required |
| `/campaigns/{id}` | Campaign detail page (party, DM notes, invite) | required |
| `/campaigns/{id}/edit` | Edit campaign | required |
| `/campaigns/{id}/deactivate` | Deactivate action | required |
| `/campaigns/{id}/delete` | Delete action | required |
| `/campaigns/join/{token}` | Player-side join page | required |
| `/games/{id}` | Launch VTT for this campaign (uses same numeric id as campaign) | required |
| `/profile/{username}/characters/{charId}` | Player's character sheet (canonical) | public-by-default |
| `/characters/{charId}` | Same sheet via shortcut path (no username required) | public-by-default |
| `/my-encounters` | DM encounter list | required |
| `/encounter-builder` | Encounter builder | required |
| `/games` | All games (VTT entry points) | required |

The campaign `id` is a small integer (`7220122` for Borderland Heroes).
The **join token** appended to invite links is `{id}{8-digit-suffix}`
(e.g. `722012254144367` for campaign `7220122`). Probably a
`campaignId * 10^8 + nonce` or similar.

The VTT route reuses the campaign id directly: `/games/7220122`.

---

## 2. `/my-campaigns` — campaign list

Selectors anchor on the visible labels:

- **"Create a Campaign"** link → `/campaigns/create`
- **"Create from Premade Campaigns"** link → `/campaigns/premade`

Each campaign card exposes:

- **Campaign name** (text)
- **"Campaign Started MM/DD/YYYY"** (text)
- **"N PLAYERS"** (integer + label)
- **"ROLE: DUNGEON MASTER" | "ROLE: PLAYER"** (text — tells us if the user can DM here)
- **"CONTENT SHARING ENABLED BY {username}"** (text, optional)
- **"View Campaign"** link → `/campaigns/{id}`
- **"Launch VTT"** link → `/games/{id}`
- **"Deactivate"** link → `/campaigns/{id}/deactivate`
- **"Delete"** link → `/campaigns/{id}/delete`

→ Parse the `id` from any of the four trailing-action links.

---

## 3. `/campaigns/create` — creation form

Surprisingly minimal:

- **Campaign Name** — `<input type="text" placeholder="Enter a name">` (required)
- **Description** — TinyMCE-style rich-text editor (HTML output). Toolbar
  includes Bold/Italic/Underline/Strikethrough, Blockquote, font family/size,
  lists, link/image/video, **embedded dice roller**, **rollable dice blocks**.
- **Create Campaign** submit button

That's the entire create surface. All other data (party, encounters, notes,
sessions, invite link) is generated server-side and edited on the detail page.

---

## 4. `/campaigns/{id}` — campaign detail (the big one)

The most data-rich surface. Five distinct sections.

### 4.1 Header

- **Page title** — campaign name (`<h1>`)
- **My Campaigns** / **Create a Campaign** / **Edit Campaign** /
  **Create Encounter** buttons (top-right)
- **Launch VTT** button → `/games/{id}`
- **Game Log** button → toggles a right-side slide-out panel (no URL change)

### 4.2 Content sharing + invite block

- **"You have enabled content sharing in this campaign"** banner (text only when on)
- **Disable Content Sharing** / **Content Management** buttons
- **Invite link** displayed in full: `https://www.dndbeyond.com/campaigns/join/{token}`
- **Copy Link** / **Reset Invite Link** actions

→ Extract the join token by parsing the visible URL or the underlying anchor.

### 4.3 Description (long-form prose)

The campaign's stored description, rendered as HTML. This is **free-form
content the DM wrote** — for Borderland Heroes it's a 2-paragraph intro that
introduces each PC by name and concept. **High-value context for our agent.**

### 4.4 Active Characters list

Per-character card (5 cards in Borderland Heroes):

```
listitem
├── link href="/profile/{username}/characters/{charId}"  ← portrait
├── generic "{character name}"
├── generic "Lvl {N} | {Species} | {Class}[ / {Subclass}]"
├── generic "Player: {username}"
├── link "View"       href="/profile/{username}/characters/{charId}"
├── link "Edit"       href="/profile/{username}/characters/{charId}/builder"
├── link "Deactivate" href="/campaigns/{id}/deactivate-character/{charId}"
└── link "Remove"     href="/campaigns/{id}/remove-character/{charId}"
```

If the character belongs to the viewing DM, an extra "Unassign" link
appears that uses a different URL shape including the join token:
`/campaigns/{charId}/{joinToken}/unclaim-assigned-character`.

→ Parsing strategy:
- Extract `username` and `charId` from any `/profile/{u}/characters/{c}` href
- The "Lvl X | Species | Class[/Subclass]" string is **pipe-delimited** — easy
  to split. Subclass is appended with " / " after the class.
- Also visible: **Create Unassigned Character** and **Create Unassigned
  Premade Character** buttons at the bottom of the card grid (DM tools).

### 4.5 DM Notes (Private + Public)

Two parallel columns:

- **DM Notes (Private)** — visible only to the DM
- **DM Notes (Public)** — visible to players too

Each has an **Edit Notes** button and renders the content as HTML.

In Borderland Heroes, the DM uses these as a full **session script**:
private notes contain chapter headings ("Chapter 1 — The Tower's Teeth",
"Chapter 2 — The Drunken Dragon Incident", etc.), bullet-point cues,
NPC names in **bold**, location names in **bold**, and inline quotes.
Public notes contain the **read-aloud prose** — the actual narrative
the DM reads to the table.

→ **This is the single highest-value extraction target for our agent.**
Pulling the Private notes gives the agent the DM's outline; pulling the
Public notes gives the agent the established narrative voice to match.

### 4.6 Game Log (right slide-out panel)

Toggled by the "Game Log" button. Same URL as the detail page; the panel
is a `<list>` of roll entries. **Newest-first**.

Each entry is a `<listitem>` with:

```
listitem
├── img — character avatar (alt = character name)
├── generic "{character name}"
├── generic "{action name}"                ← e.g. "Dagger", "Fire Bolt",
│                                            "Shortbow", "Initiative",
│                                            "NATURE", "SLEIGHT OF HAND",
│                                            "INTIMIDATION", "custom"
├── generic "{action type}"                ← "to hit" | "damage" | "roll"
│                                            | "check" | "save" (assumed)
├── generic "TO: {target}"                 ← "Self", or a creature name
│                                            (only on attacks/saves)
├── generic "D20"                          ← die type label, when shown
├── generic "{formula breakdown}"          ← e.g. "9 + 7"
├── generic "{dice notation}"              ← e.g. "1d20+7"
├── generic "{individual die result}"      ← e.g. "9"
│   └── img alt="d20 roll of 9"
├── generic "{modifier note}"              ← e.g. "Rolled with Flourishing"
├── generic "{total}"                      ← the big number (right-side)
└── generic "{timestamp}"                  ← "M/D/YYYY h:mm AM/PM"
```

Not every entry has every field. Empirically:
- `damage` rolls often render with just name + action + type + timestamp
  (the actual damage number lives in a child element that may need a
  closer look — see TODO below)
- `roll` for **Initiative** shows the total but not always the formula
- `check` rolls (NATURE, SLEIGHT OF HAND, INTIMIDATION) show name + type
  + timestamp
- `to hit` rolls show the full formula breakdown including die image

The list is mounted in the panel and **new entries appear in real time**
when players roll on D&D Beyond — a `MutationObserver` on the list will
let us stream rolls into our app with no polling.

#### TODOs to confirm in a follow-up recon pass

- Confirm damage rolls do expose their numeric totals somewhere in the
  entry's subtree (we saw "= 3" / "= 7" / "= 9" on screen but the
  accessibility tree didn't surface them — they may be styled spans).
- Capture how **saves** and **death saves** appear (no save entries in
  this campaign's log to sample).
- Capture how **target-other** entries look (when a roll has a real
  target name, not "Self").
- Capture pagination / lazy-load behavior — does the log fetch older
  entries on scroll?

---

## 5. Character sheet pages

Two URL shapes both render the same sheet:

- **Canonical (with username)** — `/profile/{username}/characters/{charId}`
- **Shortcut (no username)** — `/characters/{charId}`

The DOM is large and rich. **Out of scope for this recon pass** — we'll
do a dedicated character-sheet recon doc before we ship the scraper.

What we know we'll need from the sheet:

- Name, Species, Class(es) & level(s), Subclass(es), Background
- Current HP / Max HP / Temp HP, AC, Speed, Initiative, Proficiency Bonus
- Ability scores + modifiers
- Saving throw bonuses + proficiency state
- Skill bonuses + proficiency/expertise state
- Passive Perception / Investigation / Insight
- Action list (attacks with hit + damage)
- Inventory with currency
- Class features, species traits, feats (with usage trackers)
- Conditions currently applied
- Spell slots + prepared spells (if caster)

---

## 6. Extraction strategy for the extension

### 6.1 Content script targeting

Match on `https://www.dndbeyond.com/*`. Detect surface by URL:

| Path pattern | Handler |
|---|---|
| `/my-campaigns` | `harvestCampaignList()` — produces `[{id, name, role, playerCount, startedAt}]` |
| `/campaigns/{id}` (no further suffix) | `harvestCampaignDetail()` — produces `{id, name, description_html, invite_token, party: [{charId, username, name, level, species, class, subclass}], dm_notes_private_html, dm_notes_public_html}` and **starts a game-log observer** if the panel is open |
| `/profile/*/characters/{id}` or `/characters/{id}` | `harvestCharacterSheet()` — defer to character-sheet recon doc |
| `/encounter-builder/*` | future |

### 6.2 Game Log streaming

Inject a `MutationObserver` on the game-log list. On every added
`<listitem>`, parse it into a `Roll` record and post it to the background
worker, which writes to `dnd_beyond_rolls` in Supabase.

Roll shape (proposed):

```ts
interface Roll {
  campaign_dnd_id: number;          // 7220122
  character_name: string;
  action: string;                   // "Dagger" | "Fire Bolt" | "NATURE"
  action_type: "to_hit" | "damage" | "roll" | "check" | "save";
  target: string | null;            // "Self" | "Goblin Boss" | null
  formula: string | null;           // "1d20+7"
  total: number | null;             // 16
  raw_breakdown: string | null;     // "9 + 7"
  flags: string[];                  // ["Rolled with Flourishing"]
  observed_at: string;              // ISO timestamp from the page
}
```

### 6.3 Snapshot triggers

- On `DOMContentLoaded` for matching URLs → full snapshot
- On hash/SPA navigation → re-detect and re-snapshot
- On the Game Log panel mount → start the observer
- Periodic re-snapshot of the detail page (every ~30s) to catch DM-notes edits

### 6.4 Auth assumption

Everything we want is gated behind the user's D&D Beyond session
cookies, which the content script already has access to as the active
tab. We don't need to authenticate against D&D Beyond ourselves — we
just read what the user already sees.

---

## 7. Open questions for product

1. **Do we want to write back to D&D Beyond?** (e.g. when the agent
   advances the story, append to DM Notes (Private)?) — Probably **no**
   for v1. Read-only is safer and faster to ship.
2. **Linking a D&D Beyond campaign to our agent campaign:** simplest is
   "paste the campaign URL into our app and we parse out the id." The
   extension can also auto-suggest "Sync this campaign with your agent
   workspace?" when the user is on a `/campaigns/{id}` page.
3. **Player ID stability:** the `username` segment in character URLs
   (`/profile/h5ycz6pfbx/characters/...`) appears to be a stable
   per-account slug. The `charId` is a global integer. Use `charId` as
   the primary key; treat `username` as metadata.
4. **Encounter Builder integration:** out of scope for this recon, but a
   high-value Phase-2 target (initiative + monster stat blocks the agent
   could read to track combat).
