import type { Character } from "../types/character";

export const sampleCharacter: Character = {
  id: "00000000-0000-4000-8000-000000000001",
  name: "Drashk",
  species: "Goliath",
  background: "Soldier",
  alignment: "Chaotic Neutral",
  classes: [{ name: "Barbarian", level: 5, subclass: "Path of the Berserker", hitDie: 12 }],
  level: 5,
  xp: 6500,

  abilities: {
    STR: { base: 18, bonus: 0 },
    DEX: { base: 13, bonus: 0 },
    CON: { base: 16, bonus: 0 },
    INT: { base: 8, bonus: 0 },
    WIS: { base: 12, bonus: 0 },
    CHA: { base: 8, bonus: 0 },
  },
  saveProficiencies: ["STR", "CON"],
  saveBonuses: {},

  skillProficiencies: ["Animal Handling", "Athletics", "Intimidation", "Perception", "Survival"],
  skillExpertise: [],
  skillBonuses: {},

  hp: { current: 75, max: 75, temp: 0 },
  hitDiceUsed: 0,

  ac: { value: 14 },
  speed: 40,
  initiativeBonus: 0,
  inspiration: false,

  conditions: [],
  defenses: { resistances: ["Cold"], immunities: [], vulnerabilities: [] },

  attacks: [
    {
      id: "atk-greataxe",
      name: "Greataxe",
      ability: "STR",
      proficient: true,
      damage: "1d12",
      damageType: "slashing",
      range: "5",
      notes: "Martial, Heavy, Two-Handed, Cleave",
    },
    {
      id: "atk-javelin",
      name: "Javelin",
      ability: "STR",
      proficient: true,
      damage: "1d6",
      damageType: "piercing",
      range: "30/120",
      notes: "Simple, Thrown, Slow",
    },
    {
      id: "atk-dagger",
      name: "Dagger",
      ability: "STR",
      proficient: true,
      damage: "1d4",
      damageType: "piercing",
      range: "20/60",
      notes: "Simple, Finesse, Light, Thrown, Nick",
    },
  ],

  inventory: [
    { id: "inv-greataxe", name: "Greataxe", qty: 1, weight: 7, equipped: true, type: "weapon", damage: "1d12", damageType: "slashing", properties: ["Heavy", "Two-Handed", "Cleave"] },
    { id: "inv-javelin", name: "Javelin", qty: 4, weight: 2, type: "weapon", damage: "1d6", properties: ["Thrown", "Slow"], range: "30/120" },
    { id: "inv-dagger", name: "Dagger", qty: 2, weight: 1, type: "weapon", damage: "1d4", properties: ["Finesse", "Light", "Thrown", "Nick"], range: "20/60", finesse: true },
    { id: "inv-hide", name: "Hide Armor", qty: 1, weight: 12, equipped: true, type: "armor", notes: "AC 12 + DEX (max 2)" },
    { id: "inv-bedroll", name: "Bedroll", qty: 1, weight: 7, type: "gear" },
    { id: "inv-mess-kit", name: "Mess Kit", qty: 1, weight: 1, type: "gear" },
    { id: "inv-pot", name: "Iron Pot", qty: 1, weight: 10, type: "gear" },
    { id: "inv-leatherworkers", name: "Leatherworker's Tools", qty: 1, weight: 5, type: "tool" },
  ],
  currency: { cp: 0, sp: 0, ep: 0, gp: 42, pp: 0 },

  features: [
    {
      id: "feat-rage",
      name: "Rage",
      source: "class",
      sourceDetail: "Barbarian 1",
      description:
        "As a bonus action enter a rage for up to 1 minute. You gain advantage on STR checks and saves (not attacks), +2 melee damage with STR weapons, resistance to bludgeoning/piercing/slashing. You can't cast or concentrate while raging.",
      uses: { max: 3, current: 3, recharge: "long" },
    },
    {
      id: "feat-unarmored-defense",
      name: "Unarmored Defense",
      source: "class",
      sourceDetail: "Barbarian 1",
      description: "While not wearing armor, your AC equals 10 + DEX modifier + CON modifier + any shield bonus.",
    },
    {
      id: "feat-reckless-attack",
      name: "Reckless Attack",
      source: "class",
      sourceDetail: "Barbarian 2",
      description:
        "Attack rolls with STR melee weapons have advantage this turn, but attack rolls against you have advantage until your next turn.",
    },
    {
      id: "feat-danger-sense",
      name: "Danger Sense",
      source: "class",
      sourceDetail: "Barbarian 2",
      description:
        "Advantage on DEX saves against effects you can see while not blinded, deafened, or incapacitated.",
    },
    {
      id: "feat-stones-endurance",
      name: "Stone's Endurance",
      source: "species",
      sourceDetail: "Goliath",
      description: "As a reaction when damaged, reduce damage taken by 1d12 + CON modifier. Once per short rest.",
      uses: { max: 1, current: 1, recharge: "short" },
    },
    {
      id: "feat-extra-attack",
      name: "Extra Attack",
      source: "class",
      sourceDetail: "Barbarian 5",
      description: "You can attack twice when you take the Attack action on your turn.",
    },
    {
      id: "feat-fast-movement",
      name: "Fast Movement",
      source: "class",
      sourceDetail: "Barbarian 5",
      description: "Your speed increases by 10 ft while not wearing heavy armor (already included).",
    },
  ],

  proficiencies: {
    armor: ["Light Armor", "Medium Armor", "Shields"],
    weapons: ["Simple Weapons", "Martial Weapons"],
    tools: ["Leatherworker's Tools", "Vehicles (Land)"],
    languages: ["Common", "Giant"],
  },

  senses: {},

  notes: {
    personality: "I face problems head-on. A simple, direct solution is the best path to success.",
    ideals: "Might. In life as in war, the stronger force wins.",
    bonds: "I fight for those who cannot fight for themselves.",
    flaws: "I have little respect for anyone who is not a proven warrior.",
  },
};
