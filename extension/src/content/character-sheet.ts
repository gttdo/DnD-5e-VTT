import type {
  Ability,
  CharacterSheetSnapshot,
  SkillName,
} from "../types/snapshots";

/**
 * Scrape /characters/{id} into a `CharacterSheetSnapshot`.
 *
 * Strategy: split the relevant region's innerText on newlines and walk
 * the lines token-by-token. D&D Beyond renders the sheet as a CSS grid
 * where every label, sign, and value is its own <span> — so innerText
 * preserves them as separate lines. Labels are SCREAMING CAPS.
 *
 * Sample HP block lines:
 *   ["HIT POINTS", "HEAL", "DAMAGE", "CURRENT", "75", "/", "MAX",
 *    "Max hit points", "75", "TEMP", "--"]
 *
 * Sample save line group (per save):
 *   ["Strength Saving Throw", "STR", "+", "7"]
 *
 * Sample skill row:
 *   ["DEX", "Acrobatics", "+", "1"]
 *
 * Verified live against Drashk on Borderland Heroes.
 */

const ABILITY_FULLS: Record<string, Ability> = {
  Strength: "STR",
  Dexterity: "DEX",
  Constitution: "CON",
  Intelligence: "INT",
  Wisdom: "WIS",
  Charisma: "CHA",
};

const SKILL_LIST: ReadonlyArray<{ name: SkillName; ability: Ability }> = [
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
];

const waitFor = async (
  predicate: () => boolean,
  { timeout = 10000, interval = 200 } = {}
): Promise<boolean> => {
  const start = Date.now();
  while (!predicate()) {
    if (Date.now() - start > timeout) return false;
    await new Promise((r) => setTimeout(r, interval));
  }
  return true;
};

const linesOf = (selector: string): string[] => {
  const el = document.querySelector<HTMLElement>(selector);
  if (!el) return [];
  return el.innerText.split(/\n+/).map((s) => s.trim()).filter(Boolean);
};

const linesOfBody = (): string[] =>
  document.body.innerText.split(/\n+/).map((s) => s.trim()).filter(Boolean);

const parseSignedNumber = (sign: string, num: string): number => {
  const n = parseInt(num, 10);
  if (Number.isNaN(n)) return 0;
  return sign === "-" ? -n : n;
};

const parseHeader = (): {
  name: string;
  gender: string | null;
  species: string;
  className: string;
  classLevel: number;
} => {
  // Layout (5 lines):
  //   "Drashk", "MANAGE", "MaleGoliathBarbarian 5", "LVL 5", "LVL 6", "6,500 / 14,000 XP"
  // Or for Level 2 chars without XP:
  //   "Arthur Candrix", "MANAGE", "MaleTieflingWizard 2", "Level 2"
  const lines = linesOf(".ct-character-header-info");
  const name = lines[0] ?? "";
  // Find the line that ends in " {digit}" — that's the gender+species+class+level glob
  const glob = lines.find((l) => /\s+\d+$/.test(l)) ?? "";
  const m = glob.match(
    /^(Male|Female|Nonbinary|Other|Agender|Genderfluid)?(.+?)([A-Z][a-zA-Z]+)\s+(\d+)$/
  );
  if (!m) {
    return {
      name,
      gender: null,
      species: "",
      className: "",
      classLevel: 1,
    };
  }
  return {
    name,
    gender: m[1] ?? null,
    species: m[2].trim(),
    className: m[3],
    classLevel: parseInt(m[4], 10),
  };
};

const parseAbilities = (): CharacterSheetSnapshot["abilities"] => {
  const out: CharacterSheetSnapshot["abilities"] = {
    STR: { score: 10, modifier: 0 },
    DEX: { score: 10, modifier: 0 },
    CON: { score: 10, modifier: 0 },
    INT: { score: 10, modifier: 0 },
    WIS: { score: 10, modifier: 0 },
    CHA: { score: 10, modifier: 0 },
  };
  const boxes = document.querySelectorAll<HTMLElement>(".ddbc-ability-summary");
  for (const box of boxes) {
    const lines = box.innerText.split(/\n+/).map((s) => s.trim()).filter(Boolean);
    // Lines: ["STRENGTH", "+", "4", "18"]
    if (lines.length < 4) continue;
    const full =
      lines[0][0].toUpperCase() + lines[0].slice(1).toLowerCase();
    const ability = ABILITY_FULLS[full];
    if (!ability) continue;
    const modifier = parseSignedNumber(lines[1], lines[2]);
    const score = parseInt(lines[3], 10);
    if (Number.isFinite(modifier) && Number.isFinite(score)) {
      out[ability] = { modifier, score };
    }
  }
  return out;
};

