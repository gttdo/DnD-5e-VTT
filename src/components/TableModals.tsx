import { useEffect, useState, type ReactNode } from "react";
import type { Character, EquipSlot, InventoryItem } from "../types/character";
import { abilityModFor } from "../lib/calc";
import { checkRoll, damageRoll, type RollEntry, type RollTone } from "../lib/rolls";
import { applyHeal } from "../lib/hp";
import { EQUIP_SLOTS, slotOf, isEquipable, equippedInSlot, toggleEquipped, reorder, sortInventory } from "../lib/equip";
import {
  casterClass,
  castingAbility,
  slotsFor,
  spellsForClass,
  spellSaveDC,
  spellAttackBonus,
} from "../lib/spellcasting";
import { useRules } from "../state/Rules";
import { useAuth } from "../state/useAuth";
import { useJournal } from "../state/useJournal";
import { supabase } from "../lib/supabase";
import { Dialog } from "./ui/Dialog";
import { MapPickerDialog } from "./MapPickerDialog";
import { Icon, type IconName } from "./ui/Icon";
import { GameGlyph } from "./ui/GameGlyph";

/**
 * The HUD's game-menu modals — the CRPG menu layer.
 *
 * Every modal is a new *surface* on the character sheet: it reads the bound
 * character and writes back through `onUpdate` (the roster's optimistic
 * persister), and anything rollable goes through `onRoll` so it reaches the
 * whole table. No modal owns data. One is open at a time.
 */

export type HudModal = "gear" | "spells" | "journal" | "map" | "rest";

interface MenuItem {
  id: HudModal;
  icon: IconName;
  label: string;
  /** Single-letter shortcut, shown in the tooltip and bound in the HUD. */
  key: string;
}

// The menu grows as modals land. Order = display order in the HUD cluster.
export const HUD_MENU: MenuItem[] = [
  { id: "gear", icon: "shield", label: "Character & gear", key: "C" },
  { id: "spells", icon: "sparkles", label: "Spellbook", key: "S" },
  { id: "journal", icon: "edit", label: "Journal", key: "J" },
  { id: "map", icon: "map", label: "Region map", key: "M" },
  { id: "rest", icon: "moon", label: "Rest", key: "R" },
];

interface Props {
  which: HudModal;
  character: Character;
  gameId: string;
  isDM: boolean;
  onClose: () => void;
  /** Persist a mutation to the bound character (roster-backed). */
  onUpdate: (mut: (c: Character) => Character) => void;
  /** Table-wide roll (logs + blooms + broadcasts). */
  onRoll: (entries: RollEntry[], opts?: { tone?: RollTone; label?: string }) => void;
  onNote: (msg: string) => void;
}

export const TableModals = ({ which, character, gameId, isDM, onClose, onUpdate, onRoll, onNote }: Props) => {
  switch (which) {
    case "gear":
      return <GearModal character={character} onClose={onClose} onUpdate={onUpdate} onNote={onNote} />;
    case "spells":
      return <SpellbookModal character={character} onClose={onClose} onUpdate={onUpdate} onRoll={onRoll} onNote={onNote} />;
    case "rest":
      return <RestModal character={character} onClose={onClose} onUpdate={onUpdate} onRoll={onRoll} onNote={onNote} />;
    case "journal":
      return <JournalModal gameId={gameId} authorName={character.name} onClose={onClose} />;
    case "map":
      return <RegionMapModal gameId={gameId} isDM={isDM} onClose={onClose} />;
    default:
      return null;
  }
};

/** Shared "you're one migration away" state for the DB-backed modals. */
const MigrationNote = ({ file, what }: { file: string; what: string }) => (
  <div className="tm-migrate">
    <Icon name="alert" size={30} />
    <h4>One migration away</h4>
    <p>
      {what} needs a database table that isn't there yet. Apply{" "}
      <code>supabase/migrations/{file}</code> in your Supabase SQL editor, then reopen this.
    </p>
  </div>
);

