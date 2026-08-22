import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useTokens, isTokenDowned, type Token } from "../state/useTokens";
import { useScenes } from "../state/useScenes";
import type { Game } from "../state/useGames";
import { MapPickerDialog } from "./MapPickerDialog";
import { TokenPickerDialog, TOKEN_DRAG_MIME } from "./TokenPickerDialog";
import { supabase } from "../lib/supabase";
import type { MapAsset } from "../state/useMaps";
import { useTokenAssets, type TokenAsset } from "../state/useTokenAssets";
import { findSize } from "../lib/tokenSmith";
import { Icon } from "./ui/Icon";
import { GameGlyph } from "./ui/GameGlyph";
import { useToast } from "../state/Toast";
import { useConfirm } from "../state/Confirm";
import { useInitiative } from "../state/useInitiative";
import { usePings } from "../state/usePings";
import { usePartyOwners } from "../state/usePartyOwners";
import { useTableRolls } from "../state/useTableRolls";
import { naturalD20, optionalBonusesFor, type RollEntry, type RollTone, type AttackSpec, type RollMode } from "../lib/rolls";
import type { SkillName } from "../types/character";
import { aggregateConditions, autoFailsSave, conditionName, parseCondition } from "../lib/conditions";
import { isReadying, parseBuff, isStealthHidden, encodeHidden, isHiddenEntry, hiddenStealth } from "../lib/buffs";
import { TokenStatusEditor } from "./TokenStatusEditor";
import { useSaveRequests } from "../state/useSaveRequests";
import { type SaveRequest, encodeCondition } from "../lib/saves";
import { useReactions } from "../state/useReactions";
import { useCombatSignal } from "../state/useCombatSignal";
import { type ReactionOffer, type ReactionResponse, lowestOpenSlot, lowestOpenSlotAtLeast, knowsShield, knowsCounterspell } from "../lib/reactions";
import { useRules } from "../state/Rules";
import { casterClass, slotsFor, spellSaveDC } from "../lib/spellcasting";
import { parseMonsterSpellcasting } from "../lib/monsterSpells";
import { DiceRollDialog, type RollChip } from "./DiceRollDialog";
import { CastingLoader } from "./CastingLoader";
import { SpellProjectile, SPELL_FX_TRAVEL_MS, hasSpellFx } from "./SpellFx";
import { useSpellFx } from "../state/useSpellFx";
import { resolveDamage, type Defenses } from "../lib/damage";
import { attackRangeFt, resolveAttacks } from "../lib/attacks";
import { applyHeal, applyDamage, applyTempHp } from "../lib/hp";
import { TableHud, TokenHud, MonsterHud } from "./TableHud";
import { AttackCursor, CURSOR_SWING_MS, cursorSwingMs, cursorImpactMs, type CursorKind } from "./AttackCursor";
import { TableModals, type HudModal } from "./TableModals";
import { RegionNavigator } from "./RegionNavigator";
import { useFog } from "../state/useFog";
import { useDrawings, type DrawKind } from "../state/useDrawings";
import { useHotspots } from "../state/useHotspots";
import { useDraftSceneIds, useCampaignDocs, useDocShares } from "../state/useCampaign";
import { useSessions, sessionDuration } from "../state/useSessions";
import { appendGameLog } from "../lib/gameLog";
import { usePartyPresence } from "../state/usePartyPresence";
import { PartyPanel } from "./PartyPanel";
import { useAuth } from "../state/useAuth";
import { penPathD, shapeBox, arrowHead, hitsDrawing, DRAW_COLORS } from "../lib/drawing";
import { PartyTray, DRAG_MIME } from "./PartyTray";
import { CombatTurnRail } from "./CombatTurnRail";
import { DiceRoller } from "./DiceRoller";
import { GameLog } from "./GameLog";
import { useGameLogFeed } from "../state/useGameLogFeed";
import { StoryDrawer } from "./StoryDrawer";
import { JournalDrawer } from "./JournalDrawer";
import { CoDMCompanion } from "./CoDMCompanion";
import { AudioSettingsPopover } from "./AudioSettings";
import { SceneAmbience } from "./SceneAmbience";
import { effectiveAmbienceKey } from "../lib/soundtrack";
import { audioBus } from "../lib/audioBus";
import { HandoutView } from "./HandoutView";
import { QuestView } from "./QuestView";
import { draftRecap } from "../lib/scribe";
import { RotateHint } from "./RotateHint";
import { initiative as initiativeMod, saveBonus, abilityMod, abilityModFor, skillBonus, skillCheckChips, attackBonus, damageBonus } from "../lib/calc";
import { LootDialog } from "./LootDialog";
import { LootEditorDialog } from "./LootEditorDialog";
import { Dialog } from "./ui/Dialog";
import {
  incidentalCreatureLoot,
  incidentalContainerLoot,
  lootIsEmpty,
  lootSummary,
  lootToInventoryItem,
  tierForLevel,
  type TokenLoot,
} from "../lib/loot";
import { xpForCr, splitXp } from "../lib/xp";
import { rollD20, roll, type RollResult } from "../lib/dice";
import type { Character, Ability, Currency } from "../types/character";
import { ABILITY_FULL } from "../types/character";

interface Props {
  game: Game;
  onBack: () => void;
  /** The signed-in user's characters, passed from App's single useRoster()
   *  instance. TableCanvas must NOT call useRoster() itself: both hooks would
   *  build a realtime channel with the same topic (characters:{userId}), and
   *  supabase-js throws when callbacks are added to the already-subscribed
   *  shared channel — which blanked the whole table. */
  characters: Character[];
  /** Of those characters, the ids this user actually owns (can write directly).
   *  A party member's PC can be read (RLS) but not written — its HP goes through
   *  the apply-hp edge function instead. From App's single useRoster. */
  ownedCharacterIds: Set<string>;
  /** Persist a mutation to one of the signed-in user's characters — the HUD's
   *  path for adjusting HP from the table. From App's single useRoster. */
  onUpdateCharacter: (id: string, mut: (c: Character) => Character) => void | Promise<void>;
}

// A sword cursor for attack-targeting mode — a clearer "pick your victim" signal
// than a bare crosshair. Drawn once, encoded as a data URI. The blade tip is the
// hotspot (7,7): the sword is a vertical blade rotated -45° so it points up-left
// and its body trails down-right like a normal pointer. Cream blade + dark
// outline stays legible on both dark and light maps; crosshair is the fallback
// for browsers that don't support SVG cursors.
const SWORD_CURSOR_SVG =
  '<svg xmlns="http://www.w3.org/2000/svg" width="32" height="32" viewBox="0 0 32 32">' +
  '<g transform="rotate(-45 16 16)" stroke="#241a10" stroke-width="1.3" stroke-linejoin="round">' +
  '<polygon points="16,3 18.4,8 18.4,18 13.6,18 13.6,8" fill="#f5ecd8"/>' +
  '<rect x="9" y="17.6" width="14" height="2.8" rx="1" fill="#d4a95a"/>' +
  '<rect x="14.4" y="20.4" width="3.2" height="6" fill="#7a5a34"/>' +
  '<circle cx="16" cy="27.6" r="2.1" fill="#d4a95a"/>' +
  '</g></svg>';
const SWORD_CURSOR = `url("data:image/svg+xml,${encodeURIComponent(SWORD_CURSOR_SVG)}") 7 7, crosshair`;

// Pinching-fingers cursor for pickpocket targeting — a thumb + forefinger about
// to nip something, tip at the top (hotspot 16,4). Cream fill + dark outline so
// it reads on any map.
const PINCH_CURSOR_SVG =
  '<svg xmlns="http://www.w3.org/2000/svg" width="32" height="32" viewBox="0 0 32 32">' +
  '<g stroke="#241a10" stroke-width="1.4" stroke-linejoin="round" stroke-linecap="round" fill="#f5ecd8">' +
  '<path d="M13 6 Q16 3 19 6 L18 15 Q16 17 14 15 Z"/>' +
  '<path d="M11 13 Q9 16 11 20 L13 26 Q16 28 19 26 L21 20 Q23 16 21 13 Q19 16 16 16 Q13 16 11 13 Z"/>' +
  '</g></svg>';
const PINCH_CURSOR = `url("data:image/svg+xml,${encodeURIComponent(PINCH_CURSOR_SVG)}") 16 4, pointer`;

// Animated sprite sword cursor during attack targeting (public/sprites/sword_sprite.png,
// geometry measured in AttackCursor). Falls back to the static SVG sword above
// only if this is turned off.
const ANIMATED_CURSOR = true;

// Cell size is fixed in SVG user units; the grid dimensions come from the
// active scene so different maps can have different sizes.
const CELL = 40;
// One grid cell = 5 ft, so a spell area's feet convert to SVG units directly.
const FT_PER_CELL = 5;
// Aimed-cone geometry, shared by the aim preview and the hit test so what you
// see is exactly what's caught. Cone of Cold is a 60-ft cone → 12 cells. A D&D
// cone is as wide as it is long, i.e. a half-angle of atan(0.5) (the base spans
// ±length/2 at full reach).
const CONE_LEN = 12 * CELL;

// Board tint for a Spell area token, chosen from its damage type so a Fireball
// reads orange and a Cone of Cold blue at a glance. Falls back to arcane violet.
const AREA_TINT: Record<string, string> = {
  fire: "#e8663c", cold: "#5cc6e8", lightning: "#e8d24a", thunder: "#b58cff",
  acid: "#8fd14a", poison: "#7bd14a", necrotic: "#7a4a8f", radiant: "#f2e08a",
  psychic: "#e86ab0", force: "#9a8cff", bludgeoning: "#b0a08a", piercing: "#b0a08a",
  slashing: "#b0a08a",
};
const areaTintFor = (damageType?: string): string =>
  (damageType && AREA_TINT[damageType.toLowerCase()]) || "#9a7bd1";

/**
 * The SVG geometry for a spell area centered at (cx, cy), given its shape and
 * size in feet. Returns an element description the render loop turns into a
 * <circle>/<rect>/<polygon>. Directional shapes (cone/line) point right by
 * default — the DM nudges the token to aim; exact facing is out of scope here.
 */
const spellAreaGeom = (
  cx: number,
  cy: number,
  shape: string | undefined,
  sizeFt: number
): { tag: "circle"; r: number } | { tag: "rect"; x: number; y: number; w: number; h: number } | { tag: "polygon"; points: string } => {
  const u = (sizeFt / FT_PER_CELL) * CELL; // area extent in SVG units
  switch (shape) {
    case "cube":
      return { tag: "rect", x: cx - u / 2, y: cy - u / 2, w: u, h: u };
    case "line":
      // A 5-ft-wide beam of the given length, running right from the origin.
      return { tag: "rect", x: cx, y: cy - CELL / 2, w: u, h: CELL };
    case "cone":
      // Triangle: apex at the origin, spreading to a base of ~size at range.
      return { tag: "polygon", points: `${cx},${cy} ${cx + u},${cy - u / 2} ${cx + u},${cy + u / 2}` };
    // sphere / cylinder / emanation → a radius circle.
    default:
      return { tag: "circle", r: u };
  }
};

/** Is point p inside the triangle a-b-c? Sign-of-cross-products test (used to
 *  tell whether a creature stands in a cone footprint). */
const pointInTriangle = (
  p: [number, number],
  a: [number, number],
  b: [number, number],
  c: [number, number]
): boolean => {
  const sign = (u: [number, number], v: [number, number], w: [number, number]) =>
    (u[0] - w[0]) * (v[1] - w[1]) - (v[0] - w[0]) * (u[1] - w[1]);
  const d1 = sign(p, a, b);
  const d2 = sign(p, b, c);
  const d3 = sign(p, c, a);
  const hasNeg = d1 < 0 || d2 < 0 || d3 < 0;
  const hasPos = d1 > 0 || d2 > 0 || d3 > 0;
  return !(hasNeg && hasPos);
};
const DEFAULT_COLS = 30;
const DEFAULT_ROWS = 20;
const MIN_ZOOM = 0.3;
const MAX_ZOOM = 4;
// Pointer travel (screen px) before a press on a token becomes a DRAG rather
// than a click. Below it, the press just selects (shows the HUD) and the token
// never moves — so a click can't accidentally pick the token up.
const DRAG_THRESHOLD_PX = 5;

const COLOR_CHOICES = [
  "#c9a24a", // gold
  "#60a5fa", // blue
  "#4ade80", // green
  "#c0392b", // red
  "#a855f7", // violet
  "#f97316", // orange
];

const initialsOf = (label: string): string => {
  const parts = label.trim().split(/\s+/).slice(0, 2);
  if (!parts.length) return "?";
  return parts.map((p) => p[0]?.toUpperCase() ?? "").join("");
};

/**
 * Shared canvas for one game.
 *
 * Coordinate systems:
 * - SVG user units (px in the viewBox) — CELL is 40 units
 * - Grid cells (x, y integers) — what tokens store
 * - Screen (clientX/Y) — pointer input
 *
 * The <svg> viewBox is transformed for pan+zoom (`pan.x/y` + `zoom`). Because
 * getScreenCTM() reflects that transform, clientToSvg() keeps returning
 * correct SVG user coords under any pan/zoom — so token drag math is unchanged.
 *
 * Interaction routing:
 * - Middle-mouse drag OR space+left-drag anywhere → pan the view
 *     (handled on the svg in the CAPTURE phase, stops the event before it
 *     reaches token handlers)
 * - Left-drag on a token → move the token (unchanged from before)
 * - Wheel → zoom, keeping the cursor pinned to the same SVG point
 */
