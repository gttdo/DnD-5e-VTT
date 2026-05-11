/**
 * Campaign-style presets the DM picks when creating a campaign.
 *
 * Each option carries a short label (for the picker), a short summary
 * (for the picker's helper text), and a `prompt` chunk that gets pasted
 * into the system prompt. Keep prompts ~1–3 sentences — they stack with
 * the DM skill primer and we don't want to bloat context.
 *
 * Fantasy flavors follow the DMG 2024 list (heroic, sword & sorcery,
 * epic, mythic, dark, intrigue, mystery, swashbuckling, war) plus
 * horror and whimsical which players ask about often.
 */

export interface StyleOption<Id extends string = string> {
  id: Id;
  label: string;
  blurb: string;
  prompt: string;
}

export type FantasyFlavorId =
  | "heroic" | "sword_and_sorcery" | "epic" | "mythic" | "dark"
  | "intrigue" | "mystery" | "swashbuckling" | "war" | "horror" | "whimsical";

export const FANTASY_FLAVORS: ReadonlyArray<StyleOption<FantasyFlavorId>> = [
  {
    id: "heroic",
    label: "Heroic Fantasy",
    blurb: "Tolkien-classic; clear stakes, hopeful arc",
    prompt: "Heroic fantasy. Tone is Tolkien-classic — clear stakes between good and evil, heroes who can win, hope as a renewable resource. Use plain noble language; the world rewards courage and sacrifice.",
  },
  {
    id: "sword_and_sorcery",
    label: "Sword & Sorcery",
    blurb: "Conan-pulp; mercenary, low-magic, gritty",
    prompt: "Sword & sorcery. Pulp register — mercenary heroes, decadent cities, sorcery is rare and dangerous, gods are distant. Treasure and survival drive most scenes; loyalty is paid in gold.",
  },
  {
    id: "epic",
    label: "Epic Fantasy",
    blurb: "Dragonlance-scale; world-spanning, gods involved",
    prompt: "Epic fantasy. Stakes are world-spanning — gods, prophecies, ancient evils, the fate of kingdoms. Even minor encounters echo larger arcs. Treat names as weighty; titles and lineages matter.",
  },
  {
    id: "mythic",
    label: "Mythic",
    blurb: "Greek/Norse myth; demigods, fate, hubris",
    prompt: "Mythic fantasy. Greek- or Norse-myth register — demigods, monstrous bloodlines, fate as a real force, hubris is punished. PCs are larger than life; the gods may speak directly or in omens.",
  },
  {
    id: "dark",
    label: "Dark Fantasy",
    blurb: "Ravenloft tone; oppressive, hope is hard",
    prompt: "Dark fantasy. Tone is oppressive and gothic — hope is rationed, victories cost something, the world is sick. Lean into shadows, blood, and moral compromise. Avoid lighthearted asides unless they cut against the dread.",
  },
  {
    id: "intrigue",
    label: "Intrigue",
    blurb: "Game-of-Thrones politics; factions, betrayal",
    prompt: "Intrigue. Politics, factions, and betrayal drive every scene; armies are blunt instruments compared to a well-placed rumor. NPC motivations are layered and often hidden; the party should feel like every conversation could shift the board.",
  },
  {
    id: "mystery",
    label: "Mystery",
    blurb: "Investigation-focused; clues, deception, reveals",
    prompt: "Mystery. The game is about unraveling secrets — bodies, missing people, conspiracies. Plant clues at every scene, reward observation and deduction, and surface NPC inconsistencies. Combat is the second-favorite tool, not the first.",
  },
  {
    id: "swashbuckling",
    label: "Swashbuckling",
    blurb: "Three-Musketeers; daring, witty, acrobatic",
    prompt: "Swashbuckling. Daring escapes, witty banter, acrobatic combat over rooftops and chandeliers. Treat fights as choreography first and damage second; favor cinematic outcomes over body counts.",
  },
  {
    id: "war",
    label: "War",
    blurb: "Large-scale conflict; factions, attrition, command",
    prompt: "War campaign. Large-scale conflict frames every session — supply lines, troop movements, factions, attrition. PCs are special operators or officers; even downtime should reference the war's shifting front.",
  },
  {
    id: "horror",
    label: "Horror",
    blurb: "Lovecraft/gothic dread; the unknown",
    prompt: "Horror. Tone is dread of the unknown, gothic or cosmic depending on context. Withhold information; describe what is glimpsed, not seen. PCs may face things they cannot defeat — survival is the win condition. Avoid genre-breaking levity.",
  },
  {
    id: "whimsical",
    label: "Whimsical",
    blurb: "Princess-Bride comedic; light, charming",
    prompt: "Whimsical. Tone is Princess-Bride comedic — earnest characters, charming absurdities, witty dialogue, low stakes that still feel meaningful. Lean into running gags and the table's in-jokes when present.",
  },
] as const;

