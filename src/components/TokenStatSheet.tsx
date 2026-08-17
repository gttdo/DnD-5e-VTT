import type { ReactNode } from "react";
import { ABILITIES, type Ability } from "../types/character";
import { abilityMod } from "../lib/calc";
import type { TokenDetails, MonsterStatblock, NpcProfile, MagicItem, PropDetails, SpellTokenDetails, NamedEntry, MonsterAction } from "../types/content";
import { DamageType } from "./ui/DamageType";
import { WeaponProps } from "./ui/WeaponProps";
import { GameGlyph } from "./ui/GameGlyph";
import { sizeGlyph } from "../lib/boardGlyphs";

// Action-economy glyph for a statblock section header (Actions / Bonus Actions /
// Reactions). Traits, Legendary, and Mythic have no basic-economy glyph.
const SECTION_ECON: Record<string, string> = { Actions: "action", "Bonus Actions": "bonus", Reactions: "reaction" };
const SectionHead = ({ title }: { title: string }) => {
  const key = SECTION_ECON[title];
  return (
    <h4 className="tstat-h">
      {key && <GameGlyph src={`/icons/action_economy/econ_${key}.svg`} size={13} className="tstat-h-ico" />}
      {title}
    </h4>
  );
};

/**
 * Read-only stat display for a saved token's `details` — the D&D Beyond
 * homebrew-style block shown in the token library's detail view. Mirrors the
 * shapes the studio edits (MonsterStatblock / NpcProfile / MagicItem) but purely
 * for reading; editing lives in TokenStudioDialog.
 */

const sign = (n: number) => (n >= 0 ? `+${n}` : `${n}`);

const speedLine = (s: MonsterStatblock["speed"]): string => {
  const parts: string[] = [];
  if (s.walk != null) parts.push(`${s.walk} ft.`);
  if (s.fly != null) parts.push(`fly ${s.fly} ft.${s.hover ? " (hover)" : ""}`);
  if (s.swim != null) parts.push(`swim ${s.swim} ft.`);
  if (s.climb != null) parts.push(`climb ${s.climb} ft.`);
  if (s.burrow != null) parts.push(`burrow ${s.burrow} ft.`);
  return parts.join(", ") || "—";
};

const Line = ({ label, value }: { label: string; value?: ReactNode }) =>
  value == null || value === "" ? null : (
    <div className="tstat-line">
      <span className="tstat-k">{label}</span>
      <span className="tstat-v">{value}</span>
    </div>
  );

const Entries = ({ title, entries }: { title: string; entries?: NamedEntry[] }) =>
  !entries || entries.length === 0 ? null : (
    <div className="tstat-section">
      <SectionHead title={title} />
      {entries.map((e, i) => (
        <p key={i} className="tstat-entry">
          <strong>{e.name}.</strong> {e.text}
        </p>
      ))}
    </div>
  );

const actionText = (a: MonsterAction): string => {
  const bits: string[] = [];
  if (a.attackBonus != null) bits.push(`${sign(a.attackBonus)} to hit`);
  if (a.reach) bits.push(a.reach);
  if (a.damage) bits.push(`${a.damage}${a.damageType ? ` ${a.damageType}` : ""} damage`);
  if (a.saveDc != null) bits.push(`DC ${a.saveDc}${a.saveAbility ? ` ${a.saveAbility}` : ""} save`);
  const head = bits.length ? bits.join(", ") : "";
  return [head, a.text].filter(Boolean).join(" — ");
};

