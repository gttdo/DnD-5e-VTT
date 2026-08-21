import { useEffect, useMemo, useRef, useState } from "react";
import { useTokenAssets, type TokenAsset } from "../state/useTokenAssets";
import { findSize, TOKEN_SIZES } from "../lib/tokenSmith";
import { Card, CardMedia, CardBody, CardTitle, CardMeta } from "./ui/Card";
import { Dialog } from "./ui/Dialog";
import { EmptyState } from "./ui/EmptyState";
import { Icon, type IconName } from "./ui/Icon";
import { GameGlyph } from "./ui/GameGlyph";
import { tokenKindGlyph } from "../lib/boardGlyphs";

/** Drag payload when a library token is dragged onto the board (the whole asset
 *  as JSON, so the canvas can place it without loading the library itself). */
export const TOKEN_DRAG_MIME = "application/x-vtt-token";

interface Props {
  onPick: (asset: TokenAsset) => void;
  /** Opens the quick-marker form (labeled colored disc — "Goblin A") instead
   *  of placing library art. Lives here since the IA demotion of the rail's
   *  "Add custom token" button (user, 2026-08-21). */
  onQuickMarker?: () => void;
  onClose: () => void;
}

type Kind = "monster" | "npc" | "prop" | "spell" | "item" | "other";

const KIND_TABS: { key: Kind; label: string; icon: IconName }[] = [
  { key: "monster", label: "Monsters", icon: "swords" },
  { key: "npc", label: "NPCs", icon: "users" },
  { key: "prop", label: "Props", icon: "package" },
  { key: "spell", label: "Spells", icon: "sparkles" },
  { key: "item", label: "Items", icon: "library" },
  { key: "other", label: "Other", icon: "grid" },
];
// Creature/scenery kinds you place on the board always show a tab (even empty)
// so they're reliably reachable; spells/items/other appear only if present.
const ALWAYS: Kind[] = ["monster", "npc", "prop"];

const kindOf = (a: TokenAsset): Kind => (a.token_type ?? a.details?.kind ?? "other") as Kind;
const rarityOf = (a: TokenAsset): string | null => (a.details?.kind === "item" ? a.details.item.rarity ?? null : null);
const itemTypeOf = (a: TokenAsset): string | null => (a.details?.kind === "item" ? a.details.item.itemType ?? null : null);
const levelOf = (a: TokenAsset) => (a.details?.kind === "spell" ? a.details.spell.level ?? null : null);
const schoolOf = (a: TokenAsset) => (a.details?.kind === "spell" ? a.details.spell.school ?? null : null);
const containerOf = (a: TokenAsset) => (a.details?.kind === "prop" ? !!a.details.prop.container : false);

const metaOf = (a: TokenAsset): string => {
  if (a.details?.kind === "spell") {
    const s = a.details.spell;
    return [s.level === 0 ? "Cantrip" : s.level != null ? `Level ${s.level}` : "Spell", s.school].filter(Boolean).join(" · ");
  }
  if (a.details?.kind === "item") return a.details.item.rarity ?? "Item";
  const size = findSize(a.size_category).label.split(" ")[0];
  return a.creature_type ? `${size} · ${a.creature_type}` : size;
};
const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);

/**
 * Grid of the DM's saved tokens, split by kind, with per-kind filters + search.
 * Click one → places it on the active scene at grid center. An internal scroll
 * keeps the dialog from growing past the viewport.
 */