export type ToneId = "balanced" | "serious" | "light" | "grim" | "mature";

export const TONES: ReadonlyArray<StyleOption<ToneId>> = [
  {
    id: "balanced",
    label: "Balanced",
    blurb: "Moments of weight and levity",
    prompt: "Overall tone: balanced. Mix moments of weight with moments of levity; don't be afraid of a joke landing right before a hard scene.",
  },
  {
    id: "serious",
    label: "Serious",
    blurb: "Straight-faced; weight behind every choice",
    prompt: "Overall tone: serious and grounded. NPC reactions have weight; the world doesn't joke back unless the PCs do first.",
  },
  {
    id: "light",
    label: "Light",
    blurb: "Banter-heavy, easy laughs",
    prompt: "Overall tone: light. Banter, NPC quirks, and easy laughs. Stakes still exist but the table is here to have fun first.",
  },
  {
    id: "grim",
    label: "Grim",
    blurb: "Hope is rationed",
    prompt: "Overall tone: grim. Hope is rationed; victories cost something; even a peaceful tavern has a knife under the bar.",
  },
  {
    id: "mature",
    label: "Mature",
    blurb: "Handles dark themes head-on",
    prompt: "Overall tone: mature. The table has consented to dark themes — depict consequence rather than gore; respect the players' safety tools (X-card, Lines & Veils) if the DM raises them.",
  },
] as const;

export type LethalityId = "cinematic" | "standard" | "gritty";

export const LETHALITY: ReadonlyArray<StyleOption<LethalityId>> = [
  {
    id: "cinematic",
    label: "Cinematic",
    blurb: "PC death is rare; failure is dramatic, not fatal",
    prompt: "Combat lethality: cinematic. PCs rarely die — when an attack would drop them, prefer non-lethal consequences (knocked out, captured, dramatic injury) unless the table is clearly playing for blood.",
  },
  {
    id: "standard",
    label: "Standard",
    blurb: "RAW death saves; a hard fight is ~50/50",
    prompt: "Combat lethality: standard. Death saves and rules as written. A hard fight should feel risky; PC death is on the table but never gratuitous.",
  },
  {
    id: "gritty",
    label: "Gritty",
    blurb: "Death is real; injuries linger",
    prompt: "Combat lethality: gritty. Death is real and earned. Suggest lingering injuries on dropped PCs; healing magic is precious; food, sleep, and resources matter.",
  },
] as const;

export interface CampaignStyle {
  flavor: FantasyFlavorId;
  tone: ToneId;
  lethality: LethalityId;
}

export const DEFAULT_STYLE: CampaignStyle = {
  flavor: "heroic",
  tone: "balanced",
  lethality: "standard",
};

const findOption = <Id extends string>(
  options: ReadonlyArray<StyleOption<Id>>,
  id: Id
): StyleOption<Id> | undefined => options.find((o) => o.id === id);

export const stylePromptBlock = (style: CampaignStyle): string => {
  const lines: string[] = [];
  const flavor = findOption(FANTASY_FLAVORS, style.flavor);
  const tone = findOption(TONES, style.tone);
  const lethality = findOption(LETHALITY, style.lethality);
  if (flavor) lines.push(`- ${flavor.prompt}`);
  if (tone) lines.push(`- ${tone.prompt}`);
  if (lethality) lines.push(`- ${lethality.prompt}`);
  return lines.join("\n");
};