const StatBlock = ({ m }: { m: MonsterStatblock }) => (
  <div className="tstat">
    <div className="tstat-sub">
      {m.size && sizeGlyph(m.size) && <GameGlyph src={sizeGlyph(m.size)!} size={13} className="tstat-sub-ico" />}
      {[m.size ? sizeWord(m.size) : null, m.type, m.subtype ? `(${m.subtype})` : null, m.alignment]
        .filter(Boolean)
        .join(" ")}
    </div>

    <div className="tstat-rule" />
    <Line label="Armor Class" value={`${m.ac}${m.acNote ? ` (${m.acNote})` : ""}`} />
    <Line label="Hit Points" value={`${m.hp}${m.hitDice ? ` (${m.hitDice})` : ""}`} />
    <Line label="Speed" value={speedLine(m.speed)} />
    {m.initiative != null && <Line label="Initiative" value={sign(m.initiative)} />}
    <div className="tstat-rule" />

    <div className="tstat-abilities">
      {ABILITIES.map((ab: Ability) => {
        const score = m.abilities?.[ab] ?? 10;
        const mod = abilityMod(score);
        return (
          <div key={ab} className="tstat-ab">
            <div className="tstat-ab-k">{ab}</div>
            <div className="tstat-ab-s">{score}</div>
            <div className="tstat-ab-m">{sign(mod)}</div>
          </div>
        );
      })}
    </div>
    <div className="tstat-rule" />

    {m.saves && Object.keys(m.saves).length > 0 && (
      <Line
        label="Saving Throws"
        value={ABILITIES.filter((a) => m.saves?.[a] != null)
          .map((a) => `${a} ${sign(m.saves![a]!)}`)
          .join(", ")}
      />
    )}
    {m.skills && m.skills.length > 0 && (
      <Line label="Skills" value={m.skills.map((s) => `${s.name} ${sign(s.bonus)}`).join(", ")} />
    )}
    <Line label="Damage Resistances" value={m.damageResistances?.join(", ")} />
    <Line label="Damage Immunities" value={m.damageImmunities?.join(", ")} />
    <Line label="Damage Vulnerabilities" value={m.damageVulnerabilities?.join(", ")} />
    <Line label="Condition Immunities" value={m.conditionImmunities?.join(", ")} />
    <Line label="Senses" value={m.senses?.join(", ")} />
    <Line label="Languages" value={m.languages?.join(", ")} />
    <Line
      label="Challenge"
      value={`${m.cr}${m.proficiencyBonus != null ? `  (PB ${sign(m.proficiencyBonus)})` : ""}`}
    />
    <Line label="Gear" value={m.gear?.join(", ")} />

    <Entries title="Traits" entries={m.traits} />
    {m.actions && m.actions.length > 0 && (
      <div className="tstat-section">
        <SectionHead title="Actions" />
        {m.actions.map((a, i) => (
          <p key={i} className="tstat-entry">
            <strong>{a.name}.</strong> {actionText(a)}
          </p>
        ))}
      </div>
    )}
    <Entries title="Bonus Actions" entries={m.bonusActions} />
    <Entries title="Reactions" entries={m.reactions} />
    <Entries
      title={`Legendary Actions${m.legendaryCount ? ` (${m.legendaryCount}/round)` : ""}`}
      entries={m.legendaryActions}
    />
    <Entries title="Mythic Actions" entries={m.mythicActions} />
    {m.lairActions && m.lairActions.length > 0 && (
      <div className="tstat-section">
        <h4 className="tstat-h">Lair Actions</h4>
        {m.lairActions.map((t, i) => (
          <p key={i} className="tstat-entry">
            {t}
          </p>
        ))}
      </div>
    )}

    {m.description && <p className="tstat-desc">{m.description}</p>}
    {m.source && <div className="tstat-source">{m.source}</div>}
  </div>
);

const NpcSheet = ({ npc }: { npc: NpcProfile }) => (
  <div className="tstat">
    <div className="tstat-sub">{[npc.ancestry, npc.role].filter(Boolean).join(" · ") || "NPC"}</div>
    <div className="tstat-rule" />
    <Line label="Appearance" value={npc.appearance} />
    <Line label="Personality" value={npc.personalityTrait} />
    <Line label="Ideal" value={npc.ideal} />
    <Line label="Bond" value={npc.bond} />
    <Line label="Flaw" value={npc.flaw} />
    <Line label="Voice / Mannerism" value={npc.voice} />
    <Line label="Motivation" value={npc.motivation} />
    {npc.secret && (
      <div className="tstat-line">
        <span className="tstat-k">Secret (DM)</span>
        <span className="tstat-v tstat-dm">{npc.secret}</span>
      </div>
    )}
    {npc.description && <p className="tstat-desc">{npc.description}</p>}
    {npc.statblock && (
      <div className="tstat-section">
        <h4 className="tstat-h">Combat</h4>
        <StatBlock m={npc.statblock} />
      </div>
    )}
  </div>
);

