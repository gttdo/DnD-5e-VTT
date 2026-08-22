import { useEffect, useMemo, useRef, useState } from "react";
import { useDismiss } from "../lib/useDismiss";
import type { Character, Attack, InventoryItem, Feature } from "../types/character";
import { resolveAttacks, damageLabel } from "../lib/attacks";
import { damageRoll, saveRoll, type RollEntry, type RollTone, type AttackSpec } from "../lib/rolls";
import { spellMech, scaleCantrip, upcastDamage, dartDamage } from "../lib/spellMechanics";
import { itemSpellGrant } from "../lib/itemSpellGrants";
import { attackBonus, damageBonus, formatMod, abilityModFor, proficiencyBonus } from "../lib/calc";
import { applyDamage, applyHeal } from "../lib/hp";
import { casterClass, slotsFor, spellAttackBonus, spellSaveDC, castingAbility, sorceryPoints, QUICKEN_COST } from "../lib/spellcasting";
import { aggregateConditions, conditionName, conditionGlyph, parseCondition } from "../lib/conditions";
import { buffGlyph, buffNote, buffIsGood, buffName, isReadying, encodeReadying, parseBuff, isStealthHidden } from "../lib/buffs";
import type { MonsterStatblock } from "../types/content";
import { useRules } from "../state/Rules";
import { SheetDrawer } from "./SheetDrawer";
import { CreatureSheet } from "./CreatureSheet";
import { parseMonsterSpellcasting } from "../lib/monsterSpells";
import { parseSaveAction, parseHitRider } from "../lib/monsterActions";
import { Icon, type IconName } from "./ui/Icon";
import { GameGlyph } from "./ui/GameGlyph";

/**
 * The in-game HUD dock — a creature's dice, on the board.
 *
 * Bound to whatever character the selected token represents. Every action here
 * is a roll routed through lib/rolls and out to the whole table (the parent
 * hands us `onRoll`, which logs + blooms + broadcasts). Nothing owns data: the
 * attacks come from the sheet's equipped weapons (resolveAttacks), HP and
 * conditions read straight off the character. This is a new *surface* on the
 * sheet, not a copy of it.
 *
 * Lives inside .table-board, whose left edge already starts right of the tool
 * rail — so the dock can never collide with the tools (that was the whole point
 * of anchoring it here rather than to the shell).
 */

const initialsOf = (name: string): string =>
  name.trim().split(/\s+/).slice(0, 2).map((w) => w[0]?.toUpperCase() ?? "").join("") || "?";

/** Per-turn action economy for the selected creature (shown only in combat). */
export interface EconomyView {
  /** Main actions SPENT this turn (a count — 0..mainMax, for Multiattack). */
  action: number;
  bonus: boolean;
  reaction: boolean;
  moveUsed: number;
  speed: number;
}
type EconKey = "action" | "bonus" | "reaction";

// The token's statuses as a compact icon strip (#user ask — HUD, not on the
// token). Conditions (red) + buffs (gold) as glyph chips with a hover label.
// Rendered in every HUD so clicking any token shows what's on it.
const StatusStrip = ({
  conditions = [],
  buffs = [],
  onReleaseReady,
}: {
  conditions?: string[];
  buffs?: string[];
  /** Slice G: makes THIS strip's Readying chip tappable — the human trigger
   *  call that releases the held action. Only the owner's HUD passes it. */
  onReleaseReady?: (entry: string) => void;
}) => {
  if (conditions.length === 0 && buffs.length === 0) return null;
  const incap = aggregateConditions(conditions).incapacitated;
  const chip = (key: string, glyph: string | null, label: string, good: boolean, tip: string, onClick?: () => void) =>
    onClick ? (
      <button key={key} className="thud-status is-buff is-tappable" title={tip} onClick={onClick} aria-label={tip}>
        {glyph ? <GameGlyph src={glyph} size={16} className="thud-status-ico" /> : <span className="thud-status-txt">{label.slice(0, 3)}</span>}
      </button>
    ) : (
      <span key={key} className={`thud-status ${good ? "is-buff" : "is-cond"}`} title={tip}>
        {glyph ? <GameGlyph src={glyph} size={16} className="thud-status-ico" /> : <span className="thud-status-txt">{label.slice(0, 3)}</span>}
      </span>
    );
  return (
    <div className={`thud-statuses ${incap ? "is-incap" : ""}`} aria-label="Statuses">
      {conditions.map((c) => {
        const pc = parseCondition(c);
        const tip = pc.save && pc.dc != null ? `${pc.name} · ${pc.save} save DC ${pc.dc}` : pc.name;
        return chip(`c:${c}`, conditionGlyph(pc.name), pc.name, false, tip);
      })}
      {buffs.map((b) => {
        const nm = buffName(b);
        const tip = buffNote(b) ? `${nm} — ${buffNote(b)}` : nm;
        const release = onReleaseReady && isReadying(b) && !incap ? () => onReleaseReady(b) : undefined;
        return chip(`b:${b}`, buffGlyph(b), nm, buffIsGood(b), tip, release);
      })}
    </div>
  );
};

/**
 * Ready declaration (slice G): type the trigger and pick the held response.
 * The trigger is narrative (no engine can detect "when the goblin steps out"),
 * so it's free text; the response is one of your attack tiles (or Move). Tiny
 * inline card over the HUD.
 */
const ReadyPrompt = ({
  attacks,
  onCancel,
  onConfirm,
}: {
  attacks: { id: string; name: string }[];
  onCancel: () => void;
  onConfirm: (attackId: string, trigger: string) => void;
}) => {
  const [trigger, setTrigger] = useState("");
  const [attackId, setAttackId] = useState(attacks[0]?.id ?? "");
  return (
    <div className="ready-prompt" role="dialog" aria-label="Ready an action">
      <div className="ready-prompt-h">Ready an action</div>
      <label className="ready-prompt-l">
        When…
        <input
          className="ready-prompt-in"
          autoFocus
          placeholder="the goblin steps out from cover"
          value={trigger}
          onChange={(e) => setTrigger(e.target.value)}
          onKeyDown={(e) => { if (e.key === "Enter" && attackId) onConfirm(attackId, trigger.trim()); }}
        />
      </label>
      <label className="ready-prompt-l">
        …I will
        <select className="ready-prompt-sel" value={attackId} onChange={(e) => setAttackId(e.target.value)}>
          {attacks.map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}
          {attacks.length === 0 && <option value="">(no attack ready)</option>}
        </select>
      </label>
      <div className="ready-prompt-btns">
        <button className="ghost" onClick={onCancel}>Cancel</button>
        <button className="primary" disabled={!attackId} onClick={() => onConfirm(attackId, trigger.trim())}>Ready</button>
      </div>
    </div>
  );
};

/** Remaining spell slots for one level, for the resource strip's pips. */
export interface SlotView {
  level: number;
  max: number;
  used: number;
}

/** The active action-economy tab: a glyph category, or a spell level (number). */
export type ActionTab = "main" | "bonus" | "cantrip" | "reaction" | "items" | number;

const NUM_WORD: Record<string, number> = { one: 1, two: 2, three: 3, four: 4, five: 5, six: 6 };
/** How many attacks a creature's Multiattack grants (its Main-action count).
 *  Parses the Multiattack action's prose ("makes two attacks"); 1 if none. */
const multiattackCount = (actions?: { name: string; text?: string }[]): number => {
  const ma = (actions ?? []).find((a) => /multiattack/i.test(a.name));
  if (!ma) return 1;
  const m = /\b(one|two|three|four|five|six|\d+)\b/i.exec(ma.text ?? "");
  if (!m) return 2; // has Multiattack but unparseable → assume two
  const n = NUM_WORD[m[1].toLowerCase()] ?? parseInt(m[1], 10);
  return Number.isFinite(n) && n > 1 ? n : 2;
};

const ROMAN = ["", "I", "II", "III", "IV", "V", "VI", "VII", "VIII", "IX"];

/**
 * A limited-use class feature surfaced on the resource strip as a spendable
 * TRACKER (Rage, Ki, Channel Divinity, Action Surge…). Unlike a glyph/slot it
 * doesn't filter the action area — it only counts down, and clicking it spends
 * a charge (plus, in combat, whatever action economy the feature costs).
 */
export interface ResourceView {
  id: string;
  label: string;
  current: number;
  max: number;
  /** Action economy activating it costs ("none" = free/passive, e.g. Action Surge). */
  econ: EconKey | "none";
  /** True when it can't be spent right now (no charges, incapacitated, econ exhausted). */
  disabled: boolean;
}

/**
 * What activating a class feature costs and does. Heuristic keyed on the
 * feature's name — covers the common 2024 activated features; an unrecognized
 * limited-use feature defaults to costing an action (the safe assumption for
 * "use it on your turn" powers). `special` layers an extra effect on top of the
 * charge+economy spend: Action Surge grants a second main action, Second Wind
 * heals.
 */
const featureEcon = (name: string): { econ: EconKey | "none"; special?: "extraMain" | "heal" } => {
  const n = name.toLowerCase();
  if (/action surge/.test(n)) return { econ: "none", special: "extraMain" };
  if (/second wind/.test(n)) return { econ: "bonus", special: "heal" };
  if (/\brage\b|cunning action|bardic inspiration|patient defense|step of the wind|flurry of blows|healing word|font of|relentless|vow of enmity/.test(n))
    return { econ: "bonus" };
  if (/riposte|deflect|as a reaction/.test(n)) return { econ: "reaction" };
  // Channel Divinity, Wild Shape, Lay on Hands, Breath Weapon, and the rest.
  return { econ: "action" };
};

/** Short label for a tracker chip — the BG3 numeral badge carries the count. */
const abbrevResource = (name: string): string => {
  const first = name.trim().split(/\s+/)[0] ?? name;
  return first.length > 5 ? first.slice(0, 4) : first;
};

/**
 * Parse a monster action's recharge from its name — "Fire Breath (Recharge
 * 5–6)" or "(Recharge 6)". Returns the LOW end of the range: a d6 at the start
 * of the creature's turn that rolls ≥ this recharges the ability. Null if the
 * action has no recharge (it's always available).
 */
const rechargeThreshold = (name: string): number | null => {
  const m = /\(recharge\s+(\d)(?:\s*[–-]\s*\d)?\)/i.exec(name);
  return m ? parseInt(m[1], 10) : null;
};
/** The action name without its "(Recharge …)" suffix, for a clean button label. */
const stripRecharge = (name: string): string => name.replace(/\s*\(recharge[^)]*\)/i, "").trim();
/** Human recharge range — "6" for a single value, "5–6" for a range up to 6. */
const rechargeLabel = (threshold: number): string => (threshold >= 6 ? "6" : `${threshold}–6`);

/** The turn economy a spell's casting time consumes. */
export type SpellEcon = "action" | "bonus" | "reaction" | "long";
/**
 * Classify a spell's `casting_time` string (from spells.json) into the economy
 * it spends. Drives which glyph a spell consumes so a Bonus-Action spell
 * (Healing Word, Misty Step) no longer eats the main action. "long" is anything
 * measured in minutes/hours (rituals, exploration utility) — not a single
 * turn's action.
 */
const spellEconomy = (castingTime?: string): SpellEcon => {
  const t = (castingTime ?? "").trim().toLowerCase();
  if (t.startsWith("bonus action")) return "bonus";
  if (t.startsWith("reaction")) return "reaction";
  if (!t || t.startsWith("action")) return "action"; // incl. "Action or Ritual"
  return "long"; // "1 minute", "10 minutes", "1 hour", "8 hours"…
};
/** Compact tile caption for a spell's economy (fits the 82px hotbar tile). */
const spellEconLabel = (e: SpellEcon): string =>
  e === "bonus" ? "bonus" : e === "reaction" ? "reaction" : e === "long" ? "ritual" : "action";

