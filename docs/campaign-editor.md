# Campaign Editor — design & implementation plan

*Status: SHIPPED 2026-08-20 — slices 1a–1e all live and verified, plus the
handout generator (0042). Implementation notes at the bottom record where
the build deviated from this design.*
*Mockup (v3) and research references at the bottom.*

The Campaign Editor is the narrative layer of The Table: the DM-side authoring
surface where a campaign is composed as a story and broken into pieces that can
be played at the table. It is the temporal/story counterpart to the spatial
layer we already have (region maps → hotspots → scenes), and both layers point
at the same atoms: scenes, maps, documents.

Guiding insight (from the *Heroes of the Borderlands* structural teardown): a
professional campaign compiles into **places, maps at every altitude, tiny
labeled text atoms, and a referenced asset library** — which is exactly scene
graph + documents + library. Nothing in a professional module is long: read-
alouds run ~25 words, keyed rooms 50–150. Small, labeled, atomic content is the
quality bar for both the editor and its AI assistance.

---

## 1. Information architecture

```
Campaign                      games (+ level band, tagline, cover)
├─ Campaign overview          campaign-level document (premise; Scribe context)
├─ Regional map               region_maps (exists)
└─ Chapters                   NEW — story-space grouping, draft/published
    └─ Scenes                 scenes (exist) — the stageable unit
        ├─ Description        scenes.description (NEW) — canonical source
        ├─ Backdrop           scenes.cinematic_url (exists)
        ├─ Battlemap          scenes.image_url (exists)
        └─ Documents          campaign_documents (NEW)

Sessions                      NEW — table-time recording boundaries
└─ Game log                   NEW persistent stream: rolls + chat + system events
    └─ Recap                  a campaign_document drafted from one session's log
```

**Chapters ⊥ sessions.** Chapters are story-space (the outline you write);
sessions are table-time (the record of play). A chapter can span many sessions
and a session can wander across chapters. They meet only in derived views
(e.g. "Chapter 2: 3 of 5 scenes visited").

**Vocabulary** (validated against Heroes of the Borderlands):

| The book says              | We say                          |
| -------------------------- | ------------------------------- |
| Chapter (Caves of Chaos)   | Chapter                         |
| Lair / location / region   | **Scene** — one stageable map   |
| Keyed room (A1, A2…)       | Scene-linked doc (pins later)   |
| Getting Started / intro    | Chapter-level document          |

The test for "is it a scene?": *does it get its own map you'd stage at the
table?*

---

## 2. Schema — migration 0041

New tables:

```sql
chapters (
  id, game_id → games,
  title, position int,
  region_map_id → region_maps null,     -- spatial by default, optional
  status text 'draft' | 'published',    -- new chapters default draft
  timestamps
)

sessions (
  id, game_id → games,
  number int,                            -- 1, 2, 3… per game
  started_at, ended_at null              -- null = live now
)

game_log (
  id, game_id → games,
  session_id → sessions null,            -- null = off the record
  kind text 'roll' | 'chat' | 'system',
  author_id → auth.users null,           -- null for system events
  author_name text,                      -- denormalised, like journal_entries
  body jsonb,                            -- roll payload / chat text / event
  created_at
)

campaign_documents (
  id, game_id → games,
  kind text 'note' | 'read_aloud' | 'quest' | 'recap',
  title, content text,                   -- markdown
  visibility text 'dm' | 'players',
  scene_id → scenes null,                -- attach at scene…
  chapter_id → chapters null,            -- …or chapter…
  session_id → sessions null,            -- …or session (recaps)
  position int,                          -- order within its parent
  created_by, timestamps
)
```

Column additions:

```sql
scenes.chapter_id → chapters null        -- null = Unfiled (counts as published)
scenes.description text                  -- the canonical scene source
games.description text                   -- tagline for the campaign card
games.level_min int, games.level_max int -- 1–20, min ≤ max, nullable
```

RLS: DM full CRUD everywhere; players read `campaign_documents` only where
`visibility = 'players'`; players read `game_log` and insert their own
`chat`/`roll` rows; `sessions` and `chapters` are player-readable (needed for
publish gating), DM-writable.

**Note — the log is new plumbing, not just a column.** Today's "game log" is
in-memory only (`src/state/DiceLog.tsx`: last 50 rolls in React state,
broadcast via `rolls:{gameId}`, lost on refresh). `game_log` makes the stream
persistent; rolls write a row at broadcast time. `journal_entries` (the
existing user-authored journal) is untouched — fold-in reconsidered later.

---

## 3. The editor surface

