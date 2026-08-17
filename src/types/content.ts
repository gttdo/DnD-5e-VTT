import type { Ability } from "./character";
import type { TokenSize } from "../lib/tokenSmith";

/**
 * Content created in the token studio: monsters, NPCs, and magic items. Each is
 * an image PLUS structured details, stored in `token_assets.details` (jsonb)
 * and discriminated by `token_assets.token_type`.
 *
 * The monster shape is deliberately the one the DM HUD (#64) reads — a token's
 * statblock and its in-combat statblock are the same object, so a monster
 * placed on the map can act straight away.
 *
 * Sourcing: known creatures are looked up in the bundled SRD bestiary
 * (CC-BY-4.0); anything else is generated CR-appropriately and hand-editable.
 * Numbers are facts; any flavor text is paraphrased, never copied from a book.
 */

export type TokenType = "monster" | "npc" | "item" | "prop" | "spell";

export type SpellAreaShape = "sphere" | "cube" | "cone" | "line" | "cylinder" | "emanation";

/**
 * A spell in the library / placed on the board. Two independent things live
 * here and must not be conflated:
 *   • RANGE — the targeting distance (Magic Missile: 120 ft; a cone: "Self").
 *     Most spells have a range; it says nothing about an area.
 *   • AREA  — the area-of-effect footprint. OPTIONAL — many spells have none
 *     (single-target, self-buff, touch). Absent `areaShape` = no area, and the
 *     board renders the spell's art rather than a translucent AoE shape.
 */
export interface SpellTokenDetails {
  name: string;
  level?: number; // 0 = cantrip
  school?: string;
  classes?: string[];
  castingTime?: string; // "Action", "Bonus Action", "1 minute", "Reaction", …
  /** Targeting distance — INDEPENDENT of area. "120 feet", "Self", "Touch". */
  range?: string;
  components?: string; // "V, S, M (…)"
  duration?: string; // "Instantaneous", "Concentration, up to 1 minute"
  concentration?: boolean;
  ritual?: boolean;
  damageType?: string;
  /** Area of effect — OPTIONAL. Leave undefined for spells with no area
   *  ("none" in the studio menu). One of the geometry shapes when present. */
  areaShape?: SpellAreaShape;
  /** Feet — radius for sphere/cylinder/emanation, length for cube/cone/line.
   *  Only meaningful alongside an `areaShape`. */
  areaSize?: number;
  description?: string;
}

/**
 * A scenery/object token — chairs, chests, rocks, barrels, doors. No stats, not
 * a combat target. A prop flagged `container` participates in the loot system
 * (a chest players can open).
 */
export interface PropDetails {
  name: string;
  /** Freeform category — "container", "furniture", "debris", "door", … */
  category?: string;
  /** True for chests/crates/etc. that hold loot. */
  container?: boolean;
  description?: string;
}

export type Rarity = "common" | "uncommon" | "rare" | "very rare" | "legendary" | "artifact";

export interface Speeds {
  walk?: number;
  fly?: number;
  swim?: number;
  climb?: number;
  burrow?: number;
  hover?: boolean;
}

/** A named entry with descriptive text — traits, reactions, legendary actions. */
export interface NamedEntry {
  name: string;
  text: string;
}

/**
 * A monster action. `text` is the human description; the optional structured
 * fields let the HUD roll it (attack → to-hit + damage; save-based → DC).
 */
export interface MonsterAction {
  name: string;
  text?: string;
  attackBonus?: number;
  reach?: string; // "5 ft" or "range 60/240 ft"
  damage?: string; // dice, e.g. "6d6+6"
  damageType?: string;
  saveDc?: number;
  saveAbility?: Ability;
}

export interface MonsterStatblock {
  name: string;
  size: TokenSize;
  type: string; // creature type: "Giant", "Beast", "Undead", …
  subtype?: string;
  alignment?: string;

  ac: number;
  acNote?: string; // "natural armor", "plate, shield"
  hp: number;
  hitDice?: string; // "12d12 + 60"
  speed: Speeds;

  abilities: Record<Ability, number>; // scores, 1–30
  saves?: Partial<Record<Ability, number>>; // bonus where proficient
  skills?: { name: string; bonus: number }[];

  damageResistances?: string[];
  damageImmunities?: string[];
  damageVulnerabilities?: string[];
  conditionImmunities?: string[];
  senses?: string[]; // "darkvision 60 ft", "passive Perception 13"
  languages?: string[];

  cr: string; // "8", "1/4", "0"
  proficiencyBonus?: number;

  initiative?: number; // 2024 stat blocks list an Initiative bonus
  gear?: string[]; // "Javelins", "Plate Armor"

  traits?: NamedEntry[];
  actions?: MonsterAction[];
  bonusActions?: NamedEntry[];
  reactions?: NamedEntry[];
  legendaryActions?: NamedEntry[];
  legendaryCount?: number;
  mythicActions?: NamedEntry[];
  lairActions?: string[];

  habitats?: string[];
  tags?: string[];
  description?: string;
  /** Attribution when sourced from the SRD (CC-BY-4.0). */
  source?: string;
}

export interface NpcProfile {
  name: string;
  ancestry?: string; // species / lineage
  role?: string; // occupation, station
  appearance?: string;
  personalityTrait?: string;
  ideal?: string;
  bond?: string;
  flaw?: string;
  voice?: string; // voice / mannerism cue for the DM
  motivation?: string;
  secret?: string; // DM-facing
  description?: string;
  /** Optional combat stats — an NPC that fights carries a statblock. */
  statblock?: MonsterStatblock;
}

export interface MagicItem {
  name: string;
  baseType?: string; // "Item" | "Armor" | "Weapon" — the D&D Beyond Base Item Type
  itemType: string; // Magic Item Type: "Wondrous item", "Potion", "Ring", "Weapon", …
  rarity: Rarity;
  attunement?: boolean;
  attunementNote?: string; // "by a spellcaster"
  description: string; // the effect text

  // Weapon extras
  baseWeapon?: string; // "Longsword", "Shortbow"
  damage?: string;
  damageType?: string;
  properties?: string[];

  // Armor extras
  armorClass?: string;
  dexBonus?: string; // "Yes", "Yes, max 2", "No"
  strRequirement?: number;
  stealthDisadvantage?: boolean;

  // Consumable / charged
  charges?: { max: number; recharge?: string };
  attachedSpells?: string[];

  weight?: number;
  cost?: string;
  tags?: string[];
}

/** Discriminated union stored in token_assets.details, keyed by token_type. */
export type TokenDetails =
  | { kind: "monster"; monster: MonsterStatblock }
  | { kind: "npc"; npc: NpcProfile }
  | { kind: "item"; item: MagicItem }
  | { kind: "prop"; prop: PropDetails }
  | { kind: "spell"; spell: SpellTokenDetails };