// D&D-library glyphs for the icon-first hotbar tiles (public/icons/actions).
// Each action reads by silhouette instead of a text name (BG3-style), so the
// mapping has to be specific — a bow is not a sword. Falls back to attack_melee.
const glyphSrc = (file: string) => `/icons/actions/${file}.svg`;
const RANGED_RE = /bow|crossbow|sling|blowgun|dart|blaster|pistol|musket|rifle|firearm/;
const THROWN_RE = /handaxe|javelin|trident|light hammer|dagger|spear|net|throw/;
/** Pick the attack-type glyph for a weapon attack. */
const attackGlyph = (atk: Attack): string => {
  const n = atk.name.toLowerCase();
  if (n.includes("unarmed") || n.includes("fist")) return glyphSrc("attack_unarmed");
  if (RANGED_RE.test(n)) return glyphSrc("attack_ranged");
  // Thrown weapons carry a split range ("20/60"); a plain "5 ft" reach is melee.
  if (THROWN_RE.test(n) && (atk.range?.includes("/") ?? false)) return glyphSrc("attack_thrown");
  return glyphSrc("attack_melee");
};
/** Glyph for a statblock action by its name — melee/ranged for a to-hit action,
 *  a generic "special ability" mark otherwise. */
const actionGlyphByName = (name: string, isAttack: boolean): string =>
  isAttack ? glyphSrc(RANGED_RE.test(name.toLowerCase()) ? "attack_ranged" : "attack_melee") : glyphSrc("action_magic");

/**
 * The always-visible tile caption. A to-hit line ("+5 · 1d6+2") reads at a
 * glance and stays; a bare economy word ("action", "bonus") is useless as the
 * only label, so those tiles show the action's NAME instead (the full name +
 * economy is still on hover). Stat lines are what `formatMod` produces, so they
 * always start with a sign.
 */
const tileCaption = (name: string, sub: string): string => (/^[+\-−]/.test(sub) ? sub : name);

/**
 * BG3-style turn-resource strip (combat only): glyph shapes read at a glance —
 * ▪ Action, ▲ Bonus, ● Reaction (dim when spent) — plus a draining movement
 * bar and spell-slot pips grouped by level. End Turn lives at its end.
 */
const ResourceStrip = ({
  eco,
  slots,
  resources,
  onSpendResource,
  hasCantrip,
  hasReactions,
  hasItems,
  mainMax,
  activeTab,
  onSelectTab,
  onEndTurn,
  endTurnEnabled,
}: {
  /** Null out of combat — the calm variant: tabs only, no economy chrome. */
  eco: EconomyView | null;
  slots?: SlotView[];
  /** Limited-use class features shown as spendable trackers (Rage, Ki…). */
  resources?: ResourceView[];
  onSpendResource?: (id: string) => void;
  hasCantrip?: boolean;
  /** Whether the creature has any reaction options (spells/OA) — enables the tab. */
  hasReactions?: boolean;
  /** Whether the creature holds any charged magic item — enables the Items tab. */
  hasItems?: boolean;
  /** Main actions available this turn (>1 for Multiattack / Action Surge). */
  mainMax?: number;
  /** The glyphs + slot levels act as TABS driving the action area. */
  activeTab?: ActionTab;
  onSelectTab?: (t: ActionTab) => void;
  onEndTurn?: () => void;
  endTurnEnabled?: boolean;
}) => {
  const inCombat = !!eco;
  const speed = eco?.speed ?? 0;
  const remaining = Math.max(0, speed - (eco?.moveUsed ?? 0));
  const movePct = speed > 0 ? (remaining / speed) * 100 : 0;
  const mainN = Math.max(1, mainMax ?? 1);
  const glyph = (shape: "action" | "bonus", label: string, usedCount: number, w: EconKey, tab: ActionTab, pips = 1) => (
    <button
      key={w}
      className={`thud-rs-glyph is-${shape} ${usedCount >= pips ? "is-used" : ""} ${activeTab === tab ? "is-active" : ""}`}
      onClick={() => onSelectTab?.(tab)}
      title={pips > 1 ? `${label} — ${Math.max(0, pips - usedCount)} of ${pips} left (Multiattack)` : label}
      aria-label={label}
    >
      {Array.from({ length: pips }, (_, i) => (
        <i key={i} className={i < usedCount ? "is-spent" : ""} />
      ))}
    </button>
  );
  return (
    <div className={`thud-rs ${inCombat ? "" : "is-calm"}`} role="group" aria-label={inCombat ? "Turn resources" : "Actions"}>
      {glyph("action", "Main action", eco?.action ?? 0, "action", "main", mainN)}
      {glyph("bonus", "Bonus action", eco?.bonus ? 1 : 0, "bonus", "bonus")}
      {/* Third slot: a cantrip (casters) / actionable trait quick-access. */}
      <button
        className={`thud-rs-glyph is-cantrip ${hasCantrip ? "" : "is-empty"} ${activeTab === "cantrip" ? "is-active" : ""}`}
        onClick={() => hasCantrip && onSelectTab?.("cantrip")}
        disabled={!hasCantrip}
        title={hasCantrip ? "Cantrips & trait actions" : "No cantrip or trait action"}
        aria-label="Cantrip or trait action"
      >
        <i />
      </button>
      {/* Reaction: dims once spent this turn; tab lists reaction spells + OA. */}
      <button
        className={`thud-rs-glyph is-reaction ${eco?.reaction ? "is-used" : ""} ${hasReactions ? "" : "is-empty"} ${activeTab === "reaction" ? "is-active" : ""}`}
        onClick={() => hasReactions && onSelectTab?.("reaction")}
        disabled={!hasReactions}
        title={hasReactions ? (eco?.reaction ? "Reaction — used this turn" : "Reaction") : "No reaction options"}
        aria-label="Reaction"
      >
        <i />
      </button>
      {/* Items: spells cast from a magic item's charges (#88). Shown only when the
          creature holds a charged item — a non-caster's one path to spellcasting. */}
      {hasItems && (
        <button
          className={`thud-rs-glyph is-items ${activeTab === "items" ? "is-active" : ""}`}
          onClick={() => onSelectTab?.("items")}
          title="Magic item spells"
          aria-label="Magic item spells"
        >
          <i />
        </button>
      )}
      {inCombat && (
        <span className="thud-rs-move" title={`Movement — ${remaining} of ${speed} ft left`}>
          <span className="thud-rs-move-bar"><i style={{ width: `${movePct}%` }} /></span>
          <b>{remaining} ft</b>
        </span>
      )}
      {(slots ?? [])
        .filter((s) => s.max > 0)
        .map((s) => {
          const body = (
            <>
              <em>{ROMAN[s.level] ?? s.level}</em>
              {Array.from({ length: s.max }, (_, i) => (
                <i key={i} className={i < s.max - s.used ? "" : "is-used"} />
              ))}
            </>
          );
          const title = `Level ${s.level} spells — ${Math.max(0, s.max - s.used)} of ${s.max} slots`;
          return (
            <button
              key={s.level}
              className={`thud-rs-slots is-tab ${activeTab === s.level ? "is-active" : ""}`}
              onClick={() => onSelectTab?.(s.level)}
              title={title}
            >
              {body}
            </button>
          );
        })}
      {(resources ?? []).map((r) => (
        <button
          key={r.id}
          className={`thud-rs-res is-${r.econ} ${r.disabled ? "is-used" : ""}`}
          onClick={() => !r.disabled && onSpendResource?.(r.id)}
          disabled={r.disabled}
          title={
            `${r.label} — ${r.current} of ${r.max} left` +
            (r.econ === "none" ? " · free" : ` · costs a ${r.econ} action`) +
            (r.current > 0 && !r.disabled ? " · click to use" : "")
          }
        >
          <b className="thud-rs-res-n">{r.current}</b>
          <span className="thud-rs-res-l">{abbrevResource(r.label)}</span>
        </button>
      ))}
      {inCombat && onEndTurn && (
        <button
          className="thud-rs-end"
          disabled={!endTurnEnabled}
          onClick={onEndTurn}
          title={endTurnEnabled ? "End this turn" : "Not your turn"}
        >
          End Turn
        </button>
      )}
    </div>
  );
};

interface Props {
  character: Character;
  isDM: boolean;
  /** Highlights the dock when it's this creature's turn. */
  activeTurn?: boolean;
  /** Log + bloom + broadcast a roll. `label` overrides the bloom headline. */
  onRoll: (entries: RollEntry[], opts?: { tone?: RollTone; label?: string }) => void;
  /** Hand an attack to the combat resolver (which asks for a target). */
  onAttack: (spec: AttackSpec) => void;
  /** Declare a no-dice action ("Dash — movement doubles"). */
  onNote: (msg: string) => void;
  /** A movement spell (Misty Step) — the caller picks a destination cell. */
  onMove?: (label: string) => void;
  /** Open a counterspell window for a leveled spell; resolves true if countered. */
  onCounterspellCheck?: (spellName: string, level: number) => Promise<boolean>;
  /** Dash — doubles this turn's movement budget. */
  onDash?: () => void;
  /** Dodge (slice F) — applies the Dodging buff to the token until the start
   *  of its next turn: incoming attacks at disadvantage, DEX saves at adv. */
  onDodge?: () => void;
  /** Ready (slice G) — put the encoded Readying buff on the token (trigger +
   *  held response); the canvas writes it and logs the declaration. */
  onReady?: (buffEntry: string) => void;
  /** Ready release (slice G) — the canvas strips the buff, spends the
   *  Reaction, and logs; the HUD then launches the held attack's targeting. */
  onReleaseReady?: (buffEntry: string) => void;
  /** Hide (slice H) — the canvas rolls Stealth vs hostile observers' passive
   *  Perception and applies the Hidden state on success. */
  onHide?: () => void;
  /** Search (slice H) — the canvas rolls active Perception vs nearby hidden
   *  foes' frozen Stealth and reveals the ones it beats. */
  onSearch?: () => void;
  /** Per-turn action economy (shown only in combat); null hides the strip. */
  economy?: EconomyView | null;
  onSpend?: (which: EconKey) => void;
  /** Advance the turn (combat only; rendered on the resource strip). */
  onEndTurn?: () => void;
  /** False when it isn't this token's turn (button shown but inert). */
  endTurnEnabled?: boolean;
  /** Active conditions on this token — disable actions when incapacitating. */
  conditions?: string[];
  /** Active buffs on this token — shown in the status strip (gold). */
  buffs?: string[];
  /** HP editing, routed to the character row. Null → HP is read-only. */
  hp?: { heal: (n: number) => void; damage: (n: number) => void; setTemp: (n: number) => void } | null;
  /** Close any open game-menu modal (e.g. the region map) — for one-at-a-time. */
  onCloseModal?: () => void;
  /** Persist a mutation to this character — used to spend spell slots on cast. */
  onUpdate?: (mut: (c: Character) => Character) => void;
  // DM-only contextual token controls, folded off the rail into the dock.
  hidden?: boolean;
  onToggleHidden?: () => void;
  onDeleteToken?: () => void;
}

