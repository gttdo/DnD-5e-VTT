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
}

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

export interface Character {
  id: string;
  name: string;
  portrait?: string;
  species: string;
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