Route `#/campaign/<gameId>`, DM-only. Entry points:
1. Creating a campaign lands in the editor (with a level-band picker at
   creation: tier presets 1–4 / 5–10 / 11–16 / 17–20 + custom).
2. Games screen cards: ⋮ → "Manage campaign" (campaigns you DM only).

**Top bar** — ‹ Games · campaign name · level chip · Settings · **Open table ›**

**Left rail — two tabs:**

*Story* (default): Campaign overview + Regional map rows, then the chapter →
scene tree. ＋ Add scene per chapter, ＋ Add chapter at the foot, drag to
reorder, Unfiled bucket (existing scenes land there on day one — organizing
them **is** the migration onboarding). Per-row ⋮: Rename · Remove from chapter
(unfiles, safe) · Delete (guarded — confirms; warns if staged or pin-targeted;
chapter delete never cascades, its scenes drop to Unfiled). Scenes with no
battlemap show a "no map" badge — prep debt at a glance.

*Timeline*: sessions newest-first (number · date · duration), each opening its
recap doc in the main pane, or offering "Draft recap…" if none exists.

**Main pane — the scene page** (prep face of the same `scenes` row the table
plays):
- **Description** — autosaved prose (`Saved · just now`, no save button). The
  canonical source: seeds the Scribe's read-aloud drafts and both image
  generator prompts (matched-faces keeps the two images the same place).
- **Faces** — backdrop + battlemap slots: Swap (MapPickerDialog) or Generate
  (GenerateMapDialog), both existing components.