// ---------------------------------------------------------------------------
// Journal — the party's shared log (per game). Everyone reads; you write and
// delete your own. Migration-tolerant.
// ---------------------------------------------------------------------------

// Light, SAFE rich text for journal entries (#20): **bold**, *italic*, and line
// breaks. Builds React nodes directly — never innerHTML — so a note written by
// another player can't inject markup.
const parseInline = (line: string): ReactNode[] => {
  const nodes: ReactNode[] = [];
  const re = /\*\*([^*]+)\*\*|\*([^*]+)\*/g;
  let last = 0;
  let k = 0;
  let m: RegExpExecArray | null;
  while ((m = re.exec(line)) !== null) {
    if (m.index > last) nodes.push(line.slice(last, m.index));
    if (m[1] != null) nodes.push(<strong key={k++}>{m[1]}</strong>);
    else nodes.push(<em key={k++}>{m[2]}</em>);
    last = m.index + m[0].length;
  }
  if (last < line.length) nodes.push(line.slice(last));
  return nodes;
};
const renderRich = (text: string): ReactNode =>
  text.split("\n").map((line, i) => (
    <span key={i}>
      {i > 0 && <br />}
      {parseInline(line)}
    </span>
  ));

export const JournalModal = ({
  gameId,
  authorName,
  onClose,
}: {
  gameId: string;
  authorName: string;
  onClose: () => void;
}) => {
  const { user } = useAuth();
  const { entries, loading, error, addEntry, removeEntry } = useJournal(gameId);
  const [title, setTitle] = useState("");
  const [body, setBody] = useState("");
  const missing = !!error && /journal|relation|does not exist|schema cache/i.test(error);

  const submit = () => {
    if (!body.trim()) return;
    void addEntry(title, body, authorName);
    setTitle("");
    setBody("");
  };

  return (
    <Dialog onClose={onClose} size="lg" title="Journal" subtitle="the party's shared log">
      <div className="tm-body">
        {missing ? (
          <MigrationNote file="0013_journal.sql" what="The journal" />
        ) : (
          <>
            <div className="tm-jcompose">
              <input
                className="tm-jtitle"
                placeholder="Title (optional)"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                aria-label="Note title"
              />
              <textarea
                className="tm-jbody"
                placeholder="A clue, a name, a debt owed…  (**bold**, *italic*, line breaks)"
                value={body}
                onChange={(e) => setBody(e.target.value)}
                aria-label="Note body"
                rows={3}
              />
              <button className="tm-jadd" onClick={submit} disabled={!body.trim()}>
                Add note
              </button>
            </div>
            <div className="tm-jlist">
              {loading ? (
                <span className="tm-empty">Loading…</span>
              ) : entries.length === 0 ? (
                <span className="tm-empty">No entries yet — start the party's record.</span>
              ) : (
                entries.map((e) => (
                  <div className="tm-jentry" key={e.id}>
                    <div className="tm-jentry-hd">
                      <span className="tm-jentry-t">{e.title || "Note"}</span>
                      <span className="tm-jentry-m">
                        {e.author_name || "Someone"} · {new Date(e.created_at).toLocaleDateString()}
                      </span>
                      {user?.id === e.author_id && (
                        <button className="tm-jdel" onClick={() => void removeEntry(e.id)} title="Delete" aria-label="Delete note">
                          ×
                        </button>
                      )}
                    </div>
                    <p className="tm-jentry-b">{renderRich(e.body)}</p>
                  </div>
                ))
              )}
            </div>
            <p className="tm-note">One journal per game — your notes and anything the DM shares, in one place.</p>
          </>
        )}
      </div>
    </Dialog>
  );
};

// ---------------------------------------------------------------------------
// Region map — a world map the DM shares (per game), separate from the battle
// scene. DM sets it from the map library; players view read-only. Migration-
// tolerant against the games.region_map_url column.
// ---------------------------------------------------------------------------