const parseHP = (): CharacterSheetSnapshot["hp"] => {
  // Lines: ["HIT POINTS","HEAL","DAMAGE","CURRENT","75","/","MAX","Max hit points","75","TEMP","--"]
  const lines = linesOf(".ct-quick-info__health");
  const findAfter = (label: string): string | undefined => {
    const idx = lines.findIndex((l) => l.toLowerCase() === label.toLowerCase());
    return idx >= 0 ? lines[idx + 1] : undefined;
  };
  const current = parseInt(findAfter("CURRENT") ?? "0", 10) || 0;
  const max = parseInt(findAfter("Max hit points") ?? "0", 10) || 0;
  const tempRaw = findAfter("TEMP") ?? "0";
  const temp = /^[\d]+$/.test(tempRaw) ? parseInt(tempRaw, 10) : 0;
  return { current, max, temp };
};

const parseCombat = (): { ac: number; initiative: number; defenses: string[]; conditions: string[] } => {
  // Lines: ["INITIATIVE","INITIATIVE","+","1","ARMOR CLASS","ARMOR","14","CLASS",
  //         "Defenses and Conditions","DEFENSES","Cold","CONDITIONS","Add Active Conditions"]
  const lines = linesOf(".ct-combat");
  let initiative = 0;
  let ac = 10;
  const defenses: string[] = [];
  const conditions: string[] = [];
  for (let i = 0; i < lines.length; i++) {
    if (lines[i].toUpperCase() === "INITIATIVE" && (lines[i + 1] === "+" || lines[i + 1] === "-")) {
      initiative = parseSignedNumber(lines[i + 1], lines[i + 2] ?? "0");
    }
    if (lines[i].toUpperCase() === "ARMOR") {
      const n = parseInt(lines[i + 1] ?? "10", 10);
      if (Number.isFinite(n)) ac = n;
    }
    if (lines[i].toUpperCase() === "DEFENSES") {
      // Capture until the next CAPS-only token (CONDITIONS or end)
      for (let j = i + 1; j < lines.length; j++) {
        const t = lines[j];
        if (/^[A-Z\s]+$/.test(t) && t.length > 2) break;
        defenses.push(t);
      }
    }
    if (lines[i].toUpperCase() === "CONDITIONS") {
      for (let j = i + 1; j < lines.length; j++) {
        const t = lines[j];
        if (/^Add Active Conditions$/i.test(t)) break;
        if (/^[A-Z\s]+$/.test(t) && t.length > 2) break;
        conditions.push(t);
      }
    }
  }
  return { ac, initiative, defenses, conditions };
};

const parseSpeed = (): number => {
  // Lines: ["SPEED","WALKING","40","ft.","SPEED"]
  const lines = linesOf("[class*='speed-box']");
  for (let i = 0; i < lines.length; i++) {
    const n = parseInt(lines[i], 10);
    if (Number.isFinite(n) && n > 0) return n;
  }
  return 30;
};

const parseProf = (): number => {
  // Lines: ["PROFICIENCY BONUS","PROFICIENCY","+","3","BONUS"]
  const lines = linesOf("[class*='proficiency-bonus']");
  for (let i = 0; i < lines.length; i++) {
    if (lines[i] === "+" || lines[i] === "-") {
      return parseSignedNumber(lines[i], lines[i + 1] ?? "0");
    }
  }
  return 2;
};

const parseSaves = (): CharacterSheetSnapshot["saves"] => {
  // Pattern in body lines: ["Strength Saving Throw","STR","+","7"]
  const lines = linesOfBody();
  const out = {} as CharacterSheetSnapshot["saves"];
  for (const full of Object.keys(ABILITY_FULLS)) {
    const ability = ABILITY_FULLS[full];
    let bonus = 0;
    for (let i = 0; i < lines.length - 3; i++) {
      if (lines[i] === `${full} Saving Throw` &&
          (lines[i + 2] === "+" || lines[i + 2] === "-")) {
        bonus = parseSignedNumber(lines[i + 2], lines[i + 3] ?? "0");
        break;
      }
    }
    out[ability] = { bonus, proficient: false };
  }
  return out;
};