export const TableHud = ({
  character: c,
  activeTurn,
  onRoll,
  onAttack,
  onNote,
  onMove,
  onCounterspellCheck,
  onDash,
  onDodge,
  onReady,
  onReleaseReady,
  onHide,
  onSearch,
  economy,
  onSpend,
  onEndTurn,
  endTurnEnabled,
  conditions,
  buffs,
  hp,
  onCloseModal,
  onUpdate,
}: Props) => {
  const incap = aggregateConditions(conditions ?? []).incapacitated;
  // The Dodge stance is LIVE while the token carries the buff (slice F) —
  // drives the tile's spinning ring, and stops exactly when it's stripped at
  // the start of this creature's next turn.
  const dodging = (buffs ?? []).includes("Dodging");
  const hidden = isStealthHidden(buffs); // slice H — the Hide stance is live
  // Ready (slice G): the held-action stance, and the picker that declares it.
  const readyEntry = (buffs ?? []).find(isReadying);
  const [readyOpen, setReadyOpen] = useState(false);
  const [min, setMin] = useState(false);
  const [hpOpen, setHpOpen] = useState(false);
  // HUD popouts — skills / the sheet drawer. ONE at a time: opening any closes
  // whatever else is up (the map modal also clears this). Spells are no longer a
  // popout — they live in the tabbed action area below.
  const [popout, setPopout] = useState<null | "skills" | "sheet" | "rest">(null);
  const togglePopout = (p: "skills" | "sheet" | "rest") => {
    setPopout((cur) => (cur === p ? null : p));
    onCloseModal?.(); // one surface at a time — also closes the region map
  };
  // Close an open popout (Skills / Rest) on an outside click or Escape. The ref
  // wraps the whole HUD — popouts AND their trigger tabs live inside it — so
  // tapping a tab still toggles, and tapping the board dismisses. The sheet
  // drawer owns its own dismissal, so leave it be.
  const hudRef = useRef<HTMLDivElement | null>(null);
  useDismiss(hudRef, () => setPopout((cur) => (cur === "sheet" ? cur : null)), popout === "skills" || popout === "rest");
  // Which action-economy tab drives the action area: main / bonus / cantrip, or
  // a spell level (number). Resets to main at the start of the token's turn.
  const [actionTab, setActionTab] = useState<ActionTab>("main");
  // Extra main actions granted THIS turn by a feature (Action Surge → +1).
  // Resets at turn start; only counts while in combat.
  const [extraMain, setExtraMain] = useState(0);
  // The bonus-action spell rule (2024): if you cast a spell as a bonus action
  // you can't cast another spell that turn except an action cantrip — and vice
  // versa. Tracks what's been cast this turn to enforce it. Resets at turn start.
  const [spellCastTurn, setSpellCastTurn] = useState<{ leveled: boolean; bonus: boolean }>({ leveled: false, bonus: false });
  // Quickened Spell metamagic (#97): a Sorcerer (L2+) can spend Sorcery Points to
  // cast an Action spell as a Bonus Action. "Armed" means the next eligible spell
  // this player casts is quickened; it auto-disarms after that cast.
  const sp = useMemo(() => sorceryPoints(c), [c]);
  const canQuicken = !!sp && sp.current >= QUICKEN_COST;
  const [quickenArmed, setQuickenArmed] = useState(false);
  const spendSorceryPoints = (n: number) =>
    onUpdate?.((d) => ({ ...d, sorceryPointsUsed: (d.sorceryPointsUsed ?? 0) + n }));
  // DC for the one-click concentration save (10 or half the damage taken).
  const [concDc, setConcDc] = useState(10);
  const [amount, setAmount] = useState(5);
  const { tables, classes, spells } = useRules();
  const attacks = useMemo(() => resolveAttacks(c), [c]);

  const subtitle = `${c.species} · ${c.classes.map((cl) => `${cl.name} ${cl.level}`).join(" / ")}`;
  const hpPct = c.hp.max > 0 ? Math.max(0, Math.min(100, (c.hp.current / c.hp.max) * 100)) : 0;
  const tempPct = c.hp.max > 0 ? Math.max(0, Math.min(100, (c.hp.temp / c.hp.max) * 100)) : 0;

  // Spell slots — pips per level, filled = remaining. Read-only here; the
  // Spellbook modal (Step 2) will spend them.
  const caster = casterClass(c, classes);
  const slots = caster ? slotsFor(caster.caster, caster.level, tables) : {};

  // Quick-cast model: this character's prepared (or known) spells grouped by
  // level. Crucially this is NOT gated on a caster CLASS — a Githyanki Fighter
  // casts Mage Hand from their race, a Magic Initiate feat grants a cantrip, etc.
  // Any spell in known/prepared surfaces; leveled ones only get slot pips if the
  // character actually has slots. For a non-caster with innate lineage spells
  // (#148) we use the species' chosen casting ability; otherwise fall back to the
  // best mental ability (a reasonable default for other innate-spell sources).
  const bestMentalMod = Math.max(abilityModFor(c, "INT"), abilityModFor(c, "WIS"), abilityModFor(c, "CHA"));
  const innateMod = c.spellcasting?.innate?.ability
    ? abilityModFor(c, c.spellcasting.innate.ability)
    : bestMentalMod;
  const spellAtk = caster ? spellAttackBonus(c, caster.name) ?? 0 : proficiencyBonus(c.level) + innateMod;
  const spellDc = caster ? spellSaveDC(c, caster.name) : 8 + proficiencyBonus(c.level) + innateMod;
  const spellHealMod = caster
    ? (castingAbility(caster.name) ? abilityModFor(c, castingAbility(caster.name)!) : 0)
    : innateMod;
  const spellGroups = useMemo(() => {
    const names = c.spellcasting?.prepared?.length
      ? c.spellcasting.prepared
      : c.spellcasting?.known ?? [];
    if (names.length === 0) return [];
    const byLevel = new Map<number, string[]>();
    for (const n of names) {
      const s = (spells ?? []).find((sp) => sp.name === n);
      if (!s) continue;
      (byLevel.get(s.level) ?? byLevel.set(s.level, []).get(s.level)!).push(n);
    }
    const used = c.spellcasting?.slotsUsed ?? {};
    return [...byLevel.entries()]
      .map(([level, sp]) => ({
        level,
        max: level === 0 ? 0 : slots[String(level)] ?? 0,
        used: used[String(level)] ?? 0,
        spells: sp.sort((a, b) => a.localeCompare(b)),
      }))
      .sort((a, b) => a.level - b.level);
  }, [c.spellcasting, spells, slots]);

  // Name → casting time, so each spell tile can route its economy (Bonus-Action
  // spells cost the bonus, not the main action).
  const castingTimeByName = useMemo(
    () => new Map((spells ?? []).map((s) => [s.name, s.casting_time])),
    [spells]
  );
  const spellEconOf = (name: string): SpellEcon => spellEconomy(castingTimeByName.get(name));
  // Name → range string, so a targeted spell enforces its range at target time.
  const spellRangeByName = useMemo(
    () => new Map((spells ?? []).map((s) => [s.name, s.range])),
    [spells]
  );
  const spellRangeOf = (name: string): string | undefined => spellRangeByName.get(name);
  // Spells that require concentration — parsed from the duration string.
  const concentrationSpells = useMemo(
    () => new Set((spells ?? []).filter((s) => /^concentration/i.test(s.duration ?? "")).map((s) => s.name)),
    [spells]
  );
  const isConc = (name: string): boolean => concentrationSpells.has(name);
  const concentratingOn = c.spellcasting?.concentratingOn ?? null;

  // Begin concentrating on `name`, replacing whatever was held (one at a time).
  const startConcentration = (name: string) => {
    const prev = c.spellcasting?.concentratingOn ?? null;
    onUpdate?.((d) => {
      const sc = d.spellcasting ?? { known: [], prepared: [], slotsUsed: {} };
      return { ...d, spellcasting: { ...sc, concentratingOn: name } };
    });
    if (prev && prev !== name) onNote(`${c.name} drops concentration on ${prev} and now concentrates on ${name}.`);
    else onNote(`${c.name} begins concentrating on ${name}.`);
  };
  const dropConcentration = (reason?: string) => {
    if (!concentratingOn) return;
    onUpdate?.((d) => {
      const sc = d.spellcasting ?? { known: [], prepared: [], slotsUsed: {} };
      return { ...d, spellcasting: { ...sc, concentratingOn: null } };
    });
    onNote(`${c.name} loses concentration on ${concentratingOn}${reason ? ` (${reason})` : ""}.`);
  };
  // One-click CON save to maintain concentration against a DC (default 10, or
  // half the damage taken — the DM sets it when a hit lands). Drops on a fail.
  const concentrationSave = (dc: number) => {
    if (!concentratingOn) return;
    const entry = saveRoll(c, "CON");
    const passed = entry.result.total >= dc;
    onRoll([entry], { label: `${entry.result.total} vs DC ${dc}` });
    if (passed) onNote(`${c.name} holds concentration on ${concentratingOn} (CON save ${entry.result.total} vs DC ${dc}).`);
    else dropConcentration(`failed CON save ${entry.result.total} vs DC ${dc}`);
  };

  // Actions that ENTER TARGETING route through here instead of calling onAttack
  // directly. It tags the spec with the current tile's economy and flags that
  // targeting began — so runItem DEFERS the economy spend to target-commit
  // (spent in TableCanvas). A cancelled attack (Esc) therefore costs nothing.
  const enteredTargeting = useRef(false);
  const pendingEcon = useRef<AttackSpec["econ"]>(undefined);
  const enterTargeting = (spec: AttackSpec) => {
    enteredTargeting.current = true;
    onAttack({ ...spec, econ: pendingEcon.current });
  };

  const doAttack = (atk: Character["attacks"][number]) => {
    const dmgBonus = damageBonus(c, atk);
    const dmgExpr = dmgBonus === 0 ? atk.damage : `${atk.damage}${dmgBonus >= 0 ? "+" : ""}${dmgBonus}`;
    // A Throw tile consumes its weapon (slice E): the resolver removes it from
    // the sheet and drops it at the target's cell, hit or miss.
    const thrownItem = atk.thrown && atk.itemId ? { characterId: c.id, itemId: atk.itemId } : undefined;
    enterTargeting({ label: atk.name, attackBonus: attackBonus(c, atk), damage: dmgExpr, damageType: atk.damageType, range: atk.range, thrownItem });
  };

  // Release a readied action (slice G): the tap on the chip IS the human
  // trigger call. The canvas strips the buff + spends the Reaction + logs;
  // then we launch the held attack's targeting off-turn. If the held response
  // was "move" (or the attack is gone), the canvas just clears it.
  const releaseReady = (entry: string) => {
    const [attackName] = parseBuff(entry).parts;
    onReleaseReady?.(entry);
    const atk = attacks.find((a) => a.name === attackName);
    if (atk) {
      // The canvas already spent the Reaction in onReleaseReady, so the launch
      // itself carries no economy cost.
      pendingEcon.current = undefined;
      doAttack(atk);
    }
  };

  // Hide (slice H): the contest (Stealth vs each hostile observer's
  // range-adjusted passive Perception) needs token positions, so it resolves
  // in the canvas. The HUD just requests it; the canvas rolls, logs, and — on
  // success — applies the Hidden buff (per-viewer invisibility).
  const doHide = () => onHide?.();
  // Search (slice H P5): the counter to Hide — active Perception vs each
  // hidden foe's frozen Stealth; the canvas reveals the ones it beats.
  const doSearch = () => onSearch?.();

  // Rest (short/long, hit dice) lives on the character sheet now (#130) — the
  // PC HUD no longer carries a Rest popout.

  const spendSlot = (level: number) => {
    if (!onUpdate) return;
    const lvl = String(level);
    onUpdate((d) => {
      const sc = d.spellcasting ?? { known: [], prepared: [], slotsUsed: {} };
      return { ...d, spellcasting: { ...sc, slotsUsed: { ...sc.slotsUsed, [lvl]: (sc.slotsUsed[lvl] ?? 0) + 1 } } };
    });
  };
  // Drain a magic item's charge pool by `cost` (#88). Persisted via onUpdate so it
  // survives re-selection; refilled on the matching rest (see useCharacter). If
  // the item has no stored pool yet (a premade whose grant came from the curated
  // table), this first spend BAKES the pool + granted spells onto it, so the item
  // becomes self-contained from then on.
  const spendItemCharges = (itemId: string, cost: number) => {
    if (!onUpdate) return;
    onUpdate((d) => ({
      ...d,
      inventory: d.inventory.map((i) => {
        if (i.id !== itemId) return i;
        const g = itemSpellGrant(i.name);
        const pool = i.charges ?? (g ? { max: g.charges, current: g.charges, recharge: g.recharge } : null);
        if (!pool) return i;
        return {
          ...i,
          charges: { ...pool, current: Math.max(0, pool.current - cost) },
          grantedSpells: i.grantedSpells?.length ? i.grantedSpells : g?.spells,
          spellCost: i.spellCost ?? g?.cost,
        };
      }),
    }));
  };

  // Cast a spell from the tabbed action area (replaces the popover). Routes by
  // mechanics — attack/heal/condition/move through the combat loop, save/utility
  // logged — and spends a slot for leveled spells. The casting time decides the
  // economy (routed via each tile's `econ`); here we also record what was cast
  // this turn to enforce the bonus-action spell rule.
  const castSpell = async (name: string, level: number, baseLevel = level, source?: { itemId: string; cost: number }) => {
    // A spell cast from a magic item draws the item's own charges — no slot check,
    // no slot spend (see below); the caller has already verified the charges.
    const remaining = source
      ? Infinity
      : level > 0 ? (Number(slots[String(level)] ?? 0) - (c.spellcasting?.slotsUsed?.[String(level)] ?? 0)) : Infinity;
    if (!source && level > 0 && remaining <= 0) {
      onNote(`No level ${level} slots left.`);
      return;
    }
    const mech = spellMech(name);
    const econKind = spellEconOf(name);
    const upcast = level > baseLevel; // cast from a higher slot than its base
    // Scale a damage/heal expression: cantrips by character level, leveled spells
    // by how far the slot outranks the spell's base level.
    const scale = (expr: string) =>
      mech?.scales ? scaleCantrip(expr, c.level) : upcastDamage(expr, baseLevel, level, mech?.upcast);
    // Spend the slot (or the item's charges) + turn tracking up front — RAW, the
    // resource is spent even if the spell is later countered. Like a slot, an item
    // charge is committed on cast, not on target-commit.
    if (source) spendItemCharges(source.itemId, source.cost);
    else if (level > 0) spendSlot(level);
    if (economy) setSpellCastTurn((s) => ({ leveled: s.leveled || level > 0, bonus: s.bonus || econKind === "bonus" }));
    // Counterspell window (leveled spells): if countered, the spell fizzles —
    // no effect, no concentration (the slot's already gone).
    if (level > 0 && onCounterspellCheck) {
      const countered = await onCounterspellCheck(name, level);
      if (countered) return;
    }
    // Not countered → resolve the effect and begin concentration if it needs it.
    if (isConc(name)) startConcentration(name);
    const range = spellRangeOf(name);
    const upTxt = upcast ? ` (upcast to level ${level})` : "";
    if (mech?.lingering && mech.area) {
      // Lingering area spell (Web, Wall of Fire…): aim at a point and drop a
      // persistent area token there. Save/condition are announced for the DM.
      enterTargeting({
        label: `${name}${upTxt}`,
        attackBonus: 0,
        burst: true,
        placeArea: { shape: mech.area.shape, size: mech.area.size, damageType: mech.damageType, level, movable: mech.movable, damage: mech.damage, concSpell: isConc(name) ? name : undefined },
        save: mech.save,
        dc: spellDc ?? undefined,
        condition: mech.condition,
        range,
      });
    } else if (mech?.kind === "attack" && mech.damage) {
      // Magic Missile-style darts scale their flat bonus too (N d4 + N); others
      // scale by dice only. Auto-hit + a VFX key pass straight through to the board.
      const dmgExpr = mech.darts ? dartDamage(mech.darts, baseLevel, level) : scale(mech.damage);
      enterTargeting({
        label: `${name}${upTxt}`,
        attackBonus: mech.autoHit ? 0 : spellAtk,
        damage: dmgExpr,
        damageType: mech.damageType,
        range,
        autoHit: mech.autoHit,
        vfx: mech.vfx,
      });
    } else if (mech?.kind === "save" && mech.damage && (mech.burst || mech.area)) {
      // Aimed AoE (Cone of Cold, Fireball, Lightning Bolt…): targeting shows
      // the TRUE footprint; on commit the resolver computes who's caught and
      // each caught creature rolls its own save (slice B).
      enterTargeting({
        label: `${name}${upTxt}`,
        attackBonus: 0,
        damage: scale(mech.damage),
        damageType: mech.damageType,
        save: mech.save,
        dc: spellDc ?? undefined,
        onSave: level === 0 ? "none" : "half",
        vfx: mech.vfx,
        burst: true,
        burstShape: mech.area ? { shape: mech.area.shape, size: mech.area.size } : undefined,
        range,
      });
    } else if (mech?.kind === "save" && mech.damage) {
      // Single-target save-for-damage (Sacred Flame, Poison Spray, Toll the
      // Dead): TARGET it — the defender rolls the save on their own client
      // (slice A). Cantrips deal nothing on a save; leveled spells take half.
      enterTargeting({
        label: `${name}${upTxt}`,
        attackBonus: 0,
        damage: scale(mech.damage),
        damageType: mech.damageType,
        save: mech.save,
        dc: spellDc ?? undefined,
        onSave: level === 0 ? "none" : "half",
        vfx: mech.vfx,
        range,
      });
    } else if (mech?.kind === "heal" && mech.heal) {
      const scaled = scale(mech.heal);
      const expr = spellHealMod !== 0 ? `${scaled}${spellHealMod > 0 ? "+" : ""}${spellHealMod}` : scaled;
      enterTargeting({ label: `${name}${upTxt}`, attackBonus: 0, heal: expr, range });
    } else if (mech?.kind === "condition") {
      enterTargeting({ label: name, attackBonus: 0, condition: mech.condition ?? "", save: mech.save, dc: spellDc ?? undefined, restrictType: mech.onlyType, range });
    } else if (mech?.kind === "cleanse") {
      enterTargeting({ label: name, attackBonus: 0, cleanse: mech.cures ?? [], range });
    } else if (mech?.kind === "move") {
      onMove?.(name);
    } else {
      onNote(`${c.name} casts ${name}${level > 0 && spellDc != null ? ` — save DC ${spellDc}` : ""}.`);
    }
  };

  // One ordered list drives both the rendered buttons and the number-key
  // hotbar — so key "1" always fires the first button the player sees.
  interface Slot {
    id: string;
    icon: IconName;
    /** D&D-library glyph path (public/icons). When set, the tile renders this
     *  silhouette instead of the generic `icon`. */
    glyph?: string;
    name: string;
    sub: string;
    kind: "attack" | "common";
    run: () => void;
    disabled?: boolean;
    /** Economy this item spends when used (drives consume + disable). */
    econ?: "action" | "bonus" | "reaction";
    /** A duration effect this tile started is LIVE (Dodge until your next
     *  turn) — the tile wears the spinning active-effect ring (slice F). */
    activeFx?: boolean;
  }
  // Players get one main action, plus any granted by a feature this turn
  // (Action Surge → +1). Extra mains only count in combat, where the economy
  // is live; out of combat mainMax is always 1.
  const mainMax = 1 + (economy ? extraMain : 0);

  // Limited-use class features → spendable trackers on the resource strip
  // (top 3; the rest live on the sheet). A tracker is a TRACKER not a TAB: it
  // doesn't filter the action area, it just counts down when clicked. `max<=20`
  // filters out pool-style resources (e.g. Lay on Hands' HP pool) that don't
  // read as discrete pips.
  const trackedFeatures = c.features
    .filter((f) => f.uses && f.uses.max > 0 && f.uses.max <= 20)
    .slice(0, 3);
  const resourceViews: ResourceView[] = trackedFeatures.map((f) => {
    const fe = featureEcon(f.name);
    const econBlocked =
      !!economy &&
      ((fe.econ === "action" && economy.action >= mainMax) ||
        (fe.econ === "bonus" && economy.bonus) ||
        (fe.econ === "reaction" && economy.reaction));
    return {
      id: f.id,
      label: f.name,
      current: f.uses!.current,
      max: f.uses!.max,
      econ: fe.econ,
      disabled: incap || f.uses!.current <= 0 || econBlocked,
    };
  });

  // Spend a class feature: drop a charge, pay the compound action-economy cost,
  // and apply its effect (Action Surge grants a second main this turn; Second
  // Wind heals). Persists the charge via onUpdate so it survives re-selection.
  const spendFeature = (id: string) => {
    const f = c.features.find((x) => x.id === id);
    if (!f || !f.uses || f.uses.current <= 0 || incap) return;
    const fe = featureEcon(f.name);
    if (economy) {
      if (fe.econ === "action" && economy.action >= mainMax) return;
      if (fe.econ === "bonus" && economy.bonus) return;
      if (fe.econ === "reaction" && economy.reaction) return;
    }
    onUpdate?.((d) => ({
      ...d,
      features: d.features.map((x) =>
        x.id === id && x.uses ? { ...x, uses: { ...x.uses, current: Math.max(0, x.uses.current - 1) } } : x
      ),
    }));
    if (fe.econ === "action" || fe.econ === "bonus" || fe.econ === "reaction") onSpend?.(fe.econ);
    if (fe.special === "extraMain") {
      setExtraMain((x) => x + 1);
      onNote(`${c.name} uses ${f.name} — an extra action this turn.`);
    } else if (fe.special === "heal") {
      const roll = damageRoll(f.name, `1d10+${c.level}`);
      onRoll([roll], { label: `+${roll.result.total}` });
      onUpdate?.((d) => ({ ...d, hp: applyHeal(d.hp, roll.result.total) }));
      onNote(`${c.name} uses ${f.name} — regains ${roll.result.total} HP.`);
    } else {
      onNote(`${c.name} uses ${f.name}.`);
    }
  };
  // MAIN-action tab: weapon attacks + the fixed action options. (Cantrips and
  // leveled spells live in their own tabs now — no "Cast a Spell" button.)
  const mainActions: Slot[] = [
    ...attacks.map((atk) => ({
      id: atk.id,
      icon: "swords" as IconName,
      glyph: attackGlyph(atk),
      name: atk.name,
      sub: `${formatMod(attackBonus(c, atk))} · ${damageLabel(atk, damageBonus(c, atk))}`,
      kind: "attack" as const,
      run: () => doAttack(atk),
      econ: "action" as const,
    })),
    { id: "hide", icon: "eye-off", glyph: glyphSrc("action_hide"), name: "Hide", sub: hidden ? "hidden" : "Stealth", kind: "common", run: () => { if (!hidden) doHide(); }, econ: "action" as const, activeFx: hidden },
    { id: "dash", icon: "right", glyph: glyphSrc("action_dash"), name: "Dash", sub: "action", kind: "common", run: () => { onNote("Dash — movement doubled this turn."); onDash?.(); }, econ: "action" as const },
    {
      id: "dodge", icon: "shield", glyph: glyphSrc("action_dodge"), name: "Dodge",
      sub: dodging ? "dodging" : "action", kind: "common",
      // Real mechanics (slice F): applies the Dodging buff to the token —
      // incoming attacks at disadvantage, DEX saves at advantage — until the
      // start of your next turn. The tile wears a spinning ring while live.
      run: () => { if (!dodging) onDodge?.(); },
      econ: "action" as const,
      activeFx: dodging,
    },
    {
      id: "ready", icon: "star", glyph: glyphSrc("action_ready"), name: "Ready",
      sub: readyEntry ? "readying" : "action", kind: "common",
      // Ready (slice G): open the declare picker (trigger + held response).
      // Set enteredTargeting so runItem DEFERS the Action spend — we spend it
      // only on CONFIRM, so cancelling the card costs nothing (review fix).
      // While readied the tile spins; releasing happens by tapping the chip.
      run: () => { if (!readyEntry) { enteredTargeting.current = true; setReadyOpen(true); } },
      econ: "action" as const,
      activeFx: Boolean(readyEntry),
    },
    {
      id: "search", icon: "search", glyph: glyphSrc("action_search"), name: "Search",
      sub: "Perception", kind: "common",
      // Search (slice H) — the counter to Hide: active Perception vs nearby
      // hidden foes' frozen Stealth; the canvas reveals the ones it beats.
      run: doSearch, econ: "action" as const,
    },
  ];
  // BONUS-action tab: non-spell bonus actions. Sparse until #90/#93 add
  // class-feature detection (Cunning Action, off-hand attack, Rage…).
  const bonusActions: Slot[] = [];
  // Spell tiles for a tab. The cantrip tab (0) shows cantrips; a leveled tab N
  // shows every prepared spell of base level 1..N — casting a lower one from a
  // higher tab UPCASTS it (spends the level-N slot, scales the effect). Economy
  // still comes from the spell's casting time; the bonus-action rule applies.
  const spellTilesFor = (tabLevel: number): Slot[] => {
    if (tabLevel === 0) {
      const g = spellGroups.find((x) => x.level === 0);
      if (!g) return [];
      return g.spells.map((name) => spellTile(name, 0, 0, Infinity));
    }
    const remaining = (slots[String(tabLevel)] ?? 0) - (c.spellcasting?.slotsUsed?.[String(tabLevel)] ?? 0);
    return spellGroups
      .filter((grp) => grp.level >= 1 && grp.level <= tabLevel)
      .flatMap((grp) => grp.spells.map((name) => ({ name, baseLevel: grp.level })))
      .sort((a, b) => a.baseLevel - b.baseLevel || a.name.localeCompare(b.name))
      .map(({ name, baseLevel }) => spellTile(name, baseLevel, tabLevel, remaining));
  };
  // Build one spell tile — cast at `slotLevel`, upcast from `baseLevel` when they
  // differ (an "↑ lvl N" caption flags it).
  const spellTile = (name: string, baseLevel: number, slotLevel: number, remaining: number): Slot => {
    const mech = spellMech(name);
    const econKind = spellEconOf(name);
    // Quickened Spell (#97): when armed, an Action-cast spell becomes a Bonus
    // Action (spending Sorcery Points). Reaction/already-bonus/ritual spells are
    // ineligible.
    const quickened = quickenArmed && canQuicken && econKind === "action";
    const tileEcon: "action" | "bonus" | "reaction" =
      quickened || econKind === "bonus" ? "bonus" : econKind === "reaction" ? "reaction" : "action";
    const ruleBlocked =
      !!economy && ((tileEcon === "bonus" && spellCastTurn.leveled) || (slotLevel > 0 && spellCastTurn.bonus));
    const upcast = slotLevel > baseLevel;
    const mechSub =
      mech?.kind === "attack" ? "attack" : mech?.kind === "save" ? `${mech.save} save` : mech?.kind === "heal" ? "heal" : mech?.kind === "cleanse" ? "restore" : slotLevel === 0 ? "cantrip" : `lvl ${baseLevel}`;
    const sub = quickened ? "⚡ quickened" : upcast ? `↑ lvl ${slotLevel}` : econKind === "action" ? mechSub : spellEconLabel(econKind);
    return {
      id: `spell-${name}`,
      icon: "sparkles" as IconName,
      glyph: glyphSrc(mech?.kind === "attack" ? "attack_spell" : "action_magic"),
      name,
      sub,
      kind: "common" as const,
      run: () => {
        if (quickened) {
          spendSorceryPoints(QUICKEN_COST);
          setQuickenArmed(false);
        }
        castSpell(name, slotLevel, baseLevel);
      },
      disabled: remaining <= 0 || ruleBlocked,
      econ: tileEcon,
    };
  };
  // REACTION tab: things you spend your reaction on — an Opportunity Attack
  // (your primary weapon, off-turn), Ready, and every reaction-cast spell
  // (Shield, Counterspell, Feather Fall…) surfaced from any level. All consume
  // the reaction glyph, not the action.
  const reactionSpellTiles: Slot[] = spellGroups.flatMap((g) =>
    g.spells
      .filter((name) => spellEconOf(name) === "reaction")
      .map((name) => {
        const remaining = g.level === 0 ? Infinity : g.max - g.used;
        return {
          id: `react-${name}`,
          icon: "sparkles" as IconName,
          glyph: glyphSrc("action_magic"),
          name,
          sub: g.level === 0 ? "reaction" : `reaction · lvl ${g.level}`,
          kind: "common" as const,
          run: () => castSpell(name, g.level),
          disabled: remaining <= 0,
          econ: "reaction" as const,
        };
      })
  );
  const reactionItems: Slot[] = [
    ...(attacks[0]
      ? [{
          id: "opportunity",
          icon: "swords" as IconName,
          glyph: attackGlyph(attacks[0]),
          name: "Opportunity Attack",
          sub: `${formatMod(attackBonus(c, attacks[0]))} · when a foe leaves reach`,
          kind: "attack" as const,
          run: () => doAttack(attacks[0]),
          econ: "reaction" as const,
        }]
      : []),
    { id: "ready", icon: "shield", glyph: glyphSrc("action_ready"), name: "Ready", sub: "hold an action", kind: "common", run: () => onNote(`${c.name} readies an action.`), econ: "reaction" as const },
    ...reactionSpellTiles,
  ];

  // ITEMS tab (#88): every magic item that carries a charge pool + granted spells
  // becomes a row of castable tiles, spending the ITEM's charges (not the
  // wielder's slots). This is the one action source open to non-casters — a
  // Fighter's Wand of Magic Missiles casts even with no spell slots.
  const spellLevelOf = (name: string): number =>
    (spells ?? []).find((s) => s.name.toLowerCase() === name.toLowerCase())?.level ?? 0;
  // Resolve an item's spell grant: its own structured fields if present, else the
  // curated SRD table (#88) — so a premade wand whose data lives only in prose
  // still drives the Items tab. `current` falls back to `max` until first cast.
  const grantFor = (item: InventoryItem): { spells: string[]; max: number; current: number; recharge?: "short" | "long" | "dawn"; cost?: Record<string, number> } | null => {
    const g = itemSpellGrant(item.name);
    const spellsList = item.grantedSpells?.length ? item.grantedSpells : g?.spells;
    if (!spellsList || spellsList.length === 0) return null;
    const max = item.charges?.max ?? g?.charges ?? 0;
    if (max <= 0) return null;
    return {
      spells: spellsList,
      max,
      current: item.charges?.current ?? max,
      recharge: item.charges?.recharge ?? g?.recharge,
      cost: item.spellCost ?? g?.cost,
    };
  };
  const castItemSpell = (item: InventoryItem, name: string) => {
    const grant = grantFor(item);
    if (!grant) return;
    const cost = grant.cost?.[name] ?? 1;
    if (grant.current < cost) {
      onNote(`${item.name} has no charges left.`);
      return;
    }
    const lvl = spellLevelOf(name);
    void castSpell(name, lvl, lvl, { itemId: item.id, cost });
  };
  const itemSpellTiles: Slot[] = c.inventory.flatMap((item) => {
    const grant = grantFor(item);
    if (!grant) return [] as Slot[];
    return grant.spells.map((name) => {
      const cost = grant.cost?.[name] ?? 1;
      const econKind = spellEconOf(name);
      const tileEcon: "action" | "bonus" | "reaction" =
        econKind === "bonus" ? "bonus" : econKind === "reaction" ? "reaction" : "action";
      return {
        id: `item-${item.id}-${name}`,
        icon: "sparkles" as IconName,
        glyph: glyphSrc(spellMech(name)?.kind === "attack" ? "attack_spell" : "action_magic"),
        name,
        sub: `${item.name} · ${grant.current}⚡${cost > 1 ? ` (−${cost})` : ""}`,
        kind: "common" as const,
        run: () => castItemSpell(item, name),
        disabled: grant.current < cost,
        econ: tileEcon,
      };
    });
  });
  const hasItemSpells = itemSpellTiles.length > 0;

  // TRAIT ACTIONS (#93): the third action slot's other half. For a caster it holds
  // cantrips; for a martial it was dead. Now a curated set of activated non-caster
  // traits (Breath Weapon…) resolves through the SAME targeting loop as spells,
  // and every other limited-use activated feature at least surfaces here as a
  // one-click "use" (spend + narrate), so the slot is alive for everyone.
  // Recognized combat traits → a full spec (routed through targeting); others → null.
  const traitActionSpec = (name: string): Omit<AttackSpec, "econ"> | null => {
    const n = name.toLowerCase();
    if (n.includes("breath weapon")) {
      // Dragonborn breath: a cone/line the whole area saves against (DEX) for half.
      // Damage scales by tier; the element comes from the draconic ancestry, which
      // buildCharacter folds into the name as "Breath Weapon (Fire)" (#148). DC is
      // CON-based (8 + prof + CON), unlike spell DCs.
      const dice = c.level >= 16 ? "5d6" : c.level >= 11 ? "4d6" : c.level >= 6 ? "3d6" : "2d6";
      const el = name.match(/\(([^)]+)\)/)?.[1]?.toLowerCase() ?? "fire";
      const dc = 8 + proficiencyBonus(c.level) + abilityModFor(c, "CON");
      return { label: name, attackBonus: 0, damage: dice, damageType: el, save: "DEX", dc, burst: true };
    }
    return null;
  };
  // Drop one use of a feature (no economy/special — the tile or spendFeature owns those).
  const spendTraitUse = (id: string) => {
    onUpdate?.((d) => ({
      ...d,
      features: d.features.map((x) =>
        x.id === id && x.uses ? { ...x, uses: { ...x.uses, current: Math.max(0, x.uses.current - 1) } } : x
      ),
    }));
  };
  const useTrait = (f: Feature) => {
    const spec = traitActionSpec(f.name);
    if (spec) {
      // Curated combat trait: spend the use now, resolve the effect through
      // targeting (economy is paid on target-commit via the tile's econ).
      spendTraitUse(f.id);
      enterTargeting(spec);
    } else {
      // Generic activated feature — same path as its resource chip.
      spendFeature(f.id);
    }
  };
  const traitTiles: Slot[] = c.features
    .filter((f) => {
      if (!f.uses || f.uses.max <= 0) return false;
      if (featureEcon(f.name).econ === "reaction") return false; // reactions live on the reaction tab
      // Curated traits always show; generic ones skip pool-style resources (max>20).
      return !!traitActionSpec(f.name) || f.uses.max <= 20;
    })
    .map((f) => {
      const spec = traitActionSpec(f.name);
      const fe = featureEcon(f.name);
      const tileEcon: "action" | "bonus" | undefined = fe.econ === "bonus" ? "bonus" : fe.econ === "action" ? "action" : undefined;
      const econBlocked =
        !!economy && ((tileEcon === "action" && economy.action >= mainMax) || (tileEcon === "bonus" && economy.bonus));
      return {
        id: `trait-${f.id}`,
        icon: "sparkles" as IconName,
        glyph: glyphSrc(spec ? "attack_spell" : "action_magic"),
        name: f.name,
        sub: `${f.uses!.current}/${f.uses!.max}${spec?.save ? ` · ${spec.save} save` : fe.econ === "bonus" ? " · bonus" : ""}`,
        kind: "common" as const,
        run: () => useTrait(f),
        disabled: incap || f.uses!.current <= 0 || econBlocked,
        // Curated traits defer economy to target-commit via this econ; generic ones
        // let spendFeature pay, so they carry no tile econ (avoids a double-spend).
        econ: spec ? tileEcon : undefined,
      };
    });
  const hasThirdSlot =
    spellGroups.some((g) => g.level === 0 && g.spells.length > 0) || traitTiles.length > 0;

  // Items shown for the active tab; also what the number keys fire.
  const tabItems: Slot[] =
    actionTab === "main" ? mainActions
    : actionTab === "bonus" ? bonusActions
    : actionTab === "cantrip" ? [...spellTilesFor(0), ...traitTiles]
    : actionTab === "reaction" ? reactionItems
    : actionTab === "items" ? itemSpellTiles
    : spellTilesFor(actionTab);

  // In combat, an item is spent-out when its economy is exhausted (main actions
  // capped at mainMax for Multiattack/Action Surge; bonus and reaction are
  // single). Incap and no-slots also disable. Out of combat nothing consumes.
  const itemDisabled = (s: Slot): boolean =>
    incap ||
    !!s.disabled ||
    (!!economy && s.econ === "action" && economy.action >= mainMax) ||
    (!!economy && s.econ === "bonus" && economy.bonus) ||
    (!!economy && s.econ === "reaction" && economy.reaction);
  // Run an item and spend its economy (the single source of consumption).
  const runItem = (s: Slot) => {
    if (itemDisabled(s)) return;
    enteredTargeting.current = false;
    pendingEcon.current = s.econ;
    s.run();
    // A targeted action defers its economy to target-commit (spent in
    // TableCanvas via spec.econ); an immediate action spends it now.
    if (s.econ && !enteredTargeting.current) onSpend?.(s.econ);
  };

  // Main is the default tab at the start of the token's turn; any extra main
  // actions from last turn's Action Surge clear.
  useEffect(() => {
    if (activeTurn) {
      setActionTab("main");
      setExtraMain(0);
      setSpellCastTurn({ leveled: false, bonus: false });
    }
  }, [activeTurn]);

  // Being incapacitated (unconscious, paralyzed, stunned…) breaks concentration.
  useEffect(() => {
    if (incap && concentratingOn) dropConcentration("incapacitated");
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [incap]);

  // Number keys 1–9 fire the matching slot — the hotbar convention. Ignored
  // while typing or with a modifier held, and only while this dock is mounted
  // (which is only when a token is selected).
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.metaKey || e.ctrlKey || e.altKey || min) return;
      const el = e.target as HTMLElement | null;
      if (el && (el.tagName === "INPUT" || el.tagName === "TEXTAREA" || el.isContentEditable)) return;
      const n = parseInt(e.key, 10);
      if (n >= 1 && n <= 9 && tabItems[n - 1]) {
        e.preventDefault();
        runItem(tabItems[n - 1]);
        return;
      }
      // Letter shortcut: C character sheet. (Skills roll from the sheet now
      // (#129); the region map moved to the VTT tool rail (#128).)
      const k = e.key.toLowerCase();
      if (k === "c") {
        e.preventDefault();
        togglePopout("sheet");
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  });

  const initials = initialsOf(c.name);

  if (min) {
    return (
      <button className="thud-pill" onClick={() => setMin(false)} aria-label={`Show ${c.name}'s bar`}>
        {c.portrait ? (
          <img className="thud-pill-pf" src={c.portrait} alt="" />
        ) : (
          <span className="thud-pill-pf">{initials}</span>
        )}
        <span className="thud-pill-nm">{c.name}</span>
        <span className="thud-pill-hp"><i style={{ width: `${hpPct}%` }} /></span>
        <Icon name="up" size={14} />
      </button>
    );
  }

  return (
    <div ref={hudRef} className={`thud ${activeTurn ? "is-turn" : ""}`} aria-live="polite">
      {popout === "sheet" && <SheetDrawer characterId={c.id} onClose={() => setPopout(null)} />}
      {/* who + how hurt — tap the portrait to open the character sheet */}
      <div className="thud-who">
        <button className="thud-pf-btn" onClick={() => togglePopout("sheet")} title="Open character sheet" aria-label="Open character sheet">
          {c.portrait ? (
            <img className="thud-pf" src={c.portrait} alt="" />
          ) : (
            <div className="thud-pf">{initials}</div>
          )}
        </button>
        <div className="thud-who-text">
          <div className="thud-nm">{c.name}</div>
          <div className="thud-sub">{subtitle}</div>
          <button
            type="button"
            className={`thud-hp ${hp ? "is-editable" : ""} ${hpOpen ? "is-open" : ""}`}
            onClick={hp ? () => setHpOpen((o) => !o) : undefined}
            disabled={!hp}
            aria-expanded={hp ? hpOpen : undefined}
            title={hp ? "Adjust hit points" : undefined}
          >
            <div className="thud-hp-row">
              <span>Hit Points</span>
              <span>
                <b>{c.hp.current}</b>/{c.hp.max}
                {c.hp.temp > 0 && <em> +{c.hp.temp}</em>}
              </span>
            </div>
            <div className="thud-hp-track">
              <i style={{ width: `${hpPct}%` }} />
              {c.hp.temp > 0 && <u style={{ width: `${tempPct}%` }} />}
            </div>
          </button>
          {hp && hpOpen && (
            <div className="thud-hp-edit" onClick={(e) => e.stopPropagation()}>
              <input
                type="number"
                value={amount}
                onChange={(e) => setAmount(Math.max(0, parseInt(e.target.value, 10) || 0))}
                aria-label="Amount"
              />
              <button className="is-heal" onClick={() => hp.heal(amount)}>Heal</button>
              <button className="is-dmg" onClick={() => hp.damage(amount)}>Damage</button>
              <button onClick={() => hp.setTemp(amount)}>Temp</button>
            </div>
          )}
          {c.conditions.length > 0 && (
            <div className="thud-conds">
              {c.conditions.map((cond) => (
                <span key={cond} className="thud-cond">{cond}</span>
              ))}
            </div>
          )}
        </div>
      </div>

      <div className="thud-rule" />

      <StatusStrip
        conditions={conditions ?? []}
        buffs={buffs ?? []}
        onReleaseReady={(entry) => releaseReady(entry)}
      />

      {readyOpen && (
        <ReadyPrompt
          attacks={mainActions.filter((s) => s.kind === "attack")}
          onCancel={() => setReadyOpen(false)}
          onConfirm={(attackId, trigger) => {
            setReadyOpen(false);
            const atk = mainActions.find((s) => s.id === attackId);
            onReady?.(encodeReadying(atk?.name ?? "an action", trigger));
            // The Action is spent here (deferred from the tile click) so a
            // cancelled declaration is free.
            onSpend?.("action");
          }}
        />
      )}

      {concentratingOn && (
        <div className="thud-conc" role="group" aria-label="Concentration">
          <span className="thud-conc-t">
            <GameGlyph src="/icons/game_state/game_concentration.svg" size={14} className="thud-conc-ico" /> Concentrating: <b>{concentratingOn}</b>
          </span>
          <span className="thud-conc-save">
            <label htmlFor="conc-dc">DC</label>
            <input
              id="conc-dc"
              type="number"
              min={1}
              value={concDc}
              onChange={(e) => setConcDc(Math.max(1, parseInt(e.target.value, 10) || 10))}
              aria-label="Concentration save DC"
            />
            <button onClick={() => concentrationSave(concDc)} title="Roll a CON save to keep concentration">
              Save
            </button>
          </span>
          <button
            className="thud-conc-x"
            onClick={() => dropConcentration("dropped")}
            title="Drop concentration"
            aria-label="Drop concentration"
          >
            <Icon name="close" size={13} />
          </button>
        </div>
      )}

      {sp && (actionTab === "cantrip" || typeof actionTab === "number") && (
        <div style={{ display: "flex", alignItems: "center", gap: 8, padding: "2px 4px 6px" }}>
          <button
            onClick={() => setQuickenArmed((a) => !a)}
            disabled={!canQuicken}
            title={
              canQuicken
                ? "Quickened Spell — your next Action spell casts as a Bonus Action (2 Sorcery Points)"
                : "Not enough Sorcery Points"
            }
            style={{
              display: "inline-flex", alignItems: "center", gap: 5, fontSize: 11, fontWeight: 600,
              padding: "4px 9px", borderRadius: 999,
              border: `1px solid ${quickenArmed ? "var(--gold)" : "var(--border)"}`,
              background: quickenArmed ? "color-mix(in srgb, var(--gold) 22%, transparent)" : "transparent",
              color: quickenArmed ? "var(--candle)" : "var(--text-dim)",
              opacity: canQuicken ? 1 : 0.5, cursor: canQuicken ? "pointer" : "not-allowed",
            }}
          >
            <Icon name="sparkles" size={12} /> Quicken{quickenArmed ? " · armed" : ` · ${QUICKEN_COST} SP`}
          </button>
          <span className="mono dim" style={{ fontSize: 11 }}>Sorcery {sp.current}/{sp.max}</span>
        </div>
      )}

      <div className="thud-acts">
        {tabItems.map((s, i) => (
          <button
            key={s.id}
            className={`thud-act is-glyph is-${s.kind}${s.activeFx ? " is-active-effect" : ""}`}
            onClick={() => runItem(s)}
            disabled={itemDisabled(s)}
            aria-label={s.name}
            title={incap ? "Incapacitated — can't act" : `${s.name} — ${s.sub}`}
          >
            {i < 9 && <span className="thud-act-key" aria-hidden="true">{i + 1}</span>}
            {s.glyph ? <GameGlyph src={s.glyph} size={24} /> : <Icon name={s.icon} size={18} />}
            <span className="thud-act-s">{tileCaption(s.name, s.sub)}</span>
          </button>
        ))}
        {tabItems.length === 0 && (
          <span className="thud-empty">
            {actionTab === "main"
              ? "No weapons drawn — equip one to attack."
              : actionTab === "bonus"
                ? "No bonus actions."
                : actionTab === "reaction"
                  ? "No reactions available."
                  : actionTab === "items"
                    ? "No charged magic items."
                    : "No spells at this level."}
          </span>
        )}
      </div>

      {/* The tab strip is always present (tabs work out of combat too); the
          economy chrome (movement, End Turn, spent-dimming) only shows in
          combat, when `economy` is non-null. */}
      <ResourceStrip
        eco={economy ?? null}
        slots={Object.entries(slots)
          .map(([lvl, max]) => ({
            level: parseInt(lvl, 10),
            max: Number(max),
            used: c.spellcasting?.slotsUsed?.[lvl] ?? 0,
          }))
          .filter((s) => Number.isFinite(s.level) && s.level > 0 && s.max > 0)
          .sort((a, b) => a.level - b.level)}
        hasCantrip={hasThirdSlot}
        hasReactions={reactionItems.length > 0}
        hasItems={hasItemSpells}
        resources={resourceViews}
        onSpendResource={spendFeature}
        mainMax={mainMax}
        activeTab={actionTab}
        onSelectTab={setActionTab}
        onEndTurn={onEndTurn}
        endTurnEnabled={endTurnEnabled}
      />

      {/* The game menu is gone: skills roll from the sheet (#129), the sheet
          opens from the portrait ("C"), rest is on the sheet (#130), and the
          region map moved to the VTT tool rail (#128). */}

      <button className="thud-min" onClick={() => setMin(true)} aria-label="Hide the bar — map first"
        title="Hide the bar">
        <Icon name="left" size={14} />
      </button>
    </div>
  );
};

