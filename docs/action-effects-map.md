# Action Effects Map

The taxonomy behind systematic combat (#conditions follow-up). Every action in
5e decomposes into four independent axes — **Effect × Delivery × Shape ×
Duration** — plus optional **riders**. "Area" is not an effect; it's a shape
that any effect can ship in.

## 1 · Effects (what an action does)

| Effect | Examples | In the app today |
|---|---|---|
| **Damage** | Longsword, Fire Bolt, Fireball | ✅ `AttackSpec.damage` |
| **Healing** | Cure Wounds, Healing Word, potion | ✅ `heal` (targeted) |
| **Temp HP** | Heroism, False Life | ❌ (buff chip only) |
| **Condition (debuff)** | Hold Person → paralyzed, Web → restrained | ✅ `condition` + save flow |
| **Buff** | Bless, Haste, Shield of Faith | ⚠️ chip only — no mechanical hook yet |
| **Cleanse** | Lesser Restoration, antitoxin | ✅ `cleanse` |
| **Forced movement** | Thunderwave push, shove | ❌ |
| **Self movement** | Misty Step, Dash | ✅ `move` / Dash economy |
| **Create zone/object** | Web, Wall of Fire, Spiritual Weapon | ✅ `placeArea` (zones); ⚠️ summons = plain tokens |
| **Resource/economy** | Haste extra action, Action Surge | ⚠️ Action Surge ✅; Haste's extra action ❌ |
| **Information/utility** | Detect Magic, Light | ✅ falls to announce (correct) |

## 2 · Delivery (how it lands)

| Delivery | Examples | In the app |
|---|---|---|
| **Attack roll** (to-hit vs AC) | weapons, Fire Bolt | ✅ targeting → to-hit |
| **Saving throw** | Fireball (DEX), Hold Person (WIS) | ✅ `SaveRequest` (defender rolls on their client) — but **only wired for `condition` spells; save-for-damage still toasts** ❌ |
| **Auto-hit** | Magic Missile | ✅ `autoHit` |
| **Contest** (opposed checks) | grapple, shove, pickpocket | ⚠️ Steal ✅ (SoH vs passive Perception); grapple/shove ❌ |
| **Willing/touch** | heals, buffs on allies | ✅ targeting without to-hit |

## 3 · Shape (who it can hit)

| Shape | Examples | In the app |
|---|---|---|
| **Single target** | most attacks/saves | ✅ |
| **Multi-target discrete** | Magic Missile darts, Scorching Ray | ⚠️ darts modeled as one target |
| **Area — instant burst** (cone/sphere/line/cube) | Fireball, Cone of Cold, breath | ⚠️ aimed VFX + announced save; **no who's-inside detection** |
| **Persistent zone** | Web, Wall of Fire, Grease | ✅ `placeArea` tokens |
| **Self / aura** | Shield, Spirit Guardians | ⚠️ self ✅; auras ❌ |

## 4 · Duration (how long it holds)

| Duration | Examples | In the app |
|---|---|---|
| **Instant** | damage, healing | ✅ |
| **Until shake-off save** | Hold Person repeat save | ✅ encoded `paralyzed@WIS:13`, auto end-of-turn |
| **Concentration-bound** | Web, Bless, Haste | ⚠️ caster's concentration tracked; **breaking it doesn't clear the effect on targets** ❌ |
| **Timed (rounds/minutes)** | Bless 1 min | ❌ no round-count expiry |
| **Until removed** | curses | ✅ (condition with no save) |

## 5 · Riders (compound actions)

| Rider | Examples | In the app |
|---|---|---|
| **Damage + condition on failed save** | Poison Spray variants, breath + prone | ❌ save is either/or today |
| **Condition on HIT** | ghoul claw → paralyze save, snake venom | ❌ `MonsterAction` has no condition fields |
| **Damage + forced move** | Thunderwave | ❌ |

## Out of combat

| Kind | Examples | In the app |
|---|---|---|
| **Ability check vs DC** | Perception, lockpicking, Persuasion | ⚠️ Examine's check flow ✅ (DM narrates); no general "DM calls for a check with a DC" |
| **Contest** | Stealth vs Perception, pickpocket | ✅ Steal only |
| **Utility/social performance** | Performance, rituals | ✅ announce is right |
| **Interaction** | loot, examine, travel | ✅ systematic |
| **Rest** | short/long | ✅ on the sheet |

## Build order (agreed direction)

1. ~~**A — Save-for-damage targets properly**~~ ✅ DONE (acb1a58). Single-target
   save spells target + fire a damage save; the defender rolls on their client.
2. ~~**B — AoE saves aim**~~ ✅ DONE (c9ac707 + review fixes 29bd999). Fireball
   sphere / Lightning Bolt line / Thunderwave cube aim their true footprint;
   who's-inside is auto-detected; each caught creature rolls its own save.
3. ~~**C — Monster save actions**~~ ✅ DONE (389a8d8). Breath weapons parse
   DC/damage/shape from statblock text and run through the aim/save flow.
4. ~~**D — Condition riders on hits**~~ ✅ DONE (22b54d0). Ghoul claw → paralyze
   save, chain → grapple; parsed from attack text, applied on a confirmed hit.
   NOTE: damage+condition combos where a hit ALSO carries a secondary DAMAGE
   save (Giant Spider bite, Bone Devil sting) are not yet modelled — the main
   damage + the condition rider fire, but the extra poison-damage save doesn't.
5. ~~**E — Thrown weapons**~~ ✅ DONE (9a5a4d1) and ~~**F — Dodge**~~ ✅ DONE
   (44b6e5c) — details below kept for the record.
   **E**: fix `attackAbility` misreading thrown STR weapons as DEX
   (javelin); weapons with the thrown property get split Melee (5 ft) / Throw
   (20/60) tiles; a throw CONSUMES the item — removed from inventory (its tile
   vanishes, since tiles derive from inventory), lands at the target's cell hit
   or miss as a ground-pickup loot token; walking adjacent + Loot returns it
   (qty stacks decrement; anyone — including enemies — can grab it). Ammo
   weapons exempt; a generic "Improvised throw" (1d4, 20/60) later.
6. **F — Dodge + the first buff-mechanics hooks** (pilot for mechanical buffs):
   a Dodge action tile spends the Action and applies the `Dodging` buff; while
   the buff is live the tile wears a SPINNING BORDER (`is-active-effect` hotbar
   state, driven by token.buffs so it survives reloads and stops exactly when
   the buff clears at the start of your next turn; reduced-motion → steady
   glow). Mechanics: incoming attacks vs a Dodging target roll at disadvantage
   (unless target incapacitated / speed 0); DEX SaveRequests pre-select
   advantage on the defender's dialog. These two hooks are the same rails
   Bless/Bane/Blur/Shield of Faith plug into later.
7. ~~**G — Ready**~~ ✅ DONE (c071256). Detail kept below for the record.
   **G — Ready**: the trigger is NARRATIVE, so the release stays human; the
   rest is systematic. Take Ready → spend the Action, type the trigger (free
   text) + pick the response (an attack tile, or move) → token gains a
   `Readying` chip with the trigger as its hover label + the tile wears the
   spinning ring (F). The Reaction is earmarked: spending it elsewhere (OA,
   Shield) auto-cancels the ready. Tap the chip = the human trigger call →
   consumes the Reaction and launches the readied flow off-turn. Unreleased at
   the start of your next turn → auto-clears (F's start-of-turn hook).
   Readied SPELLS (v2): slot spent at ready time, the hold occupies
   concentration ("held Fireball"), break = wasted, release = cast free.
**All seven planned slices (A–G) are shipped.** Remaining backlog:
8. Later: forced movement, buff mechanics for the rest of the catalog (Bless
   d4, Haste extra action) — F's two hooks (incoming-attack mode, save-dialog
   initialMode) are the rails; concentration→effect teardown, timed durations,
   grapple/shove contests, DM "call for a check" (out-of-combat DC flow).
   Ready v2: readied SPELLS (slot spent at ready, hold = concentration) +
   auto-cancel a ready when the Reaction is spent elsewhere (an OA).
   Thrown v2: improvised "throw anything" (1d4, 20/60); player-side pickup of
   a dropped weapon verified in a real player session.
   Damage+condition combo saves (Giant Spider bite's secondary poison save).

## Save-relay hardening (pre-existing, surfaced by the A/B review)

The cross-client save relay predates slices A/B; they widened its traffic.
Confirmed issues to fix in a dedicated pass:
- **Orphaned requests**: a pending save whose target token is deleted (or
  whose defender never received the broadcast — reload, late join) can never
  be resolved or dismissed; the DM "Pending saves" chip sticks until reload.
  Needs: prune on token delete + a dismiss affordance + (ideally) persistence.
- **Double resolution race**: the defender's own dialog and the DM's
  on-behalf roll can both complete within the dice-animation window → damage
  applies twice. Needs idempotency (check the request is still pending before
  applying; claim-then-roll).
- **On-behalf rolls with missing sheets**: when the DM rolls for an absent
  player whose sheet isn't in the DM's roster, the save uses +0 and empty
  defenses (a fire-resistant PC takes full Fireball). Needs vitals (save
  bonuses + defenses) mirrored onto the token like HP already is.

## Slice H — Hide (per-viewer visibility) — DESIGN, not yet built

Hide is different from A–G: those were shared state everyone sees identically.
Hide introduces **per-viewer visibility** — the same board renders differently
per client. This is the seed of a broader vision/fog system, and several other
things reuse the machinery (see "falls out for free").

### The visibility model (the novel part)
Today: `visibleTokens = isDM ? all : tokens.filter(!hidden)`. Two hidden
concepts must coexist, with OPPOSITE audiences:
- `t.hidden` (existing DM tool): visible to the DM only (translucent), players
  see nothing.
- **stealth-hidden** (new, the Hide action): visible to the OWNER only
  (translucent); everyone else — other players AND the DM — sees nothing.

Unify behind one per-viewer predicate `canView(t, me)`:
- DM-hidden → only the DM.
- stealth-hidden → only the token's controller (owner of character_id; DM for
  a monster it hid).
- otherwise → everyone.
A token you can see but that is hidden-to-you-normally renders translucent.
Client-side only — each client already knows isDM + ownedCharacterIds.

### Resolution (the contest)
In combat, on Hide: roll the hider's Stealth ONCE, compare to each OBSERVER's
range-adjusted passive Perception. Observers = the opposing side (disposition).
Range bands (our numbers, like loot — SRD has no passive-at-range table):
- near (≤ 30 ft): passive Perception as-is.
- far (30–60 ft): passive − 5 (disadvantage to notice).
- very far (> 60 ft): auto-fails to notice — ignored.
Binary result (v1): hidden only if the roll beats EVERY observer who could
notice; otherwise the hide FAILS and nothing happens. All logged. (Per-observer
partial hiding — hidden from A, seen by B — is a v2.)

### Reveal triggers (SRD)
Stealth-hidden clears when the hider attacks, casts a spell (verbal), or
otherwise reveals — hook the actor's own resolveAttack / cast (2024 also ends
it at the end of your next turn). Attacking FROM hidden gets advantage (unseen
attacker) on that attack, THEN reveals.

