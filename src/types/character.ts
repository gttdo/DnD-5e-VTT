export type Ability = "STR" | "DEX" | "CON" | "INT" | "WIS" | "CHA";

export const ABILITIES: Ability[] = ["STR", "DEX", "CON", "INT", "WIS", "CHA"];

export const ABILITY_FULL: Record<Ability, string> = {
  STR: "Strength",
  DEX: "Dexterity",
  CON: "Constitution",
  INT: "Intelligence",
  WIS: "Wisdom",
  CHA: "Charisma",
};

export const SKILLS = [
  { name: "Acrobatics", ability: "DEX" },
  { name: "Animal Handling", ability: "WIS" },
  { name: "Arcana", ability: "INT" },
  { name: "Athletics", ability: "STR" },
  { name: "Deception", ability: "CHA" },
  { name: "History", ability: "INT" },
  { name: "Insight", ability: "WIS" },
  { name: "Intimidation", ability: "CHA" },
  { name: "Investigation", ability: "INT" },
  { name: "Medicine", ability: "WIS" },
  { name: "Nature", ability: "INT" },
  { name: "Perception", ability: "WIS" },
  { name: "Performance", ability: "CHA" },
  { name: "Persuasion", ability: "CHA" },
  { name: "Religion", ability: "INT" },
  { name: "Sleight of Hand", ability: "DEX" },
  { name: "Stealth", ability: "DEX" },
  { name: "Survival", ability: "WIS" },
] as const satisfies ReadonlyArray<{ name: string; ability: Ability }>;

export type SkillName = (typeof SKILLS)[number]["name"];

export type Condition =
  | "Blinded" | "Charmed" | "Deafened" | "Frightened" | "Grappled"
  | "Incapacitated" | "Invisible" | "Paralyzed" | "Petrified" | "Poisoned"
  | "Prone" | "Restrained" | "Stunned" | "Unconscious" | "Exhaustion";

export interface AbilityScore {
  base: number;
  bonus: number;       // from background ASIs etc.
  override?: number;   // hard override
}

export interface InventoryItem {
  id: string;
  name: string;
  qty: number;
  weight: number;      // per item, lbs
  cost?: number;       // in gp
  equipped?: boolean;
  attuned?: boolean;
  notes?: string;
  type?: "weapon" | "armor" | "gear" | "tool" | "consumable" | "treasure";
  /** for weapons */
  damage?: string;     // e.g. "1d8"
  damageType?: string; // e.g. "slashing"
  properties?: string[];
  range?: string;      // e.g. "5" or "20/60"
  finesse?: boolean;
  /** Which body slot this occupies when equipped (paper doll). Optional: older
   *  items and untyped gear infer a slot from their type — see lib/equip. */
  slot?: EquipSlot;
  /** Generated/library/uploaded item art (square), shown on the inventory grid
   *  and paper doll. Filled by the item generator (sibling of tokenSmith). */
  art?: string;
  /** Item-granted spellcasting (#88): a magic item (wand, staff, ring…) that can
   *  cast these spells — by name, keying the spell dataset + spellMechanics — from
   *  its OWN charge pool instead of the wielder's slots. Surfaced as the HUD's
   *  Items tab. */
  grantedSpells?: string[];
  /** The item's charge pool that powers `grantedSpells`. `recharge` says when it
   *  refills to `max`: at dawn / on a long rest (both reset on a long rest), or on
   *  a short rest. Absent recharge → never auto-refills. */
  charges?: { max: number; current: number; recharge?: "short" | "long" | "dawn" };
  /** Charges spent per cast, by spell name (default 1). A Staff of Fire spends 3
   *  for Fireball, 4 for Wall of Fire — set those here; a plain wand omits it. */
  spellCost?: Record<string, number>;
}

/** Paper-doll equip slots. */
export type EquipSlot = "head" | "amulet" | "chest" | "cloak" | "main" | "off" | "hands" | "boots" | "ring";

