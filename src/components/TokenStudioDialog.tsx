import { useEffect, useRef, useState } from "react";
import { Dialog } from "./ui/Dialog";
import { Icon, type IconName } from "./ui/Icon";
import { useRules } from "../state/Rules";
import { findMonster } from "../lib/bestiary";
import { useTokenAssets, type TokenAsset } from "../state/useTokenAssets";
import { abilityMod, formatMod } from "../lib/calc";
import { TOKEN_SIZES, CREATURE_TYPES, findSize, type TokenSize, type CreatureType } from "../lib/tokenSmith";
import {
  buildStudioImagePrompt,
  resolveStats,
  generateStudioImage,
  nameFromDetails,
  type StatSource,
} from "../lib/contentSmith";
import type { TokenType, TokenDetails, MonsterStatblock, NpcProfile, MagicItem, PropDetails, SpellTokenDetails, SpellAreaShape } from "../types/content";
import { ABILITIES } from "../types/character";
import { cropToSquareAvatar } from "../lib/image";
import { supabase } from "../lib/supabase";

/**
 * The token studio — create a monster, NPC, or item as art PLUS structured
 * details in one pass. Known creatures resolve to their SRD statblock; anything
 * else is generated. See the concept at the studio mock; the pipeline lives in
 * lib/contentSmith, the schemas in types/content.
 *
 * v1 generates + previews + saves to the library. Fine-grained field editing
 * (beyond the name) is a fast follow — the raw details are stored either way,
 * so nothing's lost.
 */

const TYPES: { id: TokenType; label: string; icon: IconName; hint: string }[] = [
  { id: "monster", label: "Monster", icon: "swords", hint: "Try “Frost Giant” (matches the SRD) or describe a homebrew — art + statblock generate together." },
  { id: "npc", label: "NPC", icon: "users", hint: "A name and a sentence is enough — the studio drafts a full profile and a portrait." },
  { id: "item", label: "Item", icon: "library", hint: "Describe the item — the studio drafts the magic-item card, its mechanics, and art." },
  { id: "prop", label: "Prop", icon: "package", hint: "Scenery — a chest, chair, rock, barrel. No stats; flag containers to make them lootable." },
  { id: "spell", label: "Spell", icon: "sparkles", hint: "An area-effect marker — a Fireball burst, Web, Wall of Fire. Set its shape and size." },
];

type Phase = "idle" | "busy" | "ready";