const ItemSheet = ({ item }: { item: MagicItem }) => (
  <div className="tstat">
    <div className="tstat-sub">
      {[item.itemType, item.rarity].filter(Boolean).join(" · ")}
      {item.attunement ? ` · requires attunement${item.attunementNote ? ` ${item.attunementNote}` : ""}` : ""}
    </div>
    <div className="tstat-rule" />
    <Line label="Base Item" value={item.baseWeapon ?? item.baseType} />
    {item.damage && (
      <Line
        label="Damage"
        value={<>{item.damage}{item.damageType && <> <DamageType type={item.damageType} /></>}</>}
      />
    )}
    {item.properties && item.properties.length > 0 && (
      <Line label="Properties" value={<WeaponProps properties={item.properties} />} />
    )}
    <Line label="Armor Class" value={item.armorClass} />
    {item.dexBonus && <Line label="Dex Bonus" value={item.dexBonus} />}
    {item.strRequirement != null && <Line label="Strength" value={`Str ${item.strRequirement}`} />}
    {item.stealthDisadvantage && <Line label="Stealth" value="Disadvantage" />}
    {item.charges && (
      <Line
        label="Charges"
        value={`${item.charges.max}${item.charges.recharge ? ` (${item.charges.recharge})` : ""}`}
      />
    )}
    <Line label="Attached Spells" value={item.attachedSpells?.join(", ")} />
    <Line label="Weight" value={item.weight != null ? `${item.weight} lb` : undefined} />
    <Line label="Value" value={item.cost} />
    {item.description && <p className="tstat-desc">{item.description}</p>}
    {item.tags && item.tags.length > 0 && <div className="tstat-source">{item.tags.join(" · ")}</div>}
  </div>
);

const sizeWord = (s: string): string => s.charAt(0).toUpperCase() + s.slice(1);

const PropSheet = ({ prop }: { prop: PropDetails }) => (
  <div className="tstat">
    <div className="tstat-sub">
      {[prop.category || "Prop", prop.container ? "container" : null].filter(Boolean).join(" · ")}
    </div>
    <div className="tstat-rule" />
    {prop.container && <Line label="Loot" value="Players can open this to loot it." />}
    {prop.description && <p className="tstat-desc">{prop.description}</p>}
  </div>
);

const SPELL_SCHOOLS = new Set([
  "abjuration", "conjuration", "divination", "enchantment",
  "evocation", "illusion", "necromancy", "transmutation",
]);
/** Small school glyph shown beside the school name. The source SVGs are
 *  `currentColor`, so they're masked (not <img>) to take the accent color. */
const SchoolIcon = ({ school }: { school: string }) => {
  const key = school.toLowerCase();
  if (!SPELL_SCHOOLS.has(key)) return null;
  const src = `/icons/spell_schools/school_${key}.svg`;
  return (
    <span
      className="tstat-school-ico"
      style={{ WebkitMaskImage: `url("${src}")`, maskImage: `url("${src}")` }}
      aria-hidden="true"
    />
  );
};

const SpellSheet = ({ spell }: { spell: SpellTokenDetails }) => (
  <div className="tstat">
    <div className="tstat-sub">
      {spell.level != null ? (spell.level === 0 ? "Cantrip" : `Level ${spell.level}`) : "Spell"}
      {spell.school && (
        <>
          {" · "}
          <SchoolIcon school={spell.school} />
          {spell.school}
        </>
      )}
    </div>
    <div className="tstat-rule" />
    <Line label="Casting time" value={spell.castingTime} />
    <Line label="Range" value={spell.range} />
    <Line label="Duration" value={spell.concentration ? `Concentration — ${spell.duration ?? ""}`.trim().replace(/—\s*$/, "").trim() : spell.duration} />
    {spell.areaShape && (
      <Line label="Area" value={`${spell.areaSize ?? "?"} ft ${spell.areaShape}`} />
    )}
    {spell.damageType && <Line label="Damage" value={<DamageType type={spell.damageType} />} />}
    {spell.ritual && <Line label="Ritual" value="Yes" />}
    {spell.description && <p className="tstat-desc">{spell.description}</p>}
  </div>
);

export const TokenStatSheet = ({ details }: { details: TokenDetails | null }) => {
  if (!details) return null;
  if (details.kind === "monster") return <StatBlock m={details.monster} />;
  if (details.kind === "npc") return <NpcSheet npc={details.npc} />;
  if (details.kind === "item") return <ItemSheet item={details.item} />;
  if (details.kind === "prop") return <PropSheet prop={details.prop} />;
  if (details.kind === "spell") return <SpellSheet spell={details.spell} />;
  return null;
};