export interface Attack {
  id: string;
  name: string;
  ability: Ability;
  proficient: boolean;
  damage: string;        // dice notation
  damageType?: string;
  bonusToHit?: number;   // extra +X to hit
  bonusToDamage?: number;
  range?: string;
  notes?: string;
}

export interface ClassEntry {
  name: string;          // matches classes.json key
  level: number;
  subclass?: string;
  hitDie: 6 | 8 | 10 | 12;
}

export interface Feature {
  id: string;
  name: string;
  source: "class" | "species" | "feat" | "background" | "other";
  sourceDetail?: string; // e.g. "Barbarian 1"
  description: string;
  uses?: { max: number; current: number; recharge: "short" | "long" | "day" | "none" };
}

export interface Currency {
  cp: number; sp: number; ep: number; gp: number; pp: number;
}

/**
 * Spellcasting state. Stores spell NAMES that key into the shared dataset
 * (public/data/spells.json) — never copies of the spell rows — so a data
 * correction fixes every character at once.
 *
 * Optional on Character: existing saved characters predate it, so all
 * consumers must tolerate `undefined` (the sheet treats that as "no spells").
 */
export interface Spellcasting {
  /** Spells the character knows / has in their book. */
  known: string[];
  /** Subset of `known` currently prepared (classes that prepare). */
  prepared: string[];
  /** Slots spent per spell level ("1"–"9"). Cleared by a long rest. */
  slotsUsed: Record<string, number>;
  /**
   * The spell this character is currently concentrating on (its name), or
   * null/absent when not concentrating. Only one at a time — casting another
   * concentration spell replaces it. Dropped on a failed CON save or when
   * incapacitated. Lives here (JSON on the character row) so it persists and
   * shows on the sheet; no migration needed.
   */
  concentratingOn?: string | null;
  /**
   * Innate spells granted by a species lineage (#148) — Drow's Dancing Lights,
   * a Tiefling legacy's cantrip, etc. Listed in `known` too, but tracked here
   * with their own casting ability so they get a save DC independent of any
   * class (a non-caster can have these).
   */
  innate?: { ability: Ability; spells: string[] };
}

export interface Character {
  id: string;
  name: string;
  portrait?: string;
  /** AI-generated 16:9 scene used as the sheet backdrop (falls back to class art). */
  bgImage?: string;
  species: string;
  /** Chosen subrace/lineage/ancestry, e.g. "Drow", "Red", "Infernal" (#148). */
  lineage?: string;
  /** Sorcery Points spent (#97). Pool derives from Sorcerer level; reset on a Long Rest. */
  sorceryPointsUsed?: number;
  background: string;
  alignment?: string;
  classes: ClassEntry[];
  level: number;       // total
  xp: number;

  abilities: Record<Ability, AbilityScore>;
  saveProficiencies: Ability[];
  saveBonuses: Partial<Record<Ability, number>>;

  skillProficiencies: SkillName[];
  skillExpertise: SkillName[];
  skillBonuses: Partial<Record<SkillName, number>>;

  hp: { current: number; max: number; temp: number };
  hitDiceUsed: number;

  ac: { value: number; override?: number };
  speed: number;
  initiativeBonus: number;
  inspiration: boolean;

  conditions: Condition[];
  defenses: { resistances: string[]; immunities: string[]; vulnerabilities: string[] };

  attacks: Attack[];
  inventory: InventoryItem[];
  currency: Currency;
  spellcasting?: Spellcasting;

  features: Feature[];

  proficiencies: {
    armor: string[];
    weapons: string[];
    tools: string[];
    languages: string[];
  };

  senses: { passivePerception?: number; passiveInvestigation?: number; passiveInsight?: number; other?: string[] };

  notes: {
    personality?: string;
    ideals?: string;
    bonds?: string;
    flaws?: string;
    backstory?: string;
    allies?: string;
    other?: string;
  };
}