export const TableCanvas = ({ game, onBack, characters, ownedCharacterIds, onUpdateCharacter }: Props) => {
  const isDM = game.my_role === "dm";
  const toast = useToast();
  const { confirm, prompt } = useConfirm();
  const {
    scenes,
    activeScene,
    createScene,
    setActiveScene,
    navigateToScene,
    returnToStage,
    gatherParty,
    isRoaming,
    stageSceneId,
    renameScene,
    deleteScene,
    setSceneImageUrl,
    setSceneCinematicUrl,
    setSceneMode,
    updateSceneLayout,
  } = useScenes(game.id, game.active_scene_id);
  const cols = activeScene?.grid_cols ?? DEFAULT_COLS;
  const rows = activeScene?.grid_rows ?? DEFAULT_ROWS;
  const width = cols * CELL;
  const height = rows * CELL;
  // Map-to-grid alignment (#115): the background image is offset + uniformly
  // scaled so its baked grid lines up with the canonical overlay. Defaults draw
  // it 1:1 over the board (the old behavior).
  const sceneOffsetX = activeScene?.map_offset_x ?? 0;
  const sceneOffsetY = activeScene?.map_offset_y ?? 0;
  const sceneScale = activeScene?.map_scale ?? 1;
  const [aligning, setAligning] = useState(false);
  // Live transform during a drag/zoom of the map — applied to the render
  // immediately and committed to the scene on release (drag) or after a short
  // idle (wheel), so aligning stays smooth without a DB write per pointer move.
  const [mapLive, setMapLive] = useState<{ x: number; y: number; scale: number } | null>(null);
  const mapDragRef = useRef<{ sx: number; sy: number; ox: number; oy: number } | null>(null);
  const mapZoomCommitRef = useRef<number | undefined>(undefined);
  // 2-click calibrate: the DM clicks two opposite corners of ONE printed grid
  // square; we scale + offset so that square becomes one overlay cell.
  const [calibrating, setCalibrating] = useState(false);
  const [calibPt, setCalibPt] = useState<{ x: number; y: number } | null>(null);
  const mapOffsetX = mapLive?.x ?? sceneOffsetX;
  const mapOffsetY = mapLive?.y ?? sceneOffsetY;
  const mapScale = mapLive?.scale ?? sceneScale;
  const { tokens, addToken, moveToken, deleteToken, setTokenHidden, updateToken, loading, error } = useTokens(
    game.id,
    activeScene?.id ?? null
  );
  const svgRef = useRef<SVGSVGElement | null>(null);

  const [addOpen, setAddOpen] = useState(false);
  const [newLabel, setNewLabel] = useState("");
  const [newColor, setNewColor] = useState(COLOR_CHOICES[0]);
  const [scenesOpen, setScenesOpen] = useState(false);
  const [pickerOpen, setPickerOpen] = useState(false);
  // Which face the map picker is filling — the tactical battlemap or the
  // cinematic backdrop (#Phase 1). Reuses the one MapPickerDialog for both.
  const [pickerTarget, setPickerTarget] = useState<"tactical" | "cinematic">("tactical");
  // Which scene the face picker applies to — set by the gallery card's ⋯ menu
  // (#IA rework: face actions are per-scene, not global dropdown items).
  const [pickerSceneId, setPickerSceneId] = useState<string | null>(null);
  // Which gallery card's contextual ⋯ menu is open.
  const [cardMenuId, setCardMenuId] = useState<string | null>(null);
  // Close the scene dropdown (and any card menu) on a click outside it.
  const sceneMenuRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!scenesOpen) return;
    const onDown = (e: PointerEvent) => {
      if (sceneMenuRef.current && !sceneMenuRef.current.contains(e.target as Node)) {
        setScenesOpen(false);
        setCardMenuId(null);
      }
    };
    window.addEventListener("pointerdown", onDown);
    return () => window.removeEventListener("pointerdown", onDown);
  }, [scenesOpen]);
  const [tokenPickerOpen, setTokenPickerOpen] = useState(false);
  const [partyOpen, setPartyOpen] = useState(false);
  // The social Party panel (members + presence + invite) — decoupled from the
  // personal characters tray above (IA). They share screen space, so opening
  // one closes the other.
  const [partyPanelOpen, setPartyPanelOpen] = useState(false);
  // The combat rail is OFF by default (#user ask) — no pill cluttering the
  // table out of combat. It auto-appears when a fight starts and auto-hides when
  // it ends (the effect below); the tool-rail hourglass overrides either way.
  const [railHidden, setRailHidden] = useState(true);
  // Dice roller (input popover) + Game Log (record drawer) live on the tool
  // rail now (#132), not as floating FABs. The log button badges unseen rolls.
  const [rollerOpen, setRollerOpen] = useState(false);
  const [logOpen, setLogOpen] = useState(false);
  const [logSeen, setLogSeen] = useState(0);
  // unseenRolls/openLog now count the PERSISTENT feed (#0041 slice 1c) — they
  // are defined after the feed hook mounts, further down.
  const [hudModal, setHudModal] = useState<HudModal | null>(null);
  // Fullscreen: the whole table shell (header + rail + board), not just the
  // svg, so the HUD stays usable. State tracks the browser's own notion of
  // fullscreen so Esc (which exits without firing our handler) stays in sync.
  const shellRef = useRef<HTMLDivElement | null>(null);
  const [isFullscreen, setIsFullscreen] = useState(false);
  useEffect(() => {
    const onChange = () => setIsFullscreen(Boolean(document.fullscreenElement));
    document.addEventListener("fullscreenchange", onChange);
    return () => document.removeEventListener("fullscreenchange", onChange);
  }, []);
  const toggleFullscreen = () => {
    if (document.fullscreenElement) void document.exitFullscreen();
    else void shellRef.current?.requestFullscreen();
  };
  // Currently-selected token (click to select). Delete/Backspace removes it.
  // `selectedId` is the PRIMARY selection (drives the HUD/menus); `selectedIds`
  // is the full multi-selection (marquee drag, shift-click) used for the
  // selection rings and group move/delete. The primary is always a member.
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const selectedIdRef = useRef<string | null>(null);
  useEffect(() => {
    selectedIdRef.current = selectedId;
  }, [selectedId]);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const selectedIdsRef = useRef<Set<string>>(selectedIds);
  useEffect(() => { selectedIdsRef.current = selectedIds; }, [selectedIds]);
  // Select exactly one token (or none), collapsing any multi-selection.
  const selectOnly = useCallback((id: string | null) => {
    setSelectedId(id);
    setSelectedIds(id ? new Set([id]) : new Set());
  }, []);
  // Shift/⌘-click: add or remove a token from the multi-selection.
  const toggleSelect = useCallback((id: string) => {
    const next = new Set(selectedIdsRef.current);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    setSelectedIds(next);
    setSelectedId(next.has(id) ? id : (next.values().next().value ?? null));
  }, []);
  // Replace the whole selection at once (marquee result).
  const setSelection = useCallback((ids: string[]) => {
    setSelectedIds(new Set(ids));
    setSelectedId(ids[0] ?? null);
  }, []);
  // Marquee (rubber-band) drag-select — a rectangle in SVG-user coords. The ref
  // drives the live math; the state drives the on-board rectangle.
  const [marquee, setMarquee] = useState<{ x0: number; y0: number; x1: number; y1: number } | null>(null);
  const marqueeRef = useRef<{ x0: number; y0: number; x1: number; y1: number; moved: boolean } | null>(null);
  // Latest tokens, read by the keyboard handler without re-subscribing.
  const tokensRef = useRef(tokens);
  useEffect(() => {
    tokensRef.current = tokens;
  }, [tokens]);
  // Latest recheckHidden, for callers defined earlier than it (the move-commit
  // handler and the out-of-combat interval — slice H P4).
  const recheckHiddenRef = useRef<(t: Token) => void>(() => {});
  // Active canvas tool. "select" moves tokens, "pan" drags the view,
  // "ping" pulses a point for every player, "ruler" measures distance.
  // (Space-held still pans regardless of tool, as a quick modifier.)
  const [tool, setTool] = useState<"select" | "pan" | "ping" | "ruler" | "fog" | "draw" | "hotspot">("select");
  const toolRef = useRef(tool);
  useEffect(() => {
    toolRef.current = tool;
  }, [tool]);

  // Surface token-load errors as a toast (the old inline panel is gone).
  useEffect(() => {
    if (error) toast.error(error);
  }, [error, toast]);

  // Attach a library map to a scene: copy image_url + map_id.
  // Scene.image_url is what players actually load; map_id is provenance so
  // we can highlight "currently on scene" in the picker.
  const applyMapToScene = async (sceneId: string, map: MapAsset): Promise<{ error: string | null }> => {
    const { error: imgErr } = await setSceneImageUrl(sceneId, map.image_url);
    if (imgErr) return { error: imgErr };
    const { error: linkErr } = await supabase
      .from("scenes")
      .update({ map_id: map.id })
      .eq("id", sceneId);
    return { error: linkErr?.message ?? null };
  };

  // The first cell at/around a preferred spot whose footprint doesn't overlap an
  // existing creature or prop — so placing token after token fans them out
  // instead of stacking them all on grid-center. Spell area markers don't block.
  // Spirals outward by Chebyshev rings; falls back to the preferred cell if the
  // board is packed.
  const findFreeCell = (px: number, py: number, span: number): { x: number; y: number } => {
    const clamp = (x: number, y: number) => ({
      x: Math.min(Math.max(0, x), Math.max(0, cols - span)),
      y: Math.min(Math.max(0, y), Math.max(0, rows - span)),
    });
    const free = (x: number, y: number) =>
      !tokens.some((o) => {
        if (o.kind === "spell") return false;
        const os = findSize(o.size).cells;
        return x < o.x + os && x + span > o.x && y < o.y + os && y + span > o.y;
      });
    const maxR = Math.max(cols, rows);
    for (let r = 0; r <= maxR; r++) {
      for (let dy = -r; dy <= r; dy++) {
        for (let dx = -r; dx <= r; dx++) {
          if (Math.max(Math.abs(dx), Math.abs(dy)) !== r) continue; // ring perimeter only
          const { x, y } = clamp(px + dx, py + dy);
          if (free(x, y)) return { x, y };
        }
      }
    }
    return clamp(px, py);
  };

  // Place a library token asset. A dropped `cell` (drag-drop onto the board) is
  // honored as-is; otherwise it fans out to a free cell near grid-center. Copies
  // image, name, and 5e size onto the tokens row so scenes stay self-contained.
  const placeTokenFromLibrary = async (
    asset: TokenAsset,
    cell?: { x: number; y: number }
  ): Promise<{ error: string | null }> => {
    if (!activeScene) return { error: "no active scene" };
    const span = findSize(asset.size_category).cells;
    // A monster asset carries its statblock onto the token, with its own HP, so
    // the DM's in-combat HUD can read + track it per placed instance. An NPC that
    // fights carries the SAME thing under details.npc.statblock — copy it too so
    // stat-carrying NPCs render the combat HUD instead of a bare identity card.
    const monster =
      asset.token_type === "monster" && asset.details?.kind === "monster"
        ? asset.details.monster
        : asset.token_type === "npc" && asset.details?.kind === "npc"
          ? asset.details.npc.statblock ?? null
          : null;
    // Props and Spells freeze their board-behavior data at placement (like the
    // statblock above), so the canvas needs no join back to the library:
    //   • a spell copies its area footprint → translucent AoE render (#80)
    //   • a container prop stamps tier-scaled loot → immediately lootable
    const isProp = asset.token_type === "prop" && asset.details?.kind === "prop";
    const isSpell = asset.token_type === "spell" && asset.details?.kind === "spell";
    const kind = isProp ? "prop" : isSpell ? "spell" : null;
    // Only spells with an actual area footprint carry `area`. A no-area spell
    // (Magic Missile, a self-buff) places as a plain art marker.
    const area =
      isSpell && asset.details?.kind === "spell" && asset.details.spell.areaShape
        ? {
            shape: asset.details.spell.areaShape,
            size: asset.details.spell.areaSize,
            damageType: asset.details.spell.damageType,
            level: asset.details.spell.level,
          }
        : null;
    const container = isProp && asset.details?.kind === "prop" && asset.details.prop.container;
    const avgLevel =
      characters.length > 0
        ? characters.reduce((sum, c) => sum + (c.level ?? 1), 0) / characters.length
        : 1;
    const loot = container ? incidentalContainerLoot(tierForLevel(avgLevel)) : null;
    // Bake the default side from the library type: a monster drops in hostile, an
    // NPC friendly (the DM flips either from the combat tray). Only creatures get
    // a disposition — props/spells/items aren't combatants. This is the ONE place
    // that knows npc-vs-monster; the placed token can't tell them apart later.
    const disposition: "hostile" | "friendly" | null =
      asset.token_type === "monster" ? "hostile" : asset.token_type === "npc" ? "friendly" : null;
    return addToken({
      label: asset.name,
      image_url: asset.image_url,
      size: asset.size_category,
      token_id: asset.id,
      statblock: monster,
      hp_current: monster?.hp ?? null,
      hp_max: monster?.hp ?? null,
      kind,
      area,
      loot,
      disposition,
      ...(cell ?? findFreeCell(Math.floor(cols / 2) - Math.floor(span / 2), Math.floor(rows / 2) - Math.floor(span / 2), span)),
    });
  };

  // Per-viewer visibility (slice H). Two independent "hidden" concepts with
  // OPPOSITE audiences:
  //   • t.hidden — the DM's manual hide: DM sees it (dim), players don't.
  //   • a "Hidden::<stealth>" buff — the Hide action: the OWNER sees it (dim),
  //     the DM sees a faint GHOST (to keep running the scene), everyone else
  //     sees nothing.
  // viewLevel drives BOTH the visible-token filter and the render opacity.
  const controlsToken = useCallback(
    (t: Token): boolean => (t.character_id ? ownedCharacterIds.has(t.character_id) : isDM),
    [ownedCharacterIds, isDM]
  );
  const viewLevel = useCallback(
    (t: Token): "none" | "ghost" | "dim" | "full" => {
      if (t.hidden) return isDM ? "dim" : "none";
      if (isStealthHidden(t.buffs)) return controlsToken(t) ? "dim" : isDM ? "ghost" : "none";
      return "full";
    },
    [isDM, controlsToken]
  );

  // THE visibility boundary: players only ever work with visible tokens —
  // the board, the initiative order, and the header count all read from this.
  const visibleTokens = useMemo(
    () => tokens.filter((t) => viewLevel(t) !== "none"),
    [tokens, viewLevel]
  );

  // Combat pool: hidden tokens are excluded for EVERY role, DM included.
  // turn_index is an index into a per-client derived order — if the DM's
  // order contained a hidden boss that players' order lacked, the same index
  // would land on different combatants on different screens.
  const combatTokens = useMemo(() => tokens.filter((t) => !t.hidden), [tokens]);

  // Mirror a player character's live vitals (HP + level) onto their token so the
  // whole table sees them. Runs only on the OWNER's client (they can write, and
  // they hold the character's real HP/level); every other client reads the
  // synced values over realtime. Converges — once the token matches, no write.
  useEffect(() => {
    tokens.forEach((t) => {
      if (!t.character_id || !ownedCharacterIds.has(t.character_id)) return;
      const c = characters.find((x) => x.id === t.character_id);
      if (!c) return;
      if (t.hp_current !== c.hp.current || t.hp_max !== c.hp.max || t.char_level !== c.level) {
        void updateToken(t.id, { hp_current: c.hp.current, hp_max: c.hp.max, char_level: c.level });
      }
    });
  }, [tokens, characters, ownedCharacterIds, updateToken]);

  const init = useInitiative(activeScene ?? null, combatTokens);
  // Combatants who still owe an initiative roll once the fight has begun — the
  // players whose tokens the ritual left blank (monsters auto-roll). Drives the
  // per-player roll prompt, the rail's "rolling…" chip, and the DM straggler
  // control. Props/spell areas never roll.
  const pendingRollers = useMemo(
    () =>
      init.inCombat
        ? combatTokens.filter((t) => t.initiative == null && t.kind !== "prop" && t.kind !== "spell" && !isTokenDowned(t))
        : [],
    [init.inCombat, combatTokens]
  );

  // The combat-start "ritual": a brief banner shown the moment the scene enters
  // combat. Driven by the synced in_combat flag, so it lands on every client.
  const [combatBanner, setCombatBanner] = useState(false);
  const wasInCombat = useRef(false);
  useEffect(() => {
    if (init.inCombat && !wasInCombat.current) {
      wasInCombat.current = true;
      setCombatBanner(true);
      const t = window.setTimeout(() => setCombatBanner(false), 2600);
      return () => window.clearTimeout(t);
    }
    if (!init.inCombat) wasInCombat.current = false;
  }, [init.inCombat]);

  // Combat tracker follows the fight: show it when combat begins, hide it when
  // it ends (#user ask — off by default). The hourglass still overrides in
  // between; the next combat transition re-syncs.
  useEffect(() => {
    setRailHidden(!init.inCombat);
  }, [init.inCombat]);

  // Oculus nudges (#7 slice 5): raise a signal on the table moments worth a
  // gentle suggestion — a scene staged, or combat starting. The companion
  // decides whether to act (only if the DM turned nudges on). We skip the
  // first observed value so we never nudge about the scene already up on load.
  const [nudgeSignal, setNudgeSignal] = useState<{ key: string; prompt: string } | null>(null);
  const nudgeSceneRef = useRef<string | null>(null);
  useEffect(() => {
    if (!isDM) return;
    const sid = activeScene?.id ?? null;
    if (!sid) return;
    if (nudgeSceneRef.current === null) { nudgeSceneRef.current = sid; return; } // skip mount
    if (sid !== nudgeSceneRef.current) {
      nudgeSceneRef.current = sid;
      const name = activeScene?.name ?? "this scene";
      setNudgeSignal({
        key: `stage:${sid}`,
        prompt: `[The party just arrived at the scene "${name}". In ONE short sentence, is there something worth doing right now — a read-aloud or handout to share, an encounter to set up? Propose the action if apt. If nothing is worth doing, reply with exactly: NONE]`,
      });
    }
  }, [activeScene?.id, activeScene?.name, isDM]);
  const nudgeCombatRef = useRef(false);
  useEffect(() => {
    if (!isDM) return;
    if (init.inCombat && !nudgeCombatRef.current) {
      nudgeCombatRef.current = true;
      const name = activeScene?.name ?? "this scene";
      setNudgeSignal({
        key: `combat:${activeScene?.id ?? "?"}`,
        prompt: `[Combat just began in "${name}". If the scene's notes call for enemies on the board, propose placing them. ONE short sentence. If nothing, reply with exactly: NONE]`,
      });
    }
    if (!init.inCombat) nudgeCombatRef.current = false;
  }, [init.inCombat, isDM, activeScene?.id, activeScene?.name]);
  const { pings, sendPing } = usePings(activeScene?.id ?? null);
  const spellFx = useSpellFx(activeScene?.id ?? null);
  const partyOwners = usePartyOwners(game.id, game.dm_user_id);
  const fog = useFog(activeScene ?? null, cols);
  const { drawings, addDrawing, eraseDrawing, clearDrawings } = useDrawings(
    game.id,
    activeScene?.id ?? null
  );
  // Presence (#Phase 3b): who's at the table, online, and where.
  const { user: authUser } = useAuth();
  const { party, moveMember } = usePartyPresence(game.id);
  // Hotspots (#Phase 2): navigable pins on this scene's backdrop.
  const { hotspots, createHotspot, updateHotspot, deleteHotspot } = useHotspots(activeScene?.id ?? null);
  // Navigation lock (#Phase 3d): a player whose scene is IN COMBAT can't wander
  // off — combat pins the party in place. The DM is never locked.
  const navLocked = !isDM && Boolean(activeScene?.in_combat);
  // Publish gate (#0041): scenes in DRAFT chapters don't exist for players —
  // pins to them are hidden below, and travel is refused here as the backstop.
  const draftSceneIds = useDraftSceneIds(game.id);
  const guardTravel = (sceneId: string) => {
    if (navLocked) {
      toast.error("You're in combat — you can't wander off");
      return;
    }
    if (!isDM && draftSceneIds.has(sceneId)) {
      toast.info("That place isn't open to travelers yet");
      return;
    }
    // A pin that leads to where you're standing shouldn't fail silently —
    // that reads as "the pin is broken" (it was reported exactly that way).
    if (sceneId === activeScene?.id) {
      toast.info("You're already here");
      return;
    }
    void navigateToScene(sceneId);
  };
  const hotspotsRef = useRef(hotspots);
  hotspotsRef.current = hotspots;
  // The pin whose editor popover is open (DM authoring).
  const [editHotspotId, setEditHotspotId] = useState<string | null>(null);
  // Local draft for the label field — committed on blur/Done, NOT per keystroke.
  // Per-keystroke writes race each other (unordered concurrent PATCHes) and the
  // realtime echoes clobber the field, so a fast "Ancient Ruins" persisted as "A".
  const [hotspotLabelDraft, setHotspotLabelDraft] = useState("");
  useEffect(() => {
    if (!editHotspotId) return;
    // Seed once when the editor opens; don't re-seed on realtime updates (that
    // would overwrite what the DM is typing).
    setHotspotLabelDraft(hotspotsRef.current.find((x) => x.id === editHotspotId)?.label ?? "");
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [editHotspotId]);
  // Draw tool: which shape, what colour. "erase" removes on click.
  const [drawKind, setDrawKind] = useState<DrawKind | "erase">("pen");
  const [drawColor, setDrawColor] = useState(DRAW_COLORS[0]);
  const drawKindRef = useRef(drawKind);
  const drawColorRef = useRef(drawColor);
  useEffect(() => { drawKindRef.current = drawKind; }, [drawKind]);
  useEffect(() => { drawColorRef.current = drawColor; }, [drawColor]);
  // In-progress stroke, held in state so it renders live, in a ref so the
  // window move/up handlers read it without re-subscribing every frame.
  const [liveDraw, setLiveDraw] = useState<{ kind: DrawKind; color: string; points: number[] } | null>(null);
  const liveDrawRef = useRef<{ kind: DrawKind; color: string; points: number[] } | null>(null);
  const setLive = (d: typeof liveDrawRef.current) => {
    liveDrawRef.current = d;
    setLiveDraw(d);
  };

  useEffect(() => {
    const onMove = (e: PointerEvent) => {
      const live = liveDrawRef.current;
      if (!live) return;
      const local = clientToSvg(e.clientX, e.clientY);
      if (!local) return;
      if (live.kind === "pen") {
        setLive({ ...live, points: [...live.points, local.x, local.y] });
      } else {
        // Shapes/arrow: first point fixed, second tracks the cursor.
        setLive({ ...live, points: [live.points[0], live.points[1], local.x, local.y] });
      }
    };
    const onUp = () => {
      const live = liveDrawRef.current;
      setLive(null);
      if (!live) return;
      // Discard degenerate marks (a click that never moved).
      const p = live.points;
      const moved =
        live.kind === "pen"
          ? p.length >= 4
          : Math.hypot(p[2] - p[0], p[3] - p[1]) > 3;
      if (moved) void addDrawing({ kind: live.kind, color: live.color, points: p });
    };
    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup", onUp);
    window.addEventListener("pointercancel", onUp);
    return () => {
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", onUp);
      window.removeEventListener("pointercancel", onUp);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [addDrawing]);

  // Leaving the draw tool drops any half-finished stroke.
  useEffect(() => {
    if (tool !== "draw") setLive(null);
  }, [tool]);
  // Fog brush: "reveal" carves sight out of the fog, "hide" paints it back.
  const [fogMode, setFogMode] = useState<"reveal" | "hide">("reveal");
  const fogPaintingRef = useRef(false);

  // 3×3 cell brush centred on an SVG point, clamped to the grid.
  const brushCells = (sx: number, sy: number): number[] => {
    const cx = Math.floor(sx / CELL);
    const cy = Math.floor(sy / CELL);
    const cells: number[] = [];
    for (let dy = -1; dy <= 1; dy++) {
      for (let dx = -1; dx <= 1; dx++) {
        const x = cx + dx;
        const y = cy + dy;
        if (x >= 0 && x < cols && y >= 0 && y < rows) cells.push(y * cols + x);
      }
    }
    return cells;
  };

  // Fog paint drag — window-level like every other drag on this canvas.
  useEffect(() => {
    const onMove = (e: PointerEvent) => {
      if (!fogPaintingRef.current) return;
      const local = clientToSvg(e.clientX, e.clientY);
      if (local) fog.paint(brushCells(local.x, local.y), fogMode === "reveal");
    };
    const onUp = () => {
      fogPaintingRef.current = false;
    };
    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup", onUp);
    window.addEventListener("pointercancel", onUp);
    return () => {
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", onUp);
      window.removeEventListener("pointercancel", onUp);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [fog.paint, fogMode, cols, rows]);

  // Ruler: measure from a drag's start to its current point, snapped to cell
  // centres. The last measurement stays visible while the tool is active so
  // you can read it after releasing. Distance uses the PHB simple method —
  // every square 5 ft, diagonals included (Chebyshev distance).
  const rulerDragRef = useRef<{ x: number; y: number } | null>(null);
  const [measure, setMeasure] = useState<{ x1: number; y1: number; x2: number; y2: number } | null>(null);
  const snapToCellCenter = (v: number) => (Math.floor(v / CELL) + 0.5) * CELL;
  const measureFeet = (m: { x1: number; y1: number; x2: number; y2: number }) => {
    const cellsX = Math.abs(Math.round((m.x2 - m.x1) / CELL));
    const cellsY = Math.abs(Math.round((m.y2 - m.y1) / CELL));
    return Math.max(cellsX, cellsY) * 5;
  };

  // Ruler drag: window-level like the other drags, so it survives leaving the svg.
  useEffect(() => {
    const onMove = (e: PointerEvent) => {
      const start = rulerDragRef.current;
      if (!start) return;
      const local = clientToSvg(e.clientX, e.clientY);
      if (!local) return;
      setMeasure({
        x1: start.x,
        y1: start.y,
        x2: snapToCellCenter(local.x),
        y2: snapToCellCenter(local.y),
      });
    };
    const onUp = () => {
      rulerDragRef.current = null;
    };
    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup", onUp);
    window.addEventListener("pointercancel", onUp);
    return () => {
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", onUp);
      window.removeEventListener("pointercancel", onUp);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Clear any leftover measurement when leaving the ruler tool.
  useEffect(() => {
    if (tool !== "ruler") {
      setMeasure(null);
      rulerDragRef.current = null;
    }
  }, [tool]);

  // Tool actions on the board itself: ping pulses a point, ruler starts a
  // measurement. Runs on the svg's bubble phase so token/background handlers
  // (which return early for these tools) don't swallow it.
  const handleToolPointerDown = (e: React.PointerEvent) => {
    if (e.button !== 0 && e.pointerType !== "touch") return;
    if (toolRef.current === "ping") {
      const local = clientToSvg(e.clientX, e.clientY);
      if (local) {
        void sendPing(local.x, local.y).then((err) => {
          if (err) toast.error(err);
        });
      }
    } else if (toolRef.current === "fog") {
      if (!isDM) return;
      const local = clientToSvg(e.clientX, e.clientY);
      if (local) {
        fogPaintingRef.current = true;
        fog.paint(brushCells(local.x, local.y), fogMode === "reveal");
      }
    } else if (toolRef.current === "draw") {
      const local = clientToSvg(e.clientX, e.clientY);
      if (!local) return;
      if (drawKindRef.current === "erase") {
        // Erase the topmost drawing under the click.
        const hit = [...drawings].reverse().find((d) => hitsDrawing(d, local.x, local.y, 8));
        if (hit) void eraseDrawing(hit.id);
        return;
      }
      setLive({ kind: drawKindRef.current, color: drawColorRef.current, points: [local.x, local.y, local.x, local.y] });
    } else if (toolRef.current === "ruler") {
      const local = clientToSvg(e.clientX, e.clientY);
      if (!local) return;
      const start = { x: snapToCellCenter(local.x), y: snapToCellCenter(local.y) };
      rulerDragRef.current = start;
      setMeasure({ x1: start.x, y1: start.y, x2: start.x, y2: start.y });
    } else if (toolRef.current === "hotspot") {
      if (!isDM) return;
      const local = clientToSvg(e.clientX, e.clientY);
      if (!local || width === 0 || height === 0) return;
      // Store normalized to the backdrop so the pin survives any board size/zoom.
      const nx = Math.max(0, Math.min(1, local.x / width));
      const ny = Math.max(0, Math.min(1, local.y / height));
      void createHotspot(nx, ny).then(({ hotspot, error }) => {
        if (error) toast.error(error);
        else if (hotspot) setEditHotspotId(hotspot.id); // open its editor to link a target
      });
    }
  };

  // A token linked to one of my characters rolls with that character's
  // initiative modifier; anything else (monsters, NPCs) rolls flat d20.
  const rollInitiativeFor = (t: Token): number => {
    const ch = t.character_id ? characters.find((c) => c.id === t.character_id) : undefined;
    return rollD20(ch ? initiativeMod(ch) : 0).total;
  };

  // Place a roster character as a token, using their portrait as the art.
  // `cell` is the target grid square; omitted means centre of the scene.
  const placeCharacter = async (
    ch: Character,
    cell?: { x: number; y: number }
  ): Promise<void> => {
    if (!activeScene) return;
    // A dropped cell is honored as-is; a plain "place" fans out to a free cell
    // near centre so PCs don't stack.
    const { x, y } = cell ?? findFreeCell(Math.floor(cols / 2), Math.floor(rows / 2), 1);
    const { error } = await addToken({
      label: ch.name,
      image_url: ch.portrait ?? null,
      character_id: ch.id,
      controller: "player",
      size: "medium",
      // Mirror the character's vitals onto the shared token so the DM and other
      // players can see HP/level at a glance (kept synced by the effect below).
      hp_current: ch.hp.current,
      hp_max: ch.hp.max,
      char_level: ch.level,
      x: Math.max(0, Math.min(cols - 1, x)),
      y: Math.max(0, Math.min(rows - 1, y)),
    });
    if (error) {
      toast.error(
        error.includes("tokens_character_id_fkey")
          ? `${ch.name} isn't saved to the cloud (or was saved under another account) — open their sheet to re-save, or recreate them, then try again.`
          : error
      );
    } else {
      toast.success(`${ch.name} joined the map`);
    }
  };

  // Drop a dragged character onto the exact cell under the cursor.
  const handleDrop = (e: React.DragEvent) => {
    const local = clientToSvg(e.clientX, e.clientY);
    const cellAt = local ? { x: Math.floor(local.x / CELL), y: Math.floor(local.y / CELL) } : undefined;

    // A library token dragged from the picker (DM only) — the whole asset rides
    // in the payload, so place it right where it's dropped.
    const tokenJson = e.dataTransfer.getData(TOKEN_DRAG_MIME);
    if (tokenJson && isDM) {
      e.preventDefault();
      try {
        const asset = JSON.parse(tokenJson) as TokenAsset;
        void placeTokenFromLibrary(asset, cellAt).then((res) => {
          if (res.error) toast.error(res.error);
        });
      } catch {
        /* malformed payload — ignore */
      }
      return;
    }

    // A roster character dragged from the party tray.
    const id = e.dataTransfer.getData(DRAG_MIME);
    if (!id) return;
    e.preventDefault();
    const ch = characters.find((c) => c.id === id);
    if (!ch) return;
    void placeCharacter(ch, cellAt);
  };

  // Token drag state kept in refs so pointermove doesn't rerender per frame.
  const tokenDragRef = useRef<{
    id: string;
    offsetX: number;
    offsetY: number;
    /** Screen coords where the press began — to measure drag distance. */
    startX: number;
    startY: number;
    /** True once the pointer crossed the threshold: a real drag, not a click. */
    active: boolean;
  } | null>(null);
  // The active creature's live movement budget, mirrored into a ref so the drop
  // handler can clamp an over-speed move. `remainingCells` = feet left this turn
  // (speed − moveUsedFt) ÷ 5; the clamp measures from the token's CURRENT cell.
  const moveBudgetRef = useRef<{ id: string; remainingCells: number } | null>(null);
  const [ghost, setGhost] = useState<{ id: string; x: number; y: number } | null>(null);

  // Pan + zoom state.
  // pan.x/pan.y = the top-left of the visible region in SVG user units.
  // zoom = 1 shows the whole scene; 2 = 2x zoom in.
  const [pan, setPan] = useState({ x: 0, y: 0 });
  const [zoom, setZoom] = useState(1);
  const [spaceHeld, setSpaceHeld] = useState(false);
  const spaceHeldRef = useRef(false);
  useEffect(() => {
    spaceHeldRef.current = spaceHeld;
  }, [spaceHeld]);
  const panDragRef = useRef<{
    startClientX: number;
    startClientY: number;
    startPanX: number;
    startPanY: number;
  } | null>(null);
  const [panning, setPanning] = useState(false);

  // ---- Multi-touch bookkeeping -------------------------------------------
  // Live touch points by pointerId. Only "touch" pointers are tracked, so
  // mouse and pen keep their existing behaviour untouched.
  const touchesRef = useRef<Map<number, { x: number; y: number }>>(new Map());
  // Previous frame's finger spread + midpoint. Pinch is computed incrementally
  // (frame-to-frame) rather than from gesture start, which keeps zoom and
  // two-finger pan in one step and stays stable if a finger is re-seated.
  const gestureRef = useRef<{ dist: number; midX: number; midY: number } | null>(null);
  // Mirrors of pan/zoom. The gesture listeners attach once, so they must read
  // current values from refs instead of a stale closure.
  const panRef = useRef(pan);
  const zoomRef = useRef(zoom);
  useEffect(() => {
    panRef.current = pan;
  }, [pan]);
  useEffect(() => {
    zoomRef.current = zoom;
  }, [zoom]);

  const viewBox = `${pan.x} ${pan.y} ${width / zoom} ${height / zoom}`;

  // Screen → SVG user coords. Uses the live CTM so it respects viewBox transforms.
  const clientToSvg = (clientX: number, clientY: number): { x: number; y: number } | null => {
    const svg = svgRef.current;
    if (!svg) return null;
    const pt = svg.createSVGPoint();
    pt.x = clientX;
    pt.y = clientY;
    const ctm = svg.getScreenCTM();
    if (!ctm) return null;
    const local = pt.matrixTransform(ctm.inverse());
    return { x: local.x, y: local.y };
  };

  // ---- Token drag ---------------------------------------------------------
  // The live ghost cell lives in a ref (updated synchronously as the pointer
  // moves) AND in state (for rendering). The DROP handler reads the REF, never
  // the state — so a fast release can't land on a stale ghost and silently drop
  // the move (the old bug: the token snapped back to its start).
  const ghostRef = useRef<{ id: string; x: number; y: number } | null>(null);
  // "Latest callback" refs: reassigned every render so the window listeners
  // (subscribed ONCE below) always run against current tokens/cols/rows without
  // re-subscribing every frame — that per-frame churn was the drag lag.
  const onDragMoveRef = useRef<(e: PointerEvent) => void>(() => {});
  const onDragUpRef = useRef<() => void>(() => {});

  // ---- Spell-area rotation ------------------------------------------------
  // Dragging a directional Spell token's handle aims its cone/line. Live angle
  // lives in state (for the render) and a ref (for the drop write); the origin
  // is captured at grab so the angle is measured from the token's centre.
  const rotateRef = useRef<{ id: string; ox: number; oy: number } | null>(null);
  const [rotating, setRotating] = useState<{ id: string; facing: number } | null>(null);
  const rotatingRef = useRef<{ id: string; facing: number } | null>(null);
  const onRotateMoveRef = useRef<(e: PointerEvent) => void>(() => {});
  const onRotateUpRef = useRef<() => void>(() => {});

  onRotateMoveRef.current = (e: PointerEvent) => {
    const rot = rotateRef.current;
    if (!rot) return;
    const local = clientToSvg(e.clientX, e.clientY);
    if (!local) return;
    const deg = (Math.atan2(local.y - rot.oy, local.x - rot.ox) * 180) / Math.PI;
    const next = { id: rot.id, facing: Math.round(deg) };
    rotatingRef.current = next;
    setRotating(next);
  };

  onRotateUpRef.current = () => {
    const rot = rotateRef.current;
    const live = rotatingRef.current;
    rotateRef.current = null;
    rotatingRef.current = null;
    setRotating(null);
    if (!rot || !live) return;
    const t = tokens.find((tt) => tt.id === rot.id);
    if (!t) return;
    void updateToken(rot.id, { area: { ...(t.area ?? {}), facing: live.facing } });
  };

  const startRotate = (e: React.PointerEvent, t: Token) => {
    e.stopPropagation();
    e.preventDefault();
    const span = findSize(t.size).cells;
    rotateRef.current = {
      id: t.id,
      ox: t.x * CELL + (span * CELL) / 2,
      oy: t.y * CELL + (span * CELL) / 2,
    };
  };

  onDragMoveRef.current = (e: PointerEvent) => {
    const drag = tokenDragRef.current;
    if (!drag) return;
    // A press only becomes a drag once the pointer crosses the threshold — so a
    // click (even one that drifts a pixel toward the HUD) never lifts the token.
    if (!drag.active) {
      if (Math.hypot(e.clientX - drag.startX, e.clientY - drag.startY) < DRAG_THRESHOLD_PX) return;
      // Combat guard on REAL drag intent (a plain select-click never reaches
      // here): a combatant can't move off its turn, and the DM can't move a
      // player's token. Say why and abort the lift.
      const dt = tokens.find((tt) => tt.id === drag.id);
      const block = dt ? combatMoveBlock(dt) : null;
      if (block) {
        toast.info(block);
        tokenDragRef.current = null;
        return;
      }
      drag.active = true;
    }
    const local = clientToSvg(e.clientX, e.clientY);
    if (!local) return;
    // Top-left cell of the footprint (fractional while dragging).
    const g = { id: drag.id, x: (local.x - drag.offsetX) / CELL, y: (local.y - drag.offsetY) / CELL };
    ghostRef.current = g;
    setGhost(g);
  };

  onDragUpRef.current = () => {
    const drag = tokenDragRef.current;
    const g = ghostRef.current;
    tokenDragRef.current = null;
    ghostRef.current = null;
    setGhost(null);
    // Never crossed the threshold → a click to select, not a drag; leave it put.
    if (!drag || !drag.active || !g) return;
    const t = tokens.find((tt) => tt.id === drag.id);
    const span = t ? findSize(t.size).cells : 1;
    let snappedX = Math.max(0, Math.min(cols - span, Math.round(g.x)));
    let snappedY = Math.max(0, Math.min(rows - span, Math.round(g.y)));

    // Group move: if the dragged token is part of a multi-selection, shift the
    // whole group by the same delta (only the tokens the user may move; no
    // per-token budget/OA — this is a utility reposition, not a combat step).
    const groupIds = selectedIdsRef.current;
    if (t && groupIds.size > 1 && groupIds.has(drag.id)) {
      const dx = snappedX - t.x;
      const dy = snappedY - t.y;
      if (dx === 0 && dy === 0) return;
      for (const id of groupIds) {
        const m = tokens.find((tt) => tt.id === id);
        if (!m || !canMoveToken(m)) continue;
        const ms = findSize(m.size).cells;
        const nx = Math.max(0, Math.min(cols - ms, m.x + dx));
        const ny = Math.max(0, Math.min(rows - ms, m.y + dy));
        if (nx !== m.x || ny !== m.y) void moveToken(id, nx, ny);
      }
      return;
    }
    // Movement enforcement (cumulative): a step measured from the token's CURRENT
    // cell can't exceed what's left of its speed. Over-budget clamps to the
    // furthest reachable cell; with nothing left, the move is refused.
    const budget = moveBudgetRef.current;
    if (budget && budget.id === drag.id && t) {
      const dx = snappedX - t.x;
      const dy = snappedY - t.y;
      const cheb = Math.max(Math.abs(dx), Math.abs(dy));
      if (cheb > budget.remainingCells) {
        if (budget.remainingCells <= 0) {
          toast.info(`${t.label} is out of movement this turn.`);
          return;
        }
        const f = budget.remainingCells / cheb;
        snappedX = Math.max(0, Math.min(cols - span, t.x + Math.round(dx * f)));
        snappedY = Math.max(0, Math.min(rows - span, t.y + Math.round(dy * f)));
      }
    }
    // A tap / zero-distance drag skips the write (no needless DB round-trip).
    if (t && snappedX === t.x && snappedY === t.y) return;
    // Bank the distance actually travelled against this turn's budget.
    if (budget && budget.id === drag.id && t) {
      addMovement(drag.id, Math.max(Math.abs(snappedX - t.x), Math.abs(snappedY - t.y)) * 5);
    }
    // Capture the pre-move cell for the Opportunity-Attack check (the mover's
    // token object still holds its old x/y until moveToken's optimistic update).
    const oaFrom = t ? { mover: t, x: t.x, y: t.y } : null;
    void moveToken(drag.id, snappedX, snappedY).then((res) => {
      if (res.error) {
        toast.info("That token snapped back — you're not allowed to move it.");
        return;
      }
      // Only a move the table accepted can provoke — check after it commits.
      if (oaFrom) maybeProvokeOAs(oaFrom.mover, oaFrom.x, oaFrom.y, snappedX, snappedY);
      // A hidden token that moves re-tests stealth from its new spot (slice H
      // P4) — moving into the open can blow your cover. Recheck the LIVE token
      // (post-move coords), not the stale pre-move object.
      const moved = tokensRef.current.find((x) => x.id === drag.id);
      if (moved && isStealthHidden(moved.buffs)) recheckHiddenRef.current(moved);
    });
  };

  useEffect(() => {
    const move = (e: PointerEvent) => {
      onDragMoveRef.current(e);
      onRotateMoveRef.current(e);
    };
    const up = () => {
      onDragUpRef.current();
      onRotateUpRef.current();
    };
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", up);
    // pointercancel fires when the OS steals the gesture (a system swipe, a call).
    window.addEventListener("pointercancel", up);
    return () => {
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", up);
      window.removeEventListener("pointercancel", up);
    };
  }, []);

  // ---- Removing the selected token ----------------------------------------
  // One code path for every entry point: the Delete key, and the rail button
  // that is the only way to do this on a touchscreen (no Delete key, no
  // right-click). Reads the selection from a ref so callers never pass an id.
  // Who may REMOVE a token: the DM removes anything; a player removes only their
  // own character's token. Everything else (monsters, props, spell areas, other
  // players' PCs) is the DM's to clear. RLS lets any member delete, so this is
  // the gate — enforced on every removal path (Delete key + the rail button).
  const canDeleteToken = useCallback(
    (t: Token): boolean => isDM || (t.character_id != null && ownedCharacterIds.has(t.character_id)),
    [isDM, ownedCharacterIds]
  );

  const deleteSelected = useCallback(async () => {
    // The full selection (multi via marquee/shift, or a single primary).
    const ids = selectedIdsRef.current.size
      ? [...selectedIdsRef.current]
      : selectedIdRef.current
        ? [selectedIdRef.current]
        : [];
    if (ids.length === 0) return;
    const targets = ids
      .map((id) => tokensRef.current.find((tt) => tt.id === id))
      .filter((t): t is Token => Boolean(t));
    // A player can only remove tokens they own; the DM removes anything.
    const removable = targets.filter((t) => canDeleteToken(t));
    if (removable.length === 0) {
      toast.info("You can only remove your own tokens.");
      return;
    }
    // Removing several at once is a footgun (a marquee can sweep up player
    // characters too) — confirm first, and call out any PCs in the batch.
    if (removable.length > 1) {
      const pcs = removable.filter((t) => t.character_id).length;
      const ok = await confirm({
        title: `Remove ${removable.length} tokens?`,
        message:
          pcs > 0
            ? `This removes ${removable.length} tokens from the board — including ${pcs} player character${pcs === 1 ? "" : "s"}. This can't be undone.`
            : `This removes ${removable.length} tokens from the board. This can't be undone.`,
        confirmLabel: `Remove ${removable.length}`,
        danger: true,
      });
      if (!ok) return;
    }
    selectOnly(null);
    void Promise.all(removable.map((t) => deleteToken(t.id))).then((results) => {
      const failed = results.filter((r) => r.error).length;
      if (failed) toast.error(`Couldn't remove ${failed} token${failed === 1 ? "" : "s"}.`);
      else
        toast.success(
          removable.length === 1 ? `${removable[0].label ?? "Token"} removed` : `${removable.length} tokens removed`
        );
    });
  }, [deleteToken, toast, canDeleteToken, selectOnly, confirm]);

  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key !== "Delete" && e.key !== "Backspace") return;
      const el = e.target as HTMLElement | null;
      // Never hijack the key while typing (labels, prompts, etc.).
      if (el && /^(INPUT|TEXTAREA|SELECT)$/.test(el.tagName)) return;
      if (!selectedIdRef.current && selectedIdsRef.current.size === 0) return;
      e.preventDefault();
      deleteSelected();
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [deleteSelected]);

  // ---- Marquee drag-select (mouse) ----------------------------------------
  // Begun from the empty-ground rect (below). Move/up live on the window so the
  // rectangle keeps tracking even if the pointer leaves the board. On release it
  // selects every token whose footprint the rectangle touches — filtered to the
  // ones the user may manage (the DM: any; a player: only their own).
  useEffect(() => {
    const onMove = (e: PointerEvent) => {
      const m = marqueeRef.current;
      if (!m) return;
      const p = clientToSvg(e.clientX, e.clientY);
      if (!p) return;
      // A few SVG-units of travel counts as a real drag (not a click).
      if (Math.abs(p.x - m.x0) > 3 || Math.abs(p.y - m.y0) > 3) m.moved = true;
      m.x1 = p.x;
      m.y1 = p.y;
      setMarquee({ x0: m.x0, y0: m.y0, x1: m.x1, y1: m.y1 });
    };
    const onUp = () => {
      const m = marqueeRef.current;
      if (!m) return;
      marqueeRef.current = null;
      setMarquee(null);
      // A press with no real drag → clear the selection (the old deselect).
      if (!m.moved) {
        selectOnly(null);
        return;
      }
      const minX = Math.min(m.x0, m.x1), maxX = Math.max(m.x0, m.x1);
      const minY = Math.min(m.y0, m.y1), maxY = Math.max(m.y0, m.y1);
      const hits = tokensRef.current.filter((t) => {
        if (!canDeleteToken(t)) return false; // only manageable tokens
        const span = findSize(t.size).cells;
        const tx0 = t.x * CELL, ty0 = t.y * CELL;
        const tx1 = tx0 + span * CELL, ty1 = ty0 + span * CELL;
        return tx0 < maxX && tx1 > minX && ty0 < maxY && ty1 > minY; // rect overlap
      });
      setSelection(hits.map((t) => t.id));
    };
    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup", onUp);
    window.addEventListener("pointercancel", onUp);
    return () => {
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", onUp);
      window.removeEventListener("pointercancel", onUp);
    };
  }, [canDeleteToken, setSelection, selectOnly]);

  // Point-placed bursts (Fireball's sphere) respect the spell's range: the
  // blast center can't sit farther from the caster than the spell reaches
  // (review finding — spheres used to drop anywhere). Direction-only shapes
  // (cone/line/cube) aim FROM the caster, so their reach is their own length.
  const burstAimBlocked = (spec: AttackSpec, attackerId: string | undefined, aimX: number, aimY: number): string | null => {
    const s = spec.burstShape?.shape;
    if (s !== "sphere" && s !== "cylinder" && s !== "emanation") return null;
    const maxFt = attackRangeFt(spec.range);
    if (maxFt == null) return null;
    const caster = attackerId ? tokensRef.current.find((t) => t.id === attackerId) : undefined;
    if (!caster) return null;
    const span = findSize(caster.size).cells;
    const ox = caster.x * CELL + (span * CELL) / 2;
    const oy = caster.y * CELL + (span * CELL) / 2;
    const ft = Math.round(Math.hypot(aimX - ox, aimY - oy) / CELL) * FT_PER_CELL;
    return ft > maxFt ? `${spec.label} reaches ${maxFt} ft — that point is ${ft} ft away.` : null;
  };

  const startTokenDrag = (e: React.PointerEvent, t: Token) => {
    if (e.button !== 0) return;
    // Teleport targeting: this tap picks the destination cell (even over a token).
    if (pendingMoveRef.current) {
      e.stopPropagation();
      resolveMoveAt(e.clientX, e.clientY);
      return;
    }
    // Targeting an attack: this tap picks the target, not selects/drags.
    const pa = pendingAttackRef.current;
    if (pa) {
      e.stopPropagation();
      if (swingLockRef.current) return; // already swinging — ignore extra taps
      // Aimed area/cone: any tap is just a DIRECTION (or, for a point-placed
      // sphere, the blast's center), so resolve toward the tapped token's spot.
      // No self gate — a cone is aimed, not a hit. Point-placed shapes DO get
      // a range gate (Fireball can't drop beyond its 150 ft).
      if (pa.spec.burst) {
        const c = centerOfToken(t);
        const blocked = burstAimBlocked(pa.spec, pa.attackerId, c.x, c.y);
        if (blocked) {
          toast.info(blocked); // keep aiming — pick a closer point
          return;
        }
        // Economy is spent on COMMIT, not when targeting began — so an aimed
        // spell cancelled with Esc costs nothing. (#116-adjacent)
        if (pa.spec.econ) markEconomy(pa.attackerId, pa.spec.econ);
        setPendingAttack(null);
        resolveBurst(pa.by, pa.spec, pa.attackerId, c.x, c.y);
        return;
      }
      // Props (scenery/containers) and Spell area markers are never combat
      // targets — keep the cursor up so the player can pick a real creature. (#80)
      if (t.kind === "prop" || t.kind === "spell") {
        toast.info(`${t.label} isn't a target — pick a creature.`);
        return;
      }
      // Can't attack yourself — but a healing or restoration spell CAN target
      // its own caster.
      if (t.id === pa.attackerId && pa.spec.heal == null && pa.spec.cleanse == null) {
        setPendingAttack(null);
        return;
      }
      // Range check: an attack (or targeted spell) can only reach so far. Melee
      // / Touch (5 ft) needs an adjacent target; ranged up to its long range;
      // Self / unlimited → no limit. Self-heals pass (gap 0). Out of range keeps
      // the targeting cursor up so the player can pick a reachable mark instead.
      const maxFt = attackRangeFt(pa.spec.range);
      const attacker = tokens.find((x) => x.id === pa.attackerId);
      if (maxFt != null && attacker) {
        const gapFt = footprintGap(attacker, t) * 5;
        if (gapFt > maxFt) {
          toast.info(`${t.label} is out of range — ${pa.spec.label} reaches ${maxFt} ft, target is ${gapFt} ft away.`);
          return;
        }
      }
      // Valid target chosen → the action is now COMMITTED, so spend its economy
      // here (not when the attack button was pressed). Cancelling targeting with
      // Esc, or picking an out-of-range/invalid target, never reaches this line,
      // so it costs nothing.
      if (pa.spec.econ) markEconomy(pa.attackerId, pa.spec.econ);
      // Play the swing, land the blow on the impact frame, and keep the sword
      // cursor alive until the animation finishes — so the strike is visible
      // before the roll/damage appears. (AttackCursor starts its own swing on
      // this same pointerdown.) When the animated cursor is off, resolve at once.
      if (ANIMATED_CURSOR) {
        swingLockRef.current = true;
        setSwinging(true);
        attackTimers.current.push(
          window.setTimeout(() => resolveAttack(pa.by, pa.spec, t, pa.attackerId), cursorImpactMs(attackKind)),
          window.setTimeout(() => {
            setPendingAttack(null);
            setSwinging(false);
            swingLockRef.current = false;
          }, CURSOR_SWING_MS)
        );
      } else {
        setPendingAttack(null);
        resolveAttack(pa.by, pa.spec, t, pa.attackerId);
      }
      return;
    }
    // Pickpocket targeting: this tap picks the mark (adjacency checked there).
    const ps = pendingStealRef.current;
    if (ps) {
      e.stopPropagation();
      pickStealTarget(ps.attackerId, t);
      return;
    }
    // A player tapping a downed DM token (or a loot container) gets a small
    // context menu next to it — Loot / Examine — instead of auto-looting.
    // Stays available on an already-looted corpse (Loot disabled, Examine on).
    if (!isDM && menuEligible(t)) {
      e.preventDefault();
      e.stopPropagation();
      setTokenMenu({ tokenId: t.id, x: e.clientX, y: e.clientY });
      return;
    }
    // Ping/ruler/fog/draw/hotspot clicks pass through tokens to the board handler.
    if (
      toolRef.current === "ping" ||
      toolRef.current === "ruler" ||
      toolRef.current === "fog" ||
      toolRef.current === "draw" ||
      toolRef.current === "hotspot"
    )
      return;
    // Pan takes priority if the user is holding space, using middle-mouse, or
    // has the Pan tool active — the svg's capture-phase handler gets it then.
    if (spaceHeldRef.current || toolRef.current === "pan") {
      // ...except on touch, which the capture handler ignores. Start the pan
      // here so dragging over a token still pans instead of doing nothing.
      if (e.pointerType === "touch" && touchesRef.current.size <= 1) {
        beginPan(e.clientX, e.clientY);
      }
      return;
    }
    e.preventDefault();
    // Shift/⌘-click builds a multi-selection — but only across tokens the user
    // is allowed to manage (the DM: anything; a player: only their own). A plain
    // click still selects any single token (to view its HUD).
    const additive = e.shiftKey || e.metaKey || e.ctrlKey;
    if (additive && canDeleteToken(t)) toggleSelect(t.id);
    else selectOnly(t.id);
    // Movement permission: the DM moves anything; a player moves only their own
    // character token or a prop/scenery token (no statblock, no owner). Creatures
    // and other players' PCs stay put. Selection is still allowed — just no drag.
    if (!canMoveToken(t)) return;
    const local = clientToSvg(e.clientX, e.clientY);
    if (!local) return;
    // Offset from the top-left of the token's footprint (in SVG units)
    // so multi-cell tokens don't jump on grab.
    // Arm a potential drag, but don't lift the token yet — the ghost only
    // appears once the pointer crosses DRAG_THRESHOLD_PX (see handleMove). A
    // plain click therefore just selects and shows the HUD.
    tokenDragRef.current = {
      id: t.id,
      offsetX: local.x - t.x * CELL,
      offsetY: local.y - t.y * CELL,
      startX: e.clientX,
      startY: e.clientY,
      active: false,
    };
  };

  // ---- Pan (capture phase so it beats token handlers) ---------------------
  const beginPan = (clientX: number, clientY: number) => {
    panDragRef.current = {
      startClientX: clientX,
      startClientY: clientY,
      startPanX: panRef.current.x,
      startPanY: panRef.current.y,
    };
    setPanning(true);
  };

  const startPanIfTriggered = (e: React.PointerEvent) => {
    // Touch is handled by the gesture layer below (one finger on empty canvas
    // pans, two fingers pinch), so don't let it start a mouse-style pan here.
    if (e.pointerType === "touch") return;
    const trigger =
      e.button === 1 ||
      (e.button === 0 && (spaceHeldRef.current || toolRef.current === "pan"));
    if (!trigger) return;
    e.preventDefault();
    e.stopPropagation();
    beginPan(e.clientX, e.clientY);
  };

  useEffect(() => {
    const onMove = (e: PointerEvent) => {
      const p = panDragRef.current;
      if (!p) return;
      const svg = svgRef.current;
      if (!svg) return;
      const rect = svg.getBoundingClientRect();
      // Convert screen deltas to SVG-user deltas via the current view size.
      // (Not via CTM inverse because we don't want translation, only scaling.)
      const dxSvg = ((e.clientX - p.startClientX) / rect.width) * (width / zoom);
      const dySvg = ((e.clientY - p.startClientY) / rect.height) * (height / zoom);
      setPan({ x: p.startPanX - dxSvg, y: p.startPanY - dySvg });
    };
    const onUp = () => {
      if (panDragRef.current) {
        panDragRef.current = null;
        setPanning(false);
      }
    };
    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup", onUp);
    window.addEventListener("pointercancel", onUp);
    return () => {
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", onUp);
      window.removeEventListener("pointercancel", onUp);
    };
  }, [width, height, zoom]);

  // ---- Zoom (native wheel listener — React's onWheel is passive) ----------
  useEffect(() => {
    const svg = svgRef.current;
    if (!svg) return;
    const onWheel = (e: WheelEvent) => {
      e.preventDefault();
      const rect = svg.getBoundingClientRect();
      const viewW = width / zoom;
      const viewH = height / zoom;
      // Cursor position in SVG-user coords, computed from pan+view size (no CTM).
      const cursorU = pan.x + ((e.clientX - rect.left) / rect.width) * viewW;
      const cursorV = pan.y + ((e.clientY - rect.top) / rect.height) * viewH;
      // Trackpad pinch and mouse wheel both come through here as deltaY.
      // Exp keeps zoom feeling multiplicative rather than additive.
      const factor = Math.exp(-e.deltaY * 0.0015);
      const newZoom = Math.max(MIN_ZOOM, Math.min(MAX_ZOOM, zoom * factor));
      if (newZoom === zoom) return;
      const newViewW = width / newZoom;
      const newViewH = height / newZoom;
      const newPanX = cursorU - ((e.clientX - rect.left) / rect.width) * newViewW;
      const newPanY = cursorV - ((e.clientY - rect.top) / rect.height) * newViewH;
      setZoom(newZoom);
      setPan({ x: newPanX, y: newPanY });
    };
    svg.addEventListener("wheel", onWheel, { passive: false });
    return () => svg.removeEventListener("wheel", onWheel);
  }, [zoom, pan, width, height]);

  // ---- Touch gestures: pinch-zoom + two-finger pan ------------------------
  // Zoom used to be wheel-only, and `touch-action: none` suppresses the
  // browser's own pinch — so on a touchscreen there was no way to zoom at all.
  // Two fingers now scale about their midpoint AND pan by the midpoint's
  // travel, so zooming and repositioning happen in a single natural gesture.
  useEffect(() => {
    const svg = svgRef.current;
    if (!svg) return;
    const pts = touchesRef.current;

    const spread = (a: { x: number; y: number }, b: { x: number; y: number }) =>
      Math.hypot(a.x - b.x, a.y - b.y);

    const onDown = (e: PointerEvent) => {
      if (e.pointerType !== "touch") return;
      pts.set(e.pointerId, { x: e.clientX, y: e.clientY });
      if (pts.size === 2) {
        // A second finger landed. Abandon any single-finger token drag or pan
        // so the token doesn't fly along with the pinch. Dropping the ghost
        // also means the half-finished drag is never written to the DB (the
        // drag's pointerup handler no-ops without it).
        tokenDragRef.current = null;
        setGhost(null);
        panDragRef.current = null;
        setPanning(false);
        const [a, b] = [...pts.values()];
        gestureRef.current = {
          dist: spread(a, b),
          midX: (a.x + b.x) / 2,
          midY: (a.y + b.y) / 2,
        };
      }
    };

    const onMove = (e: PointerEvent) => {
      if (e.pointerType !== "touch" || !pts.has(e.pointerId)) return;
      pts.set(e.pointerId, { x: e.clientX, y: e.clientY });
      const g = gestureRef.current;
      if (pts.size !== 2 || !g) return;

      const rect = svg.getBoundingClientRect();
      if (!rect.width || !rect.height) return;
      const [a, b] = [...pts.values()];
      const dist = spread(a, b);
      const midX = (a.x + b.x) / 2;
      const midY = (a.y + b.y) / 2;
      if (!g.dist || !dist) return;

      const z0 = zoomRef.current;
      const p0 = panRef.current;
      // SVG-user point sitting under the PREVIOUS midpoint — the anchor we
      // scale about (same fraction-of-viewport math as the wheel handler).
      const fx = (g.midX - rect.left) / rect.width;
      const fy = (g.midY - rect.top) / rect.height;
      const anchorU = p0.x + fx * (width / z0);
      const anchorV = p0.y + fy * (height / z0);

      const z1 = Math.max(MIN_ZOOM, Math.min(MAX_ZOOM, z0 * (dist / g.dist)));
      // Re-pin the anchor under the NEW midpoint. The midpoint's travel between
      // frames falls out of this as two-finger pan, for free.
      const nx = anchorU - ((midX - rect.left) / rect.width) * (width / z1);
      const ny = anchorV - ((midY - rect.top) / rect.height) * (height / z1);

      zoomRef.current = z1;
      panRef.current = { x: nx, y: ny };
      setZoom(z1);
      setPan({ x: nx, y: ny });
      gestureRef.current = { dist, midX, midY };
    };

    const onUp = (e: PointerEvent) => {
      if (e.pointerType !== "touch") return;
      pts.delete(e.pointerId);
      if (pts.size >= 2) return;
      gestureRef.current = null;
      // Lifting to one finger hands control back to single-finger pan, so the
      // gesture flows on instead of dead-stopping mid-motion.
      if (pts.size === 1) {
        const [only] = [...pts.values()];
        beginPan(only.x, only.y);
      }
    };

    svg.addEventListener("pointerdown", onDown);
    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup", onUp);
    window.addEventListener("pointercancel", onUp);
    return () => {
      svg.removeEventListener("pointerdown", onDown);
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", onUp);
      window.removeEventListener("pointercancel", onUp);
      pts.clear();
      gestureRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [width, height]);

  // ---- Space key = pan modifier ------------------------------------------
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      // Don't intercept space when typing into an input.
      if (e.code !== "Space" || e.repeat) return;
      const t = e.target as HTMLElement | null;
      if (t && /^(INPUT|TEXTAREA|SELECT)$/.test(t.tagName)) return;
      e.preventDefault();
      setSpaceHeld(true);
    };
    const onKeyUp = (e: KeyboardEvent) => {
      if (e.code !== "Space") return;
      setSpaceHeld(false);
    };
    window.addEventListener("keydown", onKeyDown);
    window.addEventListener("keyup", onKeyUp);
    return () => {
      window.removeEventListener("keydown", onKeyDown);
      window.removeEventListener("keyup", onKeyUp);
    };
  }, []);

  const resetView = () => {
    setPan({ x: 0, y: 0 });
    setZoom(1);
  };

  const handleAdd = async (e: React.FormEvent) => {
    e.preventDefault();
    const label = newLabel.trim();
    if (!label) return;
    await addToken({
      label,
      color: newColor,
      ...findFreeCell(Math.floor(cols / 2), Math.floor(rows / 2), 1),
    });
    setNewLabel("");
    setAddOpen(false);
  };

  // Ghost overlay: while a token is being dragged, render at cursor position
  // instead of the DB position so the drag feels smooth (no round-trip lag).
  const rendered = useMemo(() => {
    if (!ghost) return visibleTokens;
    return visibleTokens.map((t) => (t.id === ghost.id ? { ...t, x: ghost.x, y: ghost.y } : t));
  }, [visibleTokens, ghost]);

  // Resolved from the live token list, so a token deleted by another player
  // clears the contextual rail button instead of leaving it pointing at a ghost.
  const selectedToken = useMemo(
    () => visibleTokens.find((t) => t.id === selectedId) ?? null,
    [visibleTokens, selectedId]
  );

  // Sessions (#0041): the DM's recording boundary. Rolls/chat/system events
  // made while one is live carry its id; everything else is off the record.
  const myName = party.find((m) => m.user_id === authUser?.id)?.name ?? (isDM ? "DM" : "Player");
  const { sessions, activeSession, activeSessionRef, startSession, endSession } = useSessions(game.id, {
    canManage: isDM,
    dmName: myName,
  });
  // Table-wide dice: every HUD roll logs + blooms locally and broadcasts to the
  // whole table. Single consumer of the rolls:{gameId} topic. The roller (and
  // only the roller) also persists the roll to game_log.
  const persistRoll = useCallback(
    (by: string, entries: RollEntry[]) => {
      if (!authUser) return;
      appendGameLog({
        game_id: game.id,
        session_id: activeSessionRef.current?.id ?? null,
        kind: "roll",
        author_id: authUser.id,
        author_name: by,
        body: {
          entries: entries.map((e) => ({
            label: e.label,
            expression: e.result.expression,
            total: e.result.total,
            detail: e.result.detail,
          })),
        },
      });
    },
    [game.id, authUser, activeSessionRef]
  );
  const { roll: broadcastRoll, blooms } = useTableRolls(game.id, persistRoll);
  // The persistent table feed — what the Game Log drawer renders (rolls +
  // chat + system events), and what the rail badge counts.
  const gameFeed = useGameLogFeed(game.id, { authorName: myName, sessionRef: activeSessionRef });
  const unseenRolls = logOpen ? 0 : Math.max(0, gameFeed.entries.length - logSeen);
  const openLog = () => {
    setLogSeen(gameFeed.entries.length);
    setLogOpen(true);
  };

  // Tokens follow the party (user, 2026-08-21): when THIS member's effective
  // scene changes — self-travel, DM Gather, or the stage moving under them —
  // their character's token comes along, clamped to the destination grid.
  // Each client moves only its OWN token; the DM is exempt (they roam to
  // author, and their tokens are props, not a person). Bystanders left in the
  // origin scene won't see the departure until they change scenes (realtime
  // UPDATE filters match the new row only) — a known, mild limitation.
  const prevEffectiveSceneRef = useRef<string | null>(null);
  useEffect(() => {
    const sceneId = activeScene?.id ?? null;
    const prev = prevEffectiveSceneRef.current;
    prevEffectiveSceneRef.current = sceneId;
    if (isDM || !prev || !sceneId || prev === sceneId) return;
    const myCharId = game.my_character_id;
    if (!myCharId) return;
    const cols = activeScene?.grid_cols ?? 30;
    const rows = activeScene?.grid_rows ?? 20;
    void (async () => {
      const { data: mine } = await supabase
        .from("tokens")
        .select("id, x, y")
        .eq("scene_id", prev)
        .eq("character_id", myCharId);
      for (const t of mine ?? []) {
        await supabase
          .from("tokens")
          .update({
            scene_id: sceneId,
            x: Math.min(Math.max(0, t.x as number), cols - 1),
            y: Math.min(Math.max(0, t.y as number), rows - 1),
          })
          .eq("id", t.id);
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeScene?.id]);

  // Story drawer + Present (#0041 slice 1e). The campaign's documents at the
  // table: the DM reads notes quietly and presents read-alouds; players' doc
  // list is already RLS-filtered to player-facing material.
  const [storyOpen, setStoryOpen] = useState(false);
  const [audioOpen, setAudioOpen] = useState(false); // per-device audio mixer
  // The DM's token library — so the Co-DM's place_tokens proposals can resolve
  // a creature name to real art (else a labeled marker).
  const { assets: libraryAssets } = useTokenAssets();
  const { docs: storyDocs, createDoc: createStoryDoc, reload: reloadStoryDocs } = useCampaignDocs(game.id);
  // Shares (Story/Journal) — the DM's Share files a doc in players' Journals;
  // players read this to know what's theirs.
  const { shares: docShares, shareWithParty } = useDocShares(game.id);
  const sharedDocIdSet = useMemo(() => new Set(docShares.map((s) => s.document_id)), [docShares]);
  // A player gains read access exactly when a share arrives; refetch docs so
  // the newly-shared one appears in their Journal (no doc-row event fires).
  const shareCount = docShares.length;
  useEffect(() => {
    if (!isDM && shareCount > 0) void reloadStoryDocs();
  }, [shareCount, isDM, reloadStoryDocs]);
  // Present state is DERIVED FROM THE LOG — a doc_presented system event with
  // a content snapshot, undone by doc_dismissed. No schema, survives refresh,
  // reaches late joiners, and the presentation itself is part of the record.
  const presented = useMemo(() => {
    for (let i = gameFeed.entries.length - 1; i >= 0; i--) {
      const e = gameFeed.entries[i];
      if (e.kind !== "system") continue;
      const t = (e.body as { type?: string }).type;
      if (t === "doc_dismissed") return null;
      if (t === "doc_presented") {
        const b = e.body as { doc_id?: string; title?: string; content?: string; doc_kind?: string; meta?: Record<string, unknown> };
        return {
          eventId: e.id,
          docId: b.doc_id ?? "",
          title: b.title ?? "",
          content: b.content ?? "",
          kind: b.doc_kind ?? "read_aloud",
          meta: b.meta,
        };
      }
    }
    return null;
  }, [gameFeed.entries]);
  // A player can wave the overlay away locally; the DM's ✕ dismisses for all.
  const [presentHiddenFor, setPresentHiddenFor] = useState<string | null>(null);

  // Narration playback: when a doc with a cached voice is presented (and not
  // hidden for this viewer), play it through the Narrator channel. Autoplay
  // may be blocked for a player who hasn't interacted yet — fail quietly.
  const narrationRef = useRef<HTMLAudioElement | null>(null);
  const presentedAudioUrl = presented && presentHiddenFor !== presented.eventId
    ? ((presented.meta as { audio_url?: string } | undefined)?.audio_url ?? null)
    : null;
  useEffect(() => {
    narrationRef.current?.pause();
    narrationRef.current = null;
    if (!presentedAudioUrl) return;
    const el = new Audio(presentedAudioUrl);
    el.volume = audioBus.level("narrator");
    narrationRef.current = el;
    void el.play().catch(() => {/* autoplay blocked — the overlay text still shows */});
    // Live-apply mixer changes to the playing narration.
    const unsub = audioBus.subscribe(() => {
      if (narrationRef.current) narrationRef.current.volume = audioBus.level("narrator");
    });
    return () => {
      unsub();
      el.pause();
      narrationRef.current = null;
    };
  }, [presentedAudioUrl]);
  const presentDoc = (doc: { id: string; title: string; content: string; kind: string; meta?: Record<string, unknown> }) => {
    if (!authUser) return;
    appendGameLog({
      game_id: game.id,
      session_id: activeSessionRef.current?.id ?? null,
      kind: "system",
      author_id: authUser.id,
      author_name: myName,
      body: {
        type: "doc_presented",
        doc_id: doc.id,
        title: doc.title,
        content: doc.content,
        doc_kind: doc.kind,
        // Handouts snapshot their structured fields; the overlay re-renders
        // the artifact client-side on every screen (#0042).
        ...(doc.meta ? { meta: doc.meta } : {}),
      },
    });
    setPresentHiddenFor(null);
    toast.success("Presented to the table");
  };
  const dismissPresented = () => {
    if (!authUser || !presented) return;
    appendGameLog({
      game_id: game.id,
      session_id: activeSessionRef.current?.id ?? null,
      kind: "system",
      author_id: authUser.id,
      author_name: myName,
      body: { type: "doc_dismissed", doc_id: presented.docId },
    });
  };
  const saves = useSaveRequests(game.id);
  const { tables, classes } = useRules();
  // Reaction interrupt (Shield): the attacker's continuation per open window, a
  // timeout per window, and the "waiting on the defender" banner. The hook's
  // response callback is bounced through a ref so the channel never resubscribes.
  const reactionContRef = useRef<Record<string, (resp: ReactionResponse) => void>>({});
  const reactionTimers = useRef<Record<string, number>>({});
  const reactionResolveRef = useRef<(resp: ReactionResponse) => void>(() => {});
  const [awaitingReaction, setAwaitingReaction] = useState<{ id: string; targetLabel: string } | null>(null);
  const reactions = useReactions(game.id, (resp) => reactionResolveRef.current(resp));
  // Cross-client combat start (#76): a player's first harmful blow can't roll
  // initiative (DM-only), so it fires this signal and the DM's client runs the
  // ritual. The handler is assigned later (needs init/rollInitiativeFor) and read
  // through a ref so the channel never resubscribes.
  const beginCombatRitualRef = useRef<() => void>(() => {});
  const combatSignal = useCombatSignal(game.id, () => beginCombatRitualRef.current());
  // Counterspell window (caster side): per-open-window promise resolver + caster
  // token + spell, a timeout, the "casting…" banner, and — after a counter — the
  // caster's own CON save. Reactor "No" clicks are dismissed locally (a decline
  // must NOT close the window; only a real counter or the timeout does).
  const counterspellRef = useRef<Record<string, { resolve: (countered: boolean) => void; casterTokenId: string; spell: string }>>({});
  const counterspellTimers = useRef<Record<string, number>>({});
  // Holds the caster's window resolver while their CON save dialog is open, so
  // finishCounter can delete the window entry (idempotent) yet the save can
  // still settle the promise.
  const pendingCounterResolveRef = useRef<((countered: boolean) => void) | null>(null);
  const [awaitingCounter, setAwaitingCounter] = useState<{ id: string; spell: string } | null>(null);
  const [casterCounterSave, setCasterCounterSave] = useState<{ id: string; dc: number; by: string; spell: string; casterTokenId: string } | null>(null);
  const [dismissedCounters, setDismissedCounters] = useState<Set<string>>(new Set());

  // Who controls a token's rolls: the owning player for a PC, else the DM.
  const iControlToken = useCallback(
    (t: Token): boolean => (t.character_id ? ownedCharacterIds.has(t.character_id) : isDM),
    [ownedCharacterIds, isDM]
  );

  // Who may DRAG a token (independent of speed — distance is only tracked in
  // combat, never hard-blocked). A placed SPELL area is a fixed point in the
  // world: locked for EVERYONE once set — the DM deletes it to remove it. The
  // rare relocatable areas (Moonbeam, Flaming Sphere) carry area.movable and can
  // be repositioned by the DM OR by the caster who owns it — linked via area.conc
  // (#125) — so a player nudges their own Moonbeam each turn. (#127) Otherwise:
  // DM moves anything; a player moves only their own character token or a
  // prop/scenery token.
  // The in-combat rules (turn order + hands-off players' tokens) are applied
  // separately, at drag lift-off (see onDragMoveRef → combatMoveBlock), so a
  // plain select-click stays quiet.
  const canMoveToken = useCallback(
    (t: Token): boolean => {
      if (t.kind === "spell") {
        if (t.area?.movable !== true) return false;
        const casterCharId = t.area?.conc?.characterId;
        return isDM || (casterCharId != null && ownedCharacterIds.has(casterCharId));
      }
      if (t.character_id) return isDM || ownedCharacterIds.has(t.character_id);
      return isDM || !t.statblock;
    },
    [isDM, ownedCharacterIds]
  );

  // In-combat movement guard — returns why a drag is disallowed (a message to
  // show), or null if it's fine. Checked at real drag intent so selecting a token
  // still works. Two rules, both only while a fight is underway:
  //   1. The DM must NOT move a player's token — that's the player's job.
  //   2. A COMBATANT (any creature) may only move on its OWN turn (DM included).
  // Scenery/props (no statblock, no character) stay freely movable for staging.
  const combatMoveBlock = (t: Token): string | null => {
    if (!init.inCombat) return null;
    if (t.character_id && !ownedCharacterIds.has(t.character_id) && isDM) {
      return `${t.label} belongs to a player — they move their own token.`;
    }
    const isCombatant = !!t.character_id || !!t.statblock;
    if (isCombatant && init.activeToken?.id !== t.id) {
      return `It isn't ${t.label}'s turn to move.`;
    }
    return null;
  };

  // The full character HUD binds only to a token whose sheet this client OWNS —
  // never a party member's PC seen from the DM's screen. The DM's copy of another
  // player's sheet is stale (realtime is scoped to owned characters, useRoster),
  // so binding it would show frozen HP after the DM damages that PC. Falling
  // through to the read-only TokenHud instead shows the token's LIVE hp_current,
  // which the damage path keeps current. A plain monster token has no character.
  const boundCharacter = useMemo(
    () =>
      selectedToken?.character_id && ownedCharacterIds.has(selectedToken.character_id)
        ? characters.find((c) => c.id === selectedToken.character_id) ?? null
        : null,
    [selectedToken, characters, ownedCharacterIds]
  );

  // Action economy (client-local, per token, per turn): Action / Bonus /
  // Reaction spent, plus movement CONSUMED cumulatively this turn (`moveUsedFt`
  // — the sum of each committed step, not displacement, so moving out-and-back
  // still spends the budget). Reset when initiative reaches this creature.
  // `action` is a COUNT (main actions spent this turn) so Multiattack / Action
  // Surge can allow more than one; bonus/reaction stay single.
  type Econ = { action: number; bonus: boolean; reaction: boolean; dashed: boolean; moveUsedFt: number };
  const [economy, setEconomy] = useState<Record<string, Econ>>({});
  const activeTokenId = init.activeToken?.id ?? null;
  useEffect(() => {
    if (!activeTokenId) return;
    setEconomy((e) => ({
      ...e,
      [activeTokenId]: { action: 0, bonus: false, reaction: false, dashed: false, moveUsedFt: 0 },
    }));
    // Turn-start cleanup (slices F & G), single-writer on the controlling
    // client: Dodge expires, and an UNRELEASED readied action dissipates — RAW,
    // a ready lasts only until the start of your next turn. Both stop the tile's
    // spinning ring in the same moment.
    const t = tokensRef.current.find((x) => x.id === activeTokenId);
    if (t && iControlToken(t)) {
      const buffs = t.buffs ?? [];
      const stale = buffs.filter((b) => b === "Dodging" || isReadying(b));
      if (stale.length) {
        void updateToken(t.id, { buffs: buffs.filter((b) => !stale.includes(b)) });
        if (stale.includes("Dodging")) broadcastRoll(t.label, [{ label: `${t.label} stops dodging (turn starts)`, result: roll("1d1") }]);
        if (stale.some(isReadying)) broadcastRoll(t.label, [{ label: `${t.label}'s readied action dissipates (turn starts)`, result: roll("1d1") }]);
      }
    }
    // Re-fires each new turn (activeToken changes) and each round (for solo combats).
  }, [activeTokenId, init.round]);

  // Take the Dodge action (slice F): spend nothing here — the HUD's economy
  // wiring spends the Action — just put the Dodging buff on the token and log.
  const takeDodge = (t: Token) => {
    if ((t.buffs ?? []).includes("Dodging")) return;
    void updateToken(t.id, { buffs: [...(t.buffs ?? []), "Dodging"] });
    broadcastRoll(t.label, [
      { label: `${t.label} takes the Dodge action — attacks against it have disadvantage; DEX saves at advantage (until its next turn)`, result: roll("1d1") },
    ]);
  };

  // Ready an action (slice G): store the encoded Readying buff (trigger + held
  // response) on the token and announce the declaration. The HUD spent the
  // Action via econ; the Reaction is spent on RELEASE.
  const takeReady = (t: Token, buffEntry: string) => {
    if ((t.buffs ?? []).some(isReadying)) return;
    void updateToken(t.id, { buffs: [...(t.buffs ?? []), buffEntry] });
    const [attackName, trigger] = parseBuff(buffEntry).parts;
    broadcastRoll(t.label, [
      { label: `${t.label} readies ${attackName || "an action"}${trigger ? ` — trigger: "${trigger}"` : ""}`, result: roll("1d1") },
    ]);
  };

  // Hide (slice H): roll the hider's Stealth once, contest it against each
  // hostile observer's range-adjusted passive Perception (near ≤30 ft = as-is,
  // 30–60 ft = −5, >60 ft can't notice). Beat every observer who could notice
  // → apply the Hidden buff (per-viewer invisibility, frozen Stealth for a
  // later Search); otherwise the attempt fails. All logged. Returns nothing.
  // The hostile observers who NOTICE a token trying to hide with `stealthTotal`
  // — shared by the initial Hide and the out-of-combat recheck (slice H P4).
  // Range bands: ≤30 ft passive as-is, 30–60 ft passive −5, >60 ft can't notice.
  // Meet-or-beat hides (matches Steal's `>= dc`).
  const spottersOf = (t: Token, stealthTotal: number) => {
    const hiderHostile = t.disposition === "hostile";
    const h = centerOfToken(t);
    return tokens
      .filter((o) => {
        if (o.id === t.id || o.hidden || o.kind === "prop" || o.kind === "spell") return false;
        if (isStealthHidden(o.buffs) || tokenIsDowned(o)) return false;
        return hiderHostile ? o.disposition !== "hostile" : o.disposition === "hostile";
      })
      .map((o) => {
        const c = centerOfToken(o);
        const ft = Math.round(Math.hypot(c.x - h.x, c.y - h.y) / CELL) * FT_PER_CELL;
        const pp = passivePerceptionOfToken(o) - (ft > 30 ? 5 : 0);
        return { o, ft, pp };
      })
      .filter(({ ft, pp }) => ft <= 60 && stealthTotal < pp);
  };

  const attemptHide = (t: Token) => {
    if (isStealthHidden(t.buffs)) return;
    const stealth = roll(`1d20${stealthBonusOfToken(t) >= 0 ? "+" : ""}${stealthBonusOfToken(t)}`);
    const stealthTotal = stealth.total;
    const spotters = spottersOf(t, stealthTotal);
    const hid = spotters.length === 0;
    broadcastRoll(
      t.label,
      [{
        label: hid
          ? `${t.label} hides — Stealth ${stealthTotal}, unseen`
          : `${t.label} tries to hide — Stealth ${stealthTotal}, spotted by ${spotters[0].o.label} (passive Perception ${spotters[0].pp})`,
        result: stealth,
      }],
      bloomSeedFor(t, hid ? "normal" : "fumble", hid ? "hidden" : "seen")
    );
    if (hid) void updateToken(t.id, { buffs: [...(t.buffs ?? []), encodeHidden(stealthTotal)] });
  };

  // Out-of-combat recheck (slice H P4): re-run the contest for an already-
  // hidden token against its FROZEN Stealth. If an observer now notices it
  // (the hider moved into view, or a foe closed in), reveal it. Only the
  // controlling client writes (single-writer). No re-roll — the Stealth total
  // was fixed when the token hid.
  const recheckHidden = (t: Token) => {
    if (!controlsToken(t)) return;
    const st = hiddenStealth(t.buffs);
    if (st == null) return;
    const spotters = spottersOf(t, st);
    if (spotters.length === 0) return;
    void updateToken(t.id, { buffs: (t.buffs ?? []).filter((b) => !isHiddenEntry(b)) });
    broadcastRoll(
      t.label,
      [{ label: `${t.label} is spotted by ${spotters[0].o.label} (passive Perception ${spotters[0].pp}) — no longer hidden`, result: roll("1d1") }],
      bloomSeedFor(t, "fumble", "seen")
    );
  };
  recheckHiddenRef.current = recheckHidden;

  // Out-of-combat interval (slice H P4): while NOT in combat, every ~6s re-test
  // each hidden token this client controls, so a foe walking toward a motionless
  // hider can still spot them (the on-move recheck covers the hider moving).
  // In combat, reveal is turn/action-driven, so the timer stays off.
  useEffect(() => {
    if (init.inCombat) return;
    const id = window.setInterval(() => {
      for (const t of tokensRef.current) {
        if (isStealthHidden(t.buffs) && controlsToken(t)) recheckHiddenRef.current(t);
      }
    }, 6000);
    return () => window.clearInterval(id);
  }, [init.inCombat, controlsToken]);

  // Reveal a hidden attacker (slice H, P3): attacking or casting a harmful
  // spell ends the Hide. Returns whether the actor WAS hidden — the to-hit
  // path uses that for unseen-attacker advantage.
  const revealIfHidden = (attackerId?: string): boolean => {
    if (!attackerId) return false;
    const a = tokensRef.current.find((t) => t.id === attackerId);
    if (!a || !isStealthHidden(a.buffs)) return false;
    void updateToken(a.id, { buffs: (a.buffs ?? []).filter((b) => !isHiddenEntry(b)) });
    broadcastRoll(a.label, [{ label: `${a.label} strikes from hiding — revealed`, result: roll("1d1") }]);
    return true;
  };

  // Release a readied action (slice G): the tap on the chip is the trigger
  // call. Strip the buff, spend the Reaction, log — the HUD then launches the
  // held attack's targeting off-turn.
  const releaseReady = (t: Token, buffEntry: string) => {
    void updateToken(t.id, { buffs: (t.buffs ?? []).filter((b) => b !== buffEntry) });
    markEconomy(t.id, "reaction");
    const [attackName] = parseBuff(buffEntry).parts;
    broadcastRoll(t.label, [
      { label: `${t.label} releases the readied ${attackName || "action"} (reaction)`, result: roll("1d1") },
    ]);
  };

  // Add feet to this turn's spent movement (called when a drag commits).
  const addMovement = (id: string | null, ft: number) => {
    if (!id || ft <= 0) return;
    setEconomy((e) => (e[id] ? { ...e, [id]: { ...e[id], moveUsedFt: e[id].moveUsedFt + ft } } : e));
  };

  // Dash doubles this turn's movement budget (spends the action separately).
  const markDash = (id: string | null) => {
    if (!id) return;
    setEconomy((e) => (e[id] ? { ...e, [id]: { ...e[id], dashed: true } } : e));
  };

  // Spend a resource — action increments (multiple attacks), bonus/reaction set.
  // No-op outside combat (no entry until the creature's turn starts).
  const markEconomy = (id: string | null, which: "action" | "bonus" | "reaction") => {
    if (!id) return;
    setEconomy((e) => {
      const cur = e[id];
      if (!cur) return e;
      if (which === "action") return { ...e, [id]: { ...cur, action: cur.action + 1 } };
      return cur[which] ? e : { ...e, [id]: { ...cur, [which]: true } };
    });
  };

  const economyView = useMemo(() => {
    if (!init.inCombat || !selectedToken) return null;
    const eco = economy[selectedToken.id];
    const agg = aggregateConditions(selectedToken.conditions ?? []);
    const base = selectedToken.statblock
      ? selectedToken.statblock.speed.walk ?? 30
      : boundCharacter?.speed ?? 30;
    const speed = (agg.speed0 ? 0 : base) * (eco?.dashed ? 2 : 1);
    const moveUsed = eco?.moveUsedFt ?? 0;
    return {
      // Incapacitated → everything reads spent (the HUD also disables all items).
      action: agg.incapacitated ? 99 : eco?.action ?? 0,
      bonus: agg.incapacitated ? true : eco?.bonus ?? false,
      reaction: agg.incapacitated ? true : eco?.reaction ?? false,
      moveUsed,
      speed,
    };
  }, [init.inCombat, selectedToken, economy, boundCharacter]);

  // Keep the active creature's REMAINING movement (in cells) in a ref, so a drag
  // drop can be clamped to what's left of its speed this turn.
  useEffect(() => {
    if (!init.inCombat || !activeTokenId) {
      moveBudgetRef.current = null;
      return;
    }
    const eco = economy[activeTokenId];
    const t = tokens.find((x) => x.id === activeTokenId);
    if (!eco || !t) {
      moveBudgetRef.current = null;
      return;
    }
    const char = t.character_id ? characters.find((c) => c.id === t.character_id) : undefined;
    const base = t.statblock ? t.statblock.speed.walk ?? 30 : char?.speed ?? 30;
    const speed = (aggregateConditions(t.conditions ?? []).speed0 ? 0 : base) * (eco.dashed ? 2 : 1);
    const remainingFt = Math.max(0, speed - eco.moveUsedFt);
    moveBudgetRef.current = { id: activeTokenId, remainingCells: Math.floor(remainingFt / 5) };
  }, [init.inCombat, activeTokenId, economy, tokens, characters]);

  // Fire a HUD roll, anchoring its board bloom just above the bound token.
  const fireRoll = useCallback(
    (entries: RollEntry[], opts?: { tone?: RollTone; label?: string }) => {
      const by = boundCharacter?.name ?? selectedToken?.label ?? "Someone";
      let seed: { x: number; y: number; tone?: RollTone; text?: string } | undefined;
      if (selectedToken) {
        const spec = findSize(selectedToken.size);
        const cx = selectedToken.x * CELL + (spec.cells * CELL) / 2;
        const cy = selectedToken.y * CELL + (spec.cells * CELL) / 2;
        seed = { x: cx, y: cy - spec.radius * CELL - 8, tone: opts?.tone, text: opts?.label };
      }
      broadcastRoll(by, entries, seed);
    },
    [boundCharacter, selectedToken, broadcastRoll]
  );

  // HP edited from the dock flows to the character row (same truth as the
  // sheet) — so a hit taken on the map shows up on the sheet too.
  const hpApi = useMemo(() => {
    if (!boundCharacter) return null;
    const id = boundCharacter.id;
    return {
      heal: (n: number) => onUpdateCharacter(id, (c) => ({ ...c, hp: applyHeal(c.hp, n) })),
      damage: (n: number) => onUpdateCharacter(id, (c) => ({ ...c, hp: applyDamage(c.hp, n) })),
      setTemp: (n: number) => onUpdateCharacter(id, (c) => ({ ...c, hp: applyTempHp(c.hp, n) })),
    };
  }, [boundCharacter, onUpdateCharacter]);

  // ---- Looting: pouch on a body/container → take coins & items into a PC -----
  const [lootTokenId, setLootTokenId] = useState<string | null>(null);
  // DM authoring loot onto a carrier token.
  const [lootEditTokenId, setLootEditTokenId] = useState<string | null>(null);
  // Player context menu on a downed DM token (Loot / Examine), anchored at the
  // tap position; and the token currently being examined (read-only stat card).
  const [tokenMenu, setTokenMenu] = useState<{ tokenId: string; x: number; y: number } | null>(null);
  const [examineTokenId, setExamineTokenId] = useState<string | null>(null);
  // The skill check being rolled from the Examine card (cinematic dice dialog).
  const [examineCheck, setExamineCheck] = useState<{ skill: SkillName } | null>(null);
  // A pending pickpocket: the player rolls Sleight of Hand in the dice dialog,
  // then the total is checked vs the mark's passive Perception (#131).
  const [stealRoll, setStealRoll] = useState<{ thiefId: string; targetId: string } | null>(null);
  // DM override: which pending (player-owned) save the DM chose to roll.
  const [dmPickId, setDmPickId] = useState<string | null>(null);
  // Pickpocket targeting: the acting PC token's id while the pinch cursor is up,
  // waiting for the player to tap an adjacent creature. Ref mirrors it so the
  // token-tap handler reads the latest without re-binding.
  const [pendingSteal, setPendingSteal] = useState<{ attackerId: string } | null>(null);
  const pendingStealRef = useRef(pendingSteal);
  useEffect(() => {
    pendingStealRef.current = pendingSteal;
  }, [pendingSteal]);
  useEffect(() => {
    if (!pendingSteal) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setPendingSteal(null);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [pendingSteal]);

  const lootToken = lootTokenId ? tokens.find((t) => t.id === lootTokenId) ?? null : null;
  const lootEditToken = lootEditTokenId ? tokens.find((t) => t.id === lootEditTokenId) ?? null : null;
  const menuToken = tokenMenu ? tokens.find((t) => t.id === tokenMenu.tokenId) ?? null : null;
  const examineToken = examineTokenId ? tokens.find((t) => t.id === examineTokenId) ?? null : null;
  // Close the token menu on Escape (its backdrop handles click-away).
  useEffect(() => {
    if (!tokenMenu) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setTokenMenu(null);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [tokenMenu]);
  // If the menu's token vanishes (removed, or fully looted away), drop the menu.
  useEffect(() => {
    if (tokenMenu && !menuToken) setTokenMenu(null);
  }, [tokenMenu, menuToken]);

  const saveDmLoot = async (id: string, loot: TokenLoot) => {
    const { error } = await updateToken(id, { loot });
    if (error) toast.error(`Couldn't save loot: ${error}`);
    else toast.success("Loot placed.");
  };

  // Which character receives the loot: the selected token's PC if I own it,
  // otherwise any character I own at the table. Null → I have nothing to loot into.
  const looterCharacter = useMemo(() => {
    if (boundCharacter && ownedCharacterIds.has(boundCharacter.id)) return boundCharacter;
    return characters.find((c) => ownedCharacterIds.has(c.id)) ?? null;
  }, [boundCharacter, characters, ownedCharacterIds]);

  const tokenIsDead = (t: Token): boolean =>
    !!t.statblock && (t.hp_current ?? t.statblock.hp) <= 0;

  // Downed = the board should render it as a body (greyed, drained). Covers a
  // defeated statblock creature AND a player character at 0 HP — but NOT for
  // loot (a downed ally isn't lootable), so this is a VISUAL predicate only,
  // separate from tokenIsDead which drives corpse/loot logic.
  const tokenIsDowned = (t: Token): boolean => {
    if (tokenIsDead(t)) return true;
    if (t.character_id) {
      const c = characters.find((x) => x.id === t.character_id);
      if (c) return c.hp.current <= 0;
    }
    return false;
  };

  // A body or container a player can freely loot (no skill check): a defeated
  // creature, or any token already carrying loot. Never my own PC, never once
  // it's been picked clean.
  const isFreeLootable = (t: Token): boolean => {
    if (t.hidden) return false;
    if (t.character_id && ownedCharacterIds.has(t.character_id)) return false;
    if (t.loot && t.loot.looted && lootIsEmpty(t.loot)) return false;
    return tokenIsDead(t) || (t.loot != null && !lootIsEmpty(t.loot));
  };
  // Truly picked clean — a corpse (or container) that was looted and is now
  // empty. This is the ONLY state that should read "looted": a living creature
  // isn't lootable because it's alive, not because someone emptied it.
  const lootedClean = (t: Token): boolean => Boolean(t.loot && t.loot.looted && lootIsEmpty(t.loot));

  // A token whose player context menu (Loot / Examine) should open. Unlike
  // isFreeLootable this stays true for a corpse even after it's picked clean —
  // a body is always examinable (Medicine, Investigation…), only Loot goes dead.
  const menuEligible = (t: Token): boolean => {
    if (t.hidden) return false;
    if (t.character_id && ownedCharacterIds.has(t.character_id)) return false;
    return tokenIsDead(t) || (t.loot != null && !lootIsEmpty(t.loot));
  };
  // Right-click target: any non-owned, visible token worth a menu — a LIVE
  // creature (Steal/Examine, #131), a corpse (Loot/Examine), or a loot
  // container. Broader than menuEligible (which the tap path uses for corpses
  // only, so left-click still SELECTS a live token instead of opening a menu).
  const menuTarget = (t: Token): boolean => {
    if (t.hidden) return false;
    if (t.character_id && ownedCharacterIds.has(t.character_id)) return false;
    return !!t.statblock || tokenIsDead(t) || (t.loot != null && !lootIsEmpty(t.loot));
  };

  // The knowledge skill that fits a creature's type, for the Examine card.
  const loreSkillFor = (type: string): SkillName => {
    const t = type.toLowerCase();
    if (/undead|fiend|celestial/.test(t)) return "Religion";
    if (/aberration|construct|elemental|fey|ooze|dragon|monstrosity/.test(t)) return "Arcana";
    return "Nature"; // beast, plant, giant, humanoid…
  };

  // A token's center in SVG user units (accounts for multi-cell footprints).
  const centerOfToken = (t: Token): { x: number; y: number } => {
    const span = findSize(t.size).cells;
    return { x: t.x * CELL + (span * CELL) / 2, y: t.y * CELL + (span * CELL) / 2 };
  };

  // Launch a spell projectile from the caster token to the target and broadcast
  // it to the table. Returns true when a projectile actually flew (a known vfx
  // + a locatable caster) so callers can time an effect to its arrival.
  const fireSpellProjectile = (vfx: string, attackerId: string | undefined, target: Token): boolean => {
    if (!vfx || !hasSpellFx(vfx)) return false;
    const attacker = attackerId ? tokens.find((t) => t.id === attackerId) : undefined;
    if (!attacker) return false;
    const from = centerOfToken(attacker);
    const to = centerOfToken(target);
    spellFx.sendFx({ vfx, fromX: from.x, fromY: from.y, toX: to.x, toY: to.y });
    return true;
  };

  // Grid gap between two token footprints, in cells. 0 = touching/overlapping,
  // 1 = one square away (5 ft — still "adjacent" for reach and pickpocketing).
  const footprintGap = (a: Token, b: Token): number => {
    const as = findSize(a.size).cells;
    const bs = findSize(b.size).cells;
    const dx = Math.max(0, a.x - (b.x + bs - 1), b.x - (a.x + as - 1));
    const dy = Math.max(0, a.y - (b.y + bs - 1), b.y - (a.y + as - 1));
    return Math.max(dx, dy);
  };

  // Passive Perception sets the steal DC: parse the statblock's Senses line,
  // else fall back to 10 + WIS mod.
  const passivePerceptionOf = (sb: NonNullable<Token["statblock"]>): number => {
    const line = (sb.senses ?? []).join(", ");
    const m = /passive perception\s+(\d+)/i.exec(line);
    if (m) return parseInt(m[1], 10);
    return 10 + abilityMod(sb.abilities?.WIS ?? 10);
  };

  // Hide (slice H) — a token's Stealth bonus (PC skill, monster statblock
  // skill, else DEX) and its passive Perception as an observer.
  const stealthBonusOfToken = (t: Token): number => {
    if (t.character_id) {
      const ch = characters.find((c) => c.id === t.character_id);
      if (ch) return skillBonus(ch, "Stealth");
    }
    const sb = t.statblock;
    if (sb) {
      const sk = (sb.skills ?? []).find((s) => /stealth/i.test(s.name));
      return sk ? sk.bonus : abilityMod(sb.abilities?.DEX ?? 10);
    }
    return 0;
  };
  const passivePerceptionOfToken = (t: Token): number => {
    if (t.character_id) {
      const ch = characters.find((c) => c.id === t.character_id);
      if (ch) return 10 + skillBonus(ch, "Perception");
    }
    if (t.statblock) return passivePerceptionOf(t.statblock);
    return 10;
  };

  const openLoot = async (t: Token) => {
    // Roll & freeze incidental loot the first time a creature is looted.
    if (t.loot == null && t.statblock) {
      const generated = incidentalCreatureLoot(t.statblock);
      const { error } = await updateToken(t.id, { loot: generated });
      if (error) toast.error(`Couldn't stash loot: ${error}`);
    }
    setLootTokenId(t.id);
  };

  // Token-menu actions (player, on a downed DM token). Loot still needs one of
  // your characters adjacent (you can't reach across the map); Examine is free.
  const lootFromMenu = () => {
    if (!menuToken) return;
    const adj = tokens.some(
      (o) => o.character_id && ownedCharacterIds.has(o.character_id) && footprintGap(o, menuToken) <= 1
    );
    if (!adj) {
      toast.info(`Move one of your characters next to ${menuToken.label} to loot it.`);
      setTokenMenu(null);
      return;
    }
    void openLoot(menuToken);
    setTokenMenu(null);
  };
  const examineFromMenu = () => {
    if (!menuToken) return;
    setExamineTokenId(menuToken.id);
    setTokenMenu(null);
  };
  // Steal (#131): pickpocket a LIVE creature that isn't one of your own — needs
  // one of your characters adjacent. Sleight of Hand vs the mark's passive
  // Perception (resolveSteal). Downed bodies / your own tokens use Loot instead.
  const stealFromMenu = () => {
    if (!menuToken) return;
    const thief = tokens.find(
      (o) => o.character_id && ownedCharacterIds.has(o.character_id) && footprintGap(o, menuToken) <= 1
    );
    if (!thief) {
      toast.info(`Move one of your characters next to ${menuToken.label} to pickpocket it.`);
      setTokenMenu(null);
      return;
    }
    setTokenMenu(null);
    resolveSteal(thief, menuToken);
  };

  // The DM adds loot to a token from its Examine card (#user ask) — any
  // DM-controlled token (monster, NPC, prop/container), never a player's PC.
  const addLootToToken = (t: Token) => {
    if (t.character_id) {
      toast.info("Loot goes on monsters, NPCs, or props — not player characters.");
      return;
    }
    setExamineTokenId(null);
    setLootEditTokenId(t.id);
  };
  // Open the cinematic dice roller for a skill check on the body — Medicine,
  // Investigation, etc. The player rolls it themselves; the result logs to the
  // table (and blooms on the corpse), and the DM narrates what it reveals.
  const examineRoll = (skill: SkillName) => {
    if (!looterCharacter) {
      toast.info("Select one of your characters to make that check.");
      return;
    }
    setExamineCheck({ skill });
  };

  // Pickpocket resolution: fired when a steal target is tapped (adjacency
  // already checked). Sleight of Hand vs the mark's passive Perception —
  // success reveals the loot, failure blows the attempt and starts a fight.
  const resolveSteal = (attacker: Token, target: Token) => {
    const char = attacker.character_id
      ? characters.find((c) => c.id === attacker.character_id)
      : undefined;
    if (!char || !ownedCharacterIds.has(char.id)) {
      toast.error("You can only pickpocket with your own character.");
      return;
    }
    if (!target.statblock) {
      toast.error(`There's nothing to lift off ${target.label}.`);
      return;
    }
    // Open the cinematic dice dialog — the player rolls Sleight of Hand; the
    // verdict lands in the dialog's onComplete (below).
    setStealRoll({ thiefId: attacker.id, targetId: target.id });
  };

  // Tap landed while the pinch cursor was up — validate the mark, play the
  // pinch, and land the verdict on the grab frame (mirrors the attack swing).
  const pickStealTarget = (attackerId: string, target: Token) => {
    if (stealLockRef.current) return;
    const attacker = tokens.find((t) => t.id === attackerId);
    if (!attacker || target.id === attackerId) {
      setPendingSteal(null);
      return;
    }
    if (!target.statblock || tokenIsDead(target)) {
      setPendingSteal(null);
      // A body needs no sleight — just loot it if it's yours to loot.
      if (tokenIsDead(target)) void openLoot(target);
      else toast.error(`There's nothing to pickpocket on ${target.label}.`);
      return;
    }
    if (footprintGap(attacker, target) > 1) {
      setPendingSteal(null);
      toast.error("Too far — you must be adjacent to pickpocket.");
      return;
    }
    if (ANIMATED_CURSOR) {
      stealLockRef.current = true;
      setStealing(true);
      attackTimers.current.push(
        window.setTimeout(() => resolveSteal(attacker, target), cursorImpactMs("steal")),
        window.setTimeout(() => {
          setPendingSteal(null);
          setStealing(false);
          stealLockRef.current = false;
        }, cursorSwingMs("steal"))
      );
    } else {
      setPendingSteal(null);
      resolveSteal(attacker, target);
    }
  };

  // Enter pickpocket targeting from the skills sheet (Sleight of Hand).
  const takeAllLoot = async () => {
    const t = lootToken;
    if (!t || !t.loot || !looterCharacter) return;
    const loot = t.loot;
    await onUpdateCharacter(looterCharacter.id, (c) => {
      const cur: Currency = { ...c.currency };
      (Object.keys(loot.coins) as (keyof Currency)[]).forEach((k) => {
        cur[k] = (cur[k] ?? 0) + (loot.coins[k] ?? 0);
      });
      return { ...c, inventory: [...c.inventory, ...loot.items.map(lootToInventoryItem)], currency: cur };
    });
    // A dropped-item pickup (thrown weapon on the ground) vanishes once taken —
    // it was only ever a holder for the loot. Real containers/bodies stay.
    if (loot.dropped) await deleteToken(t.id);
    else await updateToken(t.id, { loot: { coins: {}, items: [], looted: true } });
    toast.success(`${looterCharacter.name} takes everything from ${t.label}.`);
    setLootTokenId(null);
  };

  const takeLootItem = async (itemId: string) => {
    const t = lootToken;
    if (!t || !t.loot || !looterCharacter) return;
    const item = t.loot.items.find((i) => i.id === itemId);
    if (!item) return;
    await onUpdateCharacter(looterCharacter.id, (c) => ({
      ...c,
      inventory: [...c.inventory, lootToInventoryItem(item)],
    }));
    const items = t.loot.items.filter((i) => i.id !== itemId);
    const next: TokenLoot = { ...t.loot, items, looted: lootIsEmpty({ ...t.loot, items }) };
    // Emptied drop pickups (thrown weapons) remove themselves (slice E).
    if (t.loot.dropped && next.looted) {
      await deleteToken(t.id);
      setLootTokenId(null);
    } else {
      await updateToken(t.id, { loot: next });
    }
  };

  // ---- XP on defeat: a monster dropping to 0 HP pays out to the party --------
  // Each client awards only its OWN characters (owner-only RLS), so there are no
  // cross-writes and no double counting — every PC's XP is written once, by the
  // player who owns it. The split divisor is the party PCs present on the board,
  // which every client sees identically.
  const prevHpRef = useRef<Map<string, number>>(new Map());
  const awardedXpRef = useRef<Set<string>>(new Set());
  const xpSeededRef = useRef(false);
  useEffect(() => {
    const prev = prevHpRef.current;
    const partyIds = new Set(tokens.filter((t) => t.character_id).map((t) => t.character_id));
    const partySize = partyIds.size;
    const myPcs = characters.filter(
      (c) => ownedCharacterIds.has(c.id) && partyIds.has(c.id)
    );
    for (const t of tokens) {
      // Only monster/NPC statblock tokens pay XP — never a downed player.
      if (!t.statblock || t.character_id) continue;
      const hp = t.hp_current ?? t.statblock.hp;
      const was = prev.get(t.id);
      const justDied = xpSeededRef.current && was != null && was > 0 && hp <= 0;
      if (justDied && !awardedXpRef.current.has(t.id)) {
        awardedXpRef.current.add(t.id);
        const each = splitXp(xpForCr(t.statblock.cr), Math.max(1, partySize));
        if (each > 0 && myPcs.length > 0) {
          myPcs.forEach((c) => void onUpdateCharacter(c.id, (ch) => ({ ...ch, xp: ch.xp + each })));
          toast.success(`${t.label} defeated — +${each} XP${myPcs.length > 1 ? " each" : ""}.`);
        }
      }
      prev.set(t.id, hp);
    }
    xpSeededRef.current = true;
  }, [tokens, characters, ownedCharacterIds, onUpdateCharacter, toast]);

  // ---- Repeat saves: a held creature re-rolls at the end of its turn ---------
  // When the active turn passes off a token that carries a condition with an
  // ongoing save (paralyzed@WIS:13), whoever controls that token is prompted to
  // shake it off. Only the controller fires the request, so it isn't duplicated.
  const prevTurnRef = useRef<string | null>(null);
  useEffect(() => {
    const cur = init.activeToken?.id ?? null;
    const prev = prevTurnRef.current;
    prevTurnRef.current = cur;
    if (!init.inCombat || !prev || prev === cur) return;
    const ended = tokens.find((t) => t.id === prev);
    if (!ended || !iControlToken(ended)) return;
    for (const entry of ended.conditions ?? []) {
      const pc = parseCondition(entry);
      if (!pc.save || pc.dc == null) continue;
      saves.request({
        id: `sr-${Date.now()}-${Math.random().toString(36).slice(2, 6)}-${pc.name}`,
        by: "End of turn",
        targetTokenId: ended.id,
        targetLabel: ended.label,
        ability: pc.save,
        dc: pc.dc,
        sourceLabel: pc.name,
        onFail: "condition",
        condition: pc.name,
        onSave: "none",
        repeat: true,
      });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [init.activeToken?.id, init.inCombat]);

  // ---- Targeted combat: attack → tap a target → resolve vs AC → damage -----
  const [pendingAttack, setPendingAttack] = useState<{ by: string; attackerId: string; spec: AttackSpec } | null>(null);
  const pendingAttackRef = useRef(pendingAttack);
  useEffect(() => {
    pendingAttackRef.current = pendingAttack;
  }, [pendingAttack]);

  // Aim preview: while targeting, a dashed line runs from the caster to the
  // cursor with a live distance readout — green in range, red past it — so you
  // see distance + direction before committing. Updated imperatively (no
  // re-render per mouse move); the caster end is fixed, the cursor end tracks.
  const aimLineRef = useRef<SVGLineElement | null>(null);
  const aimLabelRef = useRef<SVGTextElement | null>(null);
  const aimConeRef = useRef<SVGGElement | null>(null);
  const aimAreaRef = useRef<SVGGElement | null>(null);
  useEffect(() => {
    const pa = pendingAttack;
    if (!pa) return;
    const attacker = tokens.find((t) => t.id === pa.attackerId);
    if (!attacker) return;
    const origin = centerOfToken(attacker);
    const maxFt = attackRangeFt(pa.spec.range);
    const onMove = (e: PointerEvent) => {
      const p = clientToSvg(e.clientX, e.clientY);
      if (!p) return;
      // Lingering area spell (Web, Wall of Fire…): the footprint follows the
      // cursor to the drop point (no aiming from the caster).
      if (pa.spec.placeArea) {
        const g = aimAreaRef.current;
        if (g) g.setAttribute("transform", `translate(${p.x} ${p.y})`);
        return;
      }
      // Aimed area spell: a sphere-style blast follows the cursor to its drop
      // point; cone/line/cube footprints anchor at the caster and rotate to
      // point at the cursor — direction only (their length is fixed).
      if (pa.spec.burst) {
        const s = pa.spec.burstShape?.shape;
        if (s === "sphere" || s === "cylinder" || s === "emanation") {
          const g = aimAreaRef.current;
          if (g) {
            g.setAttribute("transform", `translate(${p.x} ${p.y})`);
            // Range feedback: the footprint turns red past the spell's reach
            // (and the commit paths refuse the drop there).
            const ft = Math.round(Math.hypot(p.x - origin.x, p.y - origin.y) / CELL) * 5;
            const bad = maxFt != null && ft > maxFt;
            const circle = g.querySelector("circle");
            if (circle) circle.setAttribute("stroke", bad ? "#e0533d" : areaTintFor(pa.spec.damageType ?? undefined));
          }
          return;
        }
        const angle = (Math.atan2(p.y - origin.y, p.x - origin.x) * 180) / Math.PI;
        const cone = aimConeRef.current;
        if (cone) cone.setAttribute("transform", `translate(${origin.x} ${origin.y}) rotate(${angle})`);
        return;
      }
      const ft = Math.round(Math.hypot(p.x - origin.x, p.y - origin.y) / CELL) * 5;
      const inRange = maxFt == null || ft <= maxFt;
      const color = inRange ? "#6fcf6f" : "#e0533d";
      const line = aimLineRef.current;
      if (line) {
        line.setAttribute("x2", String(p.x));
        line.setAttribute("y2", String(p.y));
        line.setAttribute("stroke", color);
      }
      const label = aimLabelRef.current;
      if (label) {
        label.setAttribute("x", String((origin.x + p.x) / 2));
        label.setAttribute("y", String((origin.y + p.y) / 2 - 6));
        label.setAttribute("fill", color);
        label.textContent = `${ft} ft`;
      }
    };
    window.addEventListener("pointermove", onMove, { passive: true });
    return () => window.removeEventListener("pointermove", onMove);
  }, [pendingAttack, tokens]);

  // Esc bails out of targeting.
  useEffect(() => {
    if (!pendingAttack) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setPendingAttack(null);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [pendingAttack]);

  // Movement/teleport targeting (Misty Step): pick a destination CELL, not a
  // token. Separate from pendingAttack because it resolves on a board tap.
  const [pendingMove, setPendingMove] = useState<{ by: string; tokenId: string; label: string } | null>(null);
  const pendingMoveRef = useRef(pendingMove);
  useEffect(() => {
    pendingMoveRef.current = pendingMove;
  }, [pendingMove]);
  useEffect(() => {
    if (!pendingMove) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setPendingMove(null);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [pendingMove]);

  const requestMove = useCallback((by: string, tokenId: string, label: string) => {
    setPendingMove({ by, tokenId, label });
  }, []);

  // One-shot teleport bursts (Misty Step), in SVG board coords. Each removes
  // itself when its animation finishes.
  // Teleport plume — a burst played in place, broadcast to the whole table
  // through the shared spell-VFX channel (so it's not just local anymore). #94
  const spawnMistyFx = (x: number, y: number) => {
    spellFx.sendFx({ vfx: "misty-step", fromX: x, fromY: y, toX: x, toY: y });
  };

  const resolveMoveAt = (clientX: number, clientY: number) => {
    const pm = pendingMoveRef.current;
    if (!pm) return;
    const local = clientToSvg(clientX, clientY);
    if (!local) return;
    const cx = Math.max(0, Math.min(cols - 1, Math.floor(local.x / CELL)));
    const cy = Math.max(0, Math.min(rows - 1, Math.floor(local.y / CELL)));
    // Teleport VFX: a burst where they vanish and where they reappear.
    const tok = tokens.find((t) => t.id === pm.tokenId);
    if (tok) {
      const span = findSize(tok.size).cells;
      const half = (span * CELL) / 2;
      spawnMistyFx(tok.x * CELL + half, tok.y * CELL + half);
      spawnMistyFx(cx * CELL + half, cy * CELL + half);
    }
    void moveToken(pm.tokenId, cx, cy);
    toast.info(`${pm.by} casts ${pm.label}.`);
    setPendingMove(null);
  };

  // While a swing plays we keep the sword cursor alive and defer the roll to the
  // impact frame, so the strike reads before its result. `swinging` outlives
  // pendingAttack for the tail of the animation; the ref guards against a second
  // click landing a second attack mid-swing.
  const [swinging, setSwinging] = useState(false);
  const [attackKind, setAttackKind] = useState<CursorKind>("sword");
  const swingLockRef = useRef(false);
  const attackTimers = useRef<number[]>([]);
  useEffect(
    () => () => attackTimers.current.forEach((id) => window.clearTimeout(id)),
    []
  );
  // Steal cursor's swing tail — keeps the pinch animation alive after the tap
  // that lands it, mirroring the attack swing.
  const [stealing, setStealing] = useState(false);
  const stealLockRef = useRef(false);

  // A just-landed hit the target may still react to (Uncanny Dodge, etc.). This
  // is deliberately post-hoc and non-blocking: the attack resolves at full
  // damage immediately, and this offer — auto-fading after a few seconds — lets
  // the resolver hand back the difference if a reaction is declared. `applied`
  // is what already landed; `halved` is what it becomes if the reaction fires.

  const bloomSeedFor = (t: Token, tone: RollTone, text: string) => {
    const spec = findSize(t.size);
    const cx = t.x * CELL + (spec.cells * CELL) / 2;
    const cy = t.y * CELL + (spec.cells * CELL) / 2;
    return { x: cx, y: cy - spec.radius * CELL - 8, tone, text };
  };

  const acOfToken = (t: Token): number | null => {
    if (t.statblock) return t.statblock.ac;
    const c = t.character_id ? characters.find((x) => x.id === t.character_id) : undefined;
    return c ? c.ac.override ?? c.ac.value : null;
  };

  const defensesOfToken = (t: Token): Defenses => {
    if (t.statblock)
      return {
        resistances: t.statblock.damageResistances,
        immunities: t.statblock.damageImmunities,
        vulnerabilities: t.statblock.damageVulnerabilities,
      };
    const c = t.character_id ? characters.find((x) => x.id === t.character_id) : undefined;
    return c ? { ...c.defenses } : {};
  };

  // Can this token cast Shield as a reaction, and how do we spend for it?
  //  - a linked PC: knows Shield + a persistent slot open → spend that slot;
  //  - a statblock NPC/monster: Shield in its parsed spellcasting with a slot →
  //    ephemeral (monster slots aren't tracked centrally, so just log + reaction).
  // Returns null when Shield isn't available (drives the offer, prompt, and spend).
  const shieldSourceForToken = (
    t: Token
  ): { kind: "pc"; character: Character; slotLevel: number } | { kind: "statblock" } | null => {
    if (t.character_id) {
      const c = characters.find((x) => x.id === t.character_id);
      if (!c || !knowsShield(c)) return null;
      const cc = casterClass(c, classes);
      const slots = cc ? slotsFor(cc.caster, cc.level, tables) : {};
      const lvl = lowestOpenSlot(slots, c.spellcasting?.slotsUsed ?? {});
      return lvl != null ? { kind: "pc", character: c, slotLevel: lvl } : null;
    }
    if (t.statblock) {
      const mc = parseMonsterSpellcasting(t.statblock);
      const inSlots = (mc?.groups ?? []).some(
        (g) => g.level > 0 && g.max > 0 && g.spells.some((s) => /^shield$/i.test(s.trim()))
      );
      // Fallback for AI-generated statblocks that don't use the SRD "(N slots)"
      // format: Shield named anywhere inside a Spellcasting / Innate Spellcasting
      // trait still counts (statblock slots aren't tracked centrally anyway).
      const inTrait = (t.statblock.traits ?? []).some(
        (tr) => /spellcasting/i.test(tr.name) && /\bshield\b/i.test(tr.text ?? "")
      );
      return inSlots || inTrait ? { kind: "statblock" } : null;
    }
    return null;
  };

  // Can this token cast Counterspell (knows it + a 3rd-level-or-higher slot)?
  // PC → spend that slot; statblock → ephemeral, and carries its save DC so the
  // caster knows what CON DC to roll against.
  const counterSourceForToken = (
    t: Token
  ): { kind: "pc"; character: Character; slotLevel: number } | { kind: "statblock"; dc: number } | null => {
    if (t.character_id) {
      const c = characters.find((x) => x.id === t.character_id);
      if (!c || !knowsCounterspell(c)) return null;
      const cc = casterClass(c, classes);
      const slots = cc ? slotsFor(cc.caster, cc.level, tables) : {};
      const lvl = lowestOpenSlotAtLeast(slots, c.spellcasting?.slotsUsed ?? {}, 3);
      return lvl != null ? { kind: "pc", character: c, slotLevel: lvl } : null;
    }
    if (t.statblock) {
      const mc = parseMonsterSpellcasting(t.statblock);
      const inSlots = (mc?.groups ?? []).some(
        (g) => g.level >= 3 && g.max > 0 && g.spells.some((s) => /^counterspell$/i.test(s.trim()))
      );
      const inTrait = (t.statblock.traits ?? []).some(
        (tr) => /spellcasting/i.test(tr.name) && /counterspell/i.test(tr.text ?? "")
      );
      if (!(inSlots || inTrait)) return null;
      const best = Math.max(t.statblock.abilities.INT ?? 10, t.statblock.abilities.WIS ?? 10, t.statblock.abilities.CHA ?? 10);
      const dc = mc?.saveDC ?? 8 + (t.statblock.proficiencyBonus ?? 2) + abilityMod(best);
      return { kind: "statblock", dc };
    }
    return null;
  };

  // Counterspell has a 60 ft range (12 cells). Is there any readable creature
  // near the caster that *could* counter? (Used to skip the window entirely when
  // nobody could — avoids a needless pause on every spell.)
  const anyPotentialCounterspeller = (caster: Token): boolean =>
    tokens.some((t) => t.id !== caster.id && footprintGap(t, caster) <= 12 && counterSourceForToken(t) != null);

  // The token I control that would counter this caster's spell, if any.
  const counterspellerFor = (offer: ReactionOffer): Token | null => {
    const caster = tokens.find((t) => t.id === offer.targetTokenId);
    if (!caster) return null;
    return (
      tokens.find(
        (t) =>
          t.id !== caster.id &&
          iControlToken(t) &&
          !economy[t.id]?.reaction &&
          footprintGap(t, caster) <= 12 &&
          counterSourceForToken(t) != null
      ) ?? null
    );
  };

  const ownsCharacter = (id: string | null | undefined): boolean =>
    !!id && ownedCharacterIds.has(id);

  // Apply HP to a PC this client can't own-write (a party member's character):
  // the write goes through the service-role apply-hp function, which authorizes
  // the caller as a game member first. The player's own realtime subscription
  // reflects the change on their sheet/HUD. If the function isn't deployed yet,
  // the hit is still logged — we just tell the DM to apply it by hand.
  const applyHpRemote = async (characterId: string, op: "damage" | "heal", amount: number) => {
    if (amount <= 0) return;
    const { error } = await supabase.functions.invoke("apply-hp", {
      body: { gameId: game.id, characterId, op, amount },
    });
    if (!error) return;
    // supabase.functions.invoke reports any non-2xx as the opaque "Edge Function
    // returned a non-2xx status code"; the REAL reason (e.g. "That character is
    // not in this game") is the JSON body on error.context. Dig it out so the
    // failure is actionable instead of a blanket "deploy it" message.
    let detail = error.message ?? "unknown error";
    const ctx = (error as { context?: unknown }).context;
    if (ctx && typeof (ctx as Response).json === "function") {
      try {
        const body = await (ctx as Response).clone().json();
        if (body && typeof body.error === "string") detail = body.error;
      } catch {
        /* body wasn't JSON — keep the generic message */
      }
    }
    console.error("apply-hp failed:", detail);
    toast.error(`Couldn't apply ${amount} HP to that PC — ${detail}`);
  };

  const applyDamageToToken = (t: Token, amount: number) => {
    if (amount <= 0) return;
    if (t.statblock) {
      const cur = t.hp_current ?? t.statblock.hp;
      void updateToken(t.id, { hp_current: Math.max(0, cur - amount) });
    } else if (t.character_id && ownsCharacter(t.character_id)) {
      // My own character — a direct owner write is allowed by RLS; the char→token
      // mirror drops the board bar.
      onUpdateCharacter(t.character_id, (c) => ({ ...c, hp: applyDamage(c.hp, amount) }));
    } else if (t.character_id) {
      // A PC I don't own (a party member's, or one the DM is running against).
      // NOTE: do NOT gate this on the PC being in my local `characters` — the DM's
      // roster does NOT include players' sheets, so that gate silently swallowed
      // hits (e.g. an Opportunity Attack the DM rolls against a player). Instead:
      //  1) drop the token's HP bar now, so the board reflects it for everyone
      //     immediately — even if that player's client is offline to mirror it;
      //  2) persist to their sheet via the service-role apply-hp function
      //     (authorized by game membership, no local sheet needed).
      const cur = t.hp_current ?? t.hp_max ?? 0;
      void updateToken(t.id, { hp_current: Math.max(0, cur - amount) });
      void applyHpRemote(t.character_id, "damage", amount);
    }
    // else: a plain token — logged, applied by hand.
    maybeRequestConcentration(t, amount);
  };

  // Damage to a concentrating creature demands a Constitution save (DC = 10 or
  // half the damage, whichever is higher). Emitted through the save pipeline so
  // it resolves on the concentrating PLAYER's own screen — the one client that
  // can drop the held spell. Skipped when the blow drops them (unconsciousness
  // ends concentration anyway) and for statblock tokens (no tracked spell).
  const maybeRequestConcentration = (t: Token, amount: number) => {
    const c = t.character_id ? characters.find((x) => x.id === t.character_id) : null;
    const spell = c?.spellcasting?.concentratingOn;
    if (!c || !spell) return;
    if (amount >= c.hp.current + (c.hp.temp ?? 0)) return; // downed → drops via incapacitation
    saves.request({
      id: `conc-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
      by: c.name,
      targetTokenId: t.id,
      targetLabel: t.label,
      ability: "CON",
      dc: Math.max(10, Math.floor(amount / 2)),
      sourceLabel: `Concentration (${spell})`,
      onFail: "concentration",
      onSave: "none",
    });
  };

  // Give HP back to a target — the un-damage half of a reaction, re-reading the
  // token live so it stacks on whatever its HP is *now*, not the stale snapshot.
  const healToken = (id: string, amount: number) => {
    if (amount <= 0) return;
    const t = tokens.find((x) => x.id === id);
    if (!t) return;
    if (t.statblock) {
      const cur = t.hp_current ?? t.statblock.hp;
      const max = t.hp_max ?? t.statblock.hp;
      void updateToken(id, { hp_current: Math.min(max, cur + amount) });
    } else if (t.character_id && ownsCharacter(t.character_id)) {
      onUpdateCharacter(t.character_id, (c) => ({ ...c, hp: applyHeal(c.hp, amount) }));
    } else if (t.character_id) {
      // Same as damage: don't gate on the local roster (the DM lacks players'
      // sheets). Bump the token bar now and persist via apply-hp.
      const cur = t.hp_current ?? 0;
      const max = t.hp_max ?? cur + amount;
      void updateToken(id, { hp_current: Math.min(max, cur + amount) });
      void applyHpRemote(t.character_id, "heal", amount);
    }
  };

  // A token's saving-throw bonus for a given ability — monster statblock save
  // (or its ability mod) / a character's computed save.
  const saveBonusOfToken = (t: Token, ab: Ability): number => {
    if (t.statblock) return t.statblock.saves?.[ab] ?? abilityMod(t.statblock.abilities[ab] ?? 10);
    const c = t.character_id ? characters.find((x) => x.id === t.character_id) : undefined;
    return c ? saveBonus(c, ab) : 0;
  };

  // Breakdown chips for the dice dialog: the raw ability mod, plus whatever the
  // total adds on top (proficiency + misc), so the chips always sum to the total.
  const saveChips = (t: Token, ab: Ability): RollChip[] => {
    const c = t.character_id ? characters.find((x) => x.id === t.character_id) : undefined;
    const mod = t.statblock ? abilityMod(t.statblock.abilities[ab] ?? 10) : c ? abilityModFor(c, ab) : 0;
    const total = saveBonusOfToken(t, ab);
    const chips: RollChip[] = [{ label: ab, value: mod }];
    if (total - mod !== 0) chips.push({ label: "Proficiency", value: total - mod });
    return chips;
  };

  // Apply a condition that carries its own end-of-turn shake-off save, encoded
  // as "paralyzed@WIS:13". De-dupes on the base name.
  const applyConditionEncoded = (t: Token, name: string, save?: Ability, dc?: number) => {
    if (!name) return;
    const current = t.conditions ?? [];
    if (current.some((c) => conditionName(c).toLowerCase() === name.toLowerCase())) return;
    void updateToken(t.id, { conditions: [...current, encodeCondition(name, save, dc)] });
  };
  const clearCondition = (id: string, cond: string) => {
    const t = tokens.find((x) => x.id === id);
    if (!t) return;
    // `cond` may be a bare name (badge click) or a full encoded entry — match on name.
    const name = conditionName(cond).toLowerCase();
    void updateToken(id, { conditions: (t.conditions ?? []).filter((c) => conditionName(c).toLowerCase() !== name) });
  };
  // Status picker (#conditions Phase 2): the DM toggles a condition/buff on a
  // token from its Examine card. Conditions applied here carry no save (a manual
  // DM call); buffs are plain names in token.buffs.
  const toggleCondition = (t: Token, name: string) => {
    if ((t.conditions ?? []).some((c) => conditionName(c).toLowerCase() === name.toLowerCase())) clearCondition(t.id, name);
    else applyConditionEncoded(t, name);
  };
  const toggleBuff = (t: Token, name: string) => {
    const cur = t.buffs ?? [];
    const has = cur.some((b) => b.toLowerCase() === name.toLowerCase());
    void updateToken(t.id, { buffs: has ? cur.filter((b) => b.toLowerCase() !== name.toLowerCase()) : [...cur, name] });
  };

  // Ask the token's controller to roll the save that ends a save-removable
  // condition. Fired by clicking its badge (or automatically at end of turn).
  const requestShakeOff = (t: Token, entry: string) => {
    const pc = parseCondition(entry);
    if (!pc.save || pc.dc == null) return;
    saves.request({
      id: `sr-${Date.now()}-${Math.random().toString(36).slice(2, 6)}-${pc.name}`,
      by: "Shake off",
      targetTokenId: t.id,
      targetLabel: t.label,
      ability: pc.save,
      dc: pc.dc,
      sourceLabel: pc.name,
      onFail: "condition",
      condition: pc.name,
      onSave: "none",
      repeat: true,
    });
  };

  // Badge click: a save-removable condition rolls to shake it off (only the
  // controller / DM may trigger it); a condition with no save can't be waved
  // away — it needs a cleansing spell or item — so only the DM force-clears it.
  const onConditionBadge = (t: Token, entry: string) => {
    const pc = parseCondition(entry);
    if (pc.save && pc.dc != null) {
      if (!iControlToken(t) && !isDM) {
        toast.info(`Only ${t.label}'s controller can attempt that save.`);
        return;
      }
      requestShakeOff(t, entry);
    } else if (isDM) {
      clearCondition(t.id, entry);
    } else {
      toast.info(`${pc.name} can't be shrugged off — it needs a spell or item to remove.`);
    }
  };

  // ---- Save-request resolution (defender side) ------------------------------
  // Apply the outcome of a demanded save + log it for the whole table, then
  // clear the request everywhere.
  const applySaveOutcome = (req: SaveRequest, target: Token, saved: boolean, result: RollResult) => {
    let outcome: string;
    if (req.repeat) {
      // End-of-turn shake-off: success REMOVES the condition, failure keeps it.
      if (saved) {
        clearCondition(target.id, req.condition ?? "");
        outcome = `shakes off ${req.condition}!`;
      } else {
        outcome = `still ${req.condition}`;
      }
    } else if (req.onFail === "damage") {
      const rolled = parseInt(req.damage ?? "0", 10) || 0;
      const base = saved && req.onSave === "half" ? Math.floor(rolled / 2) : saved ? 0 : rolled;
      // Honor the target's resistance/immunity to the damage type (fire res on a
      // Fireball, etc.) — applied here so area saves get it too, on the defender's
      // own client.
      const out = resolveDamage(base, req.damageType, defensesOfToken(target));
      if (out.final > 0) applyDamageToToken(target, out.final);
      outcome = saved
        ? req.onSave === "half"
          ? `saves — takes ${out.final} (half)${out.note ? ` (${out.note})` : ""}`
          : "saves — unharmed"
        : `fails — takes ${out.final}${out.note ? ` (${out.note})` : ""}`;
    } else if (req.onFail === "concentration") {
      // A failed save drops the held spell (owner-side write on the defender).
      if (!saved && target.character_id) {
        void onUpdateCharacter(target.character_id, (ch) => ({
          ...ch,
          spellcasting: ch.spellcasting ? { ...ch.spellcasting, concentratingOn: null } : ch.spellcasting,
        }));
      }
      outcome = saved ? "holds concentration" : "loses concentration!";
    } else {
      // Save-or-condition.
      if (!saved && req.condition) applyConditionEncoded(target, req.condition, req.ability, req.dc);
      outcome = saved ? "resists" : req.condition ? `is ${req.condition}!` : "is affected!";
    }
    broadcastRoll(
      target.label,
      [{ label: `${req.ability} save vs ${req.sourceLabel} (DC ${req.dc}) — ${outcome}`, result }],
      bloomSeedFor(
        target,
        saved ? "normal" : "crit",
        saved ? "saved" : req.onFail === "concentration" ? "broke!" : req.condition || "hit"
      )
    );
    saves.resolve(req.id);
  };


  const resolveSaveAutoFail = (req: SaveRequest) => {
    const target = tokens.find((t) => t.id === req.targetTokenId);
    if (!target) {
      saves.resolve(req.id);
      return;
    }
    const synthetic: RollResult = { expression: "auto", rolls: [], modifier: 0, total: 0, detail: "auto-fails" };
    applySaveOutcome(req, target, false, synthetic);
  };

  const doubleDmg = (expr: string) =>
    expr.replace(/^(\d+)d(\d+)/i, (_, n: string, s: string) => `${parseInt(n, 10) * 2}d${s}`);

  // The actual combat-start ritual — DM-only (only the DM may write in_combat +
  // roll the table's initiative). Monsters/NPCs auto-roll; player tokens are left
  // blank so each player is prompted to roll on their own client. Runs both on
  // the DM's own first blow and when a player's blow relays a start signal.
  beginCombatRitualRef.current = () => {
    if (!isDM || init.inCombat) return;
    if (combatTokens.length < 2) return; // nothing to order against
    void init.beginWithPlayerRolls(rollInitiativeFor).then((err) => {
      if (err) toast.error(`Couldn't start combat: ${err}`);
      else toast.success("Combat begins — roll for initiative!");
    });
  };

  // Auto-start combat on the first HARMFUL blow that actually LANDS ON A TARGET
  // — not the moment the action button is pressed. Held in a ref so the memoized
  // requestAttack (empty deps, to keep the cursor stable) always calls the latest
  // closure over init/isDM rather than a stale one. The DM starts the ritual
  // directly; a PLAYER (who can't write initiative) relays a start signal to the
  // DM's client instead. Called from the target-resolution path (resolveAttack /
  // resolveBurst), gated on the action dealing damage — so a utility cast (Charm
  // Person, a heal, a restoration) never triggers a fight on its own.
  const autoStartCombatRef = useRef<() => void>(() => {});
  autoStartCombatRef.current = () => {
    if (init.inCombat) return;
    if (combatTokens.length < 2) return; // nothing to order against
    if (isDM) beginCombatRitualRef.current();
    else combatSignal.requestStart();
  };
  // A harmful action = one that deals damage (attacks, Magic Missile, a cone…).
  // Save-or-condition control (Charm/Hold Person), heals, and restorations don't
  // start a fight by themselves — the DM (or the first damaging blow) does.
  const startCombatIfHarmful = (spec: AttackSpec) => {
    if (spec.damage != null) autoStartCombatRef.current();
  };

  // Mirror the live turn state into refs so requestAttack (stable, []-deps, to
  // keep the cursor from flickering) can gate on it without being re-created.
  const inCombatRef = useRef(false);
  const activeTurnIdRef = useRef<string | null>(null);
  inCombatRef.current = init.inCombat;
  activeTurnIdRef.current = activeTokenId;

  const requestAttack = useCallback((by: string, attackerId: string, spec: AttackSpec) => {
    // Turn gate: once a fight is underway a creature only acts on ITS OWN turn —
    // the DM included. (Opportunity attacks are the exception, but they go
    // straight to resolveAttack, not through here, so they're unaffected.)
    if (inCombatRef.current && activeTurnIdRef.current !== attackerId) {
      toast.info("It isn't this creature's turn to act.");
      return;
    }
    // Pick the cursor sheet from the attack: a casting hand for spell/magical
    // attacks, a fist for unarmed strikes, a sword for everything else. Held in
    // state so it persists through the swing tail.
    const ARCANE = /fire|cold|lightning|acid|force|necrotic|radiant|psychic|thunder/i;
    const kind: CursorKind = spec.heal != null || spec.condition != null || spec.cleanse != null || spec.burst || spec.placeArea != null
      ? "spell"
      : /unarm|fist|punch/i.test(spec.label)
        ? "unarmed"
        : /\b(bolt|ray|blast|spell|cast|eldritch|magic|arcane|firebolt)\b/i.test(spec.label) ||
            (spec.damageType != null && ARCANE.test(spec.damageType))
          ? "spell"
          : "sword";
    setAttackKind(kind);
    setPendingAttack({ by, attackerId, spec });
    // Economy is spent by the HUD (onSpend) when the action button is pressed —
    // one source of truth, so Multiattack counts and non-attack actions agree.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Resolve an aimed area/cone (Cone of Cold) toward a POINT — not a token —
  // because an area spell is aimed at a spot, not a creature. Plays the burst
  // from the caster toward (aimX, aimY) and damages every creature in the wedge.
  const resolveBurst = (by: string, spec: AttackSpec, attackerId: string | undefined, aimX: number, aimY: number) => {
    startCombatIfHarmful(spec); // a damaging area cast begins the fight
    if (spec.damage || spec.save) revealIfHidden(attackerId); // casting an offensive AoE from hiding reveals (slice H)
    // Lingering area spell (Web, Wall of Fire…): drop a persistent #80 area token
    // at the aimed cell. It stays until removed; the DM adjudicates who's inside
    // each round. Directional shapes (line/wall) start facing east — rotate via
    // the token's handle (#80).
    if (spec.placeArea) {
      const x = Math.max(0, Math.min(cols - 1, Math.floor(aimX / CELL)));
      const y = Math.max(0, Math.min(rows - 1, Math.floor(aimY / CELL)));
      // Freeze the ongoing effect onto the token (#126): its caster's DC + (possibly
      // upcast) damage travel with it, so each round the save fires with the right
      // numbers even long after the cast. Cosmetic areas (Darkness, Fog Cloud) carry
      // none — no save, no damage, no condition.
      const effect =
        spec.save || spec.placeArea.damage || spec.condition
          ? {
              save: spec.save,
              dc: spec.dc,
              damage: spec.placeArea.damage,
              damageType: spec.placeArea.damageType,
              condition: spec.condition || undefined,
              onSave: (spec.placeArea.damage ? "half" : "none") as "half" | "none",
            }
          : null;
      // Concentration link (#125): tie a concentration area to the caster's
      // character so their own client tears it down when they stop concentrating.
      // Only for a character caster (monsters' areas are removed by the DM).
      const casterCharId = attackerId ? tokens.find((t) => t.id === attackerId)?.character_id ?? null : null;
      const conc =
        spec.placeArea.concSpell && casterCharId
          ? { characterId: casterCharId, spell: spec.placeArea.concSpell }
          : null;
      void addToken({
        label: spec.label,
        kind: "spell",
        area: { shape: spec.placeArea.shape, size: spec.placeArea.size, damageType: spec.placeArea.damageType, level: spec.placeArea.level, facing: 0, movable: spec.placeArea.movable, effect, conc },
        size: "medium",
        x,
        y,
        controller: "dm",
      });
      const saveTxt = spec.save
        ? ` — ${spec.save} save${spec.dc != null ? ` DC ${spec.dc}` : ""}${spec.condition ? ` or ${spec.condition}` : ""}`
        : "";
      broadcastRoll(
        by,
        [{ label: `${spec.label}${saveTxt} (area placed)`, result: roll("1d1") }],
        { x: x * CELL + CELL / 2, y: y * CELL, tone: "normal" as RollTone, text: "✦" }
      );
      toast.info(`${spec.label} placed — rotate/move it via its handle; remove it when the spell ends.`);
      return;
    }
    const caster = attackerId ? tokens.find((t) => t.id === attackerId) : undefined;
    if (!caster) return;
    const apex = centerOfToken(caster);
    if (spec.vfx && hasSpellFx(spec.vfx)) {
      spellFx.sendFx({ vfx: spec.vfx, fromX: apex.x, fromY: apex.y, toX: aimX, toY: aimY });
    }
    if (!spec.damage) return;
    const dir = Math.atan2(aimY - apex.y, aimX - apex.x);
    // Who's caught, by the spell's TRUE shape (slice B). Cone/line/cube aim
    // FROM the caster toward the click; a sphere is centered ON the click.
    // Centers-in-area, matching the aim preview — indiscriminate (a Fireball
    // doesn't care whose side you're on; a sphere can even catch the caster).
    const shape = spec.burstShape?.shape ?? "cone";
    const lenU = ((spec.burstShape?.size ?? (CONE_LEN / CELL) * FT_PER_CELL) / FT_PER_CELL) * CELL;
    const ux = Math.cos(dir);
    const uy = Math.sin(dir);
    const caught = tokens.filter((t) => {
      if (t.hidden || t.kind === "prop" || t.kind === "spell") return false;
      if (t.id === caster.id && shape !== "sphere") return false; // self-origin shapes never catch the caster
      const c = centerOfToken(t);
      if (shape === "sphere" || shape === "cylinder" || shape === "emanation") {
        // Blast centered at the aim point, radius = size.
        return Math.hypot(c.x - aimX, c.y - aimY) <= lenU;
      }
      const relX = c.x - apex.x;
      const relY = c.y - apex.y;
      const along = relX * ux + relY * uy; // distance down the aim axis
      const perp = Math.abs(-relX * uy + relY * ux); // distance off-axis
      if (shape === "line") {
        // A 5-ft-wide lance from the caster.
        return along > 1 && along <= lenU && perp <= CELL / 2;
      }
      if (shape === "cube") {
        // Self-origin cube (Thunderwave): extends `size` out, `size` wide.
        return along > 1 && along <= lenU && perp <= lenU / 2;
      }
      // Cone: RAW footprint — length U, width U at the far edge — is exactly
      // the TRIANGLE the aim preview draws, so test that (perp grows with
      // distance). Dot-product math also has no ±180° seam, unlike the old
      // angular test (review finding: aiming west silently missed targets).
      return along > 1 && along <= lenU && perp <= along / 2;
    });
    // RAW: one damage roll for the whole area. Each caught creature then makes its
    // OWN save on its controller's screen (a monster → the DM, a PC → that player)
    // and takes half on a success — routed through the SAME cross-client save relay
    // as single-target saves, instead of the caster auto-rolling everyone. (#113)
    const dmgRoll = roll(spec.damage);
    // A save spell whose DC failed to parse still OFFERS the save at DC 10 —
    // same fallback as the single-target branch (review finding: a missing DC
    // must never silently become "no save, full damage").
    const saveDc = spec.dc ?? 10;
    const dcTxt = spec.save ? ` DC ${saveDc}` : "";
    broadcastRoll(by, [
      {
        label:
          caught.length === 0
            ? `${by} · ${spec.label} — ${dmgRoll.total} ${spec.damageType ?? "damage"} · no creatures caught`
            : `${by} · ${spec.label} — ${dmgRoll.total} ${spec.damageType ?? "damage"}${spec.save ? ` (${spec.save}${dcTxt}${spec.onSave === "none" ? "" : " for half"})` : ""}`,
        result: dmgRoll,
      },
    ]);
    caught.forEach((t) => {
      if (spec.save) {
        // Cross-client save: the target's controller rolls and applies it.
        saves.request({
          id: `area-${Date.now()}-${Math.random().toString(36).slice(2, 6)}-${t.id.slice(0, 4)}`,
          by,
          targetTokenId: t.id,
          targetLabel: t.label,
          ability: spec.save,
          dc: saveDc,
          sourceLabel: spec.label,
          onFail: "damage",
          onSave: spec.onSave ?? "half",
          damage: String(dmgRoll.total),
          damageType: spec.damageType,
        });
      } else {
        // No save on this area — everything caught takes it in full.
        const out = resolveDamage(dmgRoll.total, spec.damageType, defensesOfToken(t));
        applyDamageToToken(t, out.final);
        broadcastRoll("", [], bloomSeedFor(t, "crit", out.immune ? "immune" : String(out.final)));
      }
    });
  };

  // Does `target`'s center fall inside the lingering `area` token's footprint?
  // The board renders the shape rotated by `facing` about the area's origin, so
  // we move the point into the area's UNROTATED local frame and test the base
  // geometry — circle (sphere/emanation), rect (cube/line), or triangle (cone).
  const tokenInArea = (target: Token, area: Token): boolean => {
    const shape = area.area?.shape;
    if (!shape) return false;
    const A = centerOfToken(area);
    const P = centerOfToken(target);
    const rad = (-(area.area?.facing ?? 0) * Math.PI) / 180;
    const dx = P.x - A.x;
    const dy = P.y - A.y;
    const lx = A.x + dx * Math.cos(rad) - dy * Math.sin(rad);
    const ly = A.y + dx * Math.sin(rad) + dy * Math.cos(rad);
    const g = spellAreaGeom(A.x, A.y, shape, area.area?.size ?? 20);
    if (g.tag === "circle") return Math.hypot(lx - A.x, ly - A.y) <= g.r;
    if (g.tag === "rect") return lx >= g.x && lx <= g.x + g.w && ly >= g.y && ly <= g.y + g.h;
    const pts = g.points.split(" ").map((s) => s.split(",").map(Number) as [number, number]);
    return pointInTriangle([lx, ly], pts[0], pts[1], pts[2]);
  };

  // Apply a lingering area's ongoing effect to one creature (#126). A save-backed
  // effect is routed to the creature's OWN controller through the #113 relay (so
  // a PC rolls their own); a no-save area auto-applies. Called only from the DM's
  // client, which owns the area tokens.
  const triggerAreaEffect = (area: Token, target: Token) => {
    const eff = area.area?.effect;
    if (!eff) return;
    const src = area.label;
    const rid = `aura-${Date.now()}-${Math.random().toString(36).slice(2, 6)}-${target.id.slice(0, 4)}`;
    if (eff.condition && !eff.damage) {
      // Condition area (Web, Entangle). An already-affected creature escapes with
      // an action — it doesn't re-save each round — so only demand a save from a
      // creature not yet suffering the condition.
      if ((target.conditions ?? []).some((c) => parseCondition(c).name === eff.condition)) return;
      if (!eff.save || eff.dc == null) return;
      saves.request({
        id: rid, by: src, targetTokenId: target.id, targetLabel: target.label,
        ability: eff.save, dc: eff.dc, sourceLabel: src,
        onFail: "condition", condition: eff.condition, onSave: "none",
      });
    } else if (eff.save && eff.dc != null && eff.damage) {
      // Damage-for-half area (Wall of Fire, Moonbeam…).
      const dmgRoll = roll(eff.damage);
      saves.request({
        id: rid, by: src, targetTokenId: target.id, targetLabel: target.label,
        ability: eff.save, dc: eff.dc, sourceLabel: src,
        onFail: "damage", onSave: eff.onSave ?? "half",
        damage: String(dmgRoll.total), damageType: eff.damageType,
      });
    } else if (eff.damage) {
      // No-save area — auto-damage (e.g. Spike Growth), applied by the DM directly.
      const dmgRoll = roll(eff.damage);
      const out = resolveDamage(dmgRoll.total, eff.damageType, defensesOfToken(target));
      applyDamageToToken(target, out.final);
      broadcastRoll(
        src,
        [{ label: `${target.label} — ${src}: ${out.final} ${eff.damageType ?? "damage"}${out.note ? ` (${out.note})` : ""}`, result: dmgRoll }],
        bloomSeedFor(target, "crit", out.immune ? "immune" : String(out.final))
      );
    }
  };

  // #126: when a combatant BEGINS its turn standing inside a lingering area with
  // an ongoing effect, demand its save. Only the DM's client fires it (it owns
  // the area tokens); the save then routes to the active creature's OWN controller
  // via the #113 relay, so a player rolls their own. Keyed by (round, token, area)
  // so a mid-turn re-render can't double-apply — and reset when combat ends.
  const areaEffectFiredRef = useRef<Set<string>>(new Set());
  useEffect(() => {
    if (!init.inCombat) {
      areaEffectFiredRef.current.clear();
      return;
    }
    if (!isDM) return;
    const active = init.activeToken;
    if (!active || active.kind === "prop" || active.kind === "spell" || tokenIsDowned(active)) return;
    const turnKey = `${init.round}:${active.id}`;
    for (const area of tokensRef.current) {
      if (area.kind !== "spell" || !area.area?.effect || !area.area.shape) continue;
      if (!tokenInArea(active, area)) continue;
      const fireKey = `${turnKey}:${area.id}`;
      if (areaEffectFiredRef.current.has(fireKey)) continue;
      areaEffectFiredRef.current.add(fireKey);
      triggerAreaEffect(area, active);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isDM, init.inCombat, init.round, init.activeToken?.id]);

  // #125: tear down a concentration area when its caster stops concentrating on
  // it. Only the caster's OWN client acts — it holds the character's live
  // concentration state, and any game member may delete the token. The `!ch`
  // guard skips until the sheet has loaded, so a not-yet-synced character can't
  // nuke a freshly placed area.
  useEffect(() => {
    for (const area of tokens) {
      const conc = area.area?.conc;
      if (!conc || area.kind !== "spell") continue;
      if (!ownedCharacterIds.has(conc.characterId)) continue;
      const ch = characters.find((c) => c.id === conc.characterId);
      if (!ch) continue;
      if ((ch.spellcasting?.concentratingOn ?? null) !== conc.spell) {
        void deleteToken(area.id);
      }
    }
  }, [tokens, characters, ownedCharacterIds, deleteToken]);

  const resolveAttack = (by: string, spec: AttackSpec, target: Token, attackerId?: string) => {
    // A harmful strike that reaches a target starts combat (utility casts don't).
    startCombatIfHarmful(spec);
    // Restoration spell/item (Lesser Restoration, antitoxin…): no to-hit — strip
    // one matching condition from the target. RAW removes a single named effect,
    // so we clear the first badge whose name the spell can cure.
    if (spec.cleanse != null) {
      const cures = spec.cleanse.map((s) => s.toLowerCase());
      const held = target.conditions ?? [];
      const hit = held.find((c) => cures.includes(conditionName(c).toLowerCase()));
      if (hit) {
        const cured = conditionName(hit);
        clearCondition(target.id, cured);
        const entry: RollEntry = {
          label: `${by} → ${target.label} · ${spec.label} — cures ${cured}`,
          result: roll("1d1"),
        };
        broadcastRoll(by, [entry], bloomSeedFor(target, "normal", "✦"));
      } else {
        toast.info(`${target.label} has nothing ${spec.label} can cure.`);
      }
      return;
    }
    // Healing spell: no to-hit — roll the dice and restore HP to the chosen
    // token (which may be the caster's own). Green bloom, no AC.
    if (spec.heal != null) {
      const healRoll = roll(spec.heal);
      healToken(target.id, healRoll.total);
      const entry: RollEntry = {
        label: `${by} → ${target.label} · ${spec.label} — heals ${healRoll.total}`,
        result: healRoll,
      };
      broadcastRoll(by, [entry], bloomSeedFor(target, "normal", `+${healRoll.total}`));
      return;
    }
    // Harmful action from hiding (slice H, P3): capture whether the attacker
    // was hidden — for unseen-attacker advantage on the to-hit path — then
    // reveal (heal/cleanse above never reveal). Applies to every harmful branch.
    const attackerWasHidden = revealIfHidden(attackerId);
    // Save-or-be-conditioned spell (Hold Person, Fear, …). The caster only sets
    // the DC — the DEFENDER rolls the save, on their own screen. Emit a save
    // request that travels to whoever controls the target; resolution + the
    // condition badge happen there. See resolveSaveRequest below.
    if (spec.condition != null && spec.save) {
      const cond = spec.condition;
      const dc = spec.dc ?? 10;
      // Guard: condition immunity (statblock) and creature-type restriction
      // (Hold Person → humanoids only) — the save simply never happens.
      const immune = (target.statblock?.conditionImmunities ?? []).some(
        (ci) => conditionName(ci).toLowerCase() === cond.toLowerCase()
      );
      const wrongType =
        !!spec.restrictType &&
        !!target.statblock &&
        !target.statblock.type.toLowerCase().includes(spec.restrictType.toLowerCase());
      if (immune || wrongType) {
        toast.info(`${target.label} is unaffected by ${spec.label}.`);
        return;
      }
      saves.request({
        id: `sr-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
        by,
        targetTokenId: target.id,
        targetLabel: target.label,
        ability: spec.save,
        dc,
        sourceLabel: spec.label,
        onFail: "condition",
        condition: cond,
        onSave: "none",
      });
      toast.info(`${target.label} must make a ${spec.save} save vs ${spec.label}…`);
      return;
    }
    // Aimed area/cone (Cone of Cold): the tapped token only sets the DIRECTION.
    // Play the cone burst anchored at the caster, roll the damage, and announce
    // the save — a cone catches a wedge of creatures, so the DM adjudicates who's
    // in it and applies damage (matching how the table's other AoE saves work).
    // A cone tapped ON a token just uses that token as the aim POINT (direction);
    // the real work is point-based in resolveBurst.
    if (spec.burst) {
      const tgt = centerOfToken(target);
      resolveBurst(by, spec, attackerId, tgt.x, tgt.y);
      return;
    }
    // Save-for-damage spell aimed at ONE creature (Sacred Flame, Poison Spray,
    // Toll the Dead — slice A of the action map): no to-hit. The caster rolls
    // damage once; the DEFENDER rolls the save on their own client (the same
    // cross-client relay as areas, #113) and takes full / half / none there,
    // with their own resistances honored.
    if (spec.save && spec.damage != null && spec.condition == null) {
      const dc = spec.dc ?? 10;
      if (spec.vfx) fireSpellProjectile(spec.vfx, attackerId, target);
      const dmgRoll = roll(spec.damage);
      broadcastRoll(by, [
        {
          label: `${by} → ${target.label} · ${spec.label} — ${dmgRoll.total} ${spec.damageType ?? "damage"} (${spec.save} save DC ${dc}${spec.onSave === "half" ? " for half" : ""})`,
          result: dmgRoll,
        },
      ]);
      saves.request({
        id: `sr-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
        by,
        targetTokenId: target.id,
        targetLabel: target.label,
        ability: spec.save,
        dc,
        sourceLabel: spec.label,
        onFail: "damage",
        onSave: spec.onSave ?? "half",
        damage: String(dmgRoll.total),
        damageType: spec.damageType,
      });
      return;
    }
    // Auto-hit projectile spell (Magic Missile): no to-hit, no Shield window.
    // Fire the VFX from caster → target and land the damage on the projectile's
    // arrival, so the number pops exactly when the bolt strikes.
    if (spec.autoHit) {
      const applyHit = () => {
        if (!spec.damage) return;
        const def = defensesOfToken(target);
        const dmgRoll = roll(spec.damage);
        const out = resolveDamage(dmgRoll.total, spec.damageType, def);
        applyDamageToToken(target, out.final);
        const detail =
          out.final !== dmgRoll.total ? `${dmgRoll.detail} → ${out.final}${out.note ? ` (${out.note})` : ""}` : dmgRoll.detail;
        const entry: RollEntry = {
          label: `${by} → ${target.label} · ${spec.label} — ${out.final} ${spec.damageType ?? "damage"}${out.note ? ` (${out.note})` : ""}`,
          result: { ...dmgRoll, total: out.final, detail },
        };
        broadcastRoll(by, [entry], bloomSeedFor(target, "normal", out.immune ? "immune" : String(out.final)));
      };
      // Land the damage on the projectile's arrival; if there's no vfx, at once.
      const fired = spec.vfx ? fireSpellProjectile(spec.vfx, attackerId, target) : false;
      if (fired) window.setTimeout(applyHit, SPELL_FX_TRAVEL_MS);
      else applyHit();
      return;
    }
    // Attack-roll spell with a projectile (Fire Bolt): the bolt is cosmetic and
    // flies as the to-hit/damage resolves through the normal path below.
    if (spec.vfx) fireSpellProjectile(spec.vfx, attackerId, target);
    const ac = acOfToken(target);
    // Conditions bend the to-hit: the target may grant attackers advantage
    // (paralyzed/restrained/prone/…), the attacker may have disadvantage
    // (frightened/poisoned/…). If both apply they cancel to a straight roll.
    const tgtAgg = aggregateConditions(target.conditions ?? []);
    const attacker = attackerId ? tokens.find((t) => t.id === attackerId) : undefined;
    const atkAgg = aggregateConditions(attacker?.conditions ?? []);
    // Unseen attacker (slice H): striking from hiding grants advantage on this
    // attack (the reveal already happened above).
    const adv = tgtAgg.attackersAdvantage || attackerWasHidden;
    // Dodging (slice F): attacks against the dodger roll at disadvantage —
    // unless a condition negates the stance (incapacitated / speed 0, RAW).
    const tgtDodging =
      (target.buffs ?? []).includes("Dodging") && !tgtAgg.incapacitated && !tgtAgg.speed0;
    const dis = atkAgg.selfAttackDisadvantage || tgtDodging;
    const mode: RollMode = adv && dis ? "normal" : adv ? "adv" : dis ? "dis" : "normal";
    const hit = rollD20(spec.attackBonus, mode);
    const nat = naturalD20(hit);
    const crit = nat === 20;
    const fumble = nat === 1;
    const isHit = crit || (!fumble && (ac == null || hit.total >= ac));
    // True to rules: a hit that Shield could still turn into a miss PAUSES here.
    // The defender's controller gets a reaction window; finishAttack runs on
    // their answer (or a timeout). Everything else finalizes immediately.
    if (isHit && ac != null && offerShieldWindow(by, spec, target, hit, mode, crit, fumble, ac)) return;
    finishAttack(by, spec, target, hit, mode, crit, fumble, ac, 0);
  };

  // Finalize an attack once any reaction window has closed: recompute hit/miss
  // against the (possibly Shield-boosted) AC, then roll + apply damage and log.
  // `acBonus` is whatever a defensive reaction added (+5 for Shield).
  const finishAttack = (
    by: string,
    spec: AttackSpec,
    target: Token,
    hit: RollResult,
    mode: RollMode,
    crit: boolean,
    fumble: boolean,
    baseAc: number | null,
    acBonus: number,
    reactionLabel?: string
  ) => {
    const ac = baseAc == null ? null : baseAc + acBonus;
    const isHit = crit || (!fumble && (ac == null || hit.total >= ac));
    const modeTag = mode === "adv" ? " (adv)" : mode === "dis" ? " (dis)" : "";
    const reactTag = acBonus > 0 ? ` (${reactionLabel ?? "reaction"} +${acBonus})` : "";
    const acLabel = ac != null ? ` vs AC ${ac}${reactTag}` : "";
    const entries: RollEntry[] = [
      {
        label: `${by} → ${target.label} · ${spec.label}${acLabel}${modeTag} — ${isHit ? (crit ? "crit!" : "hit") : "miss"}`,
        result: hit,
      },
    ];
    const tone: RollTone = crit ? "crit" : isHit ? "normal" : "fumble";
    let bloomText = isHit ? "hit" : "miss";
    if (isHit && spec.damage) {
      const def = defensesOfToken(target);
      const dmgRoll = roll(crit ? doubleDmg(spec.damage) : spec.damage);
      const out = resolveDamage(dmgRoll.total, spec.damageType, def);
      applyDamageToToken(target, out.final);
      const detail =
        out.final !== dmgRoll.total ? `${dmgRoll.detail} → ${out.final}${out.note ? ` (${out.note})` : ""}` : dmgRoll.detail;
      entries.push({
        label: `${spec.label} — ${out.final} ${spec.damageType ?? "damage"}${out.note ? ` (${out.note})` : ""}`,
        result: { ...dmgRoll, total: out.final, detail },
      });
      bloomText = out.immune ? "immune" : String(out.final);

      // Offer a damage-halving reaction while it can still matter: only when we
      // actually wrote HP (so there's something to give back) and halving would
      // change the number. Stacks correctly with resistance — the resolver
      // recomputes from the same raw roll with the reaction applied.
      const halvedOut = resolveDamage(dmgRoll.total, spec.damageType, def, { reactionHalves: true });
      // The halve reaction belongs to the DEFENDER's controller, not whoever
      // resolved the attack. BROADCAST the offer (resolveAttack runs on the
      // attacker's client); it lands in every client's pending and only the one
      // that CONTROLS the target shows the prompt (see the halve offer render).
      if (halvedOut.final < out.final) {
        const rid = `halve-${Date.now()}-${Math.random().toString(36).slice(2, 6)}-${target.id.slice(0, 4)}`;
        reactions.offer({
          id: rid,
          kind: "halve",
          by,
          targetTokenId: target.id,
          targetLabel: target.label,
          sourceLabel: spec.label,
          applied: out.final,
          halved: halvedOut.final,
          damageType: spec.damageType,
        });
        reactionTimers.current[rid] = window.setTimeout(() => reactions.clear(rid), 7000);
      }
    }
    // Thrown weapon (slice E): hit or miss, the weapon LEAVES the thrower's
    // hand — remove one from their sheet (their own client resolved this
    // attack, so the owner-side write is safe) and drop it at the target's
    // cell as a ground pickup. Walking adjacent + Loot returns it; the drop
    // token removes itself once emptied (loot.dropped).
    if (spec.thrownItem) {
      const { characterId, itemId } = spec.thrownItem;
      const ch = characters.find((x) => x.id === characterId);
      const item = ch?.inventory.find((i) => i.id === itemId);
      if (ch && item) {
        void onUpdateCharacter(characterId, (cc) => ({
          ...cc,
          inventory: cc.inventory
            .map((i) => (i.id === itemId ? { ...i, qty: i.qty - 1 } : i))
            .filter((i) => i.qty > 0),
        }));
        void addToken({
          label: item.name,
          kind: "prop",
          size: "tiny",
          x: target.x,
          y: target.y,
          image_url: item.art ?? null,
          color: "#8a7b5c",
          loot: {
            coins: {},
            items: [{
              id: `drop-${Date.now().toString(36)}`,
              name: item.name,
              qty: 1,
              kind: item.type,
              damage: item.damage,
              damageType: item.damageType,
              weight: item.weight,
              value: item.cost,
              notes: item.properties?.join(", "),
              // Keep weapon traits so the retrieved weapon stays finesse /
              // throwable with its range (review fix).
              properties: item.properties,
              finesse: item.finesse,
              range: item.range,
            }],
            dropped: true,
          },
        });
        entries.push({
          label: `${item.name} lands at ${target.label}'s feet`,
          result: roll("1d1"),
        });
      }
    }
    // Condition rider (slice D): a hit that carries one (ghoul claw → paralyze,
    // chain → grapple). A rider WITH a save demands it on the defender's client
    // (fail → the condition, encoded with its end-of-turn shake-off save). A
    // save-less rider (grapple) applies straight away — its escape is a later
    // action, not an end-of-turn save. Immunity/already-held are guarded.
    if (isHit && spec.rider) {
      const r = spec.rider;
      const immune = (target.statblock?.conditionImmunities ?? []).some(
        (ci) => conditionName(ci).toLowerCase() === r.condition.toLowerCase()
      );
      if (!immune) {
        if (r.save) {
          saves.request({
            id: `sr-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
            by,
            targetTokenId: target.id,
            targetLabel: target.label,
            ability: r.save,
            dc: r.dc,
            sourceLabel: spec.label,
            onFail: "condition",
            condition: r.condition,
            onSave: "none",
          });
        } else {
          applyConditionEncoded(target, r.condition);
        }
      }
    }
    broadcastRoll(by, entries, bloomSeedFor(target, tone, bloomText));
  };

  // Close a reaction window exactly once (a response OR the timeout): tear the
  // offer down everywhere and run the stored continuation with the answer.
  const resolveReaction = (id: string, resp: ReactionResponse) => {
    const cont = reactionContRef.current[id];
    if (!cont) return; // already resolved (guards timeout-vs-response races)
    delete reactionContRef.current[id];
    const to = reactionTimers.current[id];
    if (to) {
      window.clearTimeout(to);
      delete reactionTimers.current[id];
    }
    setAwaitingReaction((a) => (a?.id === id ? null : a));
    reactions.clear(id);
    cont(resp);
  };
  // (reactionResolveRef is assigned in the counterspell block, dispatching by kind.)

  // Attacker: a hit that Shield could flip opens a reaction window — pause,
  // offer it to the target's controller, and defer finishAttack. Returns true
  // when a window opened. Gated so the prompt is never noise: linked PC only,
  // knows Shield, has a slot open, not a crit, and +5 could actually save them.
  const offerShieldWindow = (
    by: string,
    spec: AttackSpec,
    target: Token,
    hit: RollResult,
    mode: RollMode,
    crit: boolean,
    fumble: boolean,
    baseAc: number
  ): boolean => {
    // A crit auto-hits regardless of AC, so Shield can't stop the triggering
    // blow — no window. Otherwise offer on any hit the caster could Shield (it
    // also lasts the round, so it's worth casting even when it won't flip this
    // one); the defender's client makes the final availability call.
    if (crit || fumble) return false;
    if (!shieldSourceForToken(target)) return false;
    const id = `rx-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
    reactionContRef.current[id] = (resp) =>
      finishAttack(by, spec, target, hit, mode, crit, fumble, baseAc, resp.acBonus ?? 0, resp.label);
    setAwaitingReaction({ id, targetLabel: target.label });
    reactions.offer({
      id,
      kind: "shield",
      by,
      targetTokenId: target.id,
      targetLabel: target.label,
      sourceLabel: spec.label,
      toHit: hit.total,
      baseAc,
    });
    reactionTimers.current[id] = window.setTimeout(() => resolveReaction(id, { id, kind: "shield", acBonus: 0 }), 12000);
    return true;
  };

  // --- Hostility & Movement-triggered Opportunity Attacks (#101) -----------
  // A player character is always party-side; a placed creature uses its DM-set
  // disposition, defaulting to hostile when unset. Two creatures are enemies
  // when their dispositions differ — that's what provokes an OA.
  const dispositionOf = (t: Token): "friendly" | "hostile" =>
    t.character_id ? "friendly" : t.disposition ?? "hostile";
  const areEnemies = (a: Token, b: Token): boolean => dispositionOf(a) !== dispositionOf(b);

  // A token's board ring color, so its SIDE reads at a glance for everyone: gold
  // for a player character, red for hostile, green for friendly. Props and spell
  // areas aren't combatants — they keep their own assigned color.
  const ringColorFor = (t: Token): string => {
    if (t.kind === "prop" || t.kind === "spell") return t.color;
    // Sides only read DURING a fight; out of combat every token keeps its own
    // assigned color so the board isn't a wall of red/green.
    if (!init.inCombat) return t.color;
    if (t.character_id) return "#e6b34c"; // gold — party side
    return dispositionOf(t) === "friendly" ? "#5fae5f" : "#d9534f"; // green / red
  };

  // DM flips a creature between hostile and friendly (from the tracker). PCs are
  // always party-side, so their disposition is not editable.
  const toggleDisposition = (t: Token) => {
    if (!isDM || t.character_id) return;
    void updateToken(t.id, { disposition: dispositionOf(t) === "hostile" ? "friendly" : "hostile" });
  };

  // A creature's first MELEE attack, as an AttackSpec — the OA it makes when a
  // foe leaves its reach. Null if it has no melee option (pure caster/ranged).
  const oaMeleeSpec = (r: Token): AttackSpec | null => {
    if (r.statblock) {
      const a = (r.statblock.actions ?? []).find(
        (x) => x.attackBonus != null && !/multiattack/i.test(x.name) && (attackRangeFt(x.reach) ?? 5) <= 10
      );
      return a
        ? { label: a.name, attackBonus: a.attackBonus ?? 0, damage: a.damage, damageType: a.damageType, range: a.reach ?? "5 ft" }
        : null;
    }
    const c = r.character_id ? characters.find((x) => x.id === r.character_id) : undefined;
    if (!c) return null;
    const atks = resolveAttacks(c);
    const atk = atks.find((x) => (attackRangeFt(x.range) ?? 5) <= 10) ?? atks[0];
    if (!atk) return null;
    const mod = damageBonus(c, atk);
    const dmg = mod === 0 ? atk.damage : `${atk.damage}${mod >= 0 ? "+" : ""}${mod}`;
    return { label: atk.name, attackBonus: attackBonus(c, atk), damage: dmg, damageType: atk.damageType, range: atk.range ?? "5 ft" };
  };

  // The reactor's OA reach (in cells) + a display label, computed on the MOVER's
  // client. A monster reads its own statblock (present on every client via the
  // token). A player character reads its sheet IF this client has it — but the DM
  // moving a monster does NOT have the players' sheets, so a PC falls back to a
  // basic 5 ft melee. That's enough to broadcast the offer; the reactor's OWN
  // client (which has the sheet) re-derives and runs the real attack. Without
  // this, a hostile token leaving a PC's reach never provoked when the DM did the
  // moving — only PC-leaves-monster worked (monsters resolve locally).
  const oaReach = (r: Token): { cells: number; label: string } | null => {
    const spec = oaMeleeSpec(r);
    if (spec) return { cells: Math.max(1, Math.round((attackRangeFt(spec.range) ?? 5) / 5)), label: spec.label };
    if (r.character_id) return { cells: 1, label: "Opportunity Attack" }; // PC sheet not on this client
    return null; // a monster with genuinely no melee attack — no OA
  };

  // On a committed move (see onDragUpRef), offer an OA to every enemy whose reach
  // the mover just LEFT — was within reach at the old cell, out of it at the new.
  // The offer is broadcast; only that enemy's controller is prompted. Enemy =
  // opposite faction (PC token ↔ monster/DM token); there is no attitude model.
  const maybeProvokeOAs = (mover: Token, oldX: number, oldY: number, newX: number, newY: number) => {
    if (!init.inCombat || mover.kind === "prop" || mover.kind === "spell") return;
    const at = (x: number, y: number): Token => ({ ...mover, x, y });
    for (const r of tokens) {
      if (r.id === mover.id || r.kind === "prop" || r.kind === "spell" || r.hidden) continue;
      if ((r.hp_current ?? 1) <= 0) continue;
      if (!areEnemies(mover, r)) continue; // only opposing dispositions provoke
      if (aggregateConditions(r.conditions ?? []).incapacitated) continue;
      const reach = oaReach(r);
      if (!reach) continue;
      const reachCells = reach.cells;
      if (footprintGap(r, at(oldX, oldY)) <= reachCells && footprintGap(r, at(newX, newY)) > reachCells) {
        const id = `oa-${Date.now()}-${Math.random().toString(36).slice(2, 6)}-${r.id.slice(0, 4)}`;
        reactions.offer({
          id,
          kind: "opportunity",
          by: mover.label,
          targetTokenId: r.id,
          targetLabel: r.label,
          sourceLabel: reach.label,
          moverTokenId: mover.id,
          moverLabel: mover.label,
        });
        reactionTimers.current[id] = window.setTimeout(() => reactions.clear(id), 15000);
      }
    }
  };

  // Reactor's controller took the OA: run their melee attack at the mover through
  // the normal resolution (to-hit → damage → log), spend the reaction, tear the
  // offer down everywhere.
  const runOpportunityAttack = (offer: ReactionOffer) => {
    reactions.respond({ id: offer.id, kind: "opportunity", label: "Opportunity Attack" });
    const reactor = tokens.find((t) => t.id === offer.targetTokenId);
    const mover = offer.moverTokenId ? tokens.find((t) => t.id === offer.moverTokenId) : undefined;
    if (!reactor || !mover) return;
    const spec = oaMeleeSpec(reactor);
    if (!spec) return;
    markEconomy(reactor.id, "reaction");
    resolveAttack(`${reactor.label} (Opportunity Attack)`, spec, mover, reactor.id);
  };

  // The defender's controller took a broadcast halve offer: spend the reaction,
  // give back the difference (the attacker already applied the full hit), and
  // log it — then tear the offer down everywhere. Runs on the DEFENDER's client,
  // which owns the target's HP, so the write is always allowed.
  const takeHalve = (off: ReactionOffer) => {
    reactions.clear(off.id);
    const target = tokens.find((t) => t.id === off.targetTokenId);
    if (!target || off.applied == null || off.halved == null) return;
    markEconomy(target.id, "reaction"); // the defender spent its reaction
    const giveBack = off.applied - off.halved;
    if (giveBack > 0) healToken(target.id, giveBack);
    const detail = `reaction — halved to ${off.halved}`;
    broadcastRoll(off.by, [
      {
        label: `${off.targetLabel} — reaction · ${off.sourceLabel} halved to ${off.halved} ${off.damageType ?? "damage"}`,
        result: { expression: "reaction", rolls: [], modifier: 0, total: off.halved, detail },
      },
    ], bloomSeedFor(target, "normal", String(off.halved)));
  };

  // ---- Shield reaction (defender side) --------------------------------------
  // Is Shield actually castable right now for this offer's target? (Reaction
  // unspent + a slot open.) Drives both the prompt and the auto-decline.
  const shieldReadyFor = useCallback(
    (offer: ReactionOffer): boolean => {
      if (economy[offer.targetTokenId]?.reaction) return false; // reaction already spent
      const t = tokens.find((x) => x.id === offer.targetTokenId);
      return !!t && shieldSourceForToken(t) != null;
    },
    // shieldSourceForToken closes over the same inputs listed here.
    [economy, tokens, characters, classes, tables]
  );

  const declineReaction = useCallback(
    (offer: ReactionOffer) => reactions.respond({ id: offer.id, kind: "shield", acBonus: 0 }),
    [reactions]
  );

  // Cast Shield in response: spend the reaction (and a PC's lowest slot), log to
  // the table, and answer +5 AC so the attacker recomputes the hit.
  const castShieldReaction = (offer: ReactionOffer) => {
    const t = tokens.find((x) => x.id === offer.targetTokenId);
    const src = t ? shieldSourceForToken(t) : null;
    if (!t || !src) {
      declineReaction(offer);
      return;
    }
    markEconomy(offer.targetTokenId, "reaction");
    if (src.kind === "pc") {
      // Persist the spent slot on the owned character.
      void onUpdateCharacter(src.character.id, (ch) => {
        const sc = ch.spellcasting ?? { known: [], prepared: [], slotsUsed: {} };
        const lvl = String(src.slotLevel);
        return { ...ch, spellcasting: { ...sc, slotsUsed: { ...sc.slotsUsed, [lvl]: (sc.slotsUsed[lvl] ?? 0) + 1 } } };
      });
    }
    // (Statblock casters: monster slots aren't tracked centrally — the reaction
    //  economy is the meaningful cost, and it's logged below.)
    broadcastRoll(t.label, [
      {
        label: `${t.label} casts Shield (reaction) — +5 AC vs ${offer.sourceLabel}`,
        result: { expression: "reaction", rolls: [], modifier: 0, total: 0, detail: "+5 AC" },
      },
    ]);
    reactions.respond({ id: offer.id, kind: "shield", acBonus: 5, label: "Shield" });
  };

  // Auto-decline any offer I control but can't answer (reaction spent / no slot)
  // so the attacker isn't left waiting on a dead option.
  useEffect(() => {
    for (const o of reactions.pending) {
      if (o.kind !== "shield") continue; // counterspell declines are local-only (see below)
      const t = tokens.find((x) => x.id === o.targetTokenId);
      if (t && iControlToken(t) && !shieldReadyFor(o)) declineReaction(o);
    }
  }, [reactions.pending, tokens, iControlToken, shieldReadyFor, declineReaction]);

  // Prune locally-dismissed counterspell offers once they leave the pending set.
  useEffect(() => {
    setDismissedCounters((prev) => {
      const live = new Set(reactions.pending.map((o) => o.id));
      const next = new Set([...prev].filter((id) => live.has(id)));
      return next.size === prev.size ? prev : next;
    });
  }, [reactions.pending]);

  // ---- Counterspell window (caster + reactor sides) -------------------------
  // Caster side: opened from the HUD as a spell is cast. Resolves with whether
  // the spell was countered. Skipped (resolves false at once) when no one nearby
  // could counter, so a normal cast isn't paused.
  const counterspellCheck = (
    casterToken: Token,
    casterName: string,
    spellName: string,
    level: number
  ): Promise<boolean> =>
    new Promise((resolve) => {
      if (!init.inCombat || level < 1 || !anyPotentialCounterspeller(casterToken)) {
        resolve(false);
        return;
      }
      const id = `cs-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
      counterspellRef.current[id] = { resolve, casterTokenId: casterToken.id, spell: spellName };
      setAwaitingCounter({ id, spell: spellName });
      reactions.offer({
        id,
        kind: "counterspell",
        by: casterName,
        targetTokenId: casterToken.id,
        targetLabel: casterToken.label,
        sourceLabel: spellName,
        spellLevel: level,
      });
      counterspellTimers.current[id] = window.setTimeout(() => finishCounter(id, { counter: false }), 12000);
    });

  // A counter response (or the timeout) arrives on the caster's client. A real
  // counter demands the caster's OWN CON save (vs the counterspeller's DC) — the
  // window's promise stays open until that save resolves; otherwise it's a pass.
  const finishCounter = (id: string, resp: { counter?: boolean; counterDc?: number; counterBy?: string }) => {
    const entry = counterspellRef.current[id];
    if (!entry) return;
    const to = counterspellTimers.current[id];
    if (to) {
      window.clearTimeout(to);
      delete counterspellTimers.current[id];
    }
    setAwaitingCounter((a) => (a?.id === id ? null : a));
    reactions.clear(id);
    delete counterspellRef.current[id]; // window consumed — later duplicates no-op
    if (resp.counter && resp.counterDc != null) {
      pendingCounterResolveRef.current = entry.resolve; // settled by the CON save
      setCasterCounterSave({
        id,
        dc: resp.counterDc,
        by: resp.counterBy ?? "Counterspell",
        spell: entry.spell,
        casterTokenId: entry.casterTokenId,
      });
    } else {
      entry.resolve(false);
    }
  };
  reactionResolveRef.current = (resp) => {
    if (resp.kind === "counterspell") return finishCounter(resp.id, resp);
    // OA resolves on the reactor's own client; the mover's side just clears its
    // auto-expire timer once the offer is answered (or already torn down).
    if (resp.kind === "opportunity") {
      const tm = reactionTimers.current[resp.id];
      if (tm) {
        window.clearTimeout(tm);
        delete reactionTimers.current[resp.id];
      }
      return;
    }
    return resolveReaction(resp.id, resp);
  };

  // The caster's CON save landed: success = spell holds (not countered).
  const resolveCounterSave = (countered: boolean) => {
    const resolve = pendingCounterResolveRef.current;
    pendingCounterResolveRef.current = null;
    setCasterCounterSave(null);
    resolve?.(countered);
  };

  // Reactor side: cast Counterspell in response — spend reaction + a 3rd+ slot,
  // log it, and answer with the counterspeller's spell save DC.
  const doCounterspell = (offer: ReactionOffer) => {
    const cst = counterspellerFor(offer);
    const src = cst ? counterSourceForToken(cst) : null;
    if (!cst || !src) return;
    markEconomy(cst.id, "reaction");
    let dc = 13;
    if (src.kind === "pc") {
      const cc = casterClass(src.character, classes);
      dc = (cc ? spellSaveDC(src.character, cc.name) : null) ?? 13;
      void onUpdateCharacter(src.character.id, (ch) => {
        const sc = ch.spellcasting ?? { known: [], prepared: [], slotsUsed: {} };
        const lvl = String(src.slotLevel);
        return { ...ch, spellcasting: { ...sc, slotsUsed: { ...sc.slotsUsed, [lvl]: (sc.slotsUsed[lvl] ?? 0) + 1 } } };
      });
    } else {
      dc = src.dc;
    }
    broadcastRoll(cst.label, [
      {
        label: `${cst.label} casts Counterspell on ${offer.by}'s ${offer.sourceLabel}!`,
        result: { expression: "reaction", rolls: [], modifier: 0, total: 0, detail: "reaction" },
      },
    ]);
    reactions.respond({ id: offer.id, kind: "counterspell", counter: true, counterDc: dc, counterBy: cst.label });
  };

  // One <path> holding every fogged cell as a subpath — hundreds of rects
  // would bloat the DOM; a single path renders cheaply at any grid size.
  const fogPath = useMemo(() => {
    if (!fog.enabled) return null;
    let d = "";
    for (let y = 0; y < rows; y++) {
      for (let x = 0; x < cols; x++) {
        if (!fog.revealed.has(y * cols + x)) {
          d += `M${x * CELL},${y * CELL}h${CELL}v${CELL}h${-CELL}z`;
        }
      }
    }
    return d || null;
  }, [fog.enabled, fog.revealed, cols, rows]);

  // Tokens with a saving throw still pending — the caster sees a casting loader.
  const savePendingIds = new Set(saves.pending.map((r) => r.targetTokenId));

  const svgCursor = pendingSteal || stealing
    ? ANIMATED_CURSOR
      ? "none"
      : PINCH_CURSOR
    : pendingMove
    ? "crosshair"
    : pendingAttack
    ? ANIMATED_CURSOR
      ? "none"
      : SWORD_CURSOR
    : panning
    ? "grabbing"
    : spaceHeld || tool === "pan"
      ? "grab"
      : tool === "ping" || tool === "ruler" || tool === "fog" || tool === "draw"
        ? "crosshair"
        : "default";

  return (
    <div className="table-shell" ref={shellRef}>
      <RotateHint />
      {/* Header */}
      <header className="table-header">
        <button
          className="ghost table-back"
          onClick={onBack}
          title="Back to campaigns"
          style={{ fontSize: 12, padding: "4px 10px", display: "inline-flex", alignItems: "center", gap: 6 }}
        >
          <Icon name="back" size={14} />
          <span className="table-back-label">Games</span>
        </button>

        {/* Scene selector — DM-only quick switcher (#IA rework). Players just
            see where they are; they navigate via regional-map hotspots. */}
        <div style={{ position: "relative" }} ref={sceneMenuRef}>
          <button
            className="ghost"
            onClick={() => {
              if (!isDM) return;
              setScenesOpen((v) => !v);
              setCardMenuId(null);
            }}
            style={{
              fontSize: 13,
              padding: "4px 10px",
              display: "inline-flex",
              alignItems: "center",
              gap: 6,
              cursor: isDM ? "pointer" : "default",
            }}
            title={isDM ? "Switch or create a scene" : "Current scene"}
          >
            <span className="scene-name">{activeScene?.name ?? "No scene"}</span>
            {isDM && <Icon name="down" size={14} />}
          </button>
          {/* Session control (#0041) — the DM's recording boundary. */}
          {isDM && (
            <span style={{ marginLeft: 8 }}>
              {activeSession ? (
                <button
                  className="session-chip is-live"
                  title={`Recording since ${new Date(activeSession.started_at).toLocaleTimeString()} — click to end`}
                  onClick={async () => {
                    if (
                      await confirm({
                        title: `End Session ${activeSession.number}?`,
                        message: `${sessionDuration(activeSession)} recorded. The log keeps working between sessions, but it's off the record until you start the next one.`,
                        confirmLabel: "End session",
                      })
                    ) {
                      const { error } = await endSession(activeSession.id);
                      if (error) {
                        toast.error(error);
                        return;
                      }
                      // The recap moment (#0041 slice 1d): the Scribe reads
                      // exactly this session's log while it's fresh.
                      if (
                        await confirm({
                          title: `Session ${activeSession.number} ended`,
                          message: `${sessionDuration(activeSession)} on the record. Have the Scribe draft a player-facing recap from the log now? You can edit it on the campaign Timeline.`,
                          confirmLabel: "Draft a recap",
                        })
                      ) {
                        toast.info("The Scribe is reading the session log…");
                        const { text, error: scribeErr } = await draftRecap(game.id, activeSession.id);
                        if (scribeErr || !text) toast.error(scribeErr ?? "The Scribe returned nothing");
                        else {
                          const { error: docErr } = await createStoryDoc({
                            kind: "recap",
                            session_id: activeSession.id,
                            title: `Session ${activeSession.number} recap`,
                            content: text,
                            visibility: "players",
                          });
                          if (docErr) toast.error(docErr);
                          else toast.success("Recap drafted — find it on the campaign Timeline, or present it next session.");
                        }
                      }
                    }
                  }}
                >
                  <span className="session-dot" />
                  Session {activeSession.number} · recording
                </button>
              ) : (
                <button
                  className="session-chip"
                  title="Start recording — rolls, chat, and scene changes go on the record for the recap"
                  onClick={async () => {
                    const { session, error } = await startSession();
                    if (error) toast.error(error);
                    else if (session) toast.success(`Session ${session.number} started — the table is on the record.`);
                  }}
                >
                  ▶ Start session{sessions.length ? ` ${sessions.length + 1}` : ""}
                </button>
              )}
            </span>
          )}
          {scenesOpen && (
            <div
              className="panel"
              style={{
                position: "absolute",
                top: "100%",
                left: 0,
                marginTop: 4,
                zIndex: 50,
                minWidth: 320,
                padding: 8,
                display: "flex",
                flexDirection: "column",
                gap: 2,
                boxShadow: "var(--shadow-lg)",
              }}
            >
            <div className="scene-gallery">
            {scenes.map((s) => {
              const thumb = s.cinematic_url ?? s.image_url ?? null;
              const isActive = s.id === activeScene?.id;
              return (
                <div
                  key={s.id}
                  className={`scene-card ${isActive ? "is-live" : ""}`}
                  role="button"
                  tabIndex={0}
                  aria-current={isActive}
                  onClick={async () => {
                    if (isDM && !isActive) {
                      await setActiveScene(s.id);
                      // System event (#0041): scene changes are part of the
                      // session record — they let recaps and chapter progress
                      // know where the party actually went.
                      if (authUser)
                        appendGameLog({
                          game_id: game.id,
                          session_id: activeSessionRef.current?.id ?? null,
                          kind: "system",
                          author_id: authUser.id,
                          author_name: myName,
                          body: { type: "scene_staged", scene: s.name },
                        });
                    }
                    setScenesOpen(false);
                  }}
                  title={isDM ? "Switch to this scene" : isActive ? "Current scene" : "Only the DM can switch scenes"}
                  style={{ cursor: isDM || isActive ? "pointer" : "default" }}
                >
                  <div
                    className="scene-card-thumb"
                    style={thumb ? { backgroundImage: `url("${thumb}")` } : undefined}
                  >
                    {!thumb && <Icon name="image" size={16} />}
                    {isActive && <span className="scene-card-live">Live</span>}
                    {isDM && scenes.length > 1 && (
                      <span
                        className="scene-card-del"
                        aria-label="Delete scene"
                        title="Delete scene"
                        onClick={async (e) => {
                          e.stopPropagation();
                          if (
                            await confirm({
                              title: "Delete scene",
                              message: `Delete "${s.name}"? Its tokens will be lost.`,
                              confirmLabel: "Delete",
                              danger: true,
                            })
                          ) {
                            await deleteScene(s.id);
                          }
                        }}
                      >
                        <Icon name="delete" size={12} />
                      </span>
                    )}
                  </div>
                  <div className="scene-card-foot">
                    <span
                      className="scene-card-name"
                      style={cardMenuId === s.id ? { visibility: "hidden" } : undefined}
                    >
                      {s.name}
                    </span>
                    {isDM && (
                      <span
                        className={`scene-card-more ${cardMenuId === s.id ? "is-open" : ""}`}
                        aria-label={`Options for ${s.name}`}
                        title="Scene options"
                        onClick={(e) => {
                          e.stopPropagation();
                          setCardMenuId((cur) => (cur === s.id ? null : s.id));
                        }}
                      >
                        <Icon name="more" size={12} />
                      </span>
                    )}
                  </div>

                  {/* Per-scene face actions (#IA rework) — contextual, not global.
                      Any click on the overlay (including after an action) closes
                      it, so it never traps the user. */}
                  {cardMenuId === s.id && isDM && (
                    <div
                      className="scene-card-menu"
                      onClick={(e) => {
                        e.stopPropagation();
                        setCardMenuId(null);
                      }}
                    >
                      <button
                        onClick={async () => {
                          setCardMenuId(null);
                          const name = await prompt({
                            title: "Rename scene",
                            subtitle: "Give it a new name",
                            initialValue: s.name,
                            confirmLabel: "Rename",
                          });
                          if (name && name !== s.name) {
                            const { error } = await renameScene(s.id, name);
                            if (error) toast.error(error);
                          }
                        }}
                      >
                        <Icon name="edit" size={12} /> Rename…
                      </button>
                      <button
                        onClick={() => {
                          setPickerSceneId(s.id);
                          setPickerTarget("tactical");
                          setPickerOpen(true);
                          setCardMenuId(null);
                          setScenesOpen(false);
                        }}
                      >
                        <Icon name="library" size={12} /> Set battlemap…
                      </button>
                      <button
                        onClick={() => {
                          setPickerSceneId(s.id);
                          setPickerTarget("cinematic");
                          setPickerOpen(true);
                          setCardMenuId(null);
                          setScenesOpen(false);
                        }}
                      >
                        <Icon name="drama" size={12} /> Set backdrop…
                      </button>
                      {/* Clearing a face lives inside the picker now (a lead
                          "Clear" tile) — set + clear in one place. */}
                    </div>
                  )}
                </div>
              );
            })}
            </div>
            {/* Face actions live on each card's ⋯ menu; generation lives in the
                Maps editor (#IA rework). This footer is just the game verbs. */}
            {isDM && (
              <button
                className="ghost"
                onClick={async () => {
                  setScenesOpen(false);
                  const name = await prompt({
                    title: "New scene",
                    subtitle: "Give it a name — pick its battlemap and backdrop from your Maps library",
                    initialValue: `Scene ${scenes.length + 1}`,
                    confirmLabel: "Create scene",
                  });
                  if (!name) return;
                  const { scene, error } = await createScene(name);
                  if (scene) {
                    await setActiveScene(scene.id);
                    if (authUser)
                      appendGameLog({
                        game_id: game.id,
                        session_id: activeSessionRef.current?.id ?? null,
                        kind: "system",
                        author_id: authUser.id,
                        author_name: myName,
                        body: { type: "scene_staged", scene: scene.name },
                      });
                  }
                  if (error) toast.error(error);
                }}
                style={{ fontSize: 12, marginTop: 4, borderTop: "1px solid var(--line)", paddingTop: 8 }}
              >
                + New Scene
              </button>
            )}
            {isDM && (
              <button
                className="ghost"
                onClick={async () => {
                  setScenesOpen(false);
                  const { error } = await gatherParty();
                  if (error) toast.error(error);
                  else toast.success("Party gathered to the live scene");
                }}
                style={{ fontSize: 12, display: "inline-flex", alignItems: "center", gap: 8 }}
                title="Pull every player back to the live (stage) scene"
              >
                <Icon name="users" size={14} />
                Gather party here
              </button>
            )}
            </div>
          )}
        </div>

        {/* DM-only face toggle (#Phase 1). Flips the active scene between its
            cinematic backdrop and its tactical battlemap; players follow live. */}
        {isDM && activeScene && (
          <div className="scene-mode-toggle" role="group" aria-label="Scene face">
            <button
              className={(activeScene.mode ?? "tactical") === "cinematic" ? "is-on" : ""}
              onClick={() => setSceneMode(activeScene.id, "cinematic")}
              title="Cinematic — show players the atmospheric backdrop"
            >
              <Icon name="drama" size={13} />
              <span>Cinematic</span>
            </button>
            <button
              className={(activeScene.mode ?? "tactical") === "tactical" ? "is-on" : ""}
              onClick={() => setSceneMode(activeScene.id, "tactical")}
              title="Tactical — show the battlemap grid"
            >
              <Icon name="grid" size={13} />
              <span>Tactical</span>
            </button>
          </div>
        )}

        {/* The join code no longer lives in the top bar — inviting is now an
            action in the Party panel (Copy invite link). See PartyTray. */}

        {/* Brief load cue only — the persistent token count was ambient chrome
            competing with the scene, so it's gone once the table is ready. The
            right-alignment spacer role now lives on the zoom cluster below. */}
        {loading && (
          <span className="dim table-token-count" style={{ fontSize: 12 }}>
            Loading table…
          </span>
        )}

        <div className="zoom-cluster" style={{ marginLeft: "auto" }}>
          <button
            className="rail-tool zoom-step"
            style={{ width: 30, height: 30 }}
            onClick={() => setZoom((z) => Math.max(MIN_ZOOM, z / 1.25))}
            title="Zoom out"
            aria-label="Zoom out"
          >
            <Icon name="zoom-out" size={14} />
          </button>
          <span className="pct">{Math.round(zoom * 100)}%</span>
          <button
            className="rail-tool zoom-step"
            style={{ width: 30, height: 30 }}
            onClick={() => setZoom((z) => Math.min(MAX_ZOOM, z * 1.25))}
            title="Zoom in"
            aria-label="Zoom in"
          >
            <Icon name="zoom-in" size={14} />
          </button>
          <button
            className="rail-tool"
            style={{ width: 30, height: 30 }}
            onClick={resetView}
            title="Reset view"
            aria-label="Reset view"
          >
            <Icon name="reset" size={14} />
          </button>
          {isDM && (
            <button
              className="rail-tool"
              style={{ width: 30, height: 30 }}
              onClick={() =>
                window.open(
                  `${window.location.origin}${window.location.pathname}#/display/${game.id}`,
                  "_blank",
                  "noopener"
                )
              }
              title="Open player view — a read-only board in a new tab, for casting to a screen"
              aria-label="Open player view"
            >
              <Icon name="eye" size={14} />
            </button>
          )}
          <button
            className="rail-tool"
            style={{ width: 30, height: 30 }}
            onClick={toggleFullscreen}
            title={isFullscreen ? "Exit fullscreen" : "Fullscreen"}
            aria-label={isFullscreen ? "Exit fullscreen" : "Fullscreen"}
          >
            <Icon name="fullscreen" size={14} />
          </button>
        </div>
      </header>

      {/* Body: left tool rail + board */}
      <div className="table-body">
        <div className="table-rail">
          <div className="rail-group-label">Tools</div>
          <button
            className={`rail-tool ${tool === "select" ? "active" : ""}`}
            onClick={() => setTool("select")}
            title="Select & move tokens"
            aria-label="Select tool"
          >
            <Icon name="select" size={18} />
          </button>
          <button
            className={`rail-tool ${tool === "pan" ? "active" : ""}`}
            onClick={() => setTool("pan")}
            title="Pan the view (or hold Space)"
            aria-label="Pan tool"
          >
            <Icon name="pan" size={18} />
          </button>
          <button
            className={`rail-tool ${tool === "ruler" ? "active" : ""}`}
            onClick={() => setTool("ruler")}
            title="Ruler — drag to measure (5 ft per square)"
            aria-label="Ruler tool"
          >
            <Icon name="ruler" size={18} />
          </button>
          <button
            className={`rail-tool ${tool === "ping" ? "active" : ""}`}
            onClick={() => setTool("ping")}
            title="Ping — pulse a point every player can see"
            aria-label="Ping tool"
          >
            <Icon name="ping" size={18} />
          </button>
          {isDM && (
            <button
              className={`rail-tool ${tool === "fog" ? "active" : ""} ${fog.enabled ? "is-live" : ""}`}
              onClick={() => {
                setTool("fog");
                setPartyOpen(false); // both panels live top-left; one at a time
              }}
              title="Fog of war — reveal or cover the map"
              aria-label="Fog of war tool"
            >
              <Icon name="fog" size={18} />
            </button>
          )}
          <button
            className={`rail-tool ${tool === "draw" ? "active" : ""}`}
            onClick={() => {
              setTool("draw");
              setPartyOpen(false);
            }}
            title="Draw — pen, shapes, and arrows everyone sees"
            aria-label="Draw tool"
          >
            <Icon name="draw" size={18} />
          </button>
          {isDM && activeScene?.image_url && (
            <button
              className={`rail-tool ${aligning ? "active" : ""}`}
              onClick={() => setAligning((v) => !v)}
              title="Align the map to the grid"
              aria-label="Align map to grid"
            >
              <Icon name="grid" size={18} />
            </button>
          )}
          {/* Scene-backdrop hotspot authoring retired from the rail (#user ask) —
              travel pins are prep, set up in the Campaign editor's regional map,
              not dropped at the table. Existing pins still display and navigate. */}

          <div className="rail-divider" />
          <div className="rail-group-label">Actors</div>

          <button
            className={`rail-tool ${!railHidden ? "active" : ""} ${init.inCombat ? "is-live" : ""}`}
            onClick={() => setRailHidden((v) => !v)}
            title={
              railHidden
                ? "Show the combat bar"
                : init.inCombat
                  ? `Combat — round ${init.round} (click to hide the bar)`
                  : "Combat — hide the bar"
            }
            aria-label="Toggle the combat bar"
          >
            <Icon name="swords" size={18} />
          </button>
          <button
            className={`rail-tool ${partyPanelOpen ? "active" : ""}`}
            onClick={() => {
              setPartyPanelOpen((v) => !v);
              setPartyOpen(false);
            }}
            title="Party — who's at the table, and invite players"
            aria-label="Party"
          >
            <Icon name="users" size={18} />
          </button>
          <button
            className={`rail-tool ${partyOpen ? "active" : ""}`}
            onClick={() => {
              setPartyOpen((v) => !v);
              setPartyPanelOpen(false);
            }}
            title="Your characters — drag one onto the map"
            aria-label="Your characters"
          >
            <Icon name="user" size={18} />
          </button>
          {isDM && (
            <>
              <button
                className="rail-tool"
                onClick={() => setTokenPickerOpen(true)}
                title="Place a token from your library"
                aria-label="Place token from library"
              >
                <Icon name="drama" size={18} />
              </button>
              {/* "Place loot" moved off the rail (#user ask) — the DM now
                  right-clicks a token → Examine → Add loot, contextual to that
                  token. Frees a rail slot too. */}
            </>
          )}
          {/* Quick markers moved into the token picker (IA demotion,
              user 2026-08-21) — the rail slot is freed. */}
          <div className="rail-divider" />
          <div className="rail-group-label">Panels</div>

          <button
            className={`rail-tool ${rollerOpen ? "active" : ""}`}
            onClick={() => setRollerOpen((v) => !v)}
            title="Roll dice"
            aria-label="Roll dice"
          >
            <Icon name="dice" size={18} />
          </button>
          <button
            className={`rail-tool has-badge ${logOpen ? "active" : ""}`}
            onClick={() => (logOpen ? setLogOpen(false) : openLog())}
            title="Game Log — rolls, chat, and the record of play"
            aria-label={unseenRolls ? `Game Log (${unseenRolls} new)` : "Game Log"}
          >
            <Icon name="library" size={18} />
            {unseenRolls > 0 && <span className="rail-badge">{unseenRolls > 9 ? "9+" : unseenRolls}</span>}
          </button>
          <button
            className={`rail-tool ${storyOpen ? "active" : ""}`}
            onClick={() => setStoryOpen((v) => !v)}
            title={isDM ? "Story — this scene's notes and read-alouds, ready to share" : "Journal — what the DM has shared with you"}
            aria-label={isDM ? "Story" : "Journal"}
          >
            <Icon name="story" size={18} />
          </button>
          {/* Co-DM moved to a floating companion (#7) — see CoDMCompanion,
              mounted below; the rail entry is retired. */}
          <button
            className={`rail-tool ${audioOpen ? "active" : ""}`}
            onClick={() => setAudioOpen((v) => !v)}
            title="Audio — your volume for narration and ambiance"
            aria-label="Audio settings"
          >
            <Icon name="volume" size={18} />
          </button>
          <button
            className={`rail-tool ${hudModal === "map" ? "active" : ""}`}
            onClick={() => setHudModal((v) => (v === "map" ? null : "map"))}
            title="Region map — the world map the DM shares"
            aria-label="Region map"
          >
            <GameGlyph src="/icons/board/compass.svg" size={18} />
          </button>
          {/* Rules reference retired from the rail (#user ask) — the Co-DM /
              Guide companion answers rules questions for DM and players alike. */}

          {/* Contextual: appears once a token is selected. This is the ONLY way
              to remove a token by touch — the other two routes (Delete key,
              right-click) don't exist on a phone. */}
          {selectedToken && (
            <>
              <div className="rail-divider" />
              <div className="rail-group-label">Token</div>
              {isDM && (
                <button
                  className={`rail-tool ${selectedToken.hidden ? "active" : ""}`}
                  onClick={() => {
                    void setTokenHidden(selectedToken.id, !selectedToken.hidden).then(({ error }) => {
                      if (error) {
                        toast.error(
                          error.includes("hidden")
                            ? "Visibility column is missing — apply migration 0009_token_visibility.sql."
                            : error
                        );
                      }
                    });
                  }}
                  title={
                    selectedToken.hidden
                      ? `Reveal ${selectedToken.label} to players`
                      : `Hide ${selectedToken.label} from players`
                  }
                  aria-label={selectedToken.hidden ? "Reveal token" : "Hide token"}
                >
                  <Icon name={selectedToken.hidden ? "eye-off" : "eye"} size={18} />
                </button>
              )}
              <button
                className="rail-tool is-danger"
                onClick={deleteSelected}
                title={`Remove ${selectedToken.label}`}
                aria-label={`Remove ${selectedToken.label}`}
              >
                <Icon name="delete" size={18} />
              </button>
            </>
          )}
        </div>

        <div className="table-board">
          {/* The scene's cinematic backdrop as atmosphere UNDER the tactical
              board (#Phase 1 design, now on the DM board too): blurred + dimmed
              so the battlemap floats over the place it belongs to, filling the
              letterbox margins. Sharp full-bleed cinematic mode is the separate
              .table-cinematic overlay below. */}
          {activeScene?.cinematic_url && (activeScene.mode ?? "tactical") === "tactical" && (
            <div
              className="table-backdrop-under"
              style={{ backgroundImage: `url("${activeScene.cinematic_url}")` }}
              aria-hidden="true"
            />
          )}
          <svg
            ref={svgRef}
            viewBox={viewBox}
            onPointerDownCapture={startPanIfTriggered}
            onPointerDown={handleToolPointerDown}
            onContextMenu={(e) => {
              // Middle-mouse can be read as context-menu on some setups; and we
              // don't want a browser context menu on the canvas anyway.
              e.preventDefault();
            }}
            // Accept a character (party tray) or a library token (picker) drag.
            onDragOver={(e) => {
              if (e.dataTransfer.types.includes(DRAG_MIME) || e.dataTransfer.types.includes(TOKEN_DRAG_MIME)) {
                e.preventDefault();
                e.dataTransfer.dropEffect = "copy";
              }
            }}
            onDrop={handleDrop}
            style={{
              width: "100%",
              height: "100%",
              touchAction: "none",
              userSelect: "none",
              cursor: svgCursor,
            }}
          >
            {/* Grid — a single <pattern> keeps the DOM tiny even at big sizes */}
            <defs>
              <pattern id="grid-cell" width={CELL} height={CELL} patternUnits="userSpaceOnUse">
                <path d={`M ${CELL} 0 L 0 0 0 ${CELL}`} fill="none" stroke="var(--line)" strokeWidth="1" />
              </pattern>
            </defs>
            {/* Background — clicking empty canvas clears the selection.
                (During a pan the capture-phase handler stops the event before
                it reaches here, so panning keeps the current selection.) */}
            <rect
              width={width}
              height={height}
              fill="var(--bg-0)"
              onPointerDown={(e) => {
                // Teleport targeting: an empty-ground tap is the destination.
                if (pendingMoveRef.current) {
                  resolveMoveAt(e.clientX, e.clientY);
                  return;
                }
                // A swing is mid-flight — ignore stray ground taps so it plays out.
                if (swingLockRef.current) return;
                // During targeting: an aimed area/cone resolves toward the tapped
                // spot (it's aimed at a point, not a creature); any other attack
                // just cancels on an empty-ground tap.
                if (pendingAttackRef.current) {
                  const pa = pendingAttackRef.current;
                  const p = pa.spec.burst ? clientToSvg(e.clientX, e.clientY) : null;
                  if (pa.spec.burst && p) {
                    const blocked = burstAimBlocked(pa.spec, pa.attackerId, p.x, p.y);
                    if (blocked) {
                      toast.info(blocked); // keep aiming — pick a closer point
                      return;
                    }
                  }
                  setPendingAttack(null);
                  if (pa.spec.burst && p) resolveBurst(pa.by, pa.spec, pa.attackerId, p.x, p.y);
                  return;
                }
                // Touch: one finger on empty canvas pans, without having to
                // switch to the Pan tool (there's no space bar on a phone).
                // Tokens sit above this rect, so dragging one never lands here.
                if (
                  e.pointerType === "touch" &&
                  touchesRef.current.size <= 1 &&
                  toolRef.current !== "ping" &&
                  toolRef.current !== "ruler" &&
                  toolRef.current !== "fog" &&
                  toolRef.current !== "draw"
                ) {
                  setSelectedId(null);
                  beginPan(e.clientX, e.clientY);
                  return;
                }
                // Mouse, Select tool, not panning → start a marquee. It selects
                // on release; a press with no drag just clears the selection.
                if (
                  e.pointerType !== "touch" &&
                  e.button === 0 &&
                  !spaceHeldRef.current &&
                  toolRef.current === "select"
                ) {
                  const p = clientToSvg(e.clientX, e.clientY);
                  if (p) {
                    marqueeRef.current = { x0: p.x, y0: p.y, x1: p.x, y1: p.y, moved: false };
                    setMarquee({ x0: p.x, y0: p.y, x1: p.x, y1: p.y });
                    return;
                  }
                }
                // Any other empty-ground press (e.g. pan tool) just deselects.
                setSelectedId(null);
              }}
            />
            {activeScene?.image_url && (
              <image
                href={activeScene.image_url}
                x={mapOffsetX}
                y={mapOffsetY}
                width={width * mapScale}
                height={height * mapScale}
                preserveAspectRatio="xMinYMin slice"
                style={{ pointerEvents: "none" }}
              />
            )}
            {/* Grid overlays the background so cells stay visible on any map. */}
            <rect
              width={width}
              height={height}
              fill="url(#grid-cell)"
              style={{ pointerEvents: "none", opacity: activeScene?.image_url ? 0.55 : 1 }}
            />

            {/* DM's fog preview — under the tokens so the DM still sees
                everything; translucent so the map reads through. */}
            {isDM && fogPath && (
              <path d={fogPath} fill="rgba(10, 7, 4, 0.45)" style={{ pointerEvents: "none" }} />
            )}

            {/* Combat movement preview — while dragging the creature whose turn
                it is, a line from its CURRENT cell to the cursor: green up to the
                movement it has left this turn, red for the overflow. */}
            {(() => {
              if (!init.inCombat || !ghost) return null;
              const eco = economy[ghost.id];
              if (!eco) return null; // only the active token carries a budget
              const t = tokens.find((x) => x.id === ghost.id);
              if (!t) return null;
              const half = (findSize(t.size).cells * CELL) / 2;
              const sx = t.x * CELL + half; // this step starts at the token's live cell
              const sy = t.y * CELL + half;
              const ex = ghost.x * CELL + half;
              const ey = ghost.y * CELL + half;
              const gx = Math.round(ghost.x);
              const gy = Math.round(ghost.y);
              const stepFt = Math.max(Math.abs(gx - t.x), Math.abs(gy - t.y)) * 5; // this step's distance
              const base = t.statblock ? t.statblock.speed.walk ?? 30 : boundCharacter?.speed ?? 30;
              const speed = (aggregateConditions(t.conditions ?? []).speed0 ? 0 : base) * (eco.dashed ? 2 : 1);
              const remaining = Math.max(0, speed - eco.moveUsedFt);
              const frac = stepFt > remaining && stepFt > 0 ? remaining / stepFt : 1;
              const midX = sx + (ex - sx) * frac;
              const midY = sy + (ey - sy) * frac;
              const over = stepFt > remaining;
              const label = over ? `${stepFt} ft · ${stepFt - remaining} over` : `${stepFt} ft · ${remaining - stepFt} left`;
              return (
                <g className="move-preview" style={{ pointerEvents: "none" }}>
                  <line x1={sx} y1={sy} x2={midX} y2={midY} className="mp-ok" vectorEffect="non-scaling-stroke" />
                  {over && (
                    <line x1={midX} y1={midY} x2={ex} y2={ey} className="mp-over" vectorEffect="non-scaling-stroke" />
                  )}
                  <circle cx={ex} cy={ey} r={5} className={over ? "mp-dot-over" : "mp-dot"} vectorEffect="non-scaling-stroke" />
                  {(() => {
                    const tagW = label.length * 7 + 14; // auto-size to the label
                    return (
                      <g transform={`translate(${ex}, ${ey - 16})`}>
                        <rect className={`mp-tag ${over ? "is-over" : ""}`} x={-tagW / 2} y={-13} width={tagW} height={20} rx={6} />
                        <text className="mp-tag-t" x={0} y={1} textAnchor="middle" dominantBaseline="middle">{label}</text>
                      </g>
                    );
                  })()}
                </g>
              );
            })()}

            {rendered.map((t) => {
              const spec = findSize(t.size);
              const span = spec.cells;
              const cx = t.x * CELL + (span * CELL) / 2;
              const cy = t.y * CELL + (span * CELL) / 2;
              const r = spec.radius * CELL;
              const dragging = ghost?.id === t.id;
              const clipId = `token-clip-${t.id}`;
              const dead = tokenIsDowned(t);
              // Per-viewer visibility (slice H): "ghost" = the DM's faint
              // last-known marker of a stealth-hidden token (display-only);
              // "dim" = a token you can see but that's hidden-to-others
              // (the hider's own translucent token, or a DM-hidden token).
              const vl = viewLevel(t);
              const isGhost = vl === "ghost";

              // Spell area marker (#80): a translucent, non-combatant footprint
              // sized to the spell's area of effect — not a creature disc. A
              // spell WITHOUT an area (no shape) falls through to the normal
              // token render below, showing its art as a plain marker.
              if (t.kind === "spell" && t.area?.shape) {
                const tint = areaTintFor(t.area?.damageType ?? undefined);
                const geom = spellAreaGeom(cx, cy, t.area?.shape, t.area?.size ?? 20);
                const selected = selectedIds.has(t.id);
                // Aim: rotate directional shapes (cone/line) about the origin.
                // Live angle wins while dragging the handle; else the saved facing.
                const facing = rotating?.id === t.id ? rotating.facing : t.area?.facing ?? 0;
                const directional = t.area?.shape === "cone" || t.area?.shape === "line";
                const uSize = ((t.area?.size ?? 20) / FT_PER_CELL) * CELL;
                const rad = (facing * Math.PI) / 180;
                const handleDist = uSize + 22;
                const hx = cx + handleDist * Math.cos(rad);
                const hy = cy + handleDist * Math.sin(rad);
                return (
                  <g
                    key={t.id}
                    onPointerDown={(e) => startTokenDrag(e, t)}
                    style={{
                      cursor: spaceHeld ? "grab" : dragging ? "grabbing" : "grab",
                      opacity: t.hidden ? 0.5 : dragging ? 0.85 : 1,
                    }}
                  >
                    {/* The area shape rotates about the origin; label + handle don't.
                        It's INERT (pointerEvents none) so clicks fall through to the
                        creatures standing inside — only the centre dot grabs it. */}
                    <g transform={`rotate(${facing} ${cx} ${cy})`} style={{ pointerEvents: "none" }}>
                      {geom.tag === "circle" && (
                        <circle cx={cx} cy={cy} r={geom.r} fill={tint} fillOpacity={0.22}
                          stroke={tint} strokeOpacity={0.85} strokeWidth={2} strokeDasharray="6 4" />
                      )}
                      {geom.tag === "rect" && (
                        <rect x={geom.x} y={geom.y} width={geom.w} height={geom.h} fill={tint} fillOpacity={0.22}
                          stroke={tint} strokeOpacity={0.85} strokeWidth={2} strokeDasharray="6 4" />
                      )}
                      {geom.tag === "polygon" && (
                        <polygon points={geom.points} fill={tint} fillOpacity={0.22}
                          stroke={tint} strokeOpacity={0.85} strokeWidth={2} strokeDasharray="6 4" />
                      )}
                    </g>
                    {/* Origin marker + label so the DM can grab and read it. */}
                    <circle cx={cx} cy={cy} r={6} fill={tint} />
                    <text x={cx} y={cy - 12} textAnchor="middle" fontSize={12} fontWeight={700}
                      fill={tint} style={{ pointerEvents: "none" }}>
                      {t.label}
                    </text>
                    {selected && (
                      <circle cx={cx} cy={cy} r={geom.tag === "circle" ? geom.r + 4 : 14} fill="none"
                        stroke="var(--candle)" strokeWidth={2} strokeDasharray="4 4"
                        style={{ pointerEvents: "none" }} />
                    )}
                    {/* Rotate handle — a ↻ grab knob at the aim, for cone/line only.
                        DM-only: aiming a wall/line is the DM's setup, even though a
                        spell area can't be dragged. */}
                    {selected && directional && isDM && (
                      <g>
                        <line x1={cx} y1={cy} x2={hx} y2={hy} stroke={tint} strokeOpacity={0.5} strokeWidth={2} strokeDasharray="3 3" style={{ pointerEvents: "none" }} />
                        {/* Disc is the grab target; the ↻ icon rides on top (inert). */}
                        <circle
                          cx={hx} cy={hy} r={12}
                          fill="var(--candle)" stroke="#14100c" strokeWidth={2}
                          style={{ cursor: "grab" }}
                          onPointerDown={(e) => startRotate(e, t)}
                        />
                        <g transform={`translate(${hx - 8} ${hy - 8})`} style={{ color: "#14100c", pointerEvents: "none" }}>
                          <Icon name="rotate" size={16} />
                        </g>
                        {rotating?.id === t.id && (
                          <text x={cx} y={cy + 26} textAnchor="middle" fontSize={11} fontWeight={700}
                            fill={tint} style={{ pointerEvents: "none" }}>
                            {((facing % 360) + 360) % 360}°
                          </text>
                        )}
                      </g>
                    )}
                    {t.hidden && (
                      <text x={cx} y={cy + 20} textAnchor="middle" fontSize={11} fill="var(--text-dim)"
                        style={{ pointerEvents: "none" }}>hidden</text>
                    )}
                  </g>
                );
              }

              return (
                <g
                  key={t.id}
                  onPointerDown={(e) => startTokenDrag(e, t)}
                  onContextMenu={(e) => {
                    // Right-click opens the token menu. Players get it on a
                    // non-owned creature/corpse/container (Steal/Loot/Examine,
                    // #131); the DM gets it on any visible token (Examine → Add
                    // loot, #user ask). Left-click still selects.
                    if (isDM || menuTarget(t)) {
                      e.preventDefault();
                      e.stopPropagation();
                      setTokenMenu({ tokenId: t.id, x: e.clientX, y: e.clientY });
                    }
                  }}
                  style={{
                    // While targeting, show the action cursor over tokens too
                    // (the grab cursor would otherwise win and read as "drag").
                    cursor: pendingSteal || stealing
                      ? ANIMATED_CURSOR
                        ? "none"
                        : PINCH_CURSOR
                      : pendingAttack
                      ? ANIMATED_CURSOR
                        ? "none"
                        : SWORD_CURSOR
                      : spaceHeld
                        ? "grab"
                        : dragging
                          ? "grabbing"
                          : "grab",
                    // Hidden tokens only render for the DM — ghosted, so the
                    // DM always knows what the players can't see. A defeated
                    // creature reads as a body: dimmed and drained of colour.
                    // A stealth-hidden token: dim for the hider, a faint ghost
                    // for the DM (slice H).
                    opacity: isGhost ? 0.22 : vl === "dim" ? 0.42 : dead ? 0.5 : dragging ? 0.9 : 1,
                    filter: dead ? "grayscale(0.85)" : isGhost ? "grayscale(0.6)" : undefined,
                    // The DM's ghost stays selectable — a last-known marker they
                    // can inspect, move, or manually reveal — it just can't be
                    // targeted by attacks (enforced at target-commit, slice H).
                  }}
                >
                  {/* Always-present hit target for the whole disc. `fill="transparent"`
                      IS hit-tested (unlike `fill="none"`), so clicks land on the token
                      even when its art fails to load — e.g. an expired generated-image
                      URL — instead of falling through to the background and cancelling
                      an attack or the selection. */}
                  <circle cx={cx} cy={cy} r={r} fill="transparent" />
                  {t.image_url ? (
                    <>
                      <defs>
                        <clipPath id={clipId}>
                          <circle cx={cx} cy={cy} r={r} />
                        </clipPath>
                      </defs>
                      <image
                        href={t.image_url}
                        x={cx - r}
                        y={cy - r}
                        width={r * 2}
                        height={r * 2}
                        preserveAspectRatio="xMidYMid slice"
                        clipPath={`url(#${clipId})`}
                      />
                      <circle cx={cx} cy={cy} r={r} fill="none" stroke={ringColorFor(t)} strokeWidth={Math.max(2.5, r * 0.08)} />
                    </>
                  ) : (
                    <>
                      {/* Disc filled with the token's own color; the ring carries
                          its SIDE (gold PC / red hostile / green friendly). */}
                      <circle cx={cx} cy={cy} r={r} fill={t.color} stroke={ringColorFor(t)} strokeWidth={Math.max(2.5, r * 0.08)} />
                      <text
                        x={cx}
                        y={cy + r * 0.15}
                        textAnchor="middle"
                        fontSize={r * 0.9}
                        fontWeight={700}
                        fill="#14100c"
                        style={{ pointerEvents: "none" }}
                      >
                        {initialsOf(t.label)}
                      </text>
                    </>
                  )}
                  {/* Whose turn it is, marked on the board itself — you
                      shouldn't have to read the tracker to know. */}
                  {init.activeToken?.id === t.id && (
                    <circle
                      cx={cx}
                      cy={cy}
                      r={r + 7}
                      fill="none"
                      stroke="var(--ember)"
                      strokeWidth={3}
                      style={{ pointerEvents: "none" }}
                    >
                      <animate
                        attributeName="opacity"
                        values="1;0.35;1"
                        dur="2s"
                        repeatCount="indefinite"
                      />
                    </circle>
                  )}
                  {t.hidden && (
                    <text
                      x={cx}
                      y={cy - r - 6}
                      textAnchor="middle"
                      fontSize={11}
                      fill="var(--text-dim)"
                      style={{ pointerEvents: "none" }}
                    >
                      hidden
                    </text>
                  )}
                  {selectedIds.has(t.id) && (
                    <circle
                      cx={cx}
                      cy={cy}
                      r={r + 4}
                      fill="none"
                      stroke="var(--candle)"
                      strokeWidth={2.5}
                      strokeDasharray="6 4"
                      style={{ pointerEvents: "none" }}
                    >
                      <animateTransform
                        attributeName="transform"
                        type="rotate"
                        from={`0 ${cx} ${cy}`}
                        to={`360 ${cx} ${cy}`}
                        dur="12s"
                        repeatCount="indefinite"
                      />
                    </circle>
                  )}
                  <text
                    x={cx}
                    y={cy + r + 12}
                    textAnchor="middle"
                    fontSize={11}
                    fill="var(--text)"
                    stroke="var(--bg-0)"
                    strokeWidth={3}
                    paintOrder="stroke"
                    style={{ pointerEvents: "none" }}
                  >
                    {t.label}
                  </text>

                  {/* Statuses moved off the token into the HUD (#user ask): select
                      a token to read its conditions/buffs (hover for labels), or
                      right-click → Examine. Keeps the board uncluttered. */}

                  {/* Caster's "they're rolling" loader while a save is pending. */}
                  {savePendingIds.has(t.id) && <CastingLoader cx={cx} cy={cy - r} />}

                </g>
              );
            })}

            {/* Marquee drag-select rectangle (#user ask) — SVG-user coords. */}
            {marquee && (
              <rect
                x={Math.min(marquee.x0, marquee.x1)}
                y={Math.min(marquee.y0, marquee.y1)}
                width={Math.abs(marquee.x1 - marquee.x0)}
                height={Math.abs(marquee.y1 - marquee.y0)}
                fill="var(--candle)"
                fillOpacity={0.1}
                stroke="var(--candle)"
                strokeWidth={1.5}
                strokeDasharray="6 4"
                vectorEffect="non-scaling-stroke"
                style={{ pointerEvents: "none" }}
              />
            )}

            {/* Misty Step teleport bursts now render through the shared spell-VFX
                layer below (a "burst" kind), so they broadcast to all clients. */}

            {/* Spell projectiles (Magic Missile…) — fly caster → target, then clear. */}
            {spellFx.fx.map((fx) => (
              <SpellProjectile key={fx.id} fx={fx} onDone={() => spellFx.removeFx(fx.id)} />
            ))}

            {/* Aim preview — a cone footprint for aimed area spells (Cone of Cold),
                else a dashed caster→cursor line with a live distance readout. */}
            {pendingAttack && !swinging && (() => {
              const attacker = tokens.find((t) => t.id === pendingAttack.attackerId);
              if (!attacker) return null;
              const o = centerOfToken(attacker);
              // Lingering area spell: the footprint follows the cursor to its
              // drop point (positioned by the pointer effect via aimAreaRef).
              if (pendingAttack.spec.placeArea) {
                const pa = pendingAttack.spec.placeArea;
                const tint = areaTintFor(pa.damageType ?? undefined);
                const g = spellAreaGeom(0, 0, pa.shape, pa.size);
                const stroke = { fill: tint, fillOpacity: 0.2, stroke: tint, strokeOpacity: 0.9, strokeWidth: 2.5, strokeDasharray: "7 5" };
                return (
                  <g ref={aimAreaRef} className="aim-area" transform="translate(-9999 -9999)" style={{ pointerEvents: "none" }}>
                    {g.tag === "circle" && <circle cx={0} cy={0} r={g.r} {...stroke} />}
                    {g.tag === "rect" && <rect x={g.x} y={g.y} width={g.w} height={g.h} {...stroke} />}
                    {g.tag === "polygon" && <polygon points={g.points} {...stroke} />}
                  </g>
                );
              }
              if (pendingAttack.spec.burst) {
                // WYSIWYG: the preview footprint is the SAME geometry the hit
                // test uses. Cone/line/cube anchor at the caster and rotate to
                // the cursor; a sphere follows the cursor (positioned via
                // aimAreaRef, like a lingering-area drop preview).
                const bs = pendingAttack.spec.burstShape;
                const U = bs ? (bs.size / FT_PER_CELL) * CELL : CONE_LEN;
                const tint = areaTintFor(pendingAttack.spec.damageType ?? undefined);
                const stroke = { fill: tint, fillOpacity: 0.2, stroke: tint, strokeOpacity: 0.9, strokeWidth: 2.5, strokeDasharray: "7 5" };
                if (bs && (bs.shape === "sphere" || bs.shape === "cylinder" || bs.shape === "emanation")) {
                  return (
                    <g ref={aimAreaRef} className="aim-area" transform="translate(-9999 -9999)" style={{ pointerEvents: "none" }}>
                      <circle cx={0} cy={0} r={U} {...stroke} />
                    </g>
                  );
                }
                return (
                  <g ref={aimConeRef} className="aim-cone" transform={`translate(${o.x} ${o.y})`} style={{ pointerEvents: "none" }}>
                    {bs?.shape === "line" && <rect x={0} y={-CELL / 2} width={U} height={CELL} {...stroke} />}
                    {bs?.shape === "cube" && <rect x={0} y={-U / 2} width={U} height={U} {...stroke} />}
                    {(!bs || bs.shape === "cone") && (
                      <polygon points={`0,0 ${U},${-U / 2} ${U},${U / 2}`} {...stroke} />
                    )}
                  </g>
                );
              }
              return (
                <g className="aim-preview" style={{ pointerEvents: "none" }}>
                  <line
                    ref={aimLineRef}
                    x1={o.x} y1={o.y} x2={o.x} y2={o.y}
                    stroke="#6fcf6f" strokeWidth={2.5} strokeDasharray="7 5" opacity={0.9}
                  />
                  <text
                    ref={aimLabelRef}
                    x={o.x} y={o.y}
                    textAnchor="middle" fontSize={12} fontWeight={700}
                    stroke="#14100c" strokeWidth={0.6} paintOrder="stroke"
                  />
                </g>
              );
            })()}

            {/* ---- Drawings ------------------------------------------------- */}
            {/* Above tokens so you can circle or point at a piece. Committed
                ink + the in-progress stroke render the same way. */}
            {[...drawings, ...(liveDraw ? [{ ...liveDraw, id: "__live" }] : [])].map((d) => {
              const common = {
                stroke: d.color,
                strokeWidth: 3,
                fill: "none" as const,
                strokeLinecap: "round" as const,
                strokeLinejoin: "round" as const,
                style: { pointerEvents: "none" as const },
              };
              if (d.kind === "pen") return <path key={d.id} d={penPathD(d.points)} {...common} />;
              if (d.kind === "arrow") {
                return (
                  <g key={d.id} style={{ pointerEvents: "none" }}>
                    <line x1={d.points[0]} y1={d.points[1]} x2={d.points[2]} y2={d.points[3]} {...common} />
                    <polygon points={arrowHead(d.points)} fill={d.color} stroke="none" />
                  </g>
                );
              }
              const b = shapeBox(d.points);
              if (d.kind === "rect") return <rect key={d.id} x={b.x} y={b.y} width={b.w} height={b.h} {...common} />;
              return <ellipse key={d.id} cx={b.x + b.w / 2} cy={b.y + b.h / 2} rx={b.w / 2} ry={b.h / 2} {...common} />;
            })}

            {/* ---- Ruler overlay -------------------------------------------- */}
            {measure && (() => {
              const feet = measureFeet(measure);
              const midX = (measure.x1 + measure.x2) / 2;
              const midY = (measure.y1 + measure.y2) / 2;
              return (
                <g style={{ pointerEvents: "none" }}>
                  <line
                    x1={measure.x1} y1={measure.y1} x2={measure.x2} y2={measure.y2}
                    stroke="var(--candle)" strokeWidth={3} strokeDasharray="10 6" strokeLinecap="round"
                  />
                  <circle cx={measure.x1} cy={measure.y1} r={5} fill="var(--candle)" />
                  <circle cx={measure.x2} cy={measure.y2} r={5} fill="var(--candle)" />
                  <g transform={`translate(${midX}, ${midY - 14})`}>
                    <rect x={-34} y={-13} width={68} height={22} rx={5}
                      fill="rgba(20, 16, 12, 0.88)" stroke="var(--candle)" strokeWidth={1} />
                    <text textAnchor="middle" y={3} fontSize={12} fontWeight={700}
                      fill="var(--cream)" style={{ fontVariantNumeric: "tabular-nums" }}>
                      {feet} ft
                    </text>
                  </g>
                </g>
              );
            })()}

            {/* Player fog — ABOVE tokens: what's in the dark stays unseen.
                Pings still render on top so the DM can point through fog. */}
            {!isDM && fogPath && (
              <path d={fogPath} fill="rgb(12, 9, 6)" style={{ pointerEvents: "none" }} />
            )}

            {/* ---- Pings ---------------------------------------------------- */}
            {/* CSS-animated (not SMIL): SMIL inserted by React doesn't reliably
                auto-start, which is why pings sometimes showed nothing. Styled
                after the D&D Beyond reference — red glow, light expanding rings,
                bright centre dot. Sub-elements sit at the group origin so
                transform-box:fill-box scales them in place (see .ping-* CSS). */}
            {pings.map((p) => (
              <g key={p.id} className="ping" transform={`translate(${p.x} ${p.y})`} style={{ pointerEvents: "none" }}>
                <circle className="ping-glow" r={46} fill="var(--ember)" />
                <circle className="ping-ring" r={46} fill="none" stroke="#f6ecd2" strokeWidth={3} />
                <circle className="ping-ring ping-ring-delayed" r={46} fill="none" stroke="#f6ecd2" strokeWidth={2.5} />
                <circle className="ping-dot" r={7} fill="var(--ember)" stroke="#f6ecd2" strokeWidth={2} />
              </g>
            ))}

            {/* Hotspots (#Phase 2) — navigable pins on the backdrop, positioned
                from normalized coords. DM authors/navigates; players see them
                (per-player navigation is Phase 3). Hidden pins are DM-only. */}
            {hotspots.map((h) => {
              if (h.hidden && !isDM) return null;
              // Draft-chapter targets don't exist for players (#0041).
              if (!isDM && h.target_scene_id && draftSceneIds.has(h.target_scene_id)) return null;
              const px = h.x * width;
              const py = h.y * height;
              const linked = Boolean(h.target_scene_id);
              const selected = editHotspotId === h.id;
              return (
                <g
                  key={h.id}
                  className="hotspot-pin"
                  transform={`translate(${px} ${py})`}
                  style={{ cursor: isDM ? "pointer" : "default", opacity: h.hidden ? 0.5 : 1 }}
                  onPointerDown={(e) => {
                    e.stopPropagation(); // don't let the board place a new pin here
                    // DM in hotspot-tool mode edits the pin; otherwise anyone
                    // clicking a linked pin travels THEMSELVES there (per-player
                    // navigation) — the DM stage and other players are untouched.
                    if (isDM && toolRef.current === "hotspot") {
                      setEditHotspotId(h.id);
                    } else if (h.target_scene_id) {
                      guardTravel(h.target_scene_id);
                    } else if (isDM) {
                      setEditHotspotId(h.id);
                    }
                  }}
                >
                  <circle r={20} fill="rgba(20,16,12,0.55)" stroke="var(--gold)" strokeWidth={selected ? 4 : 2.5} />
                  <circle r={7} fill="var(--gold)" />
                  {!linked && (
                    <circle r={20} fill="none" stroke="var(--ember)" strokeWidth={2.5} strokeDasharray="4 4" />
                  )}
                  {h.label && (
                    <text
                      y={40}
                      textAnchor="middle"
                      fontSize={16}
                      fill="var(--cream)"
                      stroke="var(--bg-0)"
                      strokeWidth={3}
                      paintOrder="stroke"
                      style={{ pointerEvents: "none" }}
                    >
                      {h.label}
                    </text>
                  )}
                </g>
              );
            })}

            {/* Roll blooms — a result floats up from the roller's token so the
                whole table SEES the number land, not just reads it in the log. */}
            {blooms.map((b) => (
              <text
                key={b.id}
                className={`roll-bloom roll-bloom-${b.tone}`}
                x={b.x}
                y={b.y}
                textAnchor="middle"
                style={{ pointerEvents: "none" }}
              >
                {b.text}
              </text>
            ))}

            {/* Map-alignment layer (#115): while the DM is aligning, this
                transparent rect sits on TOP of the board and grabs all input so
                you can drag the map to move it, scroll to zoom it (cursor-
                anchored), or click two opposite corners of one printed square to
                auto-calibrate. Committed to the scene on release / after idle. */}
            {aligning && isDM && activeScene?.image_url && (
              <>
                <rect
                  width={width}
                  height={height}
                  fill="transparent"
                  style={{ pointerEvents: "all", cursor: calibrating ? "crosshair" : "grab" }}
                  onPointerDown={(e) => {
                    e.stopPropagation();
                    const p = clientToSvg(e.clientX, e.clientY);
                    if (!p || !activeScene) return;
                    if (calibrating) {
                      if (!calibPt) { setCalibPt(p); return; }
                      const p1 = calibPt;
                      const side = (Math.abs(p.x - p1.x) + Math.abs(p.y - p1.y)) / 2;
                      setCalibPt(null);
                      setCalibrating(false);
                      if (side < 4) return; // too close to be a real cell
                      const m = CELL / side;
                      const tlx = Math.min(p1.x, p.x);
                      const tly = Math.min(p1.y, p.y);
                      const gx = Math.round(tlx / CELL) * CELL;
                      const gy = Math.round(tly / CELL) * CELL;
                      void updateSceneLayout(activeScene.id, {
                        map_scale: sceneScale * m,
                        map_offset_x: gx - (tlx - sceneOffsetX) * m,
                        map_offset_y: gy - (tly - sceneOffsetY) * m,
                      });
                      return;
                    }
                    (e.currentTarget as Element).setPointerCapture(e.pointerId);
                    mapDragRef.current = { sx: p.x, sy: p.y, ox: mapOffsetX, oy: mapOffsetY };
                    setMapLive({ x: mapOffsetX, y: mapOffsetY, scale: mapScale });
                  }}
                  onPointerMove={(e) => {
                    const d = mapDragRef.current;
                    if (!d) return;
                    const p = clientToSvg(e.clientX, e.clientY);
                    if (!p) return;
                    setMapLive((prev) => ({ x: d.ox + (p.x - d.sx), y: d.oy + (p.y - d.sy), scale: prev?.scale ?? sceneScale }));
                  }}
                  onPointerUp={() => {
                    if (!mapDragRef.current) return;
                    mapDragRef.current = null;
                    setMapLive((cur) => {
                      if (cur && activeScene) void updateSceneLayout(activeScene.id, { map_offset_x: cur.x, map_offset_y: cur.y, map_scale: cur.scale });
                      return null;
                    });
                  }}
                  onWheel={(e) => {
                    e.preventDefault();
                    e.stopPropagation();
                    if (!activeScene) return;
                    const p = clientToSvg(e.clientX, e.clientY);
                    if (!p) return;
                    const factor = e.deltaY < 0 ? 1.04 : 1 / 1.04;
                    setMapLive((prev) => {
                      const s = prev?.scale ?? sceneScale;
                      const ox = prev?.x ?? sceneOffsetX;
                      const oy = prev?.y ?? sceneOffsetY;
                      const ns = Math.max(0.25, Math.min(6, s * factor));
                      const r = ns / s;
                      return { scale: ns, x: p.x - (p.x - ox) * r, y: p.y - (p.y - oy) * r };
                    });
                    window.clearTimeout(mapZoomCommitRef.current);
                    mapZoomCommitRef.current = window.setTimeout(() => {
                      setMapLive((cur) => {
                        if (cur && activeScene) void updateSceneLayout(activeScene.id, { map_scale: cur.scale, map_offset_x: cur.x, map_offset_y: cur.y });
                        return null;
                      });
                    }, 300);
                  }}
                />
                {calibrating && calibPt && (
                  <circle cx={calibPt.x} cy={calibPt.y} r={5} fill="none" stroke="var(--candle)" strokeWidth={2} style={{ pointerEvents: "none" }} />
                )}
              </>
            )}
          </svg>

          {/* Cinematic face on the DM board (#Phase 2 follow-up): when the DM
              flips this scene to Cinematic, show the backdrop here too — WYSIWYG
              with what players see on the cast view — instead of a silent no-op.
              Covers the grid/tokens; flip back to Tactical to return to the map. */}
          {activeScene?.mode === "cinematic" && activeScene.cinematic_url && (
            <div
              className="table-cinematic"
              onPointerDown={(e) => {
                // DM hotspot tool works here too — this is how a NAVIGATION scene
                // is authored: a regional-map backdrop, pins placed straight on it.
                if (!isDM || toolRef.current !== "hotspot") return;
                const rect = e.currentTarget.getBoundingClientRect();
                const nx = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width));
                const ny = Math.max(0, Math.min(1, (e.clientY - rect.top) / rect.height));
                void createHotspot(nx, ny).then(({ hotspot, error }) => {
                  if (error) toast.error(error);
                  else if (hotspot) setEditHotspotId(hotspot.id);
                });
              }}
            >
              <div
                className="table-cinematic-bg"
                style={{ backgroundImage: `url("${activeScene.cinematic_url}")` }}
                aria-hidden="true"
              />
              <div className="table-cinematic-vignette" aria-hidden="true" />

              {/* Hotspot pins on the cinematic face — the navigation-scene look:
                  pins float on the full-bleed map; clicking one travels YOU. */}
              {hotspots.map((h) => {
                if (h.hidden && !isDM) return null;
                // Draft-chapter targets don't exist for players (#0041).
                if (!isDM && h.target_scene_id && draftSceneIds.has(h.target_scene_id)) return null;
                const linked = Boolean(h.target_scene_id);
                return (
                  <button
                    key={h.id}
                    className={`cine-hotspot ${linked ? "" : "is-unlinked"} ${h.hidden ? "is-hidden" : ""}`}
                    style={{ left: `${h.x * 100}%`, top: `${h.y * 100}%` }}
                    title={h.label ?? (linked ? "Travel" : "Unlinked hotspot")}
                    onPointerDown={(e) => e.stopPropagation()}
                    onClick={(e) => {
                      e.stopPropagation();
                      if (isDM && toolRef.current === "hotspot") setEditHotspotId(h.id);
                      else if (h.target_scene_id) guardTravel(h.target_scene_id);
                      else if (isDM) setEditHotspotId(h.id);
                    }}
                  >
                    <span className="cine-hotspot-dot" />
                    {h.label && <span className="cine-hotspot-label">{h.label}</span>}
                  </button>
                );
              })}

              <div className="table-cinematic-badge">
                <Icon name="drama" size={12} />
                <span>Cinematic — this is what players see</span>
              </div>
            </div>
          )}

          {/* Roaming banner (#Phase 3) — this member has wandered off the DM's
              stage via a hotspot; one tap rejoins the group. */}
          {isRoaming && (
            <div className="roam-banner">
              <Icon name="map" size={13} />
              <span>{isDM ? "You've stepped away from the stage" : "You've wandered off from the group"}</span>
              <button onClick={() => void returnToStage()}>Rejoin</button>
            </div>
          )}

          {/* Animated attack cursor (sword / fist) — stays alive through the swing tail. */}
          <AttackCursor
            active={ANIMATED_CURSOR && (!!pendingAttack || swinging || !!pendingSteal || stealing)}
            kind={pendingSteal || stealing ? "steal" : attackKind}
          />

          {/* Targeting banner — while an attack waits for its mark (hidden once
              the swing is playing so it doesn't linger over the strike). */}
          {pendingAttack && !swinging && (
            <div className="combat-target-hint" role="status">
              <Icon name="ping" size={15} />
              {pendingAttack.spec.placeArea
                ? "Tap where to place "
                : pendingAttack.spec.burst
                  ? "Tap to aim "
                  : pendingAttack.spec.heal != null
                    ? "Tap who to heal with "
                    : pendingAttack.spec.cleanse != null
                      ? "Tap who to cure with "
                      : "Tap a target for "}
              <b>{pendingAttack.spec.label}</b>
              <button onClick={() => setPendingAttack(null)}>
                {pendingAttack.spec.burst ? "Esc to cancel" : "Esc or tap ground to cancel"}
              </button>
            </div>
          )}

          {pendingMove && (
            <div className="combat-target-hint" role="status">
              <Icon name="ping" size={15} />
              Tap a destination for <b>{pendingMove.label}</b>
              <button onClick={() => setPendingMove(null)}>Esc to cancel</button>
            </div>
          )}

          {pendingSteal && (
            <div className="combat-target-hint" role="status">
              <Icon name="package" size={15} />
              Tap an <b>adjacent</b> creature to pickpocket
              <button onClick={() => setPendingSteal(null)}>Esc to cancel</button>
            </div>
          )}

          {/* Halve offer — a just-landed hit the target can still halve. Broadcast
              from the attacker; shown ONLY to the client that controls the target
              (the defender's own screen). Taking it gives back the difference. */}
          {(() => {
            const off = reactions.pending.find((o) => {
              if (o.kind !== "halve") return false;
              const t = tokens.find((x) => x.id === o.targetTokenId);
              return !!t && iControlToken(t);
            });
            if (!off) return null;
            return (
              <div className="combat-reaction" role="status">
                <Icon name="shield" size={15} />
                <span>
                  <b>{off.targetLabel}</b> took <b>{off.applied}</b> — halve with a reaction?
                </span>
                <button className="react-take" onClick={() => takeHalve(off)}>
                  Halve → {off.halved}
                </button>
                <button className="react-skip" onClick={() => reactions.clear(off.id)} aria-label="Dismiss">
                  <Icon name="close" size={13} />
                </button>
              </div>
            );
          })()}

          {/* Blocking reaction interrupt (Shield). The DEFENDER's controller sees
              the prompt; the ATTACKER sees a waiting banner until it resolves.
              When one client is both (solo / DM controls both), only the prompt
              shows — the pill is suppressed. */}
          {(() => {
            const mine = reactions.pending.find((o) => {
              const t = tokens.find((x) => x.id === o.targetTokenId);
              return t && iControlToken(t) && shieldReadyFor(o);
            });
            return (
              <>
                {mine && (
                  <div className="reaction-offer" role="alertdialog" aria-label="Reaction window">
                    <div className="reaction-offer-h">
                      <Icon name="shield" size={15} /> Reaction
                    </div>
                    <p className="reaction-offer-b">
                      <b>{mine.by}</b>'s {mine.sourceLabel} would hit <b>{mine.targetLabel}</b>{" "}
                      <span className="reaction-offer-roll">({mine.toHit} vs AC {mine.baseAc})</span>
                    </p>
                    <div className="reaction-offer-btns">
                      <button className="ro-take" onClick={() => castShieldReaction(mine)}>
                        Cast Shield <span>+5 AC</span>
                      </button>
                      <button className="ro-skip" onClick={() => declineReaction(mine)}>
                        No reaction
                      </button>
                    </div>
                  </div>
                )}
                {awaitingReaction && !mine && (
                  <div className="reaction-wait" role="status">
                    <Icon name="shield" size={14} />
                    <span>Waiting on <b>{awaitingReaction.targetLabel}</b>'s reaction…</span>
                    <button
                      onClick={() => resolveReaction(awaitingReaction.id, { id: awaitingReaction.id, kind: "shield", acBonus: 0 })}
                      title="Resolve without waiting"
                    >
                      Skip
                    </button>
                  </div>
                )}
              </>
            );
          })()}

          {/* Counterspell window. A nearby caster can counter; the caster sees a
              "casting…" banner, then rolls a CON save if they're countered. */}
          {(() => {
            const off = reactions.pending.find(
              (o) => o.kind === "counterspell" && !dismissedCounters.has(o.id) && counterspellerFor(o)
            );
            if (!off) return null;
            const cst = counterspellerFor(off)!;
            return (
              <div className="reaction-offer" role="alertdialog" aria-label="Counterspell window">
                <div className="reaction-offer-h">
                  <Icon name="sparkles" size={15} /> Reaction
                </div>
                <p className="reaction-offer-b">
                  <b>{off.by}</b> is casting <b>{off.sourceLabel}</b>
                  {off.spellLevel ? <span className="reaction-offer-roll"> (level {off.spellLevel})</span> : null} — counter it with <b>{cst.label}</b>?
                </p>
                <div className="reaction-offer-btns">
                  <button className="ro-take" onClick={() => doCounterspell(off)}>
                    Counterspell <span>lvl 3</span>
                  </button>
                  <button
                    className="ro-skip"
                    onClick={() => setDismissedCounters((s) => new Set(s).add(off.id))}
                  >
                    No
                  </button>
                </div>
              </div>
            );
          })()}

          {/* Attack of Opportunity window (#101). A hostile creature left this
              one's reach — its controller (or the DM, on an absent player's
              behalf) may spend a reaction to strike as it goes. */}
          {(() => {
            const off = reactions.pending.find((o) => {
              if (o.kind !== "opportunity") return false;
              const reactor = tokens.find((x) => x.id === o.targetTokenId);
              if (!reactor) return false;
              // Show it to the reactor's own controller. The DM may proxy ONLY a
              // creature it actually runs — a monster/NPC (no character_id) whose
              // stats live on the token. A PLAYER's opportunity attack is theirs
              // alone: never offer it to the DM, even if that sheet happens to be
              // loaded on the DM's client.
              return iControlToken(reactor) || (isDM && !reactor.character_id && !!oaMeleeSpec(reactor));
            });
            if (!off) return null;
            return (
              <div className="reaction-offer" role="alertdialog" aria-label="Attack of Opportunity">
                <div className="reaction-offer-h">
                  <Icon name="swords" size={15} /> Attack of Opportunity
                </div>
                <p className="reaction-offer-b">
                  <b>{off.moverLabel ?? off.by}</b> is leaving <b>{off.targetLabel}</b>'s reach — use your reaction to
                  strike with <b>{off.sourceLabel}</b>?
                </p>
                <div className="reaction-offer-btns">
                  <button className="ro-take" onClick={() => runOpportunityAttack(off)}>
                    Attack <span>{off.sourceLabel}</span>
                  </button>
                  <button className="ro-skip" onClick={() => reactions.respond({ id: off.id, kind: "opportunity" })}>
                    Let them go
                  </button>
                </div>
              </div>
            );
          })()}

          {awaitingCounter && (
            <div className="reaction-wait" role="status">
              <Icon name="sparkles" size={14} />
              <span>Casting <b>{awaitingCounter.spell}</b> — counterspell window…</span>
              <button onClick={() => finishCounter(awaitingCounter.id, { counter: false })} title="Resolve without waiting">
                Skip
              </button>
            </div>
          )}

          {casterCounterSave && (() => {
            const casterTok = tokens.find((t) => t.id === casterCounterSave.casterTokenId);
            if (!casterTok) return null;
            return (
              <DiceRollDialog
                title="Constitution Saving Throw"
                subtitle={`${casterCounterSave.by} counters ${casterCounterSave.spell}`}
                dc={casterCounterSave.dc}
                bonus={saveBonusOfToken(casterTok, "CON")}
                chips={saveChips(casterTok, "CON")}
                optionalBonuses={optionalBonusesFor("save")}
                performRoll={(mode) => rollD20(saveBonusOfToken(casterTok, "CON"), mode)}
                onComplete={(res) => {
                  const held = res.total >= casterCounterSave.dc;
                  broadcastRoll(
                    casterTok.label,
                    [{ label: `CON save vs Counterspell (DC ${casterCounterSave.dc}) — ${held ? "the spell holds!" : "countered!"}`, result: res }],
                    bloomSeedFor(casterTok, held ? "normal" : "crit", held ? "holds" : "countered")
                  );
                  resolveCounterSave(!held);
                }}
                onAutoFail={() => resolveCounterSave(true)}
              />
            );
          })()}

          {/* The in-game HUD — bound to the selected token. Priority: a monster
              token (statblock) → the DM monster HUD; a character token → the
              full player HUD; anything else → a minimal identity dock. Sits in
              the board region (right of the rail), so it never collides. */}
          {selectedToken?.statblock && isDM && (
            <MonsterHud
              statblock={selectedToken.statblock}
              name={selectedToken.label}
              image={selectedToken.image_url}
              hpCurrent={selectedToken.hp_current ?? selectedToken.statblock.hp}
              hpMax={selectedToken.hp_max ?? selectedToken.statblock.hp}
              activeTurn={init.activeToken?.id === selectedToken.id}
              onRoll={fireRoll}
              onAttack={(spec) => requestAttack(selectedToken.label, selectedToken.id, spec)}
              onNote={(msg) => toast.info(msg)}
              onMove={(label) => requestMove(selectedToken.label, selectedToken.id, label)}
              onCounterspellCheck={(name, level) => counterspellCheck(selectedToken, selectedToken.label, name, level)}
              economy={economyView}
              onSpend={(w) => markEconomy(selectedToken.id, w)}
              onEndTurn={() => void init.next()}
              // Only the ACTIVE combatant can end its turn — not "any token the
              // DM has selected". The DM advances other/idle turns from the turn
              // rail's Next button instead.
              endTurnEnabled={init.activeToken?.id === selectedToken.id}
              conditions={selectedToken.conditions ?? undefined}
              buffs={selectedToken.buffs ?? undefined}
              onHp={(current) => void updateToken(selectedToken.id, { hp_current: current })}
              hidden={selectedToken.hidden}
              onToggleHidden={
                isDM ? () => void setTokenHidden(selectedToken.id, !selectedToken.hidden) : undefined
              }
              onDeleteToken={
                isDM
                  ? () => {
                      setSelectedId(null);
                      void deleteToken(selectedToken.id);
                    }
                  : undefined
              }
            />
          )}
          {/* The identity/info bar: shown whenever we're NOT showing the DM's
              monster HUD and NOT the player's own bound HUD — i.e. a token you
              don't control. A player selecting a DM statblock token lands here
              too (name + owner + HP, no stats), instead of seeing nothing. */}
          {selectedToken && !boundCharacter && !(selectedToken.statblock && isDM) && (
            <TokenHud
              label={selectedToken.label}
              image={selectedToken.image_url}
              isDM={isDM}
              owner={
                selectedToken.character_id
                  ? partyOwners.ownerByCharacter.get(selectedToken.character_id) ?? null
                  : partyOwners.dmName
              }
              hp={selectedToken.hp_current ?? selectedToken.statblock?.hp ?? null}
              hpMax={selectedToken.hp_max ?? selectedToken.statblock?.hp ?? null}
              level={selectedToken.char_level ?? null}
              isPlayerChar={!!selectedToken.character_id}
              conditions={selectedToken.conditions ?? undefined}
              buffs={selectedToken.buffs ?? undefined}
              hidden={selectedToken.hidden}
              onToggleHidden={
                isDM ? () => void setTokenHidden(selectedToken.id, !selectedToken.hidden) : undefined
              }
              onDeleteToken={
                isDM
                  ? () => {
                      setSelectedId(null);
                      void deleteToken(selectedToken.id);
                    }
                  : undefined
              }
            />
          )}
          {boundCharacter && !selectedToken?.statblock && (
            <TableHud
              character={boundCharacter}
              isDM={isDM}
              activeTurn={init.activeToken?.id === selectedToken?.id}
              onRoll={fireRoll}
              onAttack={(spec) => selectedToken && requestAttack(boundCharacter.name, selectedToken.id, spec)}
              onNote={(msg) => toast.info(msg)}
              onMove={(label) => selectedToken && requestMove(boundCharacter.name, selectedToken.id, label)}
              onCounterspellCheck={(name, level) =>
                selectedToken ? counterspellCheck(selectedToken, boundCharacter.name, name, level) : Promise.resolve(false)
              }
              onDash={() => selectedToken && markDash(selectedToken.id)}
              onDodge={() => selectedToken && takeDodge(selectedToken)}
              onReady={(entry) => selectedToken && takeReady(selectedToken, entry)}
              onReleaseReady={(entry) => selectedToken && releaseReady(selectedToken, entry)}
              onHide={() => selectedToken && attemptHide(selectedToken)}
              economy={economyView}
              onSpend={(w) => selectedToken && markEconomy(selectedToken.id, w)}
              onEndTurn={() => void init.next()}
              // Same gate as the monster HUD: end-turn belongs to whoever's turn
              // it actually is (the DM uses the rail's Next for everything else).
              endTurnEnabled={!!selectedToken && init.activeToken?.id === selectedToken.id}
              conditions={selectedToken?.conditions ?? undefined}
              buffs={selectedToken?.buffs ?? undefined}
              hp={hpApi}
              onCloseModal={() => setHudModal(null)}
              onUpdate={(mut) => onUpdateCharacter(boundCharacter.id, mut)}
              hidden={selectedToken?.hidden}
              onToggleHidden={
                isDM && selectedToken
                  ? () => void setTokenHidden(selectedToken.id, !selectedToken.hidden)
                  : undefined
              }
              onDeleteToken={
                isDM && selectedToken
                  ? () => {
                      setSelectedId(null);
                      void deleteToken(selectedToken.id);
                    }
                  : undefined
              }
            />
          )}

          {/* Region map lives on the tool rail (#128) — it's a shared world map,
              so it opens for anyone (no bound character needed), unlike the
              sheet-mapped modals below. */}
          {hudModal === "map" && (
            <RegionNavigator
              gameId={game.id}
              isDM={isDM}
              // Pin authoring lives in the Campaign editor (#user ask) — at the
              // table, the DM travels the map exactly like a player.
              canEdit={false}
              scenes={scenes.map((s) => ({ id: s.id, name: s.name }))}
              draftSceneIds={draftSceneIds}
              onTravel={(sceneId) => guardTravel(sceneId)}
              onClose={() => setHudModal(null)}
            />
          )}
          {/* The old bidirectional campaign journal is retired — players read
              shared artifacts in the Journal drawer, and write in chat. */}
          {/* Other game-menu modals are sheet-mapped (need a bound character). */}
          {boundCharacter && hudModal && hudModal !== "map" && hudModal !== "journal" && (
            <TableModals
              which={hudModal}
              character={boundCharacter}
              gameId={game.id}
              isDM={isDM}
              onClose={() => setHudModal(null)}
              onUpdate={(mut) => onUpdateCharacter(boundCharacter.id, mut)}
              onRoll={fireRoll}
              onNote={(msg) => toast.info(msg)}
            />
          )}
          {/* The single combat surface (#146): out of combat it's the DM's
              "Roll for Initiative" pill; in combat it's the turn rail with an
              expandable DM management tray. Replaces the old side Initiative
              panel. The tool-rail hourglass hides/shows it. */}
          {(init.inCombat || isDM) && !railHidden && (
            <CombatTurnRail
              inCombat={init.inCombat}
              order={init.order}
              activeToken={init.activeToken}
              round={init.round}
              isDM={isDM}
              pendingRolls={pendingRollers.length}
              onBegin={() =>
                void init.beginWithPlayerRolls(rollInitiativeFor).then((err) => {
                  if (err)
                    toast.error(
                      err.includes("initiative") || err.includes("in_combat")
                        ? "Combat columns are missing — apply migration 0008_initiative.sql."
                        : err
                    );
                })
              }
              onRollRemaining={() =>
                void init.rollAll(rollInitiativeFor).then((err) => {
                  if (err) toast.error(err);
                })
              }
              onNext={() => void init.next()}
              onPrev={() => void init.previous()}
              onEnd={() => void init.end()}
              onFocusToken={(t) => {
                const span = findSize(t.size).cells;
                setPan({
                  x: (t.x + span / 2) * CELL - width / zoom / 2,
                  y: (t.y + span / 2) * CELL - height / zoom / 2,
                });
                setSelectedId(t.id);
              }}
              dispositionOf={dispositionOf}
              onToggleDisposition={toggleDisposition}
              onRemove={(t) => void init.setInitiative(t.id, null)}
              onSetInitiative={(id, v) => void init.setInitiative(id, v)}
            />
          )}

          {/* Combat-start ritual — a fleeting banner as initiative begins. */}
          {combatBanner && (
            <div className="combat-banner" role="status" aria-live="polite">
              <span className="combat-banner-swords">
                <GameGlyph src="/icons/game_state/game_initiative.svg" size={30} />
              </span>
              <span className="combat-banner-title">Roll for Initiative</span>
              <span className="combat-banner-sub">Combat begins — Round {init.round}</span>
            </div>
          )}

          {tool === "fog" && isDM && (
            <div className="fog-panel panel">
              <div className="fog-panel-head">Fog of War</div>
              <label className="drawer-option" style={{ padding: "4px 0" }}>
                <input
                  type="checkbox"
                  checked={fog.enabled}
                  onChange={(e) => {
                    void fog.setEnabled(e.target.checked).then((err) => {
                      if (err) {
                        toast.error(
                          err.includes("fog")
                            ? "Fog columns are missing — apply migration 0010_fog_of_war.sql."
                            : err
                        );
                      }
                    });
                  }}
                />
                <span>Fog enabled</span>
              </label>
              <div className="fog-mode">
                <button
                  className={fogMode === "reveal" ? "active" : ""}
                  onClick={() => setFogMode("reveal")}
                  title="Drag to reveal the map"
                >
                  Reveal
                </button>
                <button
                  className={fogMode === "hide" ? "active" : ""}
                  onClick={() => setFogMode("hide")}
                  title="Drag to cover the map again"
                >
                  Cover
                </button>
              </div>
              <div className="fog-bulk">
                <button className="ghost" onClick={() => fog.setAll(true, rows)}>
                  Reveal all
                </button>
                <button className="ghost" onClick={() => fog.setAll(false, rows)}>
                  Cover all
                </button>
              </div>
            </div>
          )}

          {tool === "draw" && (
            <div className="fog-panel panel">
              <div className="fog-panel-head">Draw</div>
              <div className="draw-tools">
                {([
                  ["pen", "draw"],
                  ["rect", "rect"],
                  ["ellipse", "ellipse"],
                  ["arrow", "arrow"],
                  ["erase", "eraser"],
                ] as const).map(([kind, icon]) => (
                  <button
                    key={kind}
                    className={`draw-tool ${drawKind === kind ? "active" : ""}`}
                    onClick={() => setDrawKind(kind)}
                    title={kind === "erase" ? "Erase (click a drawing)" : `Draw ${kind}`}
                    aria-label={kind}
                  >
                    <Icon name={icon} size={15} />
                  </button>
                ))}
              </div>
              {drawKind !== "erase" && (
                <div className="draw-colors">
                  {DRAW_COLORS.map((c) => (
                    <button
                      key={c}
                      className={`draw-swatch ${drawColor === c ? "active" : ""}`}
                      style={{ background: c }}
                      onClick={() => setDrawColor(c)}
                      aria-label={`colour ${c}`}
                    />
                  ))}
                </div>
              )}
              <div className="fog-bulk">
                <button className="ghost" onClick={() => void clearDrawings(true)}>
                  Clear mine
                </button>
                {isDM && (
                  <button className="ghost" onClick={() => void clearDrawings(false)}>
                    Clear all
                  </button>
                )}
              </div>
            </div>
          )}

          {partyOpen && (
            <PartyTray
              characters={characters}
              onPlace={(ch) => {
                void placeCharacter(ch);
                setPartyOpen(false);
              }}
              onClose={() => setPartyOpen(false)}
            />
          )}

          {/* The social Party panel — members, presence, invite (IA: decoupled
              from the personal characters tray). */}
          {partyPanelOpen && (
            <PartyPanel
              party={party}
              myUserId={authUser?.id ?? null}
              mySceneId={activeScene?.id ?? null}
              stageSceneId={stageSceneId}
              sceneNameOf={(id) => scenes.find((s) => s.id === id)?.name ?? null}
              isDM={isDM}
              joinCode={game.join_code}
              onCopyInvite={() => {
                const url = `${window.location.origin}/#/join/${game.join_code}`;
                void navigator.clipboard.writeText(url);
                toast.success("Invite link copied");
              }}
              onBringHere={(userId) => {
                // Landing them on the DM's scene: if the DM is on the stage,
                // clear the override (follow the stage); else pin them to it.
                const dest = activeScene?.id === stageSceneId ? null : activeScene?.id ?? null;
                void moveMember(userId, dest).then(({ error }) => {
                  if (error) toast.error(error);
                  else toast.success("Player brought to your scene");
                });
              }}
              onClose={() => setPartyPanelOpen(false)}
            />
          )}

          {/* Hotspot editor (#Phase 2) — DM names a pin, links it to a scene
              (or spawns a new one inline), gates it, or removes it. */}
          {editHotspotId && isDM && (() => {
            const h = hotspots.find((x) => x.id === editHotspotId);
            if (!h) return null;
            const others = scenes.filter((s) => s.id !== activeScene?.id);
            return (
              <div className="panel hotspot-editor">
                <div className="panel-title">Travel hotspot</div>
                <label className="hotspot-field">
                  <span>Label</span>
                  <input
                    autoFocus
                    value={hotspotLabelDraft}
                    onChange={(e) => setHotspotLabelDraft(e.target.value)}
                    onBlur={() => void updateHotspot(h.id, { label: hotspotLabelDraft })}
                    placeholder="e.g. The Keep"
                  />
                </label>
                <label className="hotspot-field">
                  <span>Links to scene</span>
                  <select
                    value={h.target_scene_id ?? ""}
                    onChange={async (e) => {
                      const v = e.target.value;
                      if (v === "__new__") {
                        const name = await prompt({
                          title: "New scene",
                          subtitle: "Name the destination this pin leads to",
                          initialValue: hotspotLabelDraft || `Scene ${scenes.length + 1}`,
                          confirmLabel: "Create scene",
                        });
                        if (!name) return;
                        const { scene, error } = await createScene(name);
                        if (error) {
                          toast.error(error);
                          return;
                        }
                        if (scene) await updateHotspot(h.id, { target_scene_id: scene.id });
                      } else {
                        await updateHotspot(h.id, { target_scene_id: v || null });
                      }
                    }}
                  >
                    <option value="">— Not linked —</option>
                    {others.map((s) => (
                      <option key={s.id} value={s.id}>
                        {s.name}
                      </option>
                    ))}
                    <option value="__new__">＋ New scene…</option>
                  </select>
                </label>
                <label className="hotspot-toggle">
                  <input
                    type="checkbox"
                    checked={h.hidden}
                    onChange={(e) => updateHotspot(h.id, { hidden: e.target.checked })}
                  />
                  <span>Hidden until revealed</span>
                </label>
                <div className="hotspot-editor-actions">
                  <button
                    className="ghost"
                    style={{ color: "var(--ember)" }}
                    onClick={() => {
                      void deleteHotspot(h.id);
                      setEditHotspotId(null);
                    }}
                  >
                    Delete
                  </button>
                  <button
                    className="primary"
                    onClick={() => {
                      void updateHotspot(h.id, { label: hotspotLabelDraft });
                      setEditHotspotId(null);
                    }}
                  >
                    Done
                  </button>
                </div>
              </div>
            );
          })()}

          {/* Map alignment panel (#115) — DM nudges/scales the background image so
              its baked grid lines up with the canonical overlay. Live-updates the
              scene so the change is visible (and shared) as it's tweaked. */}
          {aligning && isDM && activeScene && (
            <div className="panel map-align-pop">
              <div className="panel-title">Align map to grid</div>
              <p className="dim" style={{ fontSize: 11, margin: "0 0 8px" }}>
                {calibrating
                  ? calibPt
                    ? "Now click the OPPOSITE corner of that same square."
                    : "Click one corner of a printed grid square on the map."
                  : "Drag the map to move it, scroll to zoom. Or calibrate: click two opposite corners of one printed square."}
              </p>
              <div className="map-align-row">
                <span>Columns</span>
                <div className="map-align-stepper">
                  <button type="button" onClick={() => void updateSceneLayout(activeScene.id, { grid_cols: Math.max(5, cols - 1) })}>−</button>
                  <b>{cols}</b>
                  <button type="button" onClick={() => void updateSceneLayout(activeScene.id, { grid_cols: Math.min(60, cols + 1) })}>+</button>
                </div>
              </div>
              <div className="map-align-row">
                <span>Rows</span>
                <div className="map-align-stepper">
                  <button type="button" onClick={() => void updateSceneLayout(activeScene.id, { grid_rows: Math.max(5, rows - 1) })}>−</button>
                  <b>{rows}</b>
                  <button type="button" onClick={() => void updateSceneLayout(activeScene.id, { grid_rows: Math.min(60, rows + 1) })}>+</button>
                </div>
              </div>
              <label className="map-align-slider">
                <span>Scale <em>{mapScale.toFixed(2)}×</em></span>
                <input
                  type="range" min={0.25} max={6} step={0.01} value={mapScale}
                  onChange={(e) => void updateSceneLayout(activeScene.id, { map_scale: parseFloat(e.target.value) })}
                />
              </label>
              <button
                type="button"
                className={calibrating ? "primary" : ""}
                style={{ width: "100%", marginTop: 4 }}
                onClick={() => { setCalibrating((v) => !v); setCalibPt(null); }}
              >
                {calibrating ? "Cancel calibrate" : "Calibrate a cell"}
              </button>
              <div className="row" style={{ gap: 8, marginTop: 10 }}>
                <button
                  type="button"
                  className="ghost"
                  onClick={() => void updateSceneLayout(activeScene.id, { map_offset_x: 0, map_offset_y: 0, map_scale: 1 })}
                >
                  Reset
                </button>
                <button type="button" className="primary" onClick={() => { setAligning(false); setCalibrating(false); setCalibPt(null); }}>Done</button>
              </div>
            </div>
          )}

          {/* Add-token popover floats over the board near the rail */}
          {addOpen && (
            <form
              className="panel add-token-pop"
              onSubmit={handleAdd}
              style={{
                position: "absolute",
                top: 12,
                left: 12,
                zIndex: 10,
                display: "flex",
                gap: 8,
                alignItems: "center",
                flexWrap: "wrap",
                boxShadow: "var(--shadow-lg)",
              }}
            >
              <input
                autoFocus
                placeholder="Label (e.g. Goblin A)"
                value={newLabel}
                onChange={(e) => setNewLabel(e.target.value)}
                style={{ minWidth: 180 }}
              />
              <div style={{ display: "flex", gap: 4 }}>
                {COLOR_CHOICES.map((c) => (
                  <button
                    type="button"
                    key={c}
                    onClick={() => setNewColor(c)}
                    style={{
                      width: 24,
                      height: 24,
                      padding: 0,
                      borderRadius: "50%",
                      background: c,
                      border: newColor === c ? "2px solid var(--text)" : "1px solid var(--panel-border)",
                    }}
                    aria-label={`color ${c}`}
                  />
                ))}
              </div>
              <button className="primary" type="submit" style={{ fontSize: 12 }}>
                Add
              </button>
              <button
                className="ghost"
                type="button"
                onClick={() => setAddOpen(false)}
                style={{ fontSize: 12 }}
              >
                Cancel
              </button>
            </form>
          )}
        </div>
      </div>

      <div className="table-hint">
        {tool === "pan"
          ? "Pan mode — drag to move the view · switch to Select to move tokens"
          : tool === "ping"
            ? "Ping mode — click or tap anywhere to pulse that spot for every player"
            : tool === "ruler"
              ? "Ruler — drag to measure · every square is 5 ft, diagonals included"
              : tool === "fog"
                ? `Fog — drag to ${fogMode === "reveal" ? "reveal" : "cover"} · players see black, you see through`
                : tool === "draw"
                  ? drawKind === "erase"
                    ? "Erase — click a drawing to remove it"
                    : `Draw — drag to sketch a ${drawKind} · everyone at the table sees it`
                  : "Drag tokens · Click then Delete (or right-click) to remove · Scroll or pinch to zoom · Hold Space to pan"}
      </div>

      {rollerOpen && (
        <DiceRoller
          onClose={() => setRollerOpen(false)}
          onRolled={(label, result) => broadcastRoll(myName, [{ label, result }])}
        />
      )}
      {logOpen && (
        <GameLog
          entries={gameFeed.entries}
          myUserId={authUser?.id ?? null}
          onSend={gameFeed.sendChat}
          onClose={() => setLogOpen(false)}
        />
      )}

      {/* DM authors + shares in Story; players read what's been shared in the
          Journal (Story/Journal reconciliation). */}
      {storyOpen && isDM && (
        <StoryDrawer
          sceneName={activeScene?.name ?? "No scene"}
          sceneDocs={storyDocs.filter((d) => d.scene_id === activeScene?.id)}
          campaignDocs={storyDocs.filter((d) => !d.scene_id && !d.chapter_id && !d.session_id && d.kind !== "recap")}
          latestRecap={
            storyDocs
              .filter((d) => d.kind === "recap" && d.session_id)
              .sort((a, b) => b.created_at.localeCompare(a.created_at))[0] ?? null
          }
          isShared={(id) => sharedDocIdSet.has(id)}
          onShare={(d) => {
            // One action: file it in every player's Journal AND show it live.
            void shareWithParty(d.id, activeSessionRef.current?.id ?? null);
            presentDoc({ id: d.id, title: d.title, content: d.content, kind: d.kind, meta: d.meta });
          }}
          onClose={() => setStoryOpen(false)}
        />
      )}
      {storyOpen && !isDM && (
        <JournalDrawer docs={storyDocs} shares={docShares} sessions={sessions} onClose={() => setStoryOpen(false)} />
      )}
      {/* Loops the staged scene's ambience through the Ambiance channel —
          swapping to the combat cue while the scene is in_combat (#0047). */}
      <SceneAmbience
        trackKey={effectiveAmbienceKey(activeScene?.ambience_url, activeScene?.combat_ambience_url, Boolean(activeScene?.in_combat))}
      />
      {audioOpen && <AudioSettingsPopover onClose={() => setAudioOpen(false)} />}
      {isDM && (
        <CoDMCompanion
          gameId={game.id}
          label="Oculus"
          intro="I'm Oculus, your second set of eyes — I've read your whole campaign. Ask me anything, or tell me to stage a scene, place tokens, or share a handout; nothing reaches the players without your nod. Tap the 🔔 up top and I'll nudge you when I spot something worth doing."
          starters={[
            "What's the party heading toward, and what have I prepped for it?",
            "Remind me of this scene's secret.",
            "Suggest what to stage next.",
          ]}
          nudgeSignal={nudgeSignal}
          nudgesToggleable
          sceneName={activeScene?.name ?? null}
          onSaveToScene={async (kind, content) => {
            if (!activeScene?.id) return;
            const { error } = await createStoryDoc({
              kind,
              scene_id: activeScene.id,
              title: kind === "read_aloud" ? "From Oculus" : "Oculus note",
              content,
            });
            if (error) toast.error(error);
            else toast.success(`Saved to ${activeScene.name} — find it in Story.`);
          }}
          proposalLabel={(p) => {
            if (p.tool === "stage_scene") {
              const name = String(p.input.scene_name ?? "a scene");
              const why = p.input.reason ? ` — ${String(p.input.reason)}` : "";
              return `Stage "${name}" for everyone${why}?`;
            }
            if (p.tool === "place_tokens") {
              const n = Number(p.input.count ?? 1);
              const who = String(p.input.creature_name ?? "token");
              return `Place ${n}× ${who} on the board?`;
            }
            if (p.tool === "share_doc") {
              const d = storyDocs.find((x) => x.id === String(p.input.document_id));
              const why = p.input.reason ? ` — ${String(p.input.reason)}` : "";
              return `Share "${d?.title || (d ? "untitled" : "a document")}" with the players${why}?`;
            }
            if (p.tool === "remember") {
              return `Remember: “${String(p.input.content ?? "")}”?`;
            }
            return `Run ${p.tool}?`;
          }}
          onProposal={async (p) => {
            // 3c — execute an APPROVED proposal via the same paths the DM's
            // own controls use. Only stage_scene exists this slice.
            if (p.tool === "stage_scene") {
              const wanted = String(p.input.scene_name ?? "").trim().toLowerCase();
              const target = scenes.find((s) => s.name.trim().toLowerCase() === wanted);
              if (!target) return { ok: false, message: `No scene named "${p.input.scene_name}".` };
              if (target.id === activeScene?.id) return { ok: false, message: "Already staged there." };
              await setActiveScene(target.id);
              if (authUser)
                appendGameLog({
                  game_id: game.id,
                  session_id: activeSessionRef.current?.id ?? null,
                  kind: "system",
                  author_id: authUser.id,
                  author_name: myName,
                  body: { type: "scene_staged", scene: target.name },
                });
              return { ok: true, message: `Staged ${target.name}.` };
            }
            if (p.tool === "place_tokens") {
              if (!activeScene?.id) return { ok: false, message: "No scene staged." };
              const who = String(p.input.creature_name ?? "").trim();
              const count = Math.min(Math.max(1, Number(p.input.count ?? 1)), 12);
              if (!who) return { ok: false, message: "No creature named." };
              // Resolve against the library: exact name, else contains-match.
              const term = who.toLowerCase();
              const asset =
                libraryAssets.find((a) => a.name.trim().toLowerCase() === term) ??
                libraryAssets.find((a) => a.name.toLowerCase().includes(term));
              // Pre-compute distinct cells in a cluster near center — placing
              // in a tight loop can't rely on findFreeCell (the just-placed
              // token hasn't registered yet, so it'd stack them all).
              const cols = activeScene.grid_cols ?? 30;
              const rows = activeScene.grid_rows ?? 20;
              const cx = Math.floor(cols / 2);
              const cy = Math.floor(rows / 2);
              const cells: Array<{ x: number; y: number }> = [];
              const w = Math.ceil(Math.sqrt(count));
              for (let i = 0; i < count; i++) {
                cells.push({
                  x: Math.min(cols - 1, cx + (i % w)),
                  y: Math.min(rows - 1, cy + Math.floor(i / w)),
                });
              }
              let placed = 0;
              for (let i = 0; i < count; i++) {
                const res = asset
                  ? await placeTokenFromLibrary(asset, cells[i])
                  : await addToken({ label: count > 1 ? `${who} ${i + 1}` : who, color: "#b23a24", ...cells[i] });
                if (!res.error) placed++;
              }
              if (placed === 0) return { ok: false, message: "Couldn't place any." };
              return {
                ok: true,
                message: `Placed ${placed}× ${asset ? asset.name : who}${asset ? "" : " (marker)"} — drag them into position.`,
              };
            }
            if (p.tool === "share_doc") {
              const d = storyDocs.find((x) => x.id === String(p.input.document_id));
              if (!d) return { ok: false, message: "Couldn't find that document." };
              if (d.kind === "note") return { ok: false, message: "That's a private note — not for players." };
              // Same one-action Share the Story drawer uses: file + show live.
              void shareWithParty(d.id, activeSessionRef.current?.id ?? null);
              presentDoc({ id: d.id, title: d.title, content: d.content, kind: d.kind, meta: d.meta });
              return { ok: true, message: `Shared "${d.title || "it"}" — it's on their screens and in the journal.` };
            }
            if (p.tool === "remember") {
              const content = String(p.input.content ?? "").trim();
              if (!content) return { ok: false, message: "Nothing to remember." };
              if (!authUser) return { ok: false, message: "Not signed in." };
              const { error } = await supabase
                .from("campaign_memory")
                .insert({ game_id: game.id, content, created_by: authUser.id });
              if (error) return { ok: false, message: error.message };
              return { ok: true, message: "Noted — I'll remember that." };
            }
            return { ok: false, message: `Unknown action: ${p.tool}` };
          }}
        />
      )}
      {/* Players get the same companion in a spoiler-safe Guide mode (#7):
          rules help + what the party has been shown, no secrets, no actions. */}
      {!isDM && (
        <CoDMCompanion
          gameId={game.id}
          role="player"
          label="Oculus"
          intro="Hi, I'm Oculus! I can help with the D&D rules, or remind you what your party has learned so far. Ask away — I won't spoil anything."
          starters={[
            "How does advantage work?",
            "What have we learned so far?",
            "What can I do on my turn?",
          ]}
        />
      )}

      {/* Present overlay (#0041 slice 1e) — the DM's boxed text on every
          screen: the table reads along while the DM reads aloud. */}
      {presented && presentHiddenFor !== presented.eventId && (
        <div className="present-veil">
          <div className={`present-card ${presented.kind === "handout" ? "is-handout" : ""}`}>
            <div className="present-kicker">
              {presented.kind === "handout"
                ? "The DM hands you…"
                : presented.kind === "recap"
                  ? "Previously on…"
                  : presented.kind === "quest"
                    ? "A new quest…"
                    : "The DM reads…"}
            </div>
            {presented.kind === "handout" ? (
              <HandoutView meta={presented.meta} />
            ) : (
              <>
                {presented.title && <div className="present-title">{presented.title}</div>}
                {presented.content && <div className="present-text">{presented.content}</div>}
                {presented.kind === "quest" && <QuestView meta={presented.meta} />}
              </>
            )}
            <button
              className="present-close"
              onClick={() => (isDM ? dismissPresented() : setPresentHiddenFor(presented.eventId))}
              title={isDM ? "Dismiss for everyone" : "Hide (just for you)"}
            >
              <Icon name="close" size={14} />
              {isDM ? "Dismiss" : "Hide"}
            </button>
          </div>
        </div>
      )}

      {tokenPickerOpen && activeScene && (
        <TokenPickerDialog
          onQuickMarker={() => setAddOpen(true)}
          onPick={async (a) => {
            const { error } = await placeTokenFromLibrary(a);
            if (error) toast.error(error);
            else toast.success(`${a.name} placed on the table`);
            setTokenPickerOpen(false);
          }}
          onClose={() => setTokenPickerOpen(false)}
        />
      )}

      {pickerOpen && (() => {
        // The picker fills a face on the scene chosen from the gallery card's
        // ⋯ menu (#IA rework); falls back to the active scene.
        const target = scenes.find((s) => s.id === pickerSceneId) ?? activeScene;
        if (!target) return null;
        return (
          <MapPickerDialog
            filterType={pickerTarget === "tactical" ? ["battlemap"] : ["cinematic", "regional"]}
            slot={pickerTarget === "tactical" ? "battlemap" : "backdrop"}
            currentMapId={pickerTarget === "tactical" ? target.map_id : null}
            onClear={
              (pickerTarget === "tactical" ? target.image_url : target.cinematic_url)
                ? async () => {
                    const { error } =
                      pickerTarget === "tactical"
                        ? await setSceneImageUrl(target.id, null)
                        : await setSceneCinematicUrl(target.id, null);
                    if (error) toast.error(error);
                    else toast.success(`${target.name}: ${pickerTarget === "tactical" ? "battlemap" : "backdrop"} cleared`);
                    setPickerOpen(false);
                    setPickerSceneId(null);
                  }
                : undefined
            }
            onPick={async (m) => {
              if (pickerTarget === "cinematic") {
                const { error } = await setSceneCinematicUrl(target.id, m.image_url);
                if (error) toast.error(error);
                else toast.success(`${target.name}: backdrop set to ${m.name}`);
              } else {
                const { error } = await applyMapToScene(target.id, m);
                if (error) toast.error(error);
                else toast.success(`${target.name}: battlemap set to ${m.name}`);
              }
              setPickerOpen(false);
              setPickerSceneId(null);
            }}
            onClose={() => {
              setPickerOpen(false);
              setPickerSceneId(null);
            }}
          />
        );
      })()}

      {isDM && lootEditToken && (
        <LootEditorDialog
          tokenLabel={lootEditToken.label}
          loot={lootEditToken.loot ?? null}
          onSave={(loot) => void saveDmLoot(lootEditToken.id, loot)}
          onClose={() => setLootEditTokenId(null)}
        />
      )}

      {lootToken && (
        <LootDialog
          sourceName={lootToken.label}
          loot={lootToken.loot ?? { coins: {}, items: [] }}
          looterName={looterCharacter?.name ?? null}
          onTakeItem={(id) => void takeLootItem(id)}
          onTakeAll={() => void takeAllLoot()}
          onClose={() => setLootTokenId(null)}
        />
      )}

      {/* Player context menu on a downed DM token — Loot / Examine, anchored to
          the tap. A transparent backdrop closes it on any outside click. */}
      {tokenMenu && menuToken && (
        <>
          <div className="token-menu-backdrop" onPointerDown={() => setTokenMenu(null)} />
          <div
            className="token-menu"
            style={{
              left: Math.min(tokenMenu.x, window.innerWidth - 180),
              top: Math.min(tokenMenu.y, window.innerHeight - 140),
            }}
            role="menu"
            aria-label={`${menuToken.label} actions`}
          >
            <div className="token-menu-t">{menuToken.label}</div>
            {isDM ? (
              // The DM's menu: Examine opens the card where loot is added.
              <button role="menuitem" onClick={examineFromMenu}>
                <Icon name="eye" size={15} /> Examine
              </button>
            ) : (
              <>
                {menuToken.statblock && !tokenIsDead(menuToken) &&
                  !(menuToken.character_id && ownedCharacterIds.has(menuToken.character_id)) && (
                    <button role="menuitem" onClick={stealFromMenu}>
                      <Icon name="dice" size={15} /> Steal
                      <span className="token-menu-note">sleight of hand</span>
                    </button>
                  )}
                {/* Loot only appears once the token is a body to loot — defeated
                    (0 HP) or a container already carrying loot. A living creature
                    shows no Loot at all. Once picked clean it stays, disabled. */}
                {(tokenIsDead(menuToken) || menuToken.loot != null) && (
                  <button
                    role="menuitem"
                    onClick={lootFromMenu}
                    disabled={!isFreeLootable(menuToken)}
                    title={lootedClean(menuToken) ? "Nothing left to loot" : undefined}
                  >
                    <Icon name="package" size={15} /> Loot
                    {lootedClean(menuToken) && <span className="token-menu-note">looted</span>}
                  </button>
                )}
                {menuToken.statblock && (
                  <button role="menuitem" onClick={examineFromMenu}>
                    <Icon name="eye" size={15} /> Examine
                  </button>
                )}
              </>
            )}
          </div>
        </>
      )}

      {/* Examine card. Players (statblock only): observe + roll checks. The DM
          (any token): a prep card where loot is stashed on the token. */}
      {examineToken && (isDM || examineToken.statblock) && (
        <Dialog
          onClose={() => {
            setExamineTokenId(null);
            setExamineCheck(null);
          }}
          size="sm"
          title={examineToken.label}
          // Only what a character could physically observe — size + kind. No CR,
          // AC, HP, senses, or spell list: those are the DM's to reveal (or not)
          // through what a skill check turns up.
          subtitle={
            examineToken.statblock
              ? `${examineToken.statblock.size.charAt(0).toUpperCase()}${examineToken.statblock.size.slice(1)} ${examineToken.statblock.type}`
              : examineToken.kind === "prop"
                ? "Object"
                : undefined
          }
        >
          <div className="examine">
            {examineToken.image_url && <img className="examine-pf" src={examineToken.image_url} alt="" />}
            {isDM ? (
              <>
              {/* DM controls: loot (non-PC) + the status picker (any token). */}
              {examineToken.character_id ? (
                <p className="examine-lead">
                  This is a player's character — loot goes on monsters, NPCs, or props.
                </p>
              ) : (
                <>
                  {examineToken.loot && !lootIsEmpty(examineToken.loot) ? (
                    <div className="examine-holds">
                      <span className="examine-holds-l">Holds</span>
                      <span className="examine-holds-v">{lootSummary(examineToken.loot)}</span>
                    </div>
                  ) : lootedClean(examineToken) ? (
                    <p className="examine-lead">Looted — nothing left. Add more to restock it.</p>
                  ) : (
                    <p className="examine-lead">
                      Stash loot on {examineToken.label} — the party finds it when they loot the token.
                    </p>
                  )}
                  <button className="examine-loot-btn" onClick={() => addLootToToken(examineToken)}>
                    <Icon name="package" size={15} />{" "}
                    {examineToken.loot && !lootIsEmpty(examineToken.loot) ? "Edit loot" : "Add loot"}
                  </button>
                </>
              )}
              <TokenStatusEditor
                conditions={examineToken.conditions ?? []}
                buffs={examineToken.buffs ?? []}
                onToggleCondition={(name) => toggleCondition(examineToken, name)}
                onToggleBuff={(name) => toggleBuff(examineToken, name)}
              />
              </>
            ) : (
              examineToken.statblock && (
                <>
                  <p className="examine-lead">
                    You look the body over. Roll a check — the DM will tell you what you notice.
                  </p>
                  <div className="examine-checks">
                    <span className="examine-checks-l">
                      {looterCharacter ? `${looterCharacter.name} · investigate` : "Make a check"}
                    </span>
                    <div className="examine-checks-row">
                      {(["Medicine", "Investigation", "Perception", loreSkillFor(examineToken.statblock.type)] as SkillName[])
                        .filter((s, i, a) => a.indexOf(s) === i)
                        .map((skill) => (
                          <button key={skill} onClick={() => examineRoll(skill)} disabled={!looterCharacter}>
                            <Icon name="dice" size={13} /> {skill}
                          </button>
                        ))}
                    </div>
                  </div>
                </>
              )
            )}
          </div>
        </Dialog>
      )}

      {/* Cinematic dice roll for an Examine skill check — no DC (the DM reads the
          logged total and narrates what the character learns). */}
      {examineCheck && examineToken && looterCharacter && (
        <DiceRollDialog
          title={`${examineCheck.skill} Check`}
          subtitle={`${looterCharacter.name} · examining ${examineToken.label}`}
          bonus={skillBonus(looterCharacter, examineCheck.skill)}
          optionalBonuses={optionalBonusesFor("check")}
          performRoll={(mode) => rollD20(skillBonus(looterCharacter, examineCheck.skill), mode)}
          onComplete={(res) => {
            broadcastRoll(
              looterCharacter.name,
              [{ label: `${examineCheck.skill} check · ${examineToken.label}`, result: res }],
              bloomSeedFor(examineToken, "normal", String(res.total))
            );
            setExamineCheck(null);
          }}
          onAutoFail={() => setExamineCheck(null)}
        />
      )}

      {/* Pickpocket (#131): the player rolls Sleight of Hand here, then the total
          is checked against the mark's passive Perception. */}
      {stealRoll && (() => {
        const thief = tokens.find((t) => t.id === stealRoll.thiefId);
        const target = tokens.find((t) => t.id === stealRoll.targetId);
        const char = thief?.character_id ? characters.find((c) => c.id === thief.character_id) : undefined;
        if (!thief || !target || !char || !target.statblock) return null;
        const bonus = skillBonus(char, "Sleight of Hand");
        const dc = passivePerceptionOf(target.statblock);
        return (
          <DiceRollDialog
            title="Sleight of Hand"
            subtitle={`${char.name} · pickpocketing ${target.label}`}
            dc={dc}
            bonus={bonus}
            chips={skillCheckChips(char, "Sleight of Hand")}
            optionalBonuses={optionalBonusesFor("check")}
            performRoll={(mode) => rollD20(bonus, mode)}
            onComplete={(res) => {
              const success = res.total >= dc;
              broadcastRoll(
                char.name,
                [{ label: `${char.name} · Sleight of Hand vs ${target.label}`, result: res }],
                bloomSeedFor(target, "normal", String(res.total))
              );
              if (success) {
                toast.success(`Lifted it clean — rolled ${res.total} vs DC ${dc}.`);
                void openLoot(target);
              } else {
                toast.error(`Caught! ${target.label} felt the tug (rolled ${res.total} vs DC ${dc}).`);
                autoStartCombatRef.current();
              }
              setStealRoll(null);
            }}
            onAutoFail={() => setStealRoll(null)}
          />
        );
      })()}

      {/* Initiative ritual (#102): each player rolls their OWN token's initiative
          on their screen. Monsters/NPCs were auto-rolled when combat began; the
          DM covers absent players from the tracker. Non-dismissible — the die is
          the only way forward, just like BG3. */}
      {init.inCombat && (() => {
        const mine = pendingRollers.find((t) => !!t.character_id && iControlToken(t));
        if (!mine || !mine.character_id) return null;
        const ch = characters.find((c) => c.id === mine.character_id);
        if (!ch) return null;
        const bonus = initiativeMod(ch);
        return (
          <DiceRollDialog
            // Key by the combatant so the dialog REMOUNTS for each PC. Without it,
            // React reuses the instance and its internal roll/reveal phase stays
            // "landed" from the previous character — the die never re-arms and the
            // ritual stalls after the first roll (#158).
            key={mine.id}
            title="Roll for Initiative"
            subtitle={`${ch.name} · combat begins`}
            bonus={bonus}
            chips={[{ label: "Initiative", value: bonus }]}
            performRoll={(mode) => rollD20(bonus, mode)}
            onComplete={(res) => {
              void init.setInitiative(mine.id, res.total);
              broadcastRoll(ch.name, [{ label: `${ch.name} · Initiative`, result: res }]);
            }}
            onAutoFail={() => {}}
          />
        );
      })()}

      {/* Saving-throw prompts — the defender rolls; the DM can roll for an
          absent player from the override list. */}
      {(() => {
        const tokenOf = (id: string) => tokens.find((t) => t.id === id) ?? null;
        const controlled = saves.pending.filter((r) => {
          const t = tokenOf(r.targetTokenId);
          return t && iControlToken(t);
        });
        const active = controlled[0] ?? saves.pending.find((r) => r.id === dmPickId) ?? null;
        const others = isDM ? saves.pending.filter((r) => !controlled.includes(r)) : [];
        const target = active ? tokenOf(active.targetTokenId) : null;
        return (
          <>
            {active && target && (
              <DiceRollDialog
                // Same remount-per-subject fix as initiative (#158): several
                // pending saves resolve in sequence, so key by the save id or the
                // dialog stays "landed" from the previous target and can't reroll.
                key={active.id}
                title={`${ABILITY_FULL[active.ability] ?? active.ability} Saving Throw`}
                subtitle={
                  (!controlled.includes(active) ? `${active.targetLabel} · ` : "") +
                  (active.repeat ? `Shake off ${active.sourceLabel}` : active.sourceLabel)
                }
                dc={active.dc}
                bonus={saveBonusOfToken(target, active.ability)}
                chips={saveChips(target, active.ability)}
                optionalBonuses={optionalBonusesFor("save")}
                autoFail={autoFailsSave(target.conditions ?? [], active.ability)}
                onBehalf={!controlled.includes(active)}
                // Dodging grants ADVANTAGE on DEX saves (slice F) — pre-select
                // it; the roller can still override. Negated by incapacitated
                // OR speed 0, exactly like the incoming-attack path (review fix).
                initialMode={
                  active.ability === "DEX" &&
                  (target.buffs ?? []).includes("Dodging") &&
                  !aggregateConditions(target.conditions ?? []).incapacitated &&
                  !aggregateConditions(target.conditions ?? []).speed0
                    ? "adv"
                    : undefined
                }
                performRoll={(mode) => rollD20(saveBonusOfToken(target, active.ability), mode)}
                onComplete={(res) => {
                  setDmPickId(null);
                  applySaveOutcome(active, target, res.total >= active.dc, res);
                }}
                onAutoFail={() => {
                  setDmPickId(null);
                  resolveSaveAutoFail(active);
                }}
              />
            )}
            {others.length > 0 && (
              <div className="save-override">
                <div className="save-override-h">
                  <Icon name="dice" size={13} /> Pending saves
                </div>
                {others.map((r) => (
                  <button key={r.id} onClick={() => setDmPickId(r.id)}>
                    Roll <b>{r.ability}</b> for {r.targetLabel} <span>DC {r.dc}</span>
                  </button>
                ))}
              </div>
            )}
          </>
        );
      })()}

    </div>
  );
};
