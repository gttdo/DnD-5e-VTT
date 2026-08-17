/**
 * Short rules explanations for the per-stat detail drawers.
 *
 * All text here is paraphrased in our own words — this repo is public and
 * MIT-licensed, so no PHB/SRD wording is reproduced. Keep entries brief: the
 * drawer teaches the concept; it is not a rules compendium.
 */

export const RULE_TEXT: Record<string, string[]> = {
  armorClass: [
    "Armor Class is how hard you are to hit — an attack roll must meet or beat it to land.",
    "Without armor, AC is 10 plus your Dexterity modifier. Armor replaces that base with its own value; some types also add part or all of your Dexterity modifier, and a shield stacks on top.",
  ],
  initiative: [
    "When a fight breaks out, everyone rolls initiative — a d20 plus your Dexterity modifier — and acts in descending order for the rest of the combat.",
    "Rolling with advantage or disadvantage shifts your expected result by roughly five points either way.",
  ],
  savingThrows: [
    "A saving throw is a reflexive d20 roll to resist something happening TO you — a spell, a trap, poison. You don't choose to make one.",
    "Add the listed ability's modifier, and your proficiency bonus if your class grants proficiency in that save. The Difficulty Class is set by whatever forced the roll.",
  ],
  skills: [
    "An ability check tests raw talent; a skill lets you add your proficiency bonus when the task falls under its umbrella.",
    "Expertise doubles your proficiency bonus for that skill.",
  ],
  passiveSenses: [
    "A passive score is 10 plus the relevant skill bonus — what you notice without actively searching.",
    "The DM checks it silently against a DC, so hidden things can be spotted (or missed) with no roll at all.",
  ],
  proficiencyBonus: [
    "One bonus, applied to everything you're proficient in: attacks with familiar weapons, trained skills, class saves, and spellcasting.",
    "It rises with total character level — +2 at level 1 up to +6 at level 17 — and never applies twice to the same roll.",
  ],
  speed: [
    "Speed is how far you can move on your turn, in feet. Splitting movement around your action is allowed.",
    "Difficult terrain costs double; climbing, swimming and crawling also cost extra unless you have a matching speed.",
  ],
  hitPoints: [
    "Hit points are your capacity to keep fighting. Damage reduces them; at 0 you fall unconscious and start making death saving throws.",
    "Temporary hit points absorb damage first, never stack, and vanish when the source ends or you finish a long rest.",
  ],
};
