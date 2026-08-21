import { useEffect, useRef, useState } from "react";
import { useRegionMaps, useMapHotspots } from "../state/useRegionNav";
import { MapPickerDialog } from "./MapPickerDialog";
import { GameGlyph } from "./ui/GameGlyph";
import { Icon } from "./ui/Icon";

/**
 * The Region Map navigator (IA rework) — the world the players click through.
 *
 * The GM adds regional maps from the library and pins hotspots onto them; a pin
 * leads to a SCENE (travel — per-player, via onTravel) or drills into a deeper
 * REGION MAP (Kingdom → City → tavern), with a breadcrumb back up. Players open
 * this panel, see the pins, and navigate themselves. Replaces the old read-only
 * single-image RegionMapModal.
 */

interface Props {
  gameId: string;
  isDM: boolean;
  /** Scenes to link pins to (id + name is all we need). */
  scenes: Array<{ id: string; name: string }>;
  /** Scenes in draft chapters — their pins are hidden from players (#0041).
   *  Passed down from TableCanvas: useDraftSceneIds subscribes to a realtime
   *  topic, and a topic tolerates exactly ONE consumer — mounting the hook
   *  here too crashed the tree the moment the map opened. */
  draftSceneIds: Set<string>;
  /** Travel THIS member to a scene (per-player navigation). */
  onTravel: (sceneId: string) => void;
  onClose: () => void;
}