const parseSkills = (): CharacterSheetSnapshot["skills"] => {
  // Pattern: ["DEX","Acrobatics","+","1"]
  const lines = linesOfBody();
  const out = {} as CharacterSheetSnapshot["skills"];
  for (const { name, ability } of SKILL_LIST) {
    let bonus = 0;
    for (let i = 0; i < lines.length - 3; i++) {
      if (lines[i] === ability && lines[i + 1] === name &&
          (lines[i + 2] === "+" || lines[i + 2] === "-")) {
        bonus = parseSignedNumber(lines[i + 2], lines[i + 3] ?? "0");
        break;
      }
    }
    out[name] = { ability, bonus, proficient: false, expertise: false };
  }
  return out;
};

const parsePassive = (): CharacterSheetSnapshot["passive"] => {
  // The senses panel renders as "{N}\nPassive Perception" (number then label).
  const lines = linesOfBody();
  const grab = (label: string): number => {
    for (let i = 1; i < lines.length; i++) {
      if (lines[i] === `Passive ${label}`) {
        const n = parseInt(lines[i - 1], 10);
        if (Number.isFinite(n)) return n;
      }
    }
    return 0;
  };
  return {
    perception: grab("Perception"),
    investigation: grab("Investigation"),
    insight: grab("Insight"),
  };
};

const parseProficiencies = (): CharacterSheetSnapshot["proficiencies"] => {
  // Lines after "Proficiencies and Languages":
  //   "Armor", "Light Armor, Medium Armor, Shields",
  //   "Weapons", "Martial Weapons, Simple Weapons",
  //   "Tools", "Leatherworker's Tools, Vehicles (Land)",
  //   "Languages", "Common, Giant",
  //   "Proficiencies & Training"
  const lines = linesOfBody();
  const grab = (label: string): string[] => {
    const idx = lines.findIndex((l) => l === label);
    if (idx < 0) return [];
    const next = lines[idx + 1];
    if (!next) return [];
    return next.split(/,\s*/).map((s) => s.trim()).filter(Boolean);
  };
  return {
    armor: grab("Armor"),
    weapons: grab("Weapons"),
    tools: grab("Tools"),
    languages: grab("Languages"),
  };
};

export const scrapeCharacterSheet = async (
  charId: number
): Promise<CharacterSheetSnapshot | null> => {
  const mounted = await waitFor(
    () => document.querySelectorAll(".ddbc-ability-summary").length === 6,
    { timeout: 10000 }
  );
  if (!mounted) {
    console.warn("[dnd-ext] sheet didn't mount in time");
    return null;
  }

  const header = parseHeader();
  const combat = parseCombat();
  const username = location.pathname.match(/^\/profile\/([^/]+)/)?.[1] ?? null;

  const snap: CharacterSheetSnapshot = {
    observed_at: new Date().toISOString(),
    source_url: location.href,
    char_id: charId,
    username,

    name: header.name,
    gender: header.gender,
    species: header.species,
    classes: [{ name: header.className, level: header.classLevel, subclass: null }],
    total_level: header.classLevel,
    xp: null,
    campaign: null,

    abilities: parseAbilities(),
    proficiency_bonus: parseProf(),
    initiative_bonus: combat.initiative,
    walking_speed: parseSpeed(),
    inspiration: false, // TODO: icon class
    hp: parseHP(),

    saves: parseSaves(),
    save_notes: [],

    skills: parseSkills(),

    passive: parsePassive(),
    senses: [],
    ac: combat.ac,
    defenses: { resistances: combat.defenses, immunities: [], vulnerabilities: [] },
    conditions: combat.conditions,

    proficiencies: parseProficiencies(),
  };

  console.log("[dnd-ext] scrapeCharacterSheet →", {
    char_id: charId,
    name: snap.name,
    species: snap.species,
    class: `${snap.classes[0].name} ${snap.total_level}`,
    hp: `${snap.hp.current}/${snap.hp.max}`,
    ac: snap.ac,
    init: snap.initiative_bonus,
    speed: snap.walking_speed,
    abilities: Object.fromEntries(
      Object.entries(snap.abilities).map(([k, v]) => [
        k,
        `${v.score}(${v.modifier >= 0 ? "+" : ""}${v.modifier})`,
      ])
    ),
    saves_proficient_bonus: Object.fromEntries(
      Object.entries(snap.saves).map(([k, v]) => [k, v.bonus])
    ),
    passive: snap.passive,
    proficiencies: snap.proficiencies,
    defenses: snap.defenses.resistances,
  });

  return snap;
};
