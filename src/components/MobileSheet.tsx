import { useState } from "react";
import type { Character, Condition } from "../types/character";
import type { CharacterAPI } from "../state/useCharacter";
import { initiative, proficiencyBonus } from "../lib/calc";
import { rollD20 } from "../lib/dice";
import { useDiceLog } from "../state/DiceLog";
import { Icon, type IconName } from "./ui/Icon";
import { AbilityScores, SavingThrows } from "./AbilityScores";
import { Skills, Senses } from "./Skills";
import { Proficiencies, Defenses } from "./Proficiencies";
import { ActionsPanel } from "./ActionsPanel";
import { SpellsPanel } from "./SpellsPanel";
import { InventoryPanel } from "./InventoryPanel";
import { FeaturesPanel } from "./FeaturesPanel";
import { NotesPanel } from "./NotesPanel";

/**
 * Phone layout for the character sheet.
 *
 * Deliberately NOT the desktop three-column grid stacked into one column —
 * that produces a single enormous scroll. Following the D&D Beyond reference
 * (Figma 0yyb0hWsSvfGNaFkoolU2L, sections "Character Sheet Mobile Native" /
 * "…Mobile Browser"), the sheet is paginated: a compact identity + vitals
 * header stays put, and the body shows ONE section at a time with a floating
 * switcher to jump between them.
 *
 * Section bodies are the exact same components the desktop sheet uses, so
 * there's one implementation of each panel, not two.
 */

const ALL_CONDITIONS: Condition[] = [
  "Blinded", "Charmed", "Deafened", "Frightened", "Grappled",
  "Incapacitated", "Invisible", "Paralyzed", "Petrified", "Poisoned",
  "Prone", "Restrained", "Stunned", "Unconscious", "Exhaustion",
];

interface Section {
  key: string;
  label: string;
  icon: IconName;
}

const SECTIONS: Section[] = [
  { key: "abilities",     label: "Abilities",     icon: "swords" },
  { key: "skills",        label: "Skills",        icon: "check" },
  { key: "actions",       label: "Actions",       icon: "dice" },
  { key: "spells",        label: "Spells",        icon: "sparkles" },
  { key: "inventory",     label: "Inventory",     icon: "library" },
  { key: "features",      label: "Features",      icon: "star" },
  { key: "proficiencies", label: "Proficiencies", icon: "shield" },
  { key: "notes",         label: "Notes",         icon: "edit" },
];

/** Which transient control the header is showing, if any. */
type Drawer = "hp" | "conditions" | "rest" | null;

const formatMod = (n: number) => (n >= 0 ? `+${n}` : `${n}`);