### Out of combat
Same contest, re-checked over time: on the hidden token's MOVE (moving near an
enemy risks detection) plus a slow interval tick. Single-writer = the owner's
client.

### Falls out of the same machinery ("similar actions")
- **Invisibility / Greater Invisibility** (spells): same per-viewer visibility;
  regular breaks on attack (like Hide), Greater doesn't.
- **Search action**: the counter — active Perception vs the hider's (frozen)
  Stealth; success reveals the hidden token to that searcher.
- **Unseen attacker/target**: advantage attacking while unseen, disadvantage
  attacking a target you can't see — reuse the `invisible` condition's combat
  mods (needs new EFFECTS fields: selfAttackAdvantage, attackersDisadvantage;
  `invisible` is in the name list today but has NO EFFECTS entry yet).

### Decisions (locked)
1. DM keeps a FAINT GHOST of a hidden token (last-known marker) — the hider
   sees their translucent token, other players see nothing, the DM sees a faint
   non-interactive ghost so they can still run the scene.
2. Observers = ENEMIES only (disposition hostile). Bands: ≤30 ft passive as-is,
   30–60 ft passive −5, >60 ft can't notice.
3. Out of combat: re-check on the hider's MOVE + a ~6s interval.

### Build phases
- ~~P1–P3~~ ✅ DONE (a6c5b5e). Per-viewer visibility (viewLevel none/ghost/dim/
  full; stored as a `Hidden::<stealth>` buff), the in-combat Stealth contest,
  and reveal-on-attack + unseen-attacker advantage. Verified DM-seat; owner
  translucent view + true multi-client hiding still to confirm from a player
  seat. The DM's ghost is selectable (a last-known marker) but not targetable.