export const RegionMapModal = ({
  gameId,
  isDM,
  onClose,
}: {
  gameId: string;
  isDM: boolean;
  onClose: () => void;
}) => {
  const [url, setUrl] = useState<string | null | undefined>(undefined); // undefined = loading
  const [error, setError] = useState<string | null>(null);
  const [pickerOpen, setPickerOpen] = useState(false);

  useEffect(() => {
    let cancelled = false;
    void supabase
      .from("games")
      .select("region_map_url")
      .eq("id", gameId)
      .single()
      .then(({ data, error }) => {
        if (cancelled) return;
        if (error) setError(error.message);
        else setUrl((data as { region_map_url: string | null }).region_map_url ?? null);
      });
    return () => {
      cancelled = true;
    };
  }, [gameId]);

  const setMap = async (newUrl: string | null) => {
    const { error } = await supabase.from("games").update({ region_map_url: newUrl }).eq("id", gameId);
    if (error) setError(error.message);
    else setUrl(newUrl);
  };

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape" && !pickerOpen) onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose, pickerOpen]);

  const missing = !!error && /region_map_url|column|does not exist|schema cache/i.test(error);

  // Non-modal floating panel (no backdrop) — the board + HUD stay live.
  return (
    <div className="region-panel" role="dialog" aria-label="Region map">
      <div className="region-panel-bar">
        <span className="region-panel-t"><GameGlyph src="/icons/board/compass.svg" size={15} /> Region map</span>
        <button className="region-panel-x" onClick={onClose} aria-label="Close">
          <Icon name="close" size={15} />
        </button>
      </div>
      <div className="tm-body region-panel-body">
        {missing ? (
          <MigrationNote file="0014_region_map.sql" what="The region map" />
        ) : url === undefined ? (
          <span className="tm-empty">Loading…</span>
        ) : url ? (
          <>
            <div className="tm-regionwrap">
              <img className="tm-region" src={url} alt="Region map" />
            </div>
            {isDM ? (
              <div className="tm-regionbar">
                <button onClick={() => setPickerOpen(true)}>Change map</button>
                <button className="is-danger" onClick={() => void setMap(null)}>Remove</button>
              </div>
            ) : (
              <p className="tm-note">Shared by the DM · read-only.</p>
            )}
          </>
        ) : (
          <div className="tm-regionempty">
            <GameGlyph src="/icons/board/compass.svg" size={38} />
            <h4>No region map yet</h4>
            <p>
              {isDM
                ? "Add one from your map library so the party can see where they are in the world."
                : "Your DM hasn't shared a map of these lands yet."}
            </p>
            {isDM && (
              <button className="tm-regionset" onClick={() => setPickerOpen(true)}>Set a region map</button>
            )}
          </div>
        )}
      </div>
      {pickerOpen && (
        <MapPickerDialog
          currentMapId={null}
          onPick={(m) => {
            void setMap(m.image_url);
            setPickerOpen(false);
          }}
          onClose={() => setPickerOpen(false)}
        />
      )}
    </div>
  );
};

// ---------------------------------------------------------------------------
// Character & gear — the paper doll. Equip slots on a silhouette, grid
// inventory beside it. Equipping flips the SAME `equipped` flag that drives
// Actions + AC; drag reorders; Sort tidies once. Item art comes from the item
// generator (#65) — gradient placeholders until then.
// ---------------------------------------------------------------------------

// Fixed positions on the ~330px-tall silhouette (px from top-left of the doll).
const DOLL_POS: Partial<Record<EquipSlot, { left: string; top: number; tx: string }>> = {
  head: { left: "50%", top: 6, tx: "-50%" },
  amulet: { left: "50%", top: 66, tx: "-50%" },
  cloak: { left: "8px", top: 10, tx: "0" },
  main: { left: "8px", top: 150, tx: "0" },
  chest: { left: "50%", top: 150, tx: "-50%" },
  off: { left: "calc(100% - 55px)", top: 150, tx: "0" },
  hands: { left: "8px", top: 84, tx: "0" },
  ring: { left: "calc(100% - 55px)", top: 84, tx: "0" },
  boots: { left: "50%", top: 262, tx: "-50%" },
};