/**
 * Minimal dock for a selected token with NO linked character — a plain custom
 * token or a monster (whose statblock HUD arrives with the bestiary, #64). So
 * that selecting *anything* shows a dock: identity, plus the DM's hide/delete
 * folded off the rail.
 */
export const TokenHud = ({
  label,
  image,
  isDM,
  owner,
  hp,
  hpMax,
  level,
  isPlayerChar,
  conditions,
  buffs,
}: {
  label: string;
  image?: string | null;
  isDM: boolean;
  /** Display name of whoever owns this token (a player, or the DM). */
  owner?: string | null;
  /** Mirrored vitals — a player character's HP/level, visible to the whole table. */
  hp?: number | null;
  hpMax?: number | null;
  level?: number | null;
  /** True when the token is a bound player character (drives the labels). */
  isPlayerChar?: boolean;
  /** Statuses shown so anyone selecting the token can read them. */
  conditions?: string[];
  buffs?: string[];
  hidden?: boolean;
  onToggleHidden?: () => void;
  onDeleteToken?: () => void;
}) => {
  const hasHp = hp != null && hpMax != null && hpMax > 0;
  const hpPct = hasHp ? Math.max(0, Math.min(100, Math.round((hp! / hpMax!) * 100))) : 0;
  const subParts = [
    isPlayerChar ? (level != null ? `Level ${level}` : "Player character") : null,
    owner ? `owned by ${owner}` : null,
  ].filter(Boolean);
  return (
    <div className="thud thud-token" aria-live="polite">
      <div className="thud-who">
        {image ? <img className="thud-pf" src={image} alt="" /> : <div className="thud-pf">{initialsOf(label)}</div>}
        <div className="thud-who-text">
          <div className="thud-nm">{label}</div>
          {subParts.length > 0 && <div className="thud-sub">{subParts.join(" · ")}</div>}
        </div>
      </div>
      {hasHp ? (
        <div className="thud-token-vitals">
          <div className="thud-token-hprow">
            <span className="thud-res-l">HP</span>
            <span className="thud-token-hpnum">{hp}<span className="dim">/{hpMax}</span></span>
          </div>
          <div className="thud-token-hpbar"><i style={{ width: `${hpPct}%` }} /></div>
        </div>
      ) : (
        <div className="thud-empty">
          {isPlayerChar
            ? "This player's vitals will show once their token syncs."
            : isDM
              ? "Place this from Your Characters for its sheet — or a statblock for monster actions."
              : "This token isn't one of your characters."}
        </div>
      )}
      <StatusStrip conditions={conditions ?? []} buffs={buffs ?? []} />
    </div>
  );
};