export const RegionNavigator = ({ gameId, isDM, scenes, draftSceneIds, onTravel, onClose }: Props) => {
  const { regionMaps, loading, createRegionMap, deleteRegionMap } = useRegionMaps(gameId);
  // Breadcrumb of map ids; the top is what's shown. Seeded to the root (oldest).
  const [stack, setStack] = useState<string[]>([]);
  const [editMode, setEditMode] = useState(false);
  const [editPinId, setEditPinId] = useState<string | null>(null);
  const [labelDraft, setLabelDraft] = useState("");
  // Which picker is open: adding the root/current-level map, or a pin's sub-map.
  const [mapPicker, setMapPicker] = useState<null | { forPin: string | null }>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (stack.length === 0 && regionMaps.length > 0) setStack([regionMaps[0].id]);
    // A deleted map may leave a dangling stack — trim to known maps.
    if (stack.length > 0 && !regionMaps.some((m) => m.id === stack[stack.length - 1])) {
      setStack((prev) => prev.slice(0, -1));
    }
  }, [regionMaps, stack]);

  const current = regionMaps.find((m) => m.id === stack[stack.length - 1]) ?? null;
  const { hotspots, createHotspot, updateHotspot, deleteHotspot } = useMapHotspots(current?.id ?? null);
  const editPin = hotspots.find((h) => h.id === editPinId) ?? null;

  // Seed the label draft when an editor opens (committed on blur — a write per
  // keystroke races itself; see the scene hotspot editor's history).
  useEffect(() => {
    if (editPinId) setLabelDraft(hotspots.find((h) => h.id === editPinId)?.label ?? "");
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [editPinId]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape" && !mapPicker && !editPinId) onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose, mapPicker, editPinId]);

  // Pan + zoom over the map (user ask: inspect the map closer). The stage gets
  // translate+scale; pins are children so they ride along for free. Wheel zooms
  // toward the cursor; drag pans; double-click resets. A drag suppresses the
  // click that ends it, so panning never places pins or triggers travel.
  const [view, setView] = useState({ z: 1, tx: 0, ty: 0 });
  const stageRef = useRef<HTMLDivElement>(null);
  const panRef = useRef({ active: false, moved: false, x: 0, y: 0, tx: 0, ty: 0, thresh: 4 });
  useEffect(() => {
    setView({ z: 1, tx: 0, ty: 0 });
  }, [current?.id]);

  const onWheelZoom = (e: React.WheelEvent<HTMLDivElement>) => {
    const stage = stageRef.current;
    if (!stage) return;
    e.preventDefault();
    const vp = e.currentTarget.getBoundingClientRect();
    const px = e.clientX - vp.left;
    const py = e.clientY - vp.top;
    setView((v) => {
      const nz = Math.min(6, Math.max(1, v.z * Math.exp(-e.deltaY * 0.0016)));
      if (nz === v.z) return v;
      if (nz === 1) return { z: 1, tx: 0, ty: 0 };
      // Keep the map point under the cursor fixed: solve in the stage's
      // pre-transform space (offsetLeft/Top = its layout slot in the viewport).
      const sx = (px - stage.offsetLeft - v.tx) / v.z;
      const sy = (py - stage.offsetTop - v.ty) / v.z;
      return { z: nz, tx: px - stage.offsetLeft - sx * nz, ty: py - stage.offsetTop - sy * nz };
    });
  };
  const panStart = (e: React.PointerEvent<HTMLDivElement>) => {
    if (e.button !== 0 && e.pointerType !== "touch") return;
    // A press that starts ON a pin is a click/tap, never a pan — a natural
    // finger tap wobbles a few px, and treating that as a pan suppressed the
    // click (players tapped pins and "nothing happened").
    if ((e.target as HTMLElement).closest?.(".cine-hotspot")) return;
    const thresh = e.pointerType === "touch" ? 12 : 4;
    panRef.current = { active: true, moved: false, x: e.clientX, y: e.clientY, tx: view.tx, ty: view.ty, thresh };
  };
  const panMove = (e: React.PointerEvent<HTMLDivElement>) => {
    const p = panRef.current;
    if (!p.active) return;
    const dx = e.clientX - p.x;
    const dy = e.clientY - p.y;
    if (!p.moved && Math.hypot(dx, dy) < (p.thresh ?? 4)) return;
    p.moved = true;
    setView((v) => ({ ...v, tx: p.tx + dx, ty: p.ty + dy }));
  };
  const panEnd = () => {
    panRef.current.active = false;
    // `moved` survives until the click that follows pointerup has been seen.
    setTimeout(() => {
      panRef.current.moved = false;
    }, 0);
  };

  // DM drag-to-reposition (#user ask): press a pin and drag; release commits
  // the new normalized position. A press that never crosses the threshold is a
  // normal click (travel / edit). Window-level listeners so the drag survives
  // leaving the pin's hitbox.
  const pinDragRef = useRef({ id: null as string | null, moved: false });
  const [dragPos, setDragPos] = useState<{ id: string; x: number; y: number } | null>(null);
  const pinDragStart = (h: (typeof hotspots)[number], e: React.PointerEvent) => {
    if (!isDM) return;
    if ((e.target as HTMLElement).closest?.(".cine-hotspot-edit")) return; // pencil press stays a click
    const start = { x: e.clientX, y: e.clientY };
    const thresh = e.pointerType === "touch" ? 10 : 5;
    const drag = pinDragRef.current;
    drag.id = h.id;
    drag.moved = false;
    const onMove = (ev: PointerEvent) => {
      const stage = stageRef.current;
      if (!stage) return;
      if (!drag.moved && Math.hypot(ev.clientX - start.x, ev.clientY - start.y) < thresh) return;
      drag.moved = true;
      const r = stage.getBoundingClientRect(); // transformed box → zoom-correct
      setDragPos({
        id: h.id,
        x: Math.max(0, Math.min(1, (ev.clientX - r.left) / r.width)),
        y: Math.max(0, Math.min(1, (ev.clientY - r.top) / r.height)),
      });
    };
    const onUp = () => {
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", onUp);
      if (drag.moved) {
        setDragPos((p) => {
          if (p && p.id === h.id) void updateHotspot(h.id, { x: p.x, y: p.y });
          return null;
        });
      }
      // Survives until the click that follows pointerup has been seen.
      setTimeout(() => {
        drag.moved = false;
        drag.id = null;
      }, 0);
    };
    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup", onUp);
  };

  const placePin = (e: React.MouseEvent<HTMLDivElement>) => {
    if (!isDM || !editMode || editPinId || panRef.current.moved) return;
    const rect = e.currentTarget.getBoundingClientRect();
    const nx = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width));
    const ny = Math.max(0, Math.min(1, (e.clientY - rect.top) / rect.height));
    void createHotspot(nx, ny).then(({ hotspot, error: err }) => {
      if (err) setError(err);
      else if (hotspot) setEditPinId(hotspot.id);
    });
  };

  const pinClick = (h: (typeof hotspots)[number]) => {
    if (panRef.current.moved) return; // that was a pan, not a click
    if (pinDragRef.current.moved) return; // that was a reposition drag
    if (isDM && editMode) {
      setEditPinId(h.id);
      return;
    }
    if (h.target_map_id) {
      setStack((prev) => [...prev, h.target_map_id as string]);
    } else if (h.target_scene_id) {
      onTravel(h.target_scene_id);
      onClose();
    } else if (isDM) {
      // Unlinked pin: open its editor — WITHOUT flipping into placement mode
      // (auto-entering edit mode made the next map click silently create a
      // duplicate pin; that trap is how a stray second pin got authored).
      setEditPinId(h.id);
    }
  };

  const linkValue = editPin
    ? editPin.target_scene_id
      ? `scene:${editPin.target_scene_id}`
      : editPin.target_map_id
        ? `map:${editPin.target_map_id}`
        : ""
    : "";

  const missing = !!error && /region_maps|does not exist|schema cache/i.test(error);

  return (
    <>
    <div className="region-panel regnav" role="dialog" aria-label="Region map">
      <div className="region-panel-bar">
        {stack.length > 1 ? (
          <button className="regnav-back" onClick={() => setStack((prev) => prev.slice(0, -1))}>
            <Icon name="back" size={13} />
          </button>
        ) : (
          <GameGlyph src="/icons/board/compass.svg" size={15} />
        )}
        <span className="region-panel-t">{current?.name ?? "Region map"}</span>
        {isDM && current && (
          <button
            className={`regnav-edit ${editMode ? "is-on" : ""}`}
            onClick={() => {
              setEditMode((v) => !v);
              setEditPinId(null);
            }}
            title="Edit pins — click the map to place travel hotspots"
          >
            <Icon name="edit" size={13} />
            <span>{editMode ? "Done" : "Edit pins"}</span>
          </button>
        )}
        <button className="region-panel-x" onClick={onClose} aria-label="Close">
          <Icon name="close" size={15} />
        </button>
      </div>

      <div className="regnav-body">
        {loading && <span className="tm-empty">Loading…</span>}

        {!loading && !current && (
          <div className="tm-regionempty">
            <GameGlyph src="/icons/board/compass.svg" size={38} />
            <h4>No region map yet</h4>
            <p>
              {isDM
                ? "Add a regional map from your library — then pin its locations and your players can travel by clicking them."
                : "Your DM hasn't shared a map of these lands yet."}
            </p>
            {isDM && (
              <button className="tm-regionset" onClick={() => setMapPicker({ forPin: null })}>
                Add a region map
              </button>
            )}
          </div>
        )}

        {current && (
          <div
            className="regnav-viewport"
            onWheel={onWheelZoom}
            onPointerDown={panStart}
            onPointerMove={panMove}
            onPointerUp={panEnd}
            onPointerLeave={panEnd}
            onDoubleClick={() => {
              if (!editMode) setView({ z: 1, tx: 0, ty: 0 });
            }}
            title={view.z > 1 ? "Drag to pan · scroll to zoom · double-click to reset" : "Scroll to zoom"}
          >
            <div
              ref={stageRef}
              className={`regnav-stage ${isDM && editMode ? "is-editing" : ""}`}
              style={{ transform: `translate(${view.tx}px, ${view.ty}px) scale(${view.z})`, transformOrigin: "0 0" }}
              onClick={placePin}
            >
              <img src={current.image_url} alt={current.name} draggable={false} />
              {hotspots.map((h) => {
                if (h.hidden && !isDM) return null;
                // Draft-chapter targets don't exist for players (#0041).
                if (!isDM && h.target_scene_id && draftSceneIds.has(h.target_scene_id)) return null;
                const linked = Boolean(h.target_scene_id || h.target_map_id);
                const px = dragPos?.id === h.id ? dragPos.x : h.x;
                const py = dragPos?.id === h.id ? dragPos.y : h.y;
                return (
                  <button
                    key={h.id}
                    className={`cine-hotspot ${linked ? "" : "is-unlinked"} ${h.hidden ? "is-hidden" : ""} ${dragPos?.id === h.id ? "is-dragging" : ""}`}
                    style={{ left: `${px * 100}%`, top: `${py * 100}%` }}
                    title={h.label ?? (h.target_map_id ? "Open map" : linked ? "Travel" : "Unlinked")}
                    onPointerDown={(e) => pinDragStart(h, e)}
                    onClick={(e) => {
                      e.stopPropagation();
                      pinClick(h);
                    }}
                    onContextMenu={(e) => {
                      // DM right-click = straight to the editor, no mode needed.
                      if (!isDM) return;
                      e.preventDefault();
                      e.stopPropagation();
                      setEditPinId(h.id);
                    }}
                  >
                    <span className="cine-hotspot-dot" />
                    {h.label && <span className="cine-hotspot-label">{h.label}</span>}
                    {isDM && (
                      <span
                        className="cine-hotspot-edit"
                        role="button"
                        title="Edit this pin"
                        onClick={(e) => {
                          e.stopPropagation();
                          if (panRef.current.moved) return;
                          setEditPinId(h.id);
                        }}
                      >
                        <Icon name="edit" size={11} />
                      </span>
                    )}
                  </button>
                );
              })}
            </div>
          </div>
        )}

        {isDM && current && editMode && (
          <div className="regnav-mapbar">
            <span className="dim">Click the map to drop a pin · click a pin to edit it</span>
            <button
              className="is-danger"
              onClick={() => {
                void deleteRegionMap(current.id);
                setEditMode(false);
              }}
            >
              Remove this map
            </button>
          </div>
        )}
      </div>

      {/* Pin editor */}
      {isDM && editPin && (
        <div className="regnav-editor">
          <label className="hotspot-field">
            <span>Label</span>
            <input
              autoFocus
              value={labelDraft}
              onChange={(e) => setLabelDraft(e.target.value)}
              onBlur={() => void updateHotspot(editPin.id, { label: labelDraft })}
              placeholder="e.g. The Keep"
            />
          </label>
          <label className="hotspot-field">
            <span>Leads to</span>
            <select
              value={linkValue}
              onChange={(e) => {
                const v = e.target.value;
                if (v === "__newmap__") {
                  setMapPicker({ forPin: editPin.id });
                } else if (v.startsWith("scene:")) {
                  void updateHotspot(editPin.id, { target_scene_id: v.slice(6), target_map_id: null });
                } else if (v.startsWith("map:")) {
                  void updateHotspot(editPin.id, { target_map_id: v.slice(4), target_scene_id: null });
                } else {
                  void updateHotspot(editPin.id, { target_scene_id: null, target_map_id: null });
                }
              }}
            >
              <option value="">— Not linked —</option>
              <optgroup label="Scenes">
                {scenes.map((s) => (
                  <option key={s.id} value={`scene:${s.id}`}>
                    {s.name}
                  </option>
                ))}
              </optgroup>
              <optgroup label="Maps (drill down)">
                {regionMaps
                  .filter((m) => m.id !== current?.id)
                  .map((m) => (
                    <option key={m.id} value={`map:${m.id}`}>
                      {m.name}
                    </option>
                  ))}
                <option value="__newmap__">＋ New sub-map…</option>
              </optgroup>
            </select>
          </label>
          <label className="hotspot-toggle">
            <input
              type="checkbox"
              checked={editPin.hidden}
              onChange={(e) => updateHotspot(editPin.id, { hidden: e.target.checked })}
            />
            <span>Hidden until revealed</span>
          </label>
          <div className="hotspot-editor-actions">
            <button
              className="ghost"
              style={{ color: "var(--ember)" }}
              onClick={() => {
                void deleteHotspot(editPin.id);
                setEditPinId(null);
              }}
            >
              Delete
            </button>
            <button
              className="primary"
              onClick={() => {
                void updateHotspot(editPin.id, { label: labelDraft });
                setEditPinId(null);
              }}
            >
              Done
            </button>
          </div>
        </div>
      )}

      {error && !missing && (
        <div className="regnav-error" onClick={() => setError(null)}>
          {error}
        </div>
      )}
    </div>

    {/* Rendered OUTSIDE the panel: the panel's transform makes it the containing
        block for fixed descendants, which clipped the dialog inside its box. */}
    {mapPicker && (
      <MapPickerDialog
        filterType={["regional"]}
        slot="region"
        currentMapId={null}
        onPick={async (m) => {
          const { map, error: err } = await createRegionMap(m.name, m.image_url);
          if (err) {
            setError(err);
          } else if (map && mapPicker.forPin) {
            await updateHotspot(mapPicker.forPin, { target_map_id: map.id, target_scene_id: null });
          }
          setMapPicker(null);
        }}
        onClose={() => setMapPicker(null)}
      />
    )}
    </>
  );
};