export const MobileSheet = ({ character: c, api, onEditAvatar }: { character: Character; api: CharacterAPI; onEditAvatar?: () => void }) => {
  const [section, setSection] = useState(SECTIONS[0].key);
  const [drawer, setDrawer] = useState<Drawer>(null);
  const [amount, setAmount] = useState(5);
  const { push } = useDiceLog();

  const initials = c.name
    .split(/\s+/)
    .map((w) => w[0])
    .filter(Boolean)
    .slice(0, 2)
    .join("")
    .toUpperCase();

  const toggleDrawer = (d: Drawer) => setDrawer((cur) => (cur === d ? null : d));
  const hpPct = c.hp.max > 0 ? Math.max(0, Math.min(100, (c.hp.current / c.hp.max) * 100)) : 0;

  return (
    <div className="msheet">
      {/* ---- Identity ---------------------------------------------------- */}
      <div className="msheet-identity">
        <button className="portrait-btn" onClick={onEditAvatar} title="Change avatar" aria-label="Change avatar">
          {c.portrait ? (
            <img className="msheet-portrait" src={c.portrait} alt={c.name} />
          ) : (
            <div className="msheet-portrait">{initials || "?"}</div>
          )}
          <span className="portrait-edit" aria-hidden="true"><Icon name="image" size={11} /></span>
        </button>
        <div className="msheet-ident-text">
          <input
            className="msheet-name"
            value={c.name}
            onChange={(e) => api.setName(e.target.value)}
            aria-label="Character name"
          />
          <div className="msheet-sub">
            {c.species}{c.lineage ? ` (${c.lineage})` : ""} · {c.classes.map((cl) => `${cl.name} ${cl.level}`).join(" / ")}
          </div>
        </div>
        {/* The HP box doubles as the button that opens the HP editor — same
            trick the reference uses for its roll boxes: the value IS the target. */}
        <button
          className={`msheet-hp ${drawer === "hp" ? "open" : ""}`}
          onClick={() => toggleDrawer("hp")}
          aria-expanded={drawer === "hp"}
          title="Adjust hit points"
        >
          <span className="msheet-hp-label">Hit Points</span>
          <span className="msheet-hp-value">
            {c.hp.current}<span className="msheet-hp-max">/{c.hp.max}</span>
          </span>
          {c.hp.temp > 0 && <span className="msheet-hp-temp">+{c.hp.temp} temp</span>}
          <span className="msheet-hp-bar"><span style={{ width: `${hpPct}%` }} /></span>
        </button>
      </div>

      {/* ---- Vitals ------------------------------------------------------ */}
      <div className="msheet-vitals">
        <div className="msheet-vital">
          <span className="msheet-vital-num">+{proficiencyBonus(c.level)}</span>
          <span className="msheet-vital-label">Prof</span>
        </div>
        <div className="msheet-vital">
          <span className="msheet-vital-num">{c.speed}<small>ft</small></span>
          <span className="msheet-vital-label">Speed</span>
        </div>
        <button
          className="msheet-vital is-roll"
          onClick={() => push("Initiative", rollD20(initiative(c)))}
          title="Roll initiative"
        >
          <span className="msheet-vital-num">{formatMod(initiative(c))}</span>
          <span className="msheet-vital-label">Init</span>
        </button>
        <div className="msheet-vital">
          <span className="msheet-vital-num">{c.ac.override ?? c.ac.value}</span>
          <span className="msheet-vital-label">AC</span>
        </div>
      </div>

      {/* Actions get their own full-width row rather than being wedged into
          the vitals strip, where they squeezed the four stats into slivers. */}
      <div className="msheet-actions">
        <button
          className={`msheet-chip ${drawer === "rest" ? "open" : ""}`}
          onClick={() => toggleDrawer("rest")}
          aria-expanded={drawer === "rest"}
        >
          <Icon name="rest" size={13} />
          Rest
        </button>
        <button
          className={`msheet-chip ${drawer === "conditions" ? "open" : ""} ${c.conditions.length ? "has-any" : ""}`}
          onClick={() => toggleDrawer("conditions")}
          aria-expanded={drawer === "conditions"}
        >
          <Icon name="alert" size={13} />
          Conditions
          {c.conditions.length > 0 && <span className="msheet-chip-count">{c.conditions.length}</span>}
        </button>
        <button
          className={`msheet-chip is-toggle ${c.inspiration ? "on" : ""}`}
          onClick={api.toggleInspiration}
          aria-pressed={c.inspiration}
          title="Heroic Inspiration — reroll a d20 test and keep the new roll"
        >
          <Icon name="star" size={13} />
          Inspiration
        </button>
      </div>

      {/* ---- Expanding drawer (one at a time, keeps the header short) ----- */}
      {drawer === "hp" && (
        <div className="msheet-drawer">
          <input
            type="number"
            value={amount}
            onChange={(e) => setAmount(parseInt(e.target.value, 10) || 0)}
            aria-label="Amount"
          />
          <button onClick={() => api.heal(amount)}>+ Heal</button>
          <button className="primary" onClick={() => api.damage(amount)}>− Dmg</button>
          <button onClick={() => api.setTempHp(amount)}>Temp</button>
        </div>
      )}
      {drawer === "conditions" && (
        <div className="msheet-drawer is-wrap">
          {ALL_CONDITIONS.map((cond) => (
            <span
              key={cond}
              className={`cond-chip ${c.conditions.includes(cond) ? "on" : ""}`}
              onClick={() => api.toggleCondition(cond)}
            >
              {cond}
            </span>
          ))}
        </div>
      )}
      {drawer === "rest" && (
        <div className="msheet-drawer">
          <button onClick={api.shortRest}>Short Rest</button>
          <button onClick={api.longRest}>Long Rest</button>
        </div>
      )}

      {/* ---- Section tabs ------------------------------------------------ */}
      {/* A sticky scrollable strip, not a floating button + modal sheet: one
          tap instead of two, the current section stays visible, and it doesn't
          compete with the dice controls for a screen corner. */}
      <nav className="msheet-tabs" aria-label="Sheet sections">
        {SECTIONS.map((s) => (
          <button
            key={s.key}
            className={`msheet-tab ${s.key === section ? "active" : ""}`}
            aria-current={s.key === section ? "page" : undefined}
            onClick={() => setSection(s.key)}
          >
            <Icon name={s.icon} size={16} />
            <span>{s.label}</span>
          </button>
        ))}
      </nav>

      {/* ---- One section at a time --------------------------------------- */}
      {/* No separate section heading: AbilityScores/Skills/Proficiencies and
          ActionsPanel already render their own .panel-title, so one would just
          repeat it. The three that don't get an explicit title here instead. */}
      <div className="msheet-body">
        {/* Grouped so the split panels stay together on the page that owns
            them — nothing became unreachable when they were separated. */}
        {section === "abilities" && (
          <>
            <AbilityScores character={c} />
            <SavingThrows character={c} />
          </>
        )}
        {section === "skills" && (
          <>
            <Skills character={c} />
            <Senses character={c} />
          </>
        )}
        {section === "proficiencies" && (
          <>
            <Proficiencies character={c} />
            <Defenses character={c} />
          </>
        )}
        {section === "actions" && (
          <div className="panel"><ActionsPanel character={c} api={api} /></div>
        )}
        {section === "spells" && (
          <div className="panel">
            <div className="panel-title">Spells</div>
            <SpellsPanel character={c} api={api} />
          </div>
        )}
        {section === "inventory" && (
          <div className="panel">
            <div className="panel-title">Inventory</div>
            <InventoryPanel character={c} api={api} />
          </div>
        )}
        {section === "features" && (
          <div className="panel">
            <div className="panel-title">Features</div>
            <FeaturesPanel character={c} api={api} />
          </div>
        )}
        {section === "notes" && (
          <div className="panel">
            <div className="panel-title">Notes</div>
            <NotesPanel character={c} api={api} />
          </div>
        )}
      </div>

    </div>
  );
};