- ~~P4~~ ✅ DONE (79129d7). Out-of-combat recheck: on the hider's move + a ~6s
  interval (off during combat), owner's client re-tests the FROZEN Stealth and
  reveals a now-spotted hider. Verified live.
- ~~P5 Search~~ ✅ DONE (4f21035). Search on both HUDs (active Perception vs a
  hidden foe's frozen Stealth within 60 ft → reveal); Hide + Search added to
  the monster HUD (ambush / guards). Targeting guard: can't target a hidden
  creature you don't control. Verified: a Priest's Search rolled 16 ≥ Stealth
  15 → "finds Drashk". NOTE: DM-ghost render + targeting-refusal apply only to
  tokens the DM doesn't control (a player's PC) — solo the DM controls all, so
  those paths need a 2-seat session to see (correct by construction).

**Hide (H1–H5) is complete.** Remaining, genuinely separate follow-ons:
- Invisibility / Greater Invisibility spells — reuse the per-viewer visibility
  layer (regular breaks on attack like Hide; Greater doesn't). A spell feature,
  not part of Hide.
- 2-seat verification of the owner-translucent + DM-ghost + enemy-can't-see
  views, and the targeting-refusal, from a real player account.

Original phase notes kept below.
- P1 — Visibility foundation: per-token `viewLevel(t) → none|ghost|dim|full`
  (DM-hidden = DM dim / players none; stealth-hidden = owner dim / DM ghost /
  others none; else full). State stored as a buff `Hidden::<stealthTotal>`
  (no migration — rides token.buffs; owner sees a gold chip; freezes the
  Stealth roll for later Search). Verify with a manual toggle.
- P2 — Hide action (in combat): the tile rolls Stealth once vs each hostile
  observer's range-adjusted passive Perception; beat all who can notice →
  apply Hidden buff; else fail. All logged.
- P3 — Reveal + combat: attacking/casting clears Hidden (the actor's own
  client); attacking FROM hidden gets advantage (unseen attacker) on that
  attack, then reveals.
- P4 — Out of combat: recheck on move + ~6s interval (owner's client writes).
- P5 (later): Search (active Perception vs frozen Stealth), Invisibility spells
  reuse the same visibility layer.