/**
 * DM-facing monster HUD — reads a statblock copied onto the token, with the
 * token's own HP. Attacks roll to the whole table (pre-computed to-hit/damage),
 * saving throws roll on demand (when a player's spell calls for one), and HP is
 * tracked per placed instance. Only the DM sees it (players never bind to a
 * monster token in the current wiring).
 */
export const MonsterHud = ({
  statblock: m,
  name,
  image,
  hpCurrent,
  hpMax,
  activeTurn,
  onRoll,
  onAttack,
  onNote,
  onMove,
  onCounterspellCheck,
  onHide,
  onSearch,
  economy,
  onSpend,
  onEndTurn,
  endTurnEnabled,
  conditions,
  buffs,
  onHp,
}: {
  statblock: MonsterStatblock;
  name: string;
  image?: string | null;
  hpCurrent: number;
  hpMax: number;
  activeTurn?: boolean;
  onRoll: (entries: RollEntry[], opts?: { tone?: RollTone; label?: string }) => void;
  onAttack: (spec: AttackSpec) => void;
  onNote: (msg: string) => void;
  onMove?: (label: string) => void;
  onCounterspellCheck?: (spellName: string, level: number) => Promise<boolean>;
  onHide?: () => void;
  onSearch?: () => void;
  economy?: EconomyView | null;
  onSpend?: (which: EconKey) => void;
  onEndTurn?: () => void;
  endTurnEnabled?: boolean;
  conditions?: string[];
  buffs?: string[];
  onHp: (current: number) => void;
  hidden?: boolean;
  onToggleHidden?: () => void;
  onDeleteToken?: () => void;
}) => {
  const [min, setMin] = useState(false);
  const [hpOpen, setHpOpen] = useState(false);
  const [amount, setAmount] = useState(5);
  const [sheetOpen, setSheetOpen] = useState(false);
  // Tabbed action area (same model as the player HUD).
  const [actionTab, setActionTab] = useState<ActionTab>("main");
  // Monsters don't persist slot usage — track it ephemerally for the session.
  const [spellUsed, setSpellUsed] = useState<Record<number, number>>({});
  // Recharge abilities (Fire Breath, etc.), keyed by action name → expended?
  // true = used, waiting to recharge. Ephemeral, like spell usage.
  const [rechargeExpended, setRechargeExpended] = useState<Record<string, boolean>>({});

  // Parse the statblock's prose "Spellcasting" trait into castable spells.
  const casting = useMemo(() => parseMonsterSpellcasting(m), [m]);
  // Name → casting time, so monster spell tiles route economy like the player's.
  const { spells } = useRules();
  const castingTimeByName = useMemo(
    () => new Map((spells ?? []).map((s) => [s.name, s.casting_time])),
    [spells]
  );
  const spellEconOf = (name: string): SpellEcon => spellEconomy(castingTimeByName.get(name));
  const spellRangeByName = useMemo(() => new Map((spells ?? []).map((s) => [s.name, s.range])), [spells]);
  const spellRangeOf = (name: string): string | undefined => spellRangeByName.get(name);

  useEffect(() => {
    setSpellUsed({});
    setRechargeExpended({});
    setActionTab("main");
  }, [name]);
  useEffect(() => {
    if (!activeTurn) return;
    setActionTab("main");
    // Start-of-turn recharge: roll a d6 for each expended recharge ability and
    // bring back any that meet its threshold (the "Recharge 5–6" die).
    const expendedNames = Object.keys(rechargeExpended).filter((k) => rechargeExpended[k]);
    if (expendedNames.length === 0) return;
    const recovered: Record<string, boolean> = {};
    for (const an of expendedNames) {
      const thr = rechargeThreshold(an);
      if (thr == null) continue;
      const val = damageRoll(`${stripRecharge(an)} · Recharge`, "1d6").result.total;
      if (val >= thr) {
        recovered[an] = false;
        onNote(`${name}'s ${stripRecharge(an)} recharges (rolled ${val}).`);
      } else {
        onNote(`${name}'s ${stripRecharge(an)} stays spent (rolled ${val}).`);
      }
    }
    if (Object.keys(recovered).length) setRechargeExpended((p) => ({ ...p, ...recovered }));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeTurn]);

  const initials = initialsOf(name);
  const hpPct = hpMax > 0 ? Math.max(0, Math.min(100, (hpCurrent / hpMax) * 100)) : 0;
  const sizeLabel = m.size.charAt(0).toUpperCase() + m.size.slice(1);
  const incap = aggregateConditions(conditions ?? []).incapacitated;

  // Same deferral as the player HUD: a monster action that enters targeting tags
  // its spec with the current tile's economy and flags targeting, so runItem
  // defers the spend to target-commit (spent in TableCanvas).
  const enteredTargeting = useRef(false);
  const pendingEcon = useRef<AttackSpec["econ"]>(undefined);
  const enterTargeting = (spec: AttackSpec) => {
    enteredTargeting.current = true;
    onAttack({ ...spec, econ: pendingEcon.current });
  };

  const runAction = (a: NonNullable<MonsterStatblock["actions"]>[number]) => {
    if (a.attackBonus != null) {
      // Condition rider (slice D): a claw that paralyzes, a bite that poisons,
      // a chain that grapples — applied by the resolver when the hit lands.
      const rider = parseHitRider(a) ?? undefined;
      enterTargeting({ label: a.name, attackBonus: a.attackBonus, damage: a.damage, damageType: a.damageType, range: a.reach, rider });
      return;
    }
    // Save-based action (slice C): breath weapons, gaze attacks, poison saves.
    // Route through the SAME aim/save flow as spells — an area breath aims its
    // true footprint and each caught creature rolls; a single-target save
    // demands one save. Damage-less saves (Weakening Breath) still announce
    // until slice D handles condition riders.
    const sm = parseSaveAction(a);
    if (sm && sm.damage) {
      enterTargeting({
        label: a.name,
        attackBonus: 0,
        damage: sm.damage,
        damageType: sm.damageType,
        save: sm.save,
        dc: sm.dc,
        onSave: sm.onSave,
        range: a.reach,
        ...(sm.area
          ? { burst: true, burstShape: { shape: sm.area.shape, size: sm.area.size } }
          : {}),
      });
      return;
    }
    onNote(a.text ? `${a.name} — ${a.text}` : a.name);
  };

  // Cast a monster spell from a spell tab — routes like the player HUD, spends
  // an ephemeral slot for leveled spells.
  const castMonsterSpell = async (spellName: string, level: number) => {
    const g = casting?.groups.find((x) => x.level === level);
    const remaining = level === 0 ? Infinity : g ? g.max - (spellUsed[level] ?? 0) : 0;
    if (level > 0 && remaining <= 0) {
      onNote(`No level ${level} slots left.`);
      return;
    }
    const mech = spellMech(spellName);
    const atk = casting?.attackBonus ?? 0;
    const dc = casting?.saveDC ?? null;
    const lvl = casting?.charLevel ?? 1;
    // Spend the (ephemeral) slot up front — spent even if countered.
    if (level > 0) setSpellUsed((u) => ({ ...u, [level]: (u[level] ?? 0) + 1 }));
    // Counterspell window for leveled spells — fizzle on a counter.
    if (level > 0 && onCounterspellCheck) {
      const countered = await onCounterspellCheck(spellName, level);
      if (countered) return;
    }
    const range = spellRangeOf(spellName);
    if (mech?.lingering && mech.area) {
      enterTargeting({
        label: spellName,
        attackBonus: 0,
        burst: true,
        // Monster caster: no character sheet → no concentration link (#125); the
        // DM removes monster areas by hand.
        placeArea: { shape: mech.area.shape, size: mech.area.size, damageType: mech.damageType, level: lvl, movable: mech.movable, damage: mech.damage },
        save: mech.save,
        dc: dc ?? undefined,
        condition: mech.condition,
        range,
      });
    } else if (mech?.kind === "attack" && mech.damage) {
      const dmgExpr = mech.darts ? dartDamage(mech.darts, mech.darts === 3 ? 1 : lvl, lvl) : mech.scales ? scaleCantrip(mech.damage, lvl) : mech.damage;
      enterTargeting({
        label: spellName,
        attackBonus: mech.autoHit ? 0 : atk,
        damage: dmgExpr,
        damageType: mech.damageType,
        range,
        autoHit: mech.autoHit,
        vfx: mech.vfx,
      });
    } else if (mech?.kind === "save" && mech.damage && (mech.burst || mech.area)) {
      // Aimed AoE — true footprint + per-caught saves (slice B).
      enterTargeting({
        label: spellName,
        attackBonus: 0,
        damage: mech.scales ? scaleCantrip(mech.damage, lvl) : mech.damage,
        damageType: mech.damageType,
        save: mech.save,
        dc: dc ?? undefined,
        onSave: level === 0 ? "none" : "half",
        vfx: mech.vfx,
        burst: true,
        burstShape: mech.area ? { shape: mech.area.shape, size: mech.area.size } : undefined,
        range,
      });
    } else if (mech?.kind === "save" && mech.damage) {
      // Single-target save-for-damage (slice A) — same relay as the player HUD:
      // the defender rolls on their client. Cantrips: nothing on save.
      enterTargeting({
        label: spellName,
        attackBonus: 0,
        damage: mech.scales ? scaleCantrip(mech.damage, lvl) : mech.damage,
        damageType: mech.damageType,
        save: mech.save,
        dc: dc ?? undefined,
        onSave: level === 0 ? "none" : "half",
        vfx: mech.vfx,
        range,
      });
    } else if (mech?.kind === "heal" && mech.heal) {
      enterTargeting({ label: spellName, attackBonus: 0, heal: mech.heal, range });
    } else if (mech?.kind === "cleanse") {
      enterTargeting({ label: spellName, attackBonus: 0, cleanse: mech.cures ?? [], range });
    } else if (mech?.kind === "condition") {
      enterTargeting({ label: spellName, attackBonus: 0, condition: mech.condition ?? "", save: mech.save, dc: dc ?? undefined, restrictType: mech.onlyType, range });
    } else if (mech?.kind === "move") {
      onMove?.(spellName);
    } else {
      onNote(`${name} casts ${spellName}${level > 0 && dc != null ? ` — save DC ${dc}` : ""}.`);
    }
  };

  interface MSlot { id: string; icon: IconName; glyph?: string; name: string; sub: string; kind: "attack" | "common"; run: () => void; disabled?: boolean; econ?: "action" | "bonus" | "reaction"; recharge?: number; expended?: boolean; activeFx?: boolean; }
  // Multiattack isn't a button — it becomes the Main-action COUNT (two attacks
  // to spend). The casting trait lives in the spell tabs.
  const mainMax = multiattackCount(m.actions);
  const mainActions: MSlot[] = (m.actions ?? [])
    .filter((a) => !/spellcasting/i.test(a.name) && !/multiattack/i.test(a.name))
    .map((a) => {
      // Recharge abilities: usable once, then expended until they recharge on a
      // start-of-turn d6. The threshold is parsed from the name suffix.
      const thr = rechargeThreshold(a.name);
      const expended = thr != null && !!rechargeExpended[a.name];
      // Save actions (breath weapons) advertise their DC + damage on the tile,
      // like an attack shows its to-hit (slice C).
      const sm = a.attackBonus == null ? parseSaveAction(a) : null;
      // Attacks show their to-hit; a condition rider adds "· poisons" so the DM
      // sees the bite bites (slice D).
      const rider = a.attackBonus != null ? parseHitRider(a) : null;
      const riderSub = rider ? ` · ${rider.condition === "grappled" ? "grapples" : rider.condition}` : "";
      const baseSub = a.attackBonus != null
        ? `${formatMod(a.attackBonus)}${a.damage ? ` · ${a.damage}` : ""}${riderSub}`
        : sm && sm.damage
          ? `${sm.save} DC ${sm.dc} · ${sm.damage}`
          : "action";
      return {
        id: a.name,
        icon: a.attackBonus != null ? ("swords" as IconName) : ("dice" as IconName),
        glyph: actionGlyphByName(a.name, a.attackBonus != null),
        name: stripRecharge(a.name),
        sub: thr != null ? (expended ? `recharge ${rechargeLabel(thr)} · spent` : `recharge ${rechargeLabel(thr)}`) : baseSub,
        kind: a.attackBonus != null ? ("attack" as const) : ("common" as const),
        run: () => {
          runAction(a);
          if (thr != null) setRechargeExpended((p) => ({ ...p, [a.name]: true }));
        },
        disabled: expended,
        recharge: thr ?? undefined,
        expended,
        econ: "action" as const,
      };
    });
  // Hide / Search for monsters too (slice H) — an ambusher hides, guards search
  // for a hidden PC. The Hidden state drives per-viewer visibility just like a
  // PC's. `mHidden` = this creature is currently hidden.
  const mHidden = isStealthHidden(buffs);
  mainActions.push(
    { id: "m-hide", icon: "eye-off", glyph: glyphSrc("action_hide"), name: "Hide", sub: mHidden ? "hidden" : "Stealth", kind: "common", run: () => { if (!mHidden) onHide?.(); }, econ: "action" as const, activeFx: mHidden },
    { id: "m-search", icon: "search", glyph: glyphSrc("action_search"), name: "Search", sub: "Perception", kind: "common", run: () => onSearch?.(), econ: "action" as const },
  );
  const bonusActions: MSlot[] = (m.bonusActions ?? []).map((b) => ({
    id: b.name,
    icon: "dice" as IconName,
    glyph: glyphSrc("action_magic"),
    name: b.name,
    sub: "bonus",
    kind: "common" as const,
    run: () => onNote(b.text ? `${b.name} — ${b.text}` : b.name),
    econ: "bonus" as const,
  }));
  const spellTilesFor = (level: number): MSlot[] => {
    const g = casting?.groups.find((x) => x.level === level);
    if (!g) return [];
    const remaining = level === 0 ? Infinity : g.max - (spellUsed[level] ?? 0);
    return g.spells.map((spellName) => {
      const mech = spellMech(spellName);
      const econKind = spellEconOf(spellName);
      const mechSub =
        mech?.kind === "attack" ? "attack" : mech?.kind === "save" ? `${mech.save} save` : mech?.kind === "heal" ? "heal" : mech?.kind === "cleanse" ? "restore" : level === 0 ? "cantrip" : `lvl ${level}`;
      return {
        id: `spell-${spellName}`,
        icon: "sparkles" as IconName,
        glyph: glyphSrc(mech?.kind === "attack" ? "attack_spell" : "action_magic"),
        name: spellName,
        sub: econKind === "action" ? mechSub : spellEconLabel(econKind),
        kind: "common" as const,
        run: () => castMonsterSpell(spellName, level),
        disabled: remaining <= 0,
        econ: econKind === "bonus" ? ("bonus" as const) : econKind === "reaction" ? ("reaction" as const) : ("action" as const),
      };
    });
  };
  // REACTION tab: the statblock's own reactions, reaction-cast spells, and an
  // Opportunity Attack from the first melee action. All spend the reaction.
  const firstAttack = (m.actions ?? []).find((a) => a.attackBonus != null && !/multiattack/i.test(a.name));
  const reactionItems: MSlot[] = [
    ...(firstAttack
      ? [{
          id: "opportunity",
          icon: "swords" as IconName,
          glyph: actionGlyphByName(firstAttack.name, true),
          name: "Opportunity Attack",
          sub: `${formatMod(firstAttack.attackBonus!)} · foe leaves reach`,
          kind: "attack" as const,
          run: () => runAction(firstAttack),
          econ: "reaction" as const,
        }]
      : []),
    ...(m.reactions ?? []).map((r) => ({
      id: `reaction-${r.name}`,
      icon: "shield" as IconName,
      glyph: glyphSrc("action_ready"),
      name: r.name,
      sub: "reaction",
      kind: "common" as const,
      run: () => onNote(r.text ? `${r.name} — ${r.text}` : r.name),
      econ: "reaction" as const,
    })),
    ...(casting?.groups ?? []).flatMap((g) =>
      g.spells
        .filter((sp) => spellEconOf(sp) === "reaction")
        .map((sp) => ({
          id: `react-${sp}`,
          icon: "sparkles" as IconName,
          glyph: glyphSrc("action_magic"),
          name: sp,
          sub: g.level === 0 ? "reaction" : `reaction · lvl ${g.level}`,
          kind: "common" as const,
          run: () => castMonsterSpell(sp, g.level),
          disabled: g.level > 0 && g.max - (spellUsed[g.level] ?? 0) <= 0,
          econ: "reaction" as const,
        }))
    ),
  ];
  const tabItems: MSlot[] =
    actionTab === "main" ? mainActions
    : actionTab === "bonus" ? bonusActions
    : actionTab === "cantrip" ? spellTilesFor(0)
    : actionTab === "reaction" ? reactionItems
    : actionTab === "items" ? [] // monsters have no item-charge spellcasting (#88)
    : spellTilesFor(actionTab);

  const itemDisabled = (s: MSlot): boolean =>
    incap ||
    !!s.disabled ||
    (!!economy && s.econ === "action" && economy.action >= mainMax) ||
    (!!economy && s.econ === "bonus" && economy.bonus) ||
    (!!economy && s.econ === "reaction" && economy.reaction);
  const runItem = (s: MSlot) => {
    if (itemDisabled(s)) return;
    enteredTargeting.current = false;
    pendingEcon.current = s.econ;
    s.run();
    // Targeted actions defer to target-commit; immediate ones spend now.
    if (s.econ && !enteredTargeting.current) onSpend?.(s.econ);
  };


  const applyHp = (fn: typeof applyDamage) => onHp(fn({ current: hpCurrent, max: hpMax, temp: 0 }, amount).current);

  if (min) {
    return (
      <button className="thud-pill" onClick={() => setMin(false)} aria-label={`Show ${name}'s bar`}>
        {image ? <img className="thud-pill-pf" src={image} alt="" /> : <span className="thud-pill-pf">{initials}</span>}
        <span className="thud-pill-nm">{name}</span>
        <span className="thud-pill-hp"><i style={{ width: `${hpPct}%` }} /></span>
        <Icon name="up" size={14} />
      </button>
    );
  }

  return (
    <div className={`thud ${activeTurn ? "is-turn" : ""}`} aria-live="polite">
      <div className="thud-who">
        <button className="thud-pf-btn" onClick={() => setSheetOpen(true)} title="Open creature sheet" aria-label="Open creature sheet">
          {image ? <img className="thud-pf" src={image} alt="" /> : <div className="thud-pf">{initials}</div>}
        </button>
        <div className="thud-who-text">
          <div className="thud-nm">{name}</div>
          <div className="thud-sub">{sizeLabel} {m.type} · CR {m.cr}</div>
          <button type="button" className={`thud-hp is-editable ${hpOpen ? "is-open" : ""}`}
            onClick={() => setHpOpen((o) => !o)} aria-expanded={hpOpen} title="Adjust hit points">
            <div className="thud-hp-row"><span>Hit Points</span><span><b>{hpCurrent}</b>/{hpMax}</span></div>
            <div className="thud-hp-track"><i style={{ width: `${hpPct}%` }} /></div>
          </button>
          {hpOpen && (
            <div className="thud-hp-edit" onClick={(e) => e.stopPropagation()}>
              <input type="number" value={amount} onChange={(e) => setAmount(Math.max(0, parseInt(e.target.value, 10) || 0))} aria-label="Amount" />
              <button className="is-heal" onClick={() => applyHp(applyHeal)}>Heal</button>
              <button className="is-dmg" onClick={() => applyHp(applyDamage)}>Damage</button>
            </div>
          )}
        </div>
      </div>

      <div className="thud-rule" />

      <StatusStrip conditions={conditions ?? []} buffs={buffs ?? []} />

      <div className="thud-acts">
        {tabItems.map((s, i) => (
          <button
            key={s.id}
            className={`thud-act is-glyph is-${s.kind} ${s.recharge != null ? "is-recharge" : ""} ${s.expended ? "is-expended" : ""}${s.activeFx ? " is-active-effect" : ""}`}
            onClick={() => runItem(s)}
            disabled={itemDisabled(s)}
            aria-label={s.name}
            title={
              incap
                ? "Incapacitated — can't act"
                : s.recharge != null
                  ? s.expended
                    ? `${s.name} is spent — rolls to recharge (${rechargeLabel(s.recharge)}) at the start of each turn`
                    : `${s.name} — usable, then recharges on a ${rechargeLabel(s.recharge)}`
                  : `${s.name} — ${s.sub}`
            }
          >
            {i < 9 && <span className="thud-act-key" aria-hidden="true">{i + 1}</span>}
            {s.glyph ? <GameGlyph src={s.glyph} size={24} /> : <Icon name={s.icon} size={18} />}
            <span className="thud-act-s">{tileCaption(s.name, s.sub)}</span>
            {s.recharge != null && (
              <span className="thud-act-rc" aria-hidden="true">
                <Icon name="reset" size={11} />
              </span>
            )}
          </button>
        ))}
        {tabItems.length === 0 && (
          <span className="thud-empty">
            {actionTab === "main" ? "No actions on this statblock." : actionTab === "bonus" ? "No bonus actions." : actionTab === "reaction" ? "No reactions." : "No spells at this level."}
          </span>
        )}
      </div>

      <ResourceStrip
        eco={economy ?? null}
        slots={(casting?.groups ?? [])
          .filter((g) => g.level > 0 && g.max > 0)
          .map((g) => ({ level: g.level, max: g.max, used: spellUsed[g.level] ?? 0 }))}
        hasCantrip={(casting?.groups ?? []).some((g) => g.level === 0 && g.spells.length > 0)}
        hasReactions={reactionItems.length > 0}
        mainMax={mainMax}
        activeTab={actionTab}
        onSelectTab={setActionTab}
        onEndTurn={onEndTurn}
        endTurnEnabled={endTurnEnabled}
      />

      {/* The creature sheet opens from the portrait now (top-left). */}
      {sheetOpen && <CreatureSheet m={m} name={name} image={image} onClose={() => setSheetOpen(false)} />}

      <button className="thud-min" onClick={() => setMin(true)} aria-label="Hide the bar" title="Hide the bar">
        <Icon name="left" size={14} />
      </button>
    </div>
  );
};