- **Documents** — the scene's notes / read-alouds / quests. Read-alouds render
  as gold boxed italic text (the book's "boxed text") and carry **▶ Present**.
  Notes and quests are DM-locked by default.

**Settings modal** — administration of the campaign object: name, tagline
(card copy), level band, cover image, danger zone (delete campaign — its one
canonical home). Distinction: *Settings is what the app needs to know; the
Campaign overview doc is what the story needs to know.*

---

## 4. Draft & publish

`chapters.status`, default `draft`.

- Players can only reach scenes in **published** chapters: region-map pins
  targeting draft scenes are hidden from players, `guardTravel` refuses, no
  player-facing list shows them.
- **Unfiled scenes count as published** — existing games keep working the
  moment 0041 lands.
- The DM is never locked out: draft scenes appear badged/dimmed in the table's
  scene drawer; staging one deliberately is allowed (gentle reminder, no wall).
- Publish lives on the chapter ⋮ with a readiness check ("2 scenes have no
  battlemap — publish anyway?") that informs, never blocks. Unpublish reverses,
  pins hide immediately.
- Naming: "publish" = players may enter. The future pack/community feature
  will use a different word (share/export).

---

## 5. Sessions, log, chat

- DM control in the table view: **Start session** → live chip ("Session 3 ·
  recording") → **End session**. Auto-close after hours of empty table,
  attributing end time to last activity.
- While a session is live, log rows carry its `session_id`. Outside a session
  everything still works and persists but is **off the record**: excluded from
  recaps and Scribe context. One rule, no special cases.
- **The log is also the chat** (closes backlog #154): rolls, chat messages,
  and system events (scene staged, session start/end) interleave in one
  stream, with All / Chat / Rolls filters. Whispers and IC/OOC tagging are
  deferred follow-ons.
- Scene-change system events make chapter progress derivable ("Session 3
  touched X, Y" → "Chapter 2: 3 of 5 scenes visited").
- **End-of-session is the recap moment**: "Session 3 ended · 2h 14m · Draft a
  recap?" → Scribe drafts from exactly that session's log → saved as a `recap`
  doc on the Timeline. Player-facing recaps get ▶ Present — "previously on…"
  read at the top of the next session.

---

## 6. The Scribe (writing assistant)

One assistant, many lenses — never seven tools. Edge function
`campaign-scribe` (deployed by the project owner, like all edge functions):

- Body: `{ instruction, kind, sessionId?, sceneId?, genre?, difficulty? }`.
- Server-side context assembly, priority order: campaign premise → level band
  → recent recaps → session log (when recapping) → the linked scene's
  description and docs. Select-and-stuff; campaigns are small, no retrieval
  infrastructure needed.
- Style filters: genre (drama / horror / action / comedy / fantasy) and
  difficulty (story mode / easy / hard / very hard).
- **Presets target the canonical atom sizes** from the teardown: arrival
  read-aloud ≈ 25 words · keyed-room note ≈ 100 words with labeled mechanics
  (`Trap.` `Treasure.` `DC 12 …`) · quest = hook → steps → reward · NPC = role
  + 3 labeled traits. Essay-length output is a defect.
- Editor hooks: "✎ Draft read-aloud" on the scene description; "Draft recap"
  on sessions.

Open decision: LLM provider — Claude (claude-sonnet-5; best prose, needs an
`ANTHROPIC_API_KEY` secret) vs reusing the existing `OPENAI_API_KEY`.

---

## 7. Present (stage text to players)

Any player-facing doc gets **▶ Present** at the table: the text overlays the
players' scene view (over the backdrop) while the DM reads it aloud — players
read along. This one mechanism serves boxed text, handouts (a handout is a
rendered player-facing doc; the paused handout generator is this pipeline's
render step), and "previously on…" recaps. Realtime broadcast + a dismiss.

---

## 8. Implementation slices

Committed one slice at a time, verified in-browser before push (pin/click
verification with real pointer events, per house rule).

| Slice | Contents | Verification |
| ----- | -------- | ------------ |
| **1a — schema + editor shell** | Migration 0041. Route + top bar + Settings modal. Story tree (chapter CRUD, reorder, draft badges, publish flow + readiness check, Unfiled). Scene page (description autosave, face slots via existing dialogs, docs CRUD, read-aloud block styling). Entry points (create-flow → editor with level picker; card ⋮ "Manage campaign"). Player-side publish gating (pin hiding + guardTravel). | Create chapter/scene/docs round-trip; publish gating checked from a player window. |
| **1b — sessions + persistent log** | `sessions` start/end control in DM HUD + live chip + auto-close. Rolls persist to `game_log` (alongside the existing broadcast). System events: scene staged, session start/end. Timeline tab listing sessions. | Two-window test: roll during and outside a session, verify tagging; refresh survives. |
| **1c — chat** | Chat input on the log panel; `chat` rows; All/Chat/Rolls filters; realtime. | Two-account chat; off-the-record between sessions. |
| **1d — Scribe** | `campaign-scribe` edge function (owner deploys; provider decision above). "Draft read-aloud" + "Draft recap" + end-of-session prompt. Style filters. | Draft a read-aloud from a real scene description; recap a real session log. |
| **1e — Present** | ▶ Present on player-facing docs; overlay on players' scene view; dismiss; recap presenting. | Two-window test with real pointer events. |

Later (out of scope for slice 1): keyed pins on battlemaps (the digital "A1:
Entrance"), derived chapter-hub view, NPC registry, handout generator as the
render layer of player-facing docs, whispers / IC-OOC, solo-play generation
(the AI GM authors into this same campaign format — that is the point of the
format).

---

## 9. Implementation notes (2026-08-20)

All five slices shipped same-day (36b7259 → c740bb6), plus handouts
(bf402c2, migration 0042). Deltas from the design above, all deliberate:

- **Present rides the game log**, not new schema: `doc_presented` /
  `doc_dismissed` system events carry a content snapshot. Survives refresh,
  reaches late joiners, and presentations join the session record (the
  Scribe's recap mode reads them).
- **Handouts became a document kind** (`kind='handout'` + `meta jsonb`
  holding `{template, fields}`), not a separate Resources tool — they
  inherit visibility, RLS, the Story drawer, and Present for free. Five
  templates (letter, notice, menu, price sheet, services), client-rendered;
  stock presets fill price lines from book-price pools (`lib/shopGoods.ts`).
- **The Story drawer** (sparkles rail button) is the editor's payoff surface
  at the table: latest recap + the staged scene's docs + campaign docs.
- **The standalone dice roller** was local-only (never broadcast, never
  logged); it now goes through the table pipeline. Behavior change, on
  purpose — a table roll is a shared event.
- **Chapter hub page**: clicking a chapter title opens the derived
  "Getting Started" index (scene · first-line hook · face glyphs · prep
  depth) plus chapter-level docs.
- **Scribe** runs `claude-sonnet-5`; first live drafts hit the canonical
  sizes (32-word read-aloud, 141-word recap) with secrets hinted, not named.
- Lesson for future hooks: **creates must be optimistic** — realtime
  channels subscribed before their table existed stay dead until remount.

Still open: two-window live checks (draft-gate pins, combat nav-lock,
player-side Present hide), SRD illustrations/ornate borders on handouts,
Scribe-authored handout content, keyed pins on battlemaps.

## 10. References

- Mockup v3 (private artifact): https://claude.ai/code/artifact/f4728905-3d52-481f-85ac-7f61f758d6c0
- *Heroes of the Borderlands* structural teardown (private artifact): https://claude.ai/code/artifact/fd55d52c-133c-4228-b69d-62ece7332495
- Related design: The Living World (scenes/faces/region navigation), migrations 0035–0040.