const ItemArt = ({ item }: { item: InventoryItem }) => {
  if (item.art) return <img className="tm-art" src={item.art} alt="" />;
  const abbr = item.name.trim().split(/\s+/).slice(0, 2).map((w) => w[0]?.toUpperCase() ?? "").join("");
  return <span className="tm-art is-placeholder">{abbr || "•"}</span>;
};

const GearModal = ({
  character: c,
  onClose,
  onUpdate,
  onNote,
}: {
  character: Character;
  onClose: () => void;
  onUpdate: (mut: (c: Character) => Character) => void;
  onNote: (msg: string) => void;
}) => {
  const [dragId, setDragId] = useState<string | null>(null);

  const tapItem = (item: InventoryItem) => {
    if (isEquipable(item)) {
      onUpdate((d) => ({ ...d, inventory: toggleEquipped(d.inventory, item.id) }));
    } else {
      onNote(`${item.name} — used from Actions, not worn.`);
    }
  };

  const doDrop = (targetId: string) => {
    if (!dragId || dragId === targetId) return;
    const from = dragId;
    onUpdate((d) => ({ ...d, inventory: reorder(d.inventory, from, targetId) }));
    setDragId(null);
  };

  return (
    <Dialog onClose={onClose} size="lg" title="Character &amp; gear" subtitle={`${c.name} · sheet-mapped`}>
      <div className="tm-body">
        <div className="tm-gear">
          {/* paper doll */}
          <div className="tm-doll" aria-label="Equipment slots">
            <svg className="tm-doll-body" viewBox="0 0 100 160" aria-hidden="true">
              <circle cx="50" cy="16" r="11" />
              <rect x="34" y="30" width="32" height="46" rx="10" />
              <rect x="22" y="34" width="9" height="36" rx="4.5" />
              <rect x="69" y="34" width="9" height="36" rx="4.5" />
              <rect x="37" y="78" width="11" height="44" rx="5" />
              <rect x="52" y="78" width="11" height="44" rx="5" />
            </svg>
            {EQUIP_SLOTS.filter((s) => DOLL_POS[s.key]).map((s) => {
              const pos = DOLL_POS[s.key]!;
              const it = equippedInSlot(c.inventory, s.key);
              return (
                <div
                  key={s.key}
                  className={`tm-slot ${it ? "is-full" : ""}`}
                  style={{ left: pos.left, top: pos.top, transform: `translateX(${pos.tx})` }}
                >
                  <button
                    className="tm-slot-box"
                    onClick={it ? () => tapItem(it) : undefined}
                    disabled={!it}
                    title={it ? `${it.name} — tap to remove` : `Empty — ${s.label}`}
                  >
                    {it ? <ItemArt item={it} /> : null}
                  </button>
                  <span className="tm-slot-l">{s.label}</span>
                </div>
              );
            })}
          </div>

          {/* grid inventory */}
          <div className="tm-inv">
            <div className="tm-invtools">
              <button className="tm-sort" onClick={() => onUpdate((d) => ({ ...d, inventory: sortInventory(d.inventory) }))}
                title="Tidy once — your manual order stays yours after">
                <Icon name="grid" size={13} /> Sort
              </button>
              <span className="tm-invhint">tap to equip · drag to reorder</span>
            </div>
            <div className="tm-invgrid">
              {c.inventory.map((item) => {
                const slot = slotOf(item);
                return (
                  <button
                    key={item.id}
                    className={`tm-itile ${item.equipped ? "is-eq" : ""} ${slot ? "" : "is-noslot"}`}
                    draggable
                    onDragStart={() => setDragId(item.id)}
                    onDragEnd={() => setDragId(null)}
                    onDragOver={(e) => { if (dragId && dragId !== item.id) e.preventDefault(); }}
                    onDrop={(e) => { e.preventDefault(); doDrop(item.id); }}
                    onClick={() => tapItem(item)}
                    title={`${item.name}${item.damage ? ` — ${item.damage}${item.damageType ? " " + item.damageType : ""}` : ""}`}
                  >
                    {slot && <span className="tm-itile-slot">{slot}</span>}
                    <ItemArt item={item} />
                    <span className="tm-itile-n">{item.name}</span>
                  </button>
                );
              })}
              {c.inventory.length === 0 && (
                <span className="tm-empty">Your pack is empty — add items on your character sheet.</span>
              )}
            </div>
          </div>
        </div>
        <p className="tm-note">
          Equipping flips the same <b>equipped</b> flag your sheet uses — a wielded weapon appears in Actions
          and on the HUD; armor feeds AC. Tiles show item art once the item generator fills them.
        </p>
      </div>
    </Dialog>
  );
};

