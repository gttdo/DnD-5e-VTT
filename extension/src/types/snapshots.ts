/**
 * Snapshots produced by the content-script scrapers. These shapes follow
 * the recon docs in /docs/recon/dndbeyond-{campaigns,character-sheet}.md.
 *
 * Keep these in sync with the web app's Supabase tables — they are the
 * wire format the extension uses to write to Postgres.
 */

export type Surface =
  | { kind: "campaign-list"; url: string }
  | { kind: "campaign-detail"; url: string; campaignId: number }
  | { kind: "character-sheet"; url: string; charId: number }
  | { kind: "unknown"; url: string };

export interface CampaignSummary {
  id: number;
  name: string;
  player_count: number;
  role: "dm" | "player";
  started_at: string | null; // "MM/DD/YYYY"
  content_sharing?: { enabled: boolean; by?: string };
}

export interface CampaignListSnapshot {
  observed_at: string;
  campaigns: CampaignSummary[];
}

export interface CampaignPartyMember {
  char_id: number;
  username: string;
  name: string;
  total_level: number;
  species: string;
  class: string;
  subclass: string | null;
}

export interface CampaignDetailSnapshot {
  observed_at: string;
  id: number;
  name: string;
  description_html: string;
  invite_token: string | null;
  party: CampaignPartyMember[];
  dm_notes_private_html: string | null;
  dm_notes_public_html: string | null;
}

export type Ability = "STR" | "DEX" | "CON" | "INT" | "WIS" | "CHA";

export type SkillName =
  | "Acrobatics" | "Animal Handling" | "Arcana" | "Athletics"
  | "Deception" | "History" | "Insight" | "Intimidation"
  | "Investigation" | "Medicine" | "Nature" | "Perception"
  | "Performance" | "Persuasion" | "Religion" | "Sleight of Hand"
  | "Stealth" | "Survival";

export interface Roll {
  /** D&D Beyond campaign id this roll belongs to (parsed from the page URL). */
  campaign_dnd_id: number | null;
  character_name: string;
  /** Roll name as shown on D&D Beyond: "Dagger", "Fire Bolt", "NATURE", etc. */
  action: string;
  /** Roll kind from D&D Beyond: "to hit" | "damage" | "roll" | "check" | "save". */
  action_type: string;
  /** "TO: ..." target if present. */
  target: string | null;
  /** Formula breakdown shown in the entry, e.g. "9 + 7". */
  formula: string | null;
  /** Total displayed in the entry. */
  total: number | null;
  /** Dice notation shown in the entry, e.g. "1d20+7". */
  dice: string | null;
  /** Free-form note rendered alongside the entry, e.g. "Rolled with Flourishing". */
  note: string | null;
  /** Timestamp the entry shows ("M/D/YYYY h:mm AM/PM"). */
  observed_at: string;
  /** Stable per-entry key derived from text content so duplicates are dropped. */
  key: string;
}

export interface CharacterSheetSnapshot {
  observed_at: string;
  source_url: string;
  char_id: number;
  username: string | null;

  name: string;
  gender: string | null;
  species: string;
  classes: Array<{ name: string; level: number; subclass: string | null }>;
  total_level: number;
  xp: { current: number; next: number } | null;
  campaign: { id: number; name: string } | null;

  abilities: Record<Ability, { score: number; modifier: number }>;
  proficiency_bonus: number;
  initiative_bonus: number;
  walking_speed: number;
  inspiration: boolean;
  hp: { current: number; max: number; temp: number };

  saves: Record<Ability, { bonus: number; proficient: boolean }>;
  save_notes: string[];

  skills: Record<SkillName, {
    ability: Ability;
    bonus: number;
    proficient: boolean;
    expertise: boolean;
  }>;

  passive: { perception: number; investigation: number; insight: number };
  senses: string[];
  ac: number;
  defenses: {
    resistances: string[];
    immunities: string[];
    vulnerabilities: string[];
  };
  conditions: string[];

  proficiencies: {
    armor: string[];
    weapons: string[];
    tools: string[];
    languages: string[];
  };

  // Tab content — populated when those tabs have been rendered at least once.
  attacks?: Array<{
    name: string;
    kind: string;
    range: string;
    to_hit: number | null;
    damage: string | null;
    notes: string[];
  }>;
  attacks_per_action?: number;
  inventory?: {
    weight_carried: number;
    currency: { cp: number; sp: number; ep: number; gp: number; pp: number };
    items: Array<{
      name: string;
      qty: number;
      weight: number;
      cost: number;
      tags: string[];
      notes: string[];
      active: boolean;
    }>;
  };
  features?: Array<{
    source: "class" | "species" | "feat" | "background";
    source_detail: string;
    name: string;
    description: string;
    uses: { max: number; remaining: number; recharge: "short" | "long" | "day" } | null;
  }>;
  spells?: {
    modifier: number;
    spell_attack: number;
    save_dc: number;
    by_level: Record<number, Array<{
      name: string;
      source: string;
      casting_time: string;
      range: string;
      hit_or_dc: string | null;
      effect: string | null;
      notes: string;
      at_will: boolean;
    }>>;
  };
}