export const TokenStudioDialog = ({
  onClose,
  editAsset,
}: {
  onClose: () => void;
  /** When set, the studio edits an existing token's stats instead of creating a
   *  new one — for tokens made before stats existed. Art is kept as-is. */
  editAsset?: TokenAsset;
}) => {
  const { bestiary } = useRules();
  const { createAsset, updateAsset } = useTokenAssets();
  const editing = !!editAsset;

  const [kind, setKind] = useState<TokenType>(editAsset?.token_type ?? "monster");
  const [name, setName] = useState(editAsset?.name ?? "");
  const [description, setDescription] = useState("");
  const [phase, setPhase] = useState<Phase>(editAsset?.details ? "ready" : "idle");
  const [error, setError] = useState<string | null>(null);
  const [imageUrl, setImageUrl] = useState<string | null>(editAsset?.image_url || null);
  const [details, setDetails] = useState<TokenDetails | null>(editAsset?.details ?? null);
  const [source, setSource] = useState<StatSource | null>(null);
  const [advOpen, setAdvOpen] = useState(false);
  const [saved, setSaved] = useState(false);
  // Two entry modes (mirrors the map dialog's Upload | Generate): "hand" is the
  // driven path — a blank form you fill in; "generate" describes it and lets the
  // AI draft everything (incl. the name). Editing an existing token skips this.
  const [mode, setMode] = useState<"hand" | "generate">("hand");
  // Art is its own pipeline — upload (preferred) or generate — independent of stats.
  const [artBusy, setArtBusy] = useState(false);
  const fileRef = useRef<HTMLInputElement | null>(null);
  // Token size + creature type — derived from the generated stats, overridable.
  const [size, setSize] = useState<TokenSize>(editAsset?.size_category ?? "medium");
  const [creatureType, setCreatureType] = useState<CreatureType>(
    (editAsset?.creature_type as CreatureType) ?? "humanoid"
  );

  const typeMeta = TYPES.find((t) => t.id === kind)!;

  const reset = () => {
    setPhase("idle");
    setError(null);
    if (!editing) setImageUrl(null); // editing keeps the existing art
    setDetails(null);
    setSource(null);
    setAdvOpen(false);
    setSaved(false);
    // Back to the driven, form-first path.
    if (!editing) { setMode("hand"); seedBlank(kind); }
  };

  // Seed a blank, editable form of the given kind — the by-hand starting point.
  const seedBlank = (k: TokenType) => {
    setDetails(blankDetails(k, name.trim()));
    setSource(null);
    setPhase("ready");
    setError(null);
    setSaved(false);
  };

  const pickKind = (k: TokenType) => {
    setKind(k);
    if (!editing) setImageUrl(null);
    setError(null);
    setSaved(false);
    setSource(null);
    setAdvOpen(false);
    if (editing) return;
    if (mode === "hand") seedBlank(k);
    else { setDetails(null); setPhase("idle"); }
  };

  const switchMode = (m: "hand" | "generate") => {
    if (m === mode || editing) return;
    setMode(m);
    setError(null);
    setSaved(false);
    setSource(null);
    if (m === "hand") seedBlank(kind);
    else { setDetails(null); setPhase("idle"); }
  };

  // Form-first: land on a blank by-hand form for a NEW token.
  useEffect(() => {
    if (!editing && mode === "hand" && !details) seedBlank(kind);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // By-hand MONSTER: if the typed name matches an SRD creature, offer its exact
  // statblock (Generate mode stays homebrew — the SRD library covers canon).
  const srdMatch =
    !editing && mode === "hand" && kind === "monster" && name.trim().length >= 3
      ? findMonster(name, bestiary)
      : null;
  const srdLoaded = details?.kind === "monster" && source === "srd" && details.monster.name === srdMatch?.name;
  const loadOfficial = () => {
    if (!srdMatch) return;
    setDetails({ kind: "monster", monster: srdMatch });
    setSource("srd");
    setSize(srdMatch.size);
    setCreatureType(toCreatureType(srdMatch.type));
    setPhase("ready");
    setSaved(false);
  };

  // Stats pipeline — AI/SRD only; art is handled separately (upload or generate).
  const generate = async () => {
    if (!name.trim() && !description.trim()) return;
    setPhase("busy");
    setError(null);
    setSaved(false);
    try {
      const { details: dt, source: src } = await resolveStats(kind, name, description, bestiary);
      setDetails(dt);
      setSource(src);
      if (!name.trim()) setName(nameFromDetails(dt, kind));
      // Pre-fill the token size + type from what was generated (overridable).
      if (dt.kind === "monster") {
        setSize(dt.monster.size);
        setCreatureType(toCreatureType(dt.monster.type));
      } else if (dt.kind === "npc") {
        setSize("medium");
        setCreatureType("humanoid");
      }
      setPhase("ready");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Couldn't generate the details.");
      setPhase(details ? "ready" : "idle");
    }
  };

  // Art pipeline: bring your own file first, generate as the fallback.
  const uploadArt = async (file: File) => {
    setArtBusy(true);
    setError(null);
    setSaved(false);
    try {
      const blob = await cropToSquareAvatar(file); // throws if too small / unreadable
      const path = `token-art/${Date.now()}-${Math.floor(Math.random() * 1e6)}.png`;
      const { error: upErr } = await supabase.storage.from("map-images").upload(path, blob, {
        cacheControl: "3600",
        upsert: true,
        contentType: "image/png",
      });
      if (upErr) throw new Error(`Upload failed: ${upErr.message}`);
      const { data } = supabase.storage.from("map-images").getPublicUrl(path);
      setImageUrl(data.publicUrl);
      setSource(null); // user-provided, not SRD/generated
    } catch (e) {
      setError(e instanceof Error ? e.message : "Couldn't process that image.");
    } finally {
      setArtBusy(false);
    }
  };

  const generateArt = async () => {
    if (!name.trim() && !description.trim()) return;
    setArtBusy(true);
    setError(null);
    setSaved(false);
    try {
      // Spells match the transparent-background emblem style of the bundled art.
      // Tokens generate at "medium": at "high", gpt-image-2 runs ~150s and trips
      // the edge function's time limit (the non-2xx). A token renders as a small
      // circle, so medium is plenty and finishes in ~30–60s. Maps keep "high"
      // (GenerateMapDialog) — they squeak in, and detail matters more there.
      // Derive the art from the STATS, not just the name — so the picture matches
      // the block (a generated dwarf guard captain, not a default human). See
      // buildStudioImagePrompt: it pulls ancestry/appearance/description from details.
      const url = await generateStudioImage(
        buildStudioImagePrompt(kind, name, description, details),
        "medium",
        kind === "spell" ? { background: "transparent" } : {}
      );
      setImageUrl(url);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Couldn't generate the art.");
    } finally {
      setArtBusy(false);
    }
  };

  const save = async () => {
    // Creating needs details; editing can also save an art-only change on a
    // token that has no stats yet.
    if (!details && !editing) return;
    const finalName = name.trim() || (details ? nameFromDetails(details, kind) : editAsset!.name);
    // Keep the edited name on the details too, so the statblock label matches.
    const stamped: TokenDetails | null = !details
      ? null
      : details.kind === "monster"
        ? { kind: "monster", monster: { ...details.monster, name: finalName } }
        : details.kind === "npc"
          ? { kind: "npc", npc: { ...details.npc, name: finalName } }
          : details.kind === "prop"
            ? { kind: "prop", prop: { ...details.prop, name: finalName } }
            : details.kind === "spell"
              ? { kind: "spell", spell: { ...details.spell, name: finalName } }
              : { kind: "item", item: { ...details.item, name: finalName } };
    const { error: saveErr } = editing
      ? await updateAsset(editAsset!.id, {
          name: finalName,
          image_url: imageUrl ?? editAsset!.image_url,
          ...(stamped ? { token_type: kind, details: stamped } : {}),
          size_category: size,
          creature_type: kind === "monster" || kind === "npc" ? creatureType : null,
        })
      : await createAsset({
          name: finalName,
          image_url: imageUrl ?? "",
          token_type: kind,
          details: stamped!,
          size_category: size,
          creature_type: kind === "monster" || kind === "npc" ? creatureType : undefined,
        });
    if (saveErr) setError(saveErr);
    else setSaved(true);
  };

  // Edit the generated details in place (immutably — structuredClone then mutate).
  const editMonster = (fn: (m: MonsterStatblock) => void) =>
    setDetails((d) => (d?.kind === "monster" ? { kind: "monster", monster: cloneMut(d.monster, fn) } : d));
  const editNpc = (fn: (n: NpcProfile) => void) =>
    setDetails((d) => (d?.kind === "npc" ? { kind: "npc", npc: cloneMut(d.npc, fn) } : d));
  const editItem = (fn: (it: MagicItem) => void) =>
    setDetails((d) => (d?.kind === "item" ? { kind: "item", item: cloneMut(d.item, fn) } : d));
  const editProp = (fn: (p: PropDetails) => void) =>
    setDetails((d) => (d?.kind === "prop" ? { kind: "prop", prop: cloneMut(d.prop, fn) } : d));
  const editSpell = (fn: (s: SpellTokenDetails) => void) =>
    setDetails((d) => (d?.kind === "spell" ? { kind: "spell", spell: cloneMut(d.spell, fn) } : d));

  const artState = artBusy ? "busy" : imageUrl ? "done" : "empty";

  return (
    <Dialog
      onClose={onClose}
      size="lg"
      title={editing ? "Edit token stats" : "Token studio"}
      subtitle={editing ? editAsset!.name : "monsters · NPCs · items"}
    >
      <div className="tstudio">
        {/* hero: copy left, circular token right */}
        <div className="tstudio-hero">
          <div className="tstudio-copy">
            <div className="tstudio-types" role="group" aria-label="What to create">
              {TYPES.map((t) => (
                <button key={t.id} className={kind === t.id ? "on" : ""} onClick={() => pickKind(t.id)}
                  aria-pressed={kind === t.id}>
                  <Icon name={t.icon} size={15} /> {t.label}
                </button>
              ))}
            </div>
            <p className="tstudio-lede">
              Bring your own art and stats, or let the studio conjure either. Known creatures use their
              exact SRD stats; anything else is generated to the 2024 rules — yours to edit before you save.
            </p>
          </div>
          <div className="tstudio-artwrap">
            {/* The whole preview is the upload target (click to pick a file);
                the corner FAB generates art with AI. No separate buttons. */}
            <div
              className={`tstudio-art is-${artState} k-${kind}`}
              onClick={artBusy ? undefined : () => fileRef.current?.click()}
              role="button"
              tabIndex={artBusy ? -1 : 0}
              onKeyDown={(e) => {
                if (artBusy) return;
                if (e.key === "Enter" || e.key === " ") {
                  e.preventDefault();
                  fileRef.current?.click();
                }
              }}
              title={imageUrl ? "Click to replace with your own art" : "Click to upload your art"}
              style={{ cursor: artBusy ? "default" : "pointer" }}
            >
              {source && artState === "done" && (
                <span className="tstudio-src">{source === "srd" ? "Matched · SRD 5.1" : "Generated"}</span>
              )}
              {artState === "empty" && (
                <span className="tstudio-ph"><Icon name="image" size={26} /><span>Click to<br />upload art</span></span>
              )}
              {artState === "busy" && (
                <span className="tstudio-loader"><span className="tstudio-spinner" /><span>Conjuring…</span></span>
              )}
              {artState === "done" && imageUrl && <img src={imageUrl} alt="" />}
              {artState === "done" && !imageUrl && (
                <span className="tstudio-noart"><Icon name="image" size={22} /><span>no art</span></span>
              )}
            </div>

            {/* Generate-with-AI FAB — sits on the ring (outside the clipped
                circle), always reachable. Clicking the circle uploads instead. */}
            <button
              type="button"
              className="tstudio-artfab"
              onClick={() => void generateArt()}
              disabled={artBusy || (!name.trim() && !description.trim())}
              title={
                !name.trim() && !description.trim()
                  ? "Name or describe it first, then generate art with AI"
                  : imageUrl
                    ? "Regenerate the art with AI"
                    : "Generate art with AI"
              }
              aria-label="Generate art with AI"
            >
              <Icon name="sparkles" size={16} />
            </button>
            <input
              ref={fileRef}
              type="file"
              accept="image/*"
              hidden
              onChange={(e) => {
                const file = e.target.files?.[0];
                e.target.value = "";
                if (file) void uploadArt(file);
              }}
            />
          </div>
        </div>

        {/* create controls */}
        <div className="tstudio-form">
          {/* Two entry modes, like the map dialog. By hand = fill the form;
              Generate = describe it and let the studio draft everything. */}
          {!editing && (
            <div className="tstudio-modes" role="group" aria-label="How to create">
              <button className={mode === "hand" ? "on" : ""} aria-pressed={mode === "hand"} onClick={() => switchMode("hand")}>
                <Icon name="edit" size={14} /> By hand
              </button>
              <button className={mode === "generate" ? "on" : ""} aria-pressed={mode === "generate"} onClick={() => switchMode("generate")}>
                <Icon name="sparkles" size={14} /> Generate
              </button>
            </div>
          )}

          {/* GENERATE: describe → the studio drafts name + stats + details. */}
          {mode === "generate" && !editing && (
            <>
              <div className="tstudio-field">
                <label>Describe it <span className="opt">— the studio drafts the name, stats &amp; details</span></label>
                <textarea value={description} onChange={(e) => setDescription(e.target.value)} rows={2}
                  placeholder="Describe what you have in mind…" autoFocus />
              </div>
              <div className="tstudio-genrow">
                <button className="tstudio-gen" onClick={generate} disabled={phase === "busy" || !description.trim()}>
                  <Icon name="sparkles" size={15} /> {phase === "busy" ? "Conjuring…" : details ? "Regenerate" : "Generate"}
                </button>
                <span className="tstudio-hint">{typeMeta.hint}</span>
              </div>
            </>
          )}

          {/* Name field — always in By hand; in Generate it appears once the AI
              has drafted a name, so you can tweak it. */}
          {(mode === "hand" || (details && !editing) || editing) && (
            <div className="tstudio-field">
              <label>Name</label>
              <input value={name} onChange={(e) => setName(e.target.value)}
                placeholder={kind === "monster" ? "e.g. Frost Giant" : kind === "npc" ? "e.g. Maera Voss" : "e.g. Frostbite"} />
              {srdMatch && !srdLoaded && (
                <button type="button" className="tstudio-srd" onClick={loadOfficial}>
                  <Icon name="library" size={13} /> Load official stats for “{srdMatch.name}”
                </button>
              )}
              {srdLoaded && <span className="tstudio-srd-on"><Icon name="check" size={13} /> Official SRD stats loaded</span>}
            </div>
          )}
          {error && <div className="tstudio-error">{error}</div>}
        </div>

        {/* review */}
        {details && phase === "ready" && (
          <div className="tstudio-review">
            {kind !== "item" && (
              <div className="tstudio-tokenrow">
                <label>Token size
                  <select value={size} onChange={(e) => setSize(e.target.value as TokenSize)}>
                    {TOKEN_SIZES.map((s) => <option key={s.key} value={s.key}>{s.label}</option>)}
                  </select>
                </label>
                {(kind === "monster" || kind === "npc") && (
                  <label>Type
                    <select value={creatureType} onChange={(e) => setCreatureType(e.target.value as CreatureType)}>
                      {CREATURE_TYPES.map((c) => <option key={c.key} value={c.key}>{c.label}</option>)}
                    </select>
                  </label>
                )}
                <span className="tstudio-fp">fills {findSize(size).cells}×{findSize(size).cells} cell{findSize(size).cells === 1 ? "" : "s"}</span>
              </div>
            )}
            {details.kind === "monster" && <MonsterPreview d={details} onEdit={editMonster} advOpen={advOpen} onAdv={() => setAdvOpen((o) => !o)} />}
            {details.kind === "npc" && <NpcPreview d={details} onEdit={editNpc} />}
            {details.kind === "item" && <ItemPreview d={details} onEdit={editItem} advOpen={advOpen} onAdv={() => setAdvOpen((o) => !o)} />}
            {details.kind === "prop" && <PropPreview d={details} onEdit={editProp} />}
            {details.kind === "spell" && <SpellPreview d={details} onEdit={editSpell} />}
          </div>
        )}
      </div>

      {((details && phase === "ready") || (editing && imageUrl !== editAsset!.image_url)) && (
        <div className="tstudio-foot">
          <button className="ghost" onClick={reset}>{editing ? "Clear" : "Start over"}</button>
          {saved ? (
            <span className="tstudio-saved"><Icon name="check" size={15} /> {editing ? "Saved" : "Saved to library"}</span>
          ) : (
            <button className="tstudio-save" onClick={save}>{editing ? "Save changes" : `Save ${kind} to library`}</button>
          )}
        </div>
      )}
    </Dialog>
  );
};

// ---- editable primitives + per-kind editors --------------------------------

const cloneMut = <T,>(o: T, fn: (x: T) => void): T => {
  const c = structuredClone(o);
  fn(c);
  return c;
};

/** "darkvision 60 ft, blindsight 10 ft" ⇄ string[] — for the comma-list fields. */
const splitList = (v: string): string[] => v.split(",").map((s) => s.trim()).filter(Boolean);

const AddBtn = ({ onClick }: { onClick: () => void }) => (
  <button type="button" className="tstudio-add" onClick={onClick}><Icon name="add" size={12} /> Add</button>
);
const DelBtn = ({ onClick }: { onClick: () => void }) => (
  <button type="button" className="tstudio-del" onClick={onClick} aria-label="Remove"><Icon name="close" size={12} /></button>
);

// Minimal, rules-legal seeds for filling stats in by hand (no AI).
const blankMonster = (name: string): MonsterStatblock => ({
  name,
  size: "medium",
  type: "",
  ac: 10,
  hp: 10,
  speed: { walk: 30 },
  abilities: { STR: 10, DEX: 10, CON: 10, INT: 10, WIS: 10, CHA: 10 },
  cr: "0",
});
const blankItem = (name: string): MagicItem => ({
  name,
  itemType: "Wondrous item",
  rarity: "common",
  description: "",
});

/** An empty, rules-legal details object of the given kind — the seed for the
 *  by-hand form so it's editable from the first click. */
const blankDetails = (kind: TokenType, name: string): TokenDetails =>
  kind === "monster"
    ? { kind: "monster", monster: blankMonster(name) }
    : kind === "npc"
      ? { kind: "npc", npc: { name } }
      : kind === "prop"
        ? { kind: "prop", prop: { name, container: false } }
        : kind === "spell"
          ? { kind: "spell", spell: { name } }
          : { kind: "item", item: blankItem(name) };

const EIn = ({ value, onChange, width }: { value: string; onChange: (v: string) => void; width?: number }) => (
  <input className="tstudio-ein" value={value} style={width ? { width } : undefined} onChange={(e) => onChange(e.target.value)} />
);
const ENum = ({ value, onChange }: { value: number; onChange: (v: number) => void }) => (
  <input type="number" className="tstudio-ein is-num" value={value} onChange={(e) => onChange(parseInt(e.target.value, 10) || 0)} />
);
const EArea = ({ value, onChange, rows = 2 }: { value?: string; onChange: (v: string) => void; rows?: number }) => (
  <textarea className="tstudio-eta" rows={rows} value={value ?? ""} onChange={(e) => onChange(e.target.value)} />
);
const EStat = ({ l, children }: { l: string; children: React.ReactNode }) => (
  <label className="tstudio-estat"><span>{l}</span>{children}</label>
);
const EField = ({ l, children, secret }: { l: string; children: React.ReactNode; secret?: boolean }) => (
  <div className={`tstudio-nfield ${secret ? "secret" : ""}`}><label>{l}</label>{children}</div>
);

const RARITIES = ["common", "uncommon", "rare", "very rare", "legendary", "artifact"] as const;

const MonsterPreview = ({ d, onEdit, advOpen, onAdv }: {
  d: Extract<TokenDetails, { kind: "monster" }>;
  onEdit: (fn: (m: MonsterStatblock) => void) => void;
  advOpen: boolean;
  onAdv: () => void;
}) => {
  const m = d.monster;
  return (
    <>
      <div className="tstudio-estatline">
        <EStat l="Type"><EIn value={m.type} onChange={(v) => onEdit((x) => { x.type = v; })} /></EStat>
        <EStat l="Alignment"><EIn value={m.alignment ?? ""} onChange={(v) => onEdit((x) => { x.alignment = v; })} /></EStat>
        <EStat l="CR"><EIn width={56} value={m.cr} onChange={(v) => onEdit((x) => { x.cr = v; })} /></EStat>
      </div>
      <div className="tstudio-estatline">
        <EStat l="Armor Class"><ENum value={m.ac} onChange={(v) => onEdit((x) => { x.ac = v; })} /></EStat>
        <EStat l="Hit Points"><ENum value={m.hp} onChange={(v) => onEdit((x) => { x.hp = v; })} /></EStat>
        <EStat l="Speed (ft)"><ENum value={m.speed.walk ?? 30} onChange={(v) => onEdit((x) => { x.speed.walk = v; })} /></EStat>
      </div>
      <div className="tstudio-sec">Ability scores</div>
      <div className="tstudio-abils">
        {ABILITIES.map((a) => (
          <label key={a} className="tstudio-ab is-edit">
            <span className="l">{a}</span>
            <input type="number" value={m.abilities[a] ?? 10}
              onChange={(e) => onEdit((x) => { x.abilities[a] = parseInt(e.target.value, 10) || 0; })} />
            <span className="s">{formatMod(abilityMod(m.abilities[a] ?? 10))}</span>
          </label>
        ))}
      </div>
      <div className="tstudio-sec">Actions <AddBtn onClick={() => onEdit((x) => { (x.actions ??= []).push({ name: "New action", text: "" }); })} /></div>
      {(m.actions ?? []).map((a, i) => (
        <div className="tstudio-eact" key={i}>
          <div className="tstudio-eact-head">
            <EIn value={a.name} onChange={(v) => onEdit((x) => { x.actions![i].name = v; })} />
            <label className="tstudio-atkcb">
              <input type="checkbox" checked={a.attackBonus != null}
                onChange={(e) => onEdit((x) => { x.actions![i].attackBonus = e.target.checked ? (x.actions![i].attackBonus ?? 0) : undefined; })} />
              Attack
            </label>
            <DelBtn onClick={() => onEdit((x) => { x.actions!.splice(i, 1); })} />
          </div>
          {a.attackBonus != null && (
            <div className="tstudio-eact-row">
              <EStat l="To hit"><ENum value={a.attackBonus} onChange={(v) => onEdit((x) => { x.actions![i].attackBonus = v; })} /></EStat>
              <EStat l="Damage"><EIn value={a.damage ?? ""} onChange={(v) => onEdit((x) => { x.actions![i].damage = v || undefined; })} /></EStat>
            </div>
          )}
          <EArea value={a.text} onChange={(v) => onEdit((x) => { x.actions![i].text = v || undefined; })} />
        </div>
      ))}
      <div className="tstudio-sec">Description</div>
      <EArea value={m.description} onChange={(v) => onEdit((x) => { x.description = v || undefined; })} rows={2} />

      {/* Advanced — the less-common statblock fields, always available so a
          from-scratch monster can carry them. */}
      <div className={`tstudio-adv ${advOpen ? "open" : ""}`}>
        <button className="tstudio-adv-t" onClick={onAdv}>Advanced <Icon name="down" size={13} /></button>
        <div className="tstudio-adv-b">
          <div className="tstudio-sec">Other speeds (ft)</div>
          <div className="tstudio-estatline">
            <EStat l="Fly"><ENum value={m.speed.fly ?? 0} onChange={(v) => onEdit((x) => { x.speed.fly = v || undefined; })} /></EStat>
            <EStat l="Swim"><ENum value={m.speed.swim ?? 0} onChange={(v) => onEdit((x) => { x.speed.swim = v || undefined; })} /></EStat>
            <EStat l="Climb"><ENum value={m.speed.climb ?? 0} onChange={(v) => onEdit((x) => { x.speed.climb = v || undefined; })} /></EStat>
            <EStat l="Burrow"><ENum value={m.speed.burrow ?? 0} onChange={(v) => onEdit((x) => { x.speed.burrow = v || undefined; })} /></EStat>
          </div>
          <EStat l="Senses (comma-separated)"><EIn value={(m.senses ?? []).join(", ")} onChange={(v) => onEdit((x) => { x.senses = splitList(v); })} /></EStat>
          <EStat l="Languages (comma-separated)"><EIn value={(m.languages ?? []).join(", ")} onChange={(v) => onEdit((x) => { x.languages = splitList(v); })} /></EStat>
          <div className="tstudio-sec">Skills <AddBtn onClick={() => onEdit((x) => { (x.skills ??= []).push({ name: "", bonus: 0 }); })} /></div>
          {(m.skills ?? []).map((s, i) => (
            <div className="tstudio-erow" key={i}>
              <EIn value={s.name} onChange={(v) => onEdit((x) => { x.skills![i].name = v; })} />
              <ENum value={s.bonus} onChange={(v) => onEdit((x) => { x.skills![i].bonus = v; })} />
              <DelBtn onClick={() => onEdit((x) => { x.skills!.splice(i, 1); })} />
            </div>
          ))}
          <div className="tstudio-sec">Traits <AddBtn onClick={() => onEdit((x) => { (x.traits ??= []).push({ name: "New trait", text: "" }); })} /></div>
          {(m.traits ?? []).map((t, i) => (
            <div className="tstudio-eact" key={i}>
              <div className="tstudio-eact-head">
                <EIn value={t.name} onChange={(v) => onEdit((x) => { x.traits![i].name = v; })} />
                <DelBtn onClick={() => onEdit((x) => { x.traits!.splice(i, 1); })} />
              </div>
              <EArea value={t.text} onChange={(v) => onEdit((x) => { x.traits![i].text = v; })} />
            </div>
          ))}
        </div>
      </div>
    </>
  );
};

const NpcPreview = ({ d, onEdit }: {
  d: Extract<TokenDetails, { kind: "npc" }>;
  onEdit: (fn: (n: NpcProfile) => void) => void;
}) => {
  const n = d.npc;
  return (
    <>
      <div className="tstudio-grid2">
        <EField l="Ancestry"><EIn value={n.ancestry ?? ""} onChange={(v) => onEdit((x) => { x.ancestry = v; })} /></EField>
        <EField l="Role"><EIn value={n.role ?? ""} onChange={(v) => onEdit((x) => { x.role = v; })} /></EField>
      </div>
      <EField l="Appearance"><EArea value={n.appearance} onChange={(v) => onEdit((x) => { x.appearance = v; })} /></EField>
      <div className="tstudio-sec">Personality</div>
      <div className="tstudio-grid2">
        <EField l="Trait"><EArea value={n.personalityTrait} onChange={(v) => onEdit((x) => { x.personalityTrait = v; })} /></EField>
        <EField l="Ideal"><EArea value={n.ideal} onChange={(v) => onEdit((x) => { x.ideal = v; })} /></EField>
        <EField l="Bond"><EArea value={n.bond} onChange={(v) => onEdit((x) => { x.bond = v; })} /></EField>
        <EField l="Flaw"><EArea value={n.flaw} onChange={(v) => onEdit((x) => { x.flaw = v; })} /></EField>
      </div>
      <div className="tstudio-grid2">
        <EField l="Voice"><EArea value={n.voice} onChange={(v) => onEdit((x) => { x.voice = v; })} /></EField>
        <EField l="Motivation"><EArea value={n.motivation} onChange={(v) => onEdit((x) => { x.motivation = v; })} /></EField>
      </div>
      <EField l="Secret · DM only" secret><EArea value={n.secret} onChange={(v) => onEdit((x) => { x.secret = v; })} /></EField>
    </>
  );
};

const ItemPreview = ({ d, onEdit }: {
  d: Extract<TokenDetails, { kind: "item" }>;
  onEdit: (fn: (it: MagicItem) => void) => void;
  advOpen?: boolean;
  onAdv?: () => void;
}) => {
  const it = d.item;
  return (
    <>
      <div className="tstudio-grid2">
        <EField l="Item type"><EIn value={it.itemType} onChange={(v) => onEdit((x) => { x.itemType = v; })} /></EField>
        <EField l="Rarity">
          <select className="tstudio-ein" value={it.rarity} onChange={(e) => onEdit((x) => { x.rarity = e.target.value as MagicItem["rarity"]; })}>
            {RARITIES.map((r) => <option key={r} value={r}>{r}</option>)}
          </select>
        </EField>
      </div>
      <label className="tstudio-attune">
        <input type="checkbox" checked={!!it.attunement} onChange={(e) => onEdit((x) => { x.attunement = e.target.checked; })} />
        Requires attunement
      </label>
      <div className="tstudio-grid2">
        <EField l="Damage"><EIn value={it.damage ?? ""} onChange={(v) => onEdit((x) => { x.damage = v || undefined; })} /></EField>
        <EField l="Weight (lb)"><input type="number" className="tstudio-ein is-num" value={it.weight ?? 0} onChange={(e) => onEdit((x) => { x.weight = parseInt(e.target.value, 10) || 0; })} /></EField>
      </div>
      <EField l="Description"><EArea value={it.description} onChange={(v) => onEdit((x) => { x.description = v; })} rows={4} /></EField>
    </>
  );
};

const PropPreview = ({ d, onEdit }: {
  d: Extract<TokenDetails, { kind: "prop" }>;
  onEdit: (fn: (p: PropDetails) => void) => void;
}) => {
  const p = d.prop;
  return (
    <>
      <EField l="Category"><EIn value={p.category ?? ""} onChange={(v) => onEdit((x) => { x.category = v || undefined; })} /></EField>
      <label className="tstudio-attune">
        <input type="checkbox" checked={!!p.container} onChange={(e) => onEdit((x) => { x.container = e.target.checked; })} />
        Container — holds loot, players can open it
      </label>
      <EField l="Description"><EArea value={p.description} onChange={(v) => onEdit((x) => { x.description = v || undefined; })} rows={2} /></EField>
    </>
  );
};

const SPELL_SHAPES: SpellAreaShape[] = ["sphere", "cube", "cone", "line", "cylinder", "emanation"];
const SpellPreview = ({ d, onEdit }: {
  d: Extract<TokenDetails, { kind: "spell" }>;
  onEdit: (fn: (s: SpellTokenDetails) => void) => void;
}) => {
  const s = d.spell;
  const hasArea = !!s.areaShape;
  return (
    <>
      <div className="tstudio-estatline">
        <EStat l="Spell level"><ENum value={s.level ?? 0} onChange={(v) => onEdit((x) => { x.level = v || undefined; })} /></EStat>
        <EStat l="School"><EIn value={s.school ?? ""} onChange={(v) => onEdit((x) => { x.school = v || undefined; })} /></EStat>
        <EStat l="Casting time"><EIn value={s.castingTime ?? ""} onChange={(v) => onEdit((x) => { x.castingTime = v || undefined; })} /></EStat>
        {/* Range is the targeting distance — independent of area (Magic Missile
            has range but no area). */}
        <EStat l="Range"><EIn value={s.range ?? ""} onChange={(v) => onEdit((x) => { x.range = v || undefined; })} /></EStat>
        <EStat l="Duration"><EIn value={s.duration ?? ""} onChange={(v) => onEdit((x) => { x.duration = v || undefined; })} /></EStat>
        <EStat l="Damage type"><EIn value={s.damageType ?? ""} onChange={(v) => onEdit((x) => { x.damageType = v || undefined; })} /></EStat>
      </div>
      <div className="tstudio-estatline">
        {/* Area is OPTIONAL — "None" clears the footprint (single-target/self). */}
        <EStat l="Area shape">
          <select
            className="tstudio-ein"
            value={s.areaShape ?? "none"}
            onChange={(e) => onEdit((x) => {
              const v = e.target.value;
              if (v === "none") { x.areaShape = undefined; x.areaSize = undefined; }
              else { x.areaShape = v as SpellAreaShape; if (!x.areaSize) x.areaSize = 20; }
            })}
          >
            <option value="none">none</option>
            {SPELL_SHAPES.map((sh) => <option key={sh} value={sh}>{sh}</option>)}
          </select>
        </EStat>
        <EStat l="Area size (ft)">
          <ENum value={s.areaSize ?? 0} onChange={(v) => onEdit((x) => { x.areaSize = v || undefined; })} />
        </EStat>
        <EStat l="Concentration">
          <input
            type="checkbox"
            className="tstudio-ecb"
            checked={!!s.concentration}
            onChange={(e) => onEdit((x) => { x.concentration = e.target.checked || undefined; })}
          />
        </EStat>
        <EStat l="Ritual">
          <input
            type="checkbox"
            className="tstudio-ecb"
            checked={!!s.ritual}
            onChange={(e) => onEdit((x) => { x.ritual = e.target.checked || undefined; })}
          />
        </EStat>
      </div>
      {!hasArea && <p className="tstudio-hint">No area — this spell renders as a marker, not an AoE footprint.</p>}
      <EField l="Description"><EArea value={s.description} onChange={(v) => onEdit((x) => { x.description = v || undefined; })} rows={2} /></EField>
    </>
  );
};

/** Map a statblock's creature type string ("Giant", "Monstrosity") to a key. */
const toCreatureType = (type: string): CreatureType => {
  const t = type.toLowerCase();
  if (t.includes("monstros")) return "monster";
  const hit = CREATURE_TYPES.find((c) => t.includes(c.key));
  return (hit?.key as CreatureType) ?? "humanoid";
};