// ---------------------------------------------------------------------------
// Spellbook — prepare for the day + manage slots. Spell data has no damage, so
// casting spends a slot and announces (with the save DC); the spell-attack roll
// goes table-wide. Prepared list + slots are the sheet's own state.
// ---------------------------------------------------------------------------

const SpellbookModal = ({
  character: c,
  onClose,
  onUpdate,
  onRoll,
  onNote,
}: {
  character: Character;
  onClose: () => void;
  onUpdate: (mut: (c: Character) => Character) => void;
  onRoll: Props["onRoll"];
  onNote: (msg: string) => void;
}) => {
  const { spells, tables, classes } = useRules();
  const [filter, setFilter] = useState<"known" | "all">("known");
  const [query, setQuery] = useState("");

  const caster = casterClass(c, classes);
  const sc = c.spellcasting ?? { known: [], prepared: [], slotsUsed: {} };

  if (!caster) {
    return (
      <Dialog onClose={onClose} size="md" title="Spellbook" subtitle={c.name}>
        <p className="tm-empty" style={{ padding: "24px 4px" }}>
          {c.classes[0]?.name ?? "This class"} doesn't cast spells.
        </p>
      </Dialog>
    );
  }

  const ability = castingAbility(caster.name);
  const dc = spellSaveDC(c, caster.name);
  const atk = spellAttackBonus(c, caster.name);
  const slots = slotsFor(caster.caster, caster.level, tables);
  const slotLevels = Object.keys(slots).sort();
  const maxPrep = Math.max(1, (ability ? abilityModFor(c, ability) : 0) + caster.level);
  const classSpells = spells ? spellsForClass(spells, caster.name) : [];

  const shown = classSpells.filter((s) => {
    if (filter === "known" && !sc.known.includes(s.name)) return false;
    if (query && !s.name.toLowerCase().includes(query.toLowerCase())) return false;
    return true;
  });

  const adjustSlot = (lvl: string, delta: 1 | -1) =>
    onUpdate((d) => {
      const s = d.spellcasting ?? { known: [], prepared: [], slotsUsed: {} };
      const next = Math.max(0, (s.slotsUsed[lvl] ?? 0) + delta);
      return { ...d, spellcasting: { ...s, slotsUsed: { ...s.slotsUsed, [lvl]: next } } };
    });

  const togglePrepared = (name: string) => {
    const isPrep = sc.prepared.includes(name);
    if (!isPrep && sc.prepared.length >= maxPrep) {
      onNote(`You can keep ${maxPrep} spells prepared at level ${c.level}.`);
      return;
    }
    onUpdate((d) => {
      const s = d.spellcasting ?? { known: [], prepared: [], slotsUsed: {} };
      const prepared = isPrep ? s.prepared.filter((n) => n !== name) : [...s.prepared, name];
      const known = !isPrep && !s.known.includes(name) ? [...s.known, name] : s.known;
      return { ...d, spellcasting: { ...s, prepared, known } };
    });
  };

  const castSpell = (name: string, level: number) => {
    if (level > 0) {
      const lvl = String(level);
      const max = slots[lvl] ?? 0;
      const used = sc.slotsUsed[lvl] ?? 0;
      if (used >= max) {
        onNote(`No level ${level} slots left.`);
        return;
      }
      adjustSlot(lvl, 1);
    }
    onNote(`${c.name} casts ${name}${level > 0 && dc ? ` — save DC ${dc}` : ""}.`);
  };

  return (
    <Dialog onClose={onClose} size="lg" title="Spellbook"
      subtitle={`${caster.name} · prepare for the day`}>
      <div className="tm-body">
        <div className="tm-spellhd">
          <span className={`tm-prep ${sc.prepared.length > maxPrep ? "is-over" : ""}`}>
            Prepared <b>{sc.prepared.length}</b> / {maxPrep}
          </span>
          {dc != null && <span className="tm-spellstat">Save DC <b>{dc}</b></span>}
          {atk != null && (
            <button className="tm-spellatk" onClick={() => onRoll([checkRoll("Spell attack", atk)], { label: "atk" })}
              title="Roll a spell attack">
              Spell atk <b>{atk >= 0 ? `+${atk}` : atk}</b> <Icon name="dice" size={12} />
            </button>
          )}
        </div>

        {slotLevels.length > 0 && (
          <div className="tm-slots">
            {slotLevels.map((lvl) => {
              const max = slots[lvl];
              const used = sc.slotsUsed[lvl] ?? 0;
              return (
                <div className="tm-slotrow" key={lvl}>
                  <span className="tm-slotrow-l">Lv {lvl}</span>
                  <span className="tm-pips">
                    {Array.from({ length: max }, (_, i) => (
                      <button
                        key={i}
                        className={`tm-pip ${i < max - used ? "on" : ""}`}
                        onClick={() => adjustSlot(lvl, i < max - used ? 1 : -1)}
                        title={i < max - used ? "Spend a slot" : "Recover a slot"}
                        aria-label={`Level ${lvl} slot ${i + 1}`}
                      />
                    ))}
                  </span>
                </div>
              );
            })}
          </div>
        )}

        <div className="tm-spellbar">
          <div className="tm-spelltabs">
            <button className={filter === "known" ? "is-on" : ""} onClick={() => setFilter("known")}>
              Known ({sc.known.length})
            </button>
            <button className={filter === "all" ? "is-on" : ""} onClick={() => setFilter("all")}>
              All {caster.name}
            </button>
          </div>
          <input className="tm-spellsearch" placeholder="Search spells" value={query}
            onChange={(e) => setQuery(e.target.value)} aria-label="Search spells" />
        </div>

        <div className="tm-spgrid">
          {shown.map((s) => {
            const prepared = sc.prepared.includes(s.name);
            const cantrip = s.level === 0;
            return (
              <div key={s.name} className={`tm-sp ${prepared ? "is-prep" : ""}`}>
                <div className="tm-sp-top">
                  <span className="tm-sp-n">{s.name}</span>
                  {!cantrip && (
                    <button className={`tm-sp-ck ${prepared ? "on" : ""}`} onClick={() => togglePrepared(s.name)}
                      title={prepared ? "Unprepare" : "Prepare"} aria-pressed={prepared}>
                      {prepared ? "✓" : ""}
                    </button>
                  )}
                </div>
                <span className="tm-sp-m">
                  {cantrip ? "cantrip" : `level ${s.level}`} · {s.school.toLowerCase()} · {s.casting_time}
                </span>
                <button className="tm-sp-cast" onClick={() => castSpell(s.name, s.level)}>
                  {cantrip ? "Cast" : "Cast (−slot)"}
                </button>
              </div>
            );
          })}
          {shown.length === 0 && (
            <span className="tm-empty">
              {filter === "known" ? "No spells known yet — switch to All to add some." : "No spells match."}
            </span>
          )}
        </div>

        <p className="tm-note">
          Preparing and slots write to your sheet's spellcasting — the same state the Spells tab edits. Casting
          announces to the table and spends a slot; roll the spell attack from the header when a spell calls for it.
        </p>
      </div>
    </Dialog>
  );
};

