# The Table — Session Handoff

**Date:** 2026-08-19
**Repo:** `DnD-5e-VTT` · **Branch:** `main` (all work committed + pushed)
**Purpose:** Preserve the valuable context from a long working session — shipped work, the product/design direction, the open backlog, deploy reminders, and how to resume — in case the session is lost.

> **How to resume:** read this file top-to-bottom, then skim the design-direction memory notes referenced in §4. Most "what's next" lives in §4 (design vision) and §6 (backlog). The immediate build candidates are in §7.

---

## 1. Current state (TL;DR)

A Vite + React + TypeScript + Supabase **D&D 5e virtual tabletop** ("The Table"). This session shipped the **character-creation overhaul (#110)**, the **species lineage system (#148)**, **Quickened Spell metamagic (#97)**, a **statblock sheet re-skin (#123)**, **asset upload (#16)**, image-generation reliability fixes, and a bug fix for initiative rolls (#158). It then pivoted into a **major design-direction exploration**: an Alchemy-RPG-inspired **cinematic/glass UI redesign**, plus an original **scene model** (per-player free-roam scenes + two-layer cinematic/tactical scenes). Those are captured as artifacts + memory notes and are the main open thread.

Build is green; `main` is level with `origin/main`; working tree clean.

---

## 2. Shipped this session (all pushed to `main`)

Newest first. Commit short-hashes in parentheses.

### Character creation — the 4-method flow (#110) — DONE
A method chooser forking into four creation paths (mirrors D&D Beyond):
- **Standard** — the full wizard: searchable/badged Class + Species pickers, DDB-style ability assignment (rolled + array via per-ability dropdowns), caster spell selection, real starting equipment → inventory, skill validation, persistent summary header + completion-aware step rail, sticky footer. (`cd24d6e`, `981bf1b`, `7bb3dcf`, `4b22831`, `3143cf2`, `812f07d`, `f719195`, `57f3ccc`)
- **Quickbuilder** — pick class + species → auto-fills abilities (standard array by class priority), a fitting background, skills, **curated iconic starter spells** per caster, and a starting kit → opens the wizard at Review. (`879dc63`, `6ad448e`) — `src/lib/quickBuild.ts`, `src/components/CharacterQuickBuild.tsx`.
- **Premade** — clone a shared-library character (the #135 clone flow).
- **Import from PDF** — upload a D&D Beyond / form-fillable sheet → parse → reviewable character. pdf.js reads BOTH the text layer AND the **AcroForm field values** (D&D Beyond stores real data in form fields, not text). Deterministic proficient-skill detection; background inference; species+lineage mapping. (`92ce951`, `84cbf44`, `dd2a8a3`, `9e9198a`, `0b2af02`, `4ececf7`) — `src/components/CharacterImport.tsx`, `src/lib/pdfImport.ts`, edge fn `supabase/functions/parse-character-pdf/`.
- **Backgrounds expanded 4 → 16** (full 2024 PHB set) — `e44db1b`, `public/data/backgrounds.json`.
- **Close-out**: searchable Background step + artwork variety. (`6483009`)

### Species lineages / subraces (#148) — DONE
2024 subrace choices with real mechanics, in 4 slices:
- **Data + builder picker** — Elf (Drow/High/Wood), Gnome (Forest/Rock), Tiefling (Abyssal/Chthonic/Infernal), Dragonborn (10 draconic ancestries), Goliath (6 giant boons). `SpeciesData` gained `lineage_label` + `lineages`; `BuilderState` gained `lineage`; `buildCharacter` applies speed/darkvision/resistance/traits/innate spells. Filled 6 missing origin feats. (`ddb6d8e`) — `public/data/species.json`, `src/lib/characterBuilder.ts`.
- **Castable innate spells** — a lineage's innate spells are real, castable, with their own save DC (even for non-casters). (`c3ae6d6`) — `Character.spellcasting.innate`, `sorceryPoints`/helpers in `src/lib/spellcasting.ts`, `SpellsPanel.tsx`, `TableHud.tsx`.
- **Draconic breath + giant boons** as combat trait tiles. (`806d818`)
- **Sheet integration** — lineage in the header, Review row, and a **live lineage chooser** on the sheet's Features tab to re-derive on existing characters (`src/lib/lineage.ts`). PDF import preserves the subrace. (`e77df17`, `8984de0`, `ad099c7`, `4ececf7`)

### Quickened Spell metamagic + Sorcery Points (#97) — DONE
A Sorcerer (L2+) can spend Sorcery Points to cast an Action spell as a Bonus Action. Sorcery Points modeled as a **derived** pool (= Sorcerer level, resets on Long Rest); `Character.sorceryPointsUsed`. A "Quicken · 2 SP" toggle in the VTT HUD flips the next Action spell's economy to bonus. v1 assumes any L2+ sorcerer knows Quickened (no metamagic-selection UI yet). (`6f926b3`) — `src/components/TableHud.tsx`, `src/lib/spellcasting.ts`.

### Statblock sheet re-skin (#123) — first pass shipped
Re-skinned the player sheet with the DM creature-sheet's printed-statblock feel (flat panels, serif candle-gold section rules, mono candle-gold values, compact ability cells) — scoped under `.statblock-skin` on `.sheet-inner`, covers desktop + mobile, no lost interactivity. (`24e7156`) — `src/index.css`, `src/components/CharacterSheet.tsx`. **Awaiting visual review / dial-in.**

### Asset tray upload (#16) — DONE
Upload your own art as a library token from Resources (sibling to the Token Studio generate flow). (`470d933`) — `src/components/TokenUploadDialog.tsx`, wired in `TokenLibraryScreen.tsx`.

### Image-generation reliability + feedback — DONE
- Fixed the avatar generator **hanging forever** (was reusing the wide 1536×1024 high-quality background path → exceeded Supabase's ~150s wall-clock). Now a square 1024×1024 **medium** portrait; backdrop dropped to medium too; real edge-function errors surfaced (not the opaque "non-2xx"). (`09aeb61`, `db9d16b`, `3120576`) — `src/lib/classArt.ts`, `AvatarDialog.tsx`, `ChangeBackgroundDialog.tsx`.
- **`GenerationProgress`** live-feedback component (shimmer canvas, elapsed clock, advancing stage messages) on all four AI-image surfaces: avatar, backdrop, Token Studio, map generator. (`ee7f7f9`, `a0c4833`) — `src/components/ui/GenerationProgress.tsx`.

### Art + misc — DONE
- Per-spell-school banner art in the spell drawer (`a997ec5`); diversified class-backdrop art (12 distinct) + `login.png` back to auth-only (part of `6483009`).
- **Bug fix (#158):** initiative roll stalled after the first character in an all-PC party — the `DiceRollDialog` lacked a React `key`, so it wasn't remounting per combatant (stuck in the "landed" phase). Fixed on the initiative + saving-throw dialogs. (`802adf5`) — `src/components/TableCanvas.tsx`.
- **Game Log:** only the DM can clear it (`canClear={isDM}`). (`870cd83`)

### Earlier this session (pre-compaction, for completeness)
Item-granted spellcasting (#88) + curated SRD item spell grants (`4f11d5f`); dead tokens excluded from initiative (`c9e53d6`); player's first harmful blow starts combat cross-client (#76, `79c8391`); shared public library + publish toggle (#135/#137, `166adeb`, `18f2b6f`); map-to-grid alignment with drag/zoom/2-click calibrate (#115, `a6d0d26`, `c26d6a9`); campaign journal (#20, `46dcbb3`).

---

## 3. Deploy reminders (the USER deploys edge functions + migrations — Claude cannot)

- **`parse-character-pdf` — REDEPLOY REQUIRED.** The lineage-preservation + skills/background prompt changes need `supabase functions deploy parse-character-pdf`. Uses the existing `OPENAI_API_KEY` secret (no new secrets). Until deployed, PDF import won't reflect the latest parsing.
- **`generate-image`** — no change needed; avatar/backdrop fixes are client-side. Note the ~150s Supabase wall-clock: `quality:"medium"` is the safe tier for tokens/portraits; `high` at 1536 can time out.
- **Migrations** — 0031–0034 (public library/maps/characters, scene map transform) were applied earlier this session per the user. `supabase/migrations/_APPLY_ALL_PENDING.sql` exists as a convenience.
- The app also auto-generates a character backdrop on creation (fire-and-forget) and requires the `map-images` storage bucket + its upload policy for uploads (avatar/map/token upload all share it).

---

## 4. Product / design direction (the biggest open value — READ THIS)

Late in the session the work pivoted from features to a **design vision**. Full detail is in the memory notes; summarized here.

### 4a. Alchemy-inspired cinematic/glass UI redesign
Researched Alchemy RPG VTT live (Chrome extension). **Artifacts (saved on claude.ai):**
- UI audit: https://claude.ai/code/artifact/25557bb7-531c-482d-8a81-77a5bbc4fdad
- Redesign mockup of The Table mid-combat: https://claude.ai/code/artifact/f2ecf5f8-5b83-4652-987d-bab523dd945c

Key findings & target: frosted **glass tiered by mode** (near-vapor over a scene, firmer over a map), a full **circular/pill** control language, **one gold accent = state**, **tracked-uppercase labels**, a floating **glass dice tray**, a **vignette overlay**, and scenes as **looping video** (Alchemy's backdrop is an animated WebM, not a still).
**Guardrail (user's explicit steer): re-skin + KEEP interactivity — borrow the look, NOT Alchemy's sparseness.** The Table is a functional tactical VTT.
Current-app gap analysis (localhost audit): glass exists but thin (only `.thud`, `.turn-rail-bar`, `.app-header`; blur 6–8px); the app header still renders in `is-immersive` table mode; the board is a static image, bounded with black margins; no dice tray/vignette in play. → memory: **`project_vtt_cinematic_redesign`**.

### 4b. Original scene model (the ownable vision — user's own idea, still exploratory)
- **Per-player free-roam scenes** via an interactive **world-map hub** with clickable POI hotspots — each player has their OWN active scene, enabling split-party parallel roleplay and convergence. Shared-by-default with a DM "lock" for combat; presence per-scene; a "gather party" action. Killer fit for the AI GM (#152) and solo play.
- **Two-layer scenes:** a scene = cinematic backdrop + an optional **top-down floor-plan battlemap of the same location**. Switching to tactical overlays the grid + battlemap with the cinematic art **blurred behind it** (also fixes the black-margin problem). Combat = one ritual: lock party + flip to tactical. Reframes the app **tactical-first → cinematic-first, tactical-on-demand.**
- **Three-layer "map" framing:** navigation map (hub) vs tactical battlemap (a location's floor plan) vs cinematic (the scene's backdrop). Open research: which battlemaps work, when the nav map appears, how to serve/customize maps for GMs. → memory: **`project_vtt_scenes_concept`**.

### 4c. IA optimization proposal (PENDING deliverable)
User asked for an information-architecture proposal for the VTT chrome; research done (Alchemy popups) but the proposal isn't written yet. Principle: **"recede, don't remove" — keep every entry point**, improve skin + grouping + context-sensitivity. Alchemy patterns to adopt: a consistent **control-cluster capsule** (edit/close/reveal), **two modal archetypes** (centered entity card vs full-bleed image + side panel), a **consolidated gear "game menu"** (invite/settings/safety/quit), **scenes as a visual thumbnail gallery**, and **first-class Safety Tools**. Open: whole-chrome vs rail-first. → memory: **`project_vtt_ia_proposal`**.

### 4d. Handout generator (new feature idea, decisions locked)
A Resources tool (sibling to Token Studio) producing themed handouts (letters, menus, shop lists, price lists…). **Key:** handouts are text-first → **template + content → rendered** (NOT raw image-gen, which garbles text). Content source = **both** AI-authored + pulled from SRD data (shops from the items dataset with real prices). **Full template library up front.** → memory: **`project_vtt_handout_generator`**.

> **Memory notes location:** `/Users/gerardovinces/.claude/projects/-Users-gerardovinces-Downloads-PHB-Agent/memory/` (indexed in `MEMORY.md`). Files: `project_vtt_cinematic_redesign`, `project_vtt_scenes_concept`, `project_vtt_ia_proposal`, `project_vtt_handout_generator`, plus older `project_vtt_char_creation`, `project_vtt_image_generation`, `project_icon_library_integration`.

---

## 5. Product concepts backlog (parked ideas, discussion-first)

These were logged as todos earlier (numbers from the task system, see §6 caveat):
- **#152 — AI Game Master** for solo / GM-less groups: AI drives narrative, rules, encounters, content; tool-calls into the app (spawn monsters, start combat, generate maps, write journal); modes = solo + GM-less. **The umbrella feature** — #9 (cartographer-as-tool) is a subset. Threads through the scene model (§4b).
- **#153 — Fog of war, StarCraft-style:** soft feathered edges + tiered (unexplored/explored-dim/in-sight). Builds on the existing DM-painted cell fog (`useFog`).
- **#154 — In-game chat** for players + DM (per-game realtime, persisted; unify with the dice/game log).
- **#155 — GM handout tool** (create/manage/reveal images, maps, notes to players). The *reveal* half; the handout generator (§4d) is the *create* half.
- **#156 — Interactive puzzles** (combination locks, rune order, ciphers, skill-check locks) shared as handouts.
- **#157 — Cinematic UI direction** (== §4a).

---

## 6. Open backlog (numbered tasks) + caveat

**⚠️ The task/todo MCP server disconnected mid-session**, so the live numbered backlog (`TaskCreate`/`TaskList`) is currently unavailable to Claude. A session/app restart should reconnect it. This file + the memory notes are the durable capture until then.

Open / not-done:
- **#9** — expose the cartographer as a tool the AI DM can call (subset of #152).
- **#123** — statblock sheet re-skin: first pass shipped, **awaiting your visual review / dial-in**.
- **#142** — licensed bestiary artwork — **PARKED; do NOT commit licensed art.**
- **#152–#157** — the product concepts in §5 (discussion-first).
- Handout generator (§4d) — decisions locked, not built.

Done this session: #16, #97, #110, #148, #158 (+ the earlier-session set).

---

## 7. Recommended next actions (pickup order)

1. **Deploy `parse-character-pdf`** (§3) so PDF-import lineage/skills/background land server-side.
2. **Review #123** (the statblock sheet) and send dial-in notes, or approve.
3. **Redesign build order** (from the audit punch list, low→high effort): (a) **glass dice tray**, (b) **one-gold + tracked-label token pass**, (c) **two-mode toggle (cinematic⇄tactical)** starting on the projector, (d) **tiered glass primitive on the HUD**, (e) ambient audio + transitions + Zen. Quick immersion win: **hide the app header + go edge-to-edge in table mode** (the `is-immersive` hook already exists).
4. **Write the IA proposal** (§4c) — the user asked for it; research is done.
5. Continue the **scenes/maps design discussion** (§4b) before committing to a design concept (user is still adding ideas).

---

## 8. Technical reference

- **Run/build:** `npm run dev` (Vite; Vite may bump 5173→5174 if 5173 is taken). Typecheck: `npx tsc -p tsconfig.app.json --noEmit`. Build: `npx vite build`. Local Node runs the app; Python is 3.9.6 (avoid 3.10+ syntax in any scripts).
- **Edge functions** (`supabase/functions/`): `apply-hp`, `generate-image`, `generate-statblock`, `parse-character-pdf`. Deno + OpenAI; the **user deploys** them (`supabase functions deploy <name>`), Claude cannot. Pattern: CORS + auth-check + OpenAI chat-completions with `response_format: json_object`.
- **Key data** (`public/data/`): `classes.json`, `species.json` (now with `lineages`), `backgrounds.json` (16), `spells.json` (339), `feats.json` (23), `bestiary.json`, `tables.json`.
- **Key libs** (`src/lib/`): `characterBuilder.ts` (BuilderState, buildCharacter, importedToBuilderState, quickBuild helpers), `quickBuild.ts`, `lineage.ts` (applyLineage), `spellcasting.ts` (sorceryPoints, castingAbility, slots), `startingEquipment.ts`, `pdfImport.ts`, `classArt.ts` (generateCharacterPortrait/Background), `itemSpellGrants.ts`.
- **Key components:** `TableCanvas.tsx` (the VTT board — big), `TableHud.tsx` (BG3 action HUD + Quicken toggle + initiative), `CharacterSheet.tsx` + `TopBar`/`AbilityScores`/`Skills`/`Proficiencies`/`SpellsPanel`/`FeaturesPanel`, `CharacterBuilder.tsx`, the create-method + Quickbuild + Import screens, `CreatureSheet.tsx` (the statblock the #123 skin mirrors).
- **State:** `useRoster`, `useCharacter`, `useScenes`, `useTokens`, `useInitiative`, `useFog`, `useTokenAssets`, `DiceLog`, `Rules`.
- **Conventions:** commit per slice, push to `main`. SRD content: **paraphrase, no verbatim PHB/DMG/MM text** (repo is MIT-licensed, public GitHub). Co-author trailer used on commits.

---

*Generated as a session handoff. If resuming in a fresh session: the memory notes (§4) will auto-recall the design direction; this file is the exhaustive record.*
