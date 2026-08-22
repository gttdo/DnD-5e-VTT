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

1. **A — Save-for-damage targets properly** (Sacred Flame, Poison Spray… → save request `onFail:"damage"`, half/none on save). Kills the worst toasts.
2. **B — AoE saves aim** like Cone of Cold (Fireball sphere, Lightning Bolt line); DM adjudicates who's inside for now.
3. **C — Monster save actions** use their `saveDc`/`saveAbility` (breath weapons stop toasting).
4. **D — Riders**: `MonsterAction.condition*` fields + parser ("…or be paralyzed"), damage+condition saves.
5. Later: who's-inside area detection, forced movement, buff mechanics (Bless d4, Haste action), concentration→effect teardown, timed durations, grapple/shove contests, DM "call for a check" (out-of-combat DC flow).