// ---------------------------------------------------------------------------
// ---------------------------------------------------------------------------
// Rest — short/long, sheet-mapped. Short rest can spend a Hit Die (a real
// roll that heals); long rest restores by rule.
// ---------------------------------------------------------------------------

const RestModal = ({
  character: c,
  onClose,
  onUpdate,
  onRoll,
  onNote,
}: {
  character: Character;
  onClose: () => void;
  onUpdate: (mut: (c: Character) => Character) => void;
  onRoll: Props["onRoll"];
  onNote: (msg: string) => void;
}) => {
  const hitDie = c.classes[0]?.hitDie ?? 8;
  const conM = abilityModFor(c, "CON");
  const remaining = Math.max(0, c.level - c.hitDiceUsed);

  const spendHitDie = () => {
    const expr = `1d${hitDie}${conM >= 0 ? `+${conM}` : conM}`;
    const entry = damageRoll(`Hit Die (d${hitDie})`, expr);
    onRoll([entry], { label: `+${entry.result.total}` });
    onUpdate((d) => ({
      ...d,
      hp: applyHeal(d.hp, entry.result.total),
      hitDiceUsed: Math.min(d.level, d.hitDiceUsed + 1),
    }));
  };

  const shortRest = () => {
    onUpdate((d) => ({
      ...d,
      features: d.features.map((f) =>
        f.uses && f.uses.recharge === "short" ? { ...f, uses: { ...f.uses, current: f.uses.max } } : f
      ),
    }));
    onNote("Short rest — features that recharge on a short rest are back.");
  };

  const longRest = () => {
    onUpdate((d) => ({
      ...d,
      hp: { ...d.hp, current: d.hp.max, temp: 0 },
      hitDiceUsed: Math.max(0, d.hitDiceUsed - Math.floor(d.level / 2)),
      features: d.features.map((f) =>
        f.uses && (f.uses.recharge === "short" || f.uses.recharge === "long" || f.uses.recharge === "day")
          ? { ...f, uses: { ...f.uses, current: f.uses.max } }
          : f
      ),
      spellcasting: d.spellcasting ? { ...d.spellcasting, slotsUsed: {} } : d.spellcasting,
    }));
    onNote("Long rest — HP, spell slots, and daily powers restored.");
    onClose();
  };

  return (
    <Dialog onClose={onClose} size="md" title="Rest" subtitle="catch your breath">
      <div className="tm-body">
        <div className="tm-rest-hd">
          <span>Hit Points <b>{c.hp.current}</b>/{c.hp.max}</span>
          <span>Hit Dice <b>{remaining}</b>/{c.level} · d{hitDie}</span>
        </div>
        <div className="tm-rest">
          <div className="tm-restcol">
            <div className="tm-restcol-h">Short rest</div>
            <p>Spend a Hit Die to heal, and recharge short-rest features. An hour's breather.</p>
            <button className="tm-restbtn is-roll" onClick={spendHitDie} disabled={remaining === 0}>
              <Icon name="dice" size={15} /> Spend a Hit Die
              <span className="tm-restbtn-s">1d{hitDie}{conM >= 0 ? `+${conM}` : conM}</span>
            </button>
            <button className="tm-restbtn" onClick={shortRest}>Recharge features</button>
          </div>
          <div className="tm-restcol">
            <div className="tm-restcol-h">Long rest</div>
            <p>Regain all HP, half your Hit Dice, spell slots, and daily powers. A night's sleep.</p>
            <button className="tm-restbtn is-primary" onClick={longRest}>
              <Icon name="moon" size={15} /> Take a long rest
            </button>
          </div>
        </div>
        <p className="tm-note">Rest updates your sheet directly — the same short/long rest the sheet runs.</p>
      </div>
    </Dialog>
  );
};
