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
5. **E — Thrown weapons**: fix `attackAbility` misreading thrown STR weapons as DEX
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
7. **G — Ready**: the trigger is NARRATIVE, so the release stays human; the
   rest is systematic. Take Ready → spend the Action, type the trigger (free
   text) + pick the response (an attack tile, or move) → token gains a
   `Readying` chip with the trigger as its hover label + the tile wears the
   spinning ring (F). The Reaction is earmarked: spending it elsewhere (OA,
   Shield) auto-cancels the ready. Tap the chip = the human trigger call →
   consumes the Reaction and launches the readied flow off-turn. Unreleased at
   the start of your next turn → auto-clears (F's start-of-turn hook).
   Readied SPELLS (v2): slot spent at ready time, the hold occupies
   concentration ("held Fireball"), break = wasted, release = cast free.
8. Later: forced movement, buff mechanics for the rest of the catalog (Bless
   d4, Haste extra action), concentration→effect teardown, timed durations,
   grapple/shove contests, DM "call for a check" (out-of-combat DC flow).

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