export const TokenPickerDialog = ({ onPick, onQuickMarker, onClose }: Props) => {
  const { assets, loading } = useTokenAssets();
  const [tab, setTab] = useState<Kind>("monster");
  const [q, setQ] = useState("");
  const [sizeF, setSizeF] = useState("all");
  const [creatureF, setCreatureF] = useState("all");
  const [rarityF, setRarityF] = useState("all");
  const [itemTypeF, setItemTypeF] = useState("all");
  const [levelF, setLevelF] = useState("all");
  const [schoolF, setSchoolF] = useState("all");
  const [containerF, setContainerF] = useState("all");
  const userPicked = useRef(false);

  const counts = useMemo(() => {
    const c: Record<string, number> = {};
    assets.forEach((a) => { c[kindOf(a)] = (c[kindOf(a)] ?? 0) + 1; });
    return c;
  }, [assets]);

  const tabs = useMemo(
    () => KIND_TABS.filter((t) => ALWAYS.includes(t.key) || (counts[t.key] ?? 0) > 0),
    [counts]
  );

  useEffect(() => {
    if (userPicked.current || loading || assets.length === 0) return;
    if (!(counts[tab] > 0)) {
      const first = KIND_TABS.find((t) => (counts[t.key] ?? 0) > 0);
      if (first) setTab(first.key);
    }
  }, [loading, assets.length, counts, tab]);

  const clearFilters = () => {
    setQ(""); setSizeF("all"); setCreatureF("all"); setRarityF("all");
    setItemTypeF("all"); setLevelF("all"); setSchoolF("all"); setContainerF("all");
  };
  const pick = (k: Kind) => { userPicked.current = true; setTab(k); clearFilters(); };

  const tabTokens = useMemo(() => assets.filter((a) => kindOf(a) === tab), [assets, tab]);

  const sizes = useMemo(() => new Set(tabTokens.map((a) => a.size_category)), [tabTokens]);
  const creatures = useMemo(
    () => [...new Set(tabTokens.map((a) => a.creature_type).filter((c): c is string => !!c))].sort((a, b) => a.localeCompare(b)),
    [tabTokens]
  );
  const rarities = useMemo(() => [...new Set(tabTokens.map(rarityOf).filter((r): r is string => !!r))], [tabTokens]);
  const itemTypes = useMemo(
    () => [...new Set(tabTokens.map(itemTypeOf).filter((t): t is string => !!t))].sort((a, b) => a.localeCompare(b)),
    [tabTokens]
  );
  const levels = useMemo(
    () => [...new Set(tabTokens.map(levelOf).filter((l): l is number => l != null))].sort((a, b) => a - b),
    [tabTokens]
  );
  const schools = useMemo(
    () => [...new Set(tabTokens.map(schoolOf).filter((s): s is string => !!s))].sort((a, b) => a.localeCompare(b)),
    [tabTokens]
  );
  const containerMixed = useMemo(() => tab === "prop" && new Set(tabTokens.map(containerOf)).size > 1, [tabTokens, tab]);

  const filtered = useMemo(() => {
    const term = q.trim().toLowerCase();
    return tabTokens.filter((a) => {
      if (term && !a.name.toLowerCase().includes(term)) return false;
      if (sizeF !== "all" && a.size_category !== sizeF) return false;
      if (creatureF !== "all" && (a.creature_type ?? "") !== creatureF) return false;
      if (rarityF !== "all" && rarityOf(a) !== rarityF) return false;
      if (itemTypeF !== "all" && itemTypeOf(a) !== itemTypeF) return false;
      if (levelF !== "all" && String(levelOf(a) ?? "") !== levelF) return false;
      if (schoolF !== "all" && (schoolOf(a) ?? "") !== schoolF) return false;
      if (containerF !== "all" && containerOf(a) !== (containerF === "yes")) return false;
      return true;
    });
  }, [tabTokens, q, sizeF, creatureF, rarityF, itemTypeF, levelF, schoolF, containerF]);

  const tabLabel = KIND_TABS.find((t) => t.key === tab)?.label ?? "tokens";

  return (
    <Dialog onClose={onClose} size="lg" title="Place a token" subtitle="From your library — or drop a quick marker.">
      {onQuickMarker && (
        <button
          className="map-clear-tile"
          style={{ width: "100%", marginBottom: 12 }}
          onClick={() => {
            onClose();
            onQuickMarker();
          }}
          title="A labeled colored disc — 'Goblin A' — no art needed"
        >
          <Icon name="add" size={18} />
          <span>Quick marker</span>
          <span className="map-clear-tile-sub">A labeled disc for improvised foes, traps, and points of interest.</span>
        </button>
      )}
      {loading && <div className="dim">Loading library…</div>}

      {!loading && assets.length === 0 && (
        <EmptyState icon="drama" title="Your token library is empty" compact>
          Head to the <strong>Resources</strong> tab to generate a creature.
        </EmptyState>
      )}

      {!loading && assets.length > 0 && (
        <>
          <div className="tlib-tabs" role="tablist">
            {tabs.map((t) => (
              <button
                key={t.key}
                role="tab"
                aria-selected={tab === t.key}
                className={`tlib-tab ${tab === t.key ? "on" : ""}`}
                onClick={() => pick(t.key)}
              >
                {tokenKindGlyph(t.key) ? (
                  <GameGlyph src={tokenKindGlyph(t.key)!} size={15} className="tlib-tab-ico" />
                ) : (
                  <Icon name={t.icon} size={15} />
                )}{" "}
                {t.label}
                <span className="tlib-tab-count">{counts[t.key] ?? 0}</span>
              </button>
            ))}
          </div>

          <div className="tlib-controls">
            <div className="tlib-search">
              <Icon name="search" size={15} />
              <input
                placeholder="Search this tab…"
                value={q}
                onChange={(e) => setQ(e.target.value)}
                aria-label="Search tokens by name"
              />
            </div>

            {(tab === "monster" || tab === "npc") && sizes.size > 1 && (
              <select value={sizeF} onChange={(e) => setSizeF(e.target.value)} aria-label="Filter by size">
                <option value="all">All sizes</option>
                {TOKEN_SIZES.filter((s) => sizes.has(s.key)).map((s) => (
                  <option key={s.key} value={s.key}>{s.label}</option>
                ))}
              </select>
            )}
            {(tab === "monster" || tab === "npc") && creatures.length > 1 && (
              <select value={creatureF} onChange={(e) => setCreatureF(e.target.value)} aria-label="Filter by creature type">
                <option value="all">All types</option>
                {creatures.map((c) => <option key={c} value={c}>{cap(c)}</option>)}
              </select>
            )}
            {tab === "item" && rarities.length > 1 && (
              <select value={rarityF} onChange={(e) => setRarityF(e.target.value)} aria-label="Filter by rarity">
                <option value="all">All rarities</option>
                {rarities.map((r) => <option key={r} value={r}>{cap(r)}</option>)}
              </select>
            )}
            {tab === "item" && itemTypes.length > 1 && (
              <select value={itemTypeF} onChange={(e) => setItemTypeF(e.target.value)} aria-label="Filter by item type">
                <option value="all">All item types</option>
                {itemTypes.map((t) => <option key={t} value={t}>{cap(t)}</option>)}
              </select>
            )}
            {tab === "spell" && levels.length > 1 && (
              <select value={levelF} onChange={(e) => setLevelF(e.target.value)} aria-label="Filter by level">
                <option value="all">All levels</option>
                {levels.map((l) => <option key={l} value={String(l)}>{l === 0 ? "Cantrip" : `Level ${l}`}</option>)}
              </select>
            )}
            {tab === "spell" && schools.length > 1 && (
              <select value={schoolF} onChange={(e) => setSchoolF(e.target.value)} aria-label="Filter by school">
                <option value="all">All schools</option>
                {schools.map((s) => <option key={s} value={s}>{s}</option>)}
              </select>
            )}
            {containerMixed && (
              <select value={containerF} onChange={(e) => setContainerF(e.target.value)} aria-label="Filter by container">
                <option value="all">All props</option>
                <option value="yes">Containers</option>
                <option value="no">Not containers</option>
              </select>
            )}

            <span className="tlib-count">{filtered.length} of {counts[tab] ?? 0}</span>
          </div>

          {filtered.length === 0 ? (
            <EmptyState icon={q ? "search" : "drama"} title={q ? "No matches" : `No ${tabLabel.toLowerCase()} yet`} compact>
              {q ? `Nothing in this tab matches “${q}”.` : <>Create some in the <strong>Resources</strong> tab.</>}
            </EmptyState>
          ) : (
            <div
              style={{
                display: "grid",
                gridTemplateColumns: "repeat(auto-fill, minmax(124px, 1fr))",
                gap: 10,
                maxHeight: "46vh",
                overflowY: "auto",
                paddingRight: 4,
              }}
            >
              {filtered.map((a) => (
                <Card
                  key={a.id}
                  onClick={() => onPick(a)}
                  title={`${a.prompt ?? a.name} — click to place, or drag onto a cell`}
                  draggable
                  onDragStart={(e) => {
                    e.dataTransfer.setData(TOKEN_DRAG_MIME, JSON.stringify(a));
                    e.dataTransfer.effectAllowed = "copy";
                    // Step the picker aside so the board becomes a drop target.
                    // Deferred: removing the drag source synchronously in
                    // dragstart cancels the drag in some browsers.
                    setTimeout(onClose, 0);
                  }}
                >
                  <CardMedia src={a.image_url} alt={a.name} shape="circle" />
                  <CardBody>
                    <CardTitle>{a.name}</CardTitle>
                    <CardMeta>{metaOf(a)}</CardMeta>
                  </CardBody>
                </Card>
              ))}
            </div>
          )}
        </>
      )}
    </Dialog>
  );
};
