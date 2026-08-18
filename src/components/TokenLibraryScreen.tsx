import { useEffect, useMemo, useRef, useState } from "react";
import { useTokenAssets, type TokenAsset } from "../state/useTokenAssets";
import { useAuth } from "../state/useAuth";
import { useConfirm } from "../state/Confirm";
import { TokenStudioDialog } from "./TokenStudioDialog";
import { TokenStatSheet } from "./TokenStatSheet";
import { Icon, type IconName } from "./ui/Icon";
import { findSize, TOKEN_SIZES } from "../lib/tokenSmith";
import { Card, CardMedia, CardBody, CardTitle, CardMeta } from "./ui/Card";
import { GameGlyph } from "./ui/GameGlyph";
import { creatureTypeGlyph, tokenKindGlyph } from "../lib/boardGlyphs";
import { CardMenu } from "./ui/CardMenu";
import { Button } from "./ui/Button";
import { EmptyState } from "./ui/EmptyState";
import { LibraryBanner } from "./ui/LibraryBanner";

type TabKey = "monster" | "npc" | "item" | "prop" | "spell" | "other";

export const TokenLibraryScreen = () => {
  const { assets, loading, deleteAsset } = useTokenAssets();
  const { user } = useAuth();
  const { confirm } = useConfirm();
  const [generateOpen, setGenerateOpen] = useState(false);
  const [preview, setPreview] = useState<TokenAsset | null>(null);
  const [editAsset, setEditAsset] = useState<TokenAsset | null>(null);

  // The library is split into tabs by token kind; each tab has its own search
  // + kind-appropriate filters. Everything is client-side over loaded assets.
  const kindOf = (a: TokenAsset): TabKey => (a.token_type ?? a.details?.kind ?? "other") as TabKey;
  const rarityOf = (a: TokenAsset): string | null =>
    a.details?.kind === "item" ? a.details.item.rarity ?? null : null;
  const itemTypeOf = (a: TokenAsset): string | null =>
    a.details?.kind === "item" ? a.details.item.itemType ?? null : null;
  const attunedOf = (a: TokenAsset): boolean =>
    a.details?.kind === "item" ? !!a.details.item.attunement : false;
  const containerOf = (a: TokenAsset): boolean =>
    a.details?.kind === "prop" ? !!a.details.prop.container : false;
  const spellOf = (a: TokenAsset) => (a.details?.kind === "spell" ? a.details.spell : null);
  const levelOf = (a: TokenAsset): number | null => spellOf(a)?.level ?? null;
  const schoolOf = (a: TokenAsset): string | null => spellOf(a)?.school ?? null;
  const classesOf = (a: TokenAsset): string[] => spellOf(a)?.classes ?? [];
  const concOf = (a: TokenAsset): boolean => !!spellOf(a)?.concentration;

  const [tab, setTabState] = useState<TabKey>("monster");
  const [q, setQ] = useState("");
  const [sizeF, setSizeF] = useState("all");
  const [creatureF, setCreatureF] = useState("all");
  const [rarityF, setRarityF] = useState("all");
  const [itemTypeF, setItemTypeF] = useState("all");
  const [attuneF, setAttuneF] = useState("all"); // "all" | "yes" | "no"
  const [containerF, setContainerF] = useState("all"); // props: "all" | "yes" | "no"
  const [levelF, setLevelF] = useState("all"); // spells: "all" | "0".."9"
  const [schoolF, setSchoolF] = useState("all");
  const [classF, setClassF] = useState("all");
  const [concF, setConcF] = useState("all"); // spells: "all" | "yes" | "no"
  const [spellSort, setSpellSort] = useState<"level" | "name">("level");
  const userPicked = useRef(false);

  const clearFilters = () => {
    setQ("");
    setSizeF("all");
    setCreatureF("all");
    setRarityF("all");
    setItemTypeF("all");
    setAttuneF("all");
    setContainerF("all");
    setLevelF("all");
    setSchoolF("all");
    setClassF("all");
    setConcF("all");
  };
  const pickTab = (t: TabKey) => {
    userPicked.current = true;
    setTabState(t);
    clearFilters();
  };

  const counts = useMemo(() => {
    const c: Record<TabKey, number> = { monster: 0, npc: 0, item: 0, prop: 0, spell: 0, other: 0 };
    assets.forEach((a) => { c[kindOf(a)] += 1; });
    return c;
  }, [assets]);

  const tabs = useMemo<{ key: TabKey; label: string; icon: IconName }[]>(() => {
    const base: { key: TabKey; label: string; icon: IconName }[] = [
      { key: "monster", label: "Monsters", icon: "swords" },
      { key: "npc", label: "NPCs", icon: "users" },
      { key: "item", label: "Items", icon: "library" },
      { key: "prop", label: "Props", icon: "package" },
      { key: "spell", label: "Spells", icon: "sparkles" },
    ];
    return counts.other > 0
      ? [...base, { key: "other" as TabKey, label: "Other", icon: "grid" as IconName }]
      : base;
  }, [counts.other]);

  // Land on the first non-empty tab once the library loads (unless the user has
  // already chosen a tab).
  useEffect(() => {
    if (userPicked.current || assets.length === 0) return;
    if (counts[tab] === 0) {
      const first = tabs.find((t) => counts[t.key] > 0);
      if (first) setTabState(first.key);
    }
  }, [assets.length, counts, tab, tabs]);

  const tabTokens = useMemo(() => assets.filter((a) => kindOf(a) === tab), [assets, tab]);

  const sizesPresent = useMemo(() => new Set(tabTokens.map((a) => a.size_category)), [tabTokens]);
  const creaturesPresent = useMemo(
    () =>
      [...new Set(tabTokens.map((a) => a.creature_type).filter((c): c is string => !!c))].sort((a, b) =>
        a.localeCompare(b)
      ),
    [tabTokens]
  );
  const raritiesPresent = useMemo(
    () => [...new Set(tabTokens.map(rarityOf).filter((r): r is string => !!r))],
    [tabTokens]
  );
  const itemTypesPresent = useMemo(
    () => [...new Set(tabTokens.map(itemTypeOf).filter((t): t is string => !!t))].sort((a, b) => a.localeCompare(b)),
    [tabTokens]
  );
  const attuneMixed = useMemo(
    () => new Set(tabTokens.map(attunedOf)).size > 1,
    [tabTokens]
  );
  const containerMixed = useMemo(
    () => new Set(tabTokens.map(containerOf)).size > 1,
    [tabTokens]
  );
  const schoolsPresent = useMemo(
    () => [...new Set(tabTokens.map(schoolOf).filter((s): s is string => !!s))].sort((a, b) => a.localeCompare(b)),
    [tabTokens]
  );
  const classesPresent = useMemo(
    () => [...new Set(tabTokens.flatMap(classesOf))].sort((a, b) => a.localeCompare(b)),
    [tabTokens]
  );
  const levelsPresent = useMemo(
    () => [...new Set(tabTokens.map(levelOf).filter((l): l is number => l != null))].sort((a, b) => a - b),
    [tabTokens]
  );
  const concMixed = useMemo(() => tab === "spell" && new Set(tabTokens.map(concOf)).size > 1, [tabTokens, tab]);

  const filtered = useMemo(() => {
    const term = q.trim().toLowerCase();
    return tabTokens.filter((a) => {
      if (term && !a.name.toLowerCase().includes(term)) return false;
      if (sizeF !== "all" && a.size_category !== sizeF) return false;
      if (creatureF !== "all" && (a.creature_type ?? "") !== creatureF) return false;
      if (rarityF !== "all" && rarityOf(a) !== rarityF) return false;
      if (itemTypeF !== "all" && itemTypeOf(a) !== itemTypeF) return false;
      if (attuneF !== "all" && attunedOf(a) !== (attuneF === "yes")) return false;
      if (containerF !== "all" && containerOf(a) !== (containerF === "yes")) return false;
      if (levelF !== "all" && String(levelOf(a) ?? "") !== levelF) return false;
      if (schoolF !== "all" && (schoolOf(a) ?? "") !== schoolF) return false;
      if (classF !== "all" && !classesOf(a).includes(classF)) return false;
      if (concF !== "all" && concOf(a) !== (concF === "yes")) return false;
      return true;
    });
  }, [tabTokens, q, sizeF, creatureF, rarityF, itemTypeF, attuneF, containerF, levelF, schoolF, classF, concF]);

  // Spells sort by level→name (or name) so the 339-strong list reads in order;
  // other tabs keep the library's created-at order.
  const shown = useMemo(() => {
    if (tab !== "spell") return filtered;
    const byName = (a: TokenAsset, b: TokenAsset) => a.name.localeCompare(b.name);
    return [...filtered].sort((a, b) =>
      spellSort === "name" ? byName(a, b) : ((levelOf(a) ?? 0) - (levelOf(b) ?? 0)) || byName(a, b)
    );
  }, [filtered, tab, spellSort]);

  const hasFilters =
    q.trim() !== "" || sizeF !== "all" || creatureF !== "all" || rarityF !== "all" ||
    itemTypeF !== "all" || attuneF !== "all" || containerF !== "all" ||
    levelF !== "all" || schoolF !== "all" || classF !== "all" || concF !== "all";
  const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);
  const singular: Record<TabKey, string> = { monster: "monster", npc: "NPC", item: "item", prop: "prop", spell: "spell", other: "token" };

  return (
    <div className="screen-enter" style={{ padding: 24 }}>
      <LibraryBanner
        image="/art/ice_dragon.png"
        eyebrow="Your Library"
        title="Resources"
        subtitle={
          loading
            ? "Loading library…"
            : (() => {
                const mine = assets.filter((a) => a.owner_id === user?.id).length;
                const premade = assets.length - mine;
                return `${assets.length} resource${assets.length === 1 ? "" : "s"} available` +
                  (premade > 0 ? ` · ${mine} yours, ${premade} premade` : ` in your library`) + ".";
              })()
        }
      >
        <Button variant="primary" size="lg" icon="drama" onClick={() => setGenerateOpen(true)}>
          Create token
        </Button>
      </LibraryBanner>

      {!loading && assets.length === 0 && (
        <EmptyState
          icon="drama"
          title="No tokens yet"
          cta={{ label: "Forge your first token", icon: "drama", onClick: () => setGenerateOpen(true) }}
        >
          Forge a creature portrait from a description. Each token remembers its
          D&amp;D 5e size — a <strong>Large</strong> ogre fills 2×2 cells, a{" "}
          <strong>Gargantuan</strong> dragon fills 4×4.
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
                onClick={() => pickTab(t.key)}
              >
                {tokenKindGlyph(t.key) ? (
                  <GameGlyph src={tokenKindGlyph(t.key)!} size={15} className="tlib-tab-ico" />
                ) : (
                  <Icon name={t.icon} size={15} />
                )}{" "}
                {t.label}
                <span className="tlib-tab-count">{counts[t.key]}</span>
              </button>
            ))}
          </div>

          <div className="tlib-controls">
            <div className="tlib-search">
              <Icon name="search" size={15} />
              <input
                placeholder={`Search ${tab === "other" ? "tokens" : singular[tab] + "s"}…`}
                value={q}
                onChange={(e) => setQ(e.target.value)}
                aria-label="Search by name"
              />
            </div>
            {(tab === "monster" || tab === "npc") && sizesPresent.size > 1 && (
              <select value={sizeF} onChange={(e) => setSizeF(e.target.value)} aria-label="Filter by size">
                <option value="all">All sizes</option>
                {TOKEN_SIZES.filter((s) => sizesPresent.has(s.key)).map((s) => (
                  <option key={s.key} value={s.key}>{s.label}</option>
                ))}
              </select>
            )}
            {(tab === "monster" || tab === "npc") && creaturesPresent.length > 1 && (
              <select value={creatureF} onChange={(e) => setCreatureF(e.target.value)} aria-label="Filter by creature type">
                <option value="all">All types</option>
                {creaturesPresent.map((c) => (
                  <option key={c} value={c}>{cap(c)}</option>
                ))}
              </select>
            )}
            {tab === "item" && raritiesPresent.length > 1 && (
              <select value={rarityF} onChange={(e) => setRarityF(e.target.value)} aria-label="Filter by rarity">
                <option value="all">All rarities</option>
                {raritiesPresent.map((r) => (
                  <option key={r} value={r}>{cap(r)}</option>
                ))}
              </select>
            )}
            {tab === "item" && itemTypesPresent.length > 1 && (
              <select value={itemTypeF} onChange={(e) => setItemTypeF(e.target.value)} aria-label="Filter by item type">
                <option value="all">All item types</option>
                {itemTypesPresent.map((t) => (
                  <option key={t} value={t}>{cap(t)}</option>
                ))}
              </select>
            )}
            {tab === "item" && attuneMixed && (
              <select value={attuneF} onChange={(e) => setAttuneF(e.target.value)} aria-label="Filter by attunement">
                <option value="all">Any attunement</option>
                <option value="yes">Requires attunement</option>
                <option value="no">No attunement</option>
              </select>
            )}
            {tab === "prop" && containerMixed && (
              <select value={containerF} onChange={(e) => setContainerF(e.target.value)} aria-label="Filter by container">
                <option value="all">All props</option>
                <option value="yes">Containers</option>
                <option value="no">Not containers</option>
              </select>
            )}
            {tab === "spell" && levelsPresent.length > 1 && (
              <select value={levelF} onChange={(e) => setLevelF(e.target.value)} aria-label="Filter by level">
                <option value="all">All levels</option>
                {levelsPresent.map((l) => (
                  <option key={l} value={String(l)}>{l === 0 ? "Cantrip" : `Level ${l}`}</option>
                ))}
              </select>
            )}
            {tab === "spell" && schoolsPresent.length > 1 && (
              <select value={schoolF} onChange={(e) => setSchoolF(e.target.value)} aria-label="Filter by school">
                <option value="all">All schools</option>
                {schoolsPresent.map((s) => (
                  <option key={s} value={s}>{s}</option>
                ))}
              </select>
            )}
            {tab === "spell" && classesPresent.length > 1 && (
              <select value={classF} onChange={(e) => setClassF(e.target.value)} aria-label="Filter by class">
                <option value="all">All classes</option>
                {classesPresent.map((c) => (
                  <option key={c} value={c}>{c}</option>
                ))}
              </select>
            )}
            {tab === "spell" && concMixed && (
              <select value={concF} onChange={(e) => setConcF(e.target.value)} aria-label="Filter by concentration">
                <option value="all">Any concentration</option>
                <option value="yes">Concentration</option>
                <option value="no">No concentration</option>
              </select>
            )}
            {tab === "spell" && (
              <select value={spellSort} onChange={(e) => setSpellSort(e.target.value as "level" | "name")} aria-label="Sort spells">
                <option value="level">Sort: Level</option>
                <option value="name">Sort: Name</option>
              </select>
            )}
            <span className="tlib-count">{shown.length} of {tabTokens.length}</span>
            {hasFilters && (
              <button className="tlib-clear" onClick={clearFilters}>
                <Icon name="close" size={13} /> Clear
              </button>
            )}
          </div>
        </>
      )}

      {!loading && assets.length > 0 && tabTokens.length === 0 && (
        <EmptyState icon="drama" title={`No ${singular[tab]}s yet`}
          cta={{ label: "Create one", icon: "drama", onClick: () => setGenerateOpen(true) }}>
          Make a {singular[tab]} in the studio and it lands in this tab.
        </EmptyState>
      )}
      {!loading && tabTokens.length > 0 && filtered.length === 0 && (
        <EmptyState icon="search" title="No matches">
          Nothing here matches those filters.{" "}
          <button className="linklike" onClick={clearFilters}>Clear filters</button> to see them all.
        </EmptyState>
      )}

      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(auto-fill, minmax(180px, 1fr))",
          gap: 16,
        }}
      >
        {shown.map((a) => {
          const size = findSize(a.size_category);
          const spell = a.details?.kind === "spell" ? a.details.spell : null;
          const meta = spell
            ? [spell.level === 0 ? "Cantrip" : spell.level != null ? `Level ${spell.level}` : "Spell", spell.school]
                .filter(Boolean)
                .join(" · ")
            : `${size.label} · ${a.creature_type ?? "—"}`;
          const ctGlyph = spell ? null : creatureTypeGlyph(a.creature_type);
          // Shared premades (the seeded SRD library) are read-only to anyone but
          // their owner — usable, but no Edit/Delete. #135
          const owned = a.owner_id === user?.id;
          return (
            <Card
              key={a.id}
              className={owned ? "has-menu" : undefined}
              onClick={() => setPreview(a)}
            >
              {owned ? (
                <CardMenu
                  label={`Actions for ${a.name}`}
                  items={[
                    {
                      label: "Edit",
                      icon: "edit",
                      onClick: () => setEditAsset(a),
                    },
                    {
                      label: "Delete",
                      icon: "delete",
                      danger: true,
                      onClick: async () => {
                        if (
                          await confirm({
                            title: "Delete token",
                            message: `Delete "${a.name}"? Placed tokens on scenes keep their image but lose the link.`,
                            confirmLabel: "Delete",
                            danger: true,
                          })
                        ) {
                          await deleteAsset(a.id);
                        }
                      },
                    },
                  ]}
                />
              ) : (
                <span className="card-badge" title="Shared premade — from the built-in library">Premade</span>
              )}
              <CardMedia src={a.image_url} alt={a.name} shape="circle" />
              <CardBody>
                <CardTitle>{a.name}</CardTitle>
                <CardMeta>
                  {ctGlyph && <GameGlyph src={ctGlyph} size={13} className="card-meta-glyph" />}
                  {meta}
                </CardMeta>
              </CardBody>
            </Card>
          );
        })}
      </div>

      {generateOpen && <TokenStudioDialog onClose={() => setGenerateOpen(false)} />}
      {editAsset && <TokenStudioDialog editAsset={editAsset} onClose={() => setEditAsset(null)} />}

      {preview && (
        <div className="token-detail-overlay" onClick={() => setPreview(null)}>
          <div className="token-detail" onClick={(e) => e.stopPropagation()}>
            <div className="token-detail-art">
              <img src={preview.image_url} alt={preview.name} />
              <div className="token-detail-caption">
                <strong>{preview.name}</strong>
                <div className="dim" style={{ fontSize: 12, marginTop: 4 }}>
                  {findSize(preview.size_category).label} · {preview.creature_type ?? "—"}
                </div>
              </div>
              <button
                className="token-detail-edit"
                onClick={() => {
                  setEditAsset(preview);
                  setPreview(null);
                }}
              >
                <Icon name="edit" size={14} /> {preview.details ? "Edit stats" : "Add stats"}
              </button>
            </div>
            {preview.details ? (
              <div className="token-detail-stats">
                <TokenStatSheet details={preview.details} />
              </div>
            ) : (
              <div className="token-detail-stats token-detail-nostats dim">
                No stats saved for this token. Newer tokens made in the studio carry a full stat block.
              </div>
            )}
            <button className="token-detail-close" onClick={() => setPreview(null)} aria-label="Close">
              <Icon name="close" size={18} />
            </button>
          </div>
        </div>
      )}
    </div>
  );
};
