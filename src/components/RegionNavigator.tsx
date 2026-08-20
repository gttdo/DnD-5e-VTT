import { useEffect, useState } from "react";
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
  /** Travel THIS member to a scene (per-player navigation). */
  onTravel: (sceneId: string) => void;
  onClose: () => void;
}

export const RegionNavigator = ({ gameId, isDM, scenes, onTravel, onClose }: Props) => {
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

  const placePin = (e: React.MouseEvent<HTMLDivElement>) => {
    if (!isDM || !editMode || editPinId) return;
    const rect = e.currentTarget.getBoundingClientRect();
    const nx = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width));
    const ny = Math.max(0, Math.min(1, (e.clientY - rect.top) / rect.height));
    void createHotspot(nx, ny).then(({ hotspot, error: err }) => {
      if (err) setError(err);
      else if (hotspot) setEditPinId(hotspot.id);
    });
  };

  const pinClick = (h: (typeof hotspots)[number]) => {
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
      setEditMode(true);
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
            className={`regnav-stage ${isDM && editMode ? "is-editing" : ""}`}
            onClick={placePin}
            title={isDM && editMode ? "Click to place a hotspot" : undefined}
          >
            <img src={current.image_url} alt={current.name} draggable={false} />
            {hotspots.map((h) => {
              if (h.hidden && !isDM) return null;
              const linked = Boolean(h.target_scene_id || h.target_map_id);
              return (
                <button
                  key={h.id}
                  className={`cine-hotspot ${linked ? "" : "is-unlinked"} ${h.hidden ? "is-hidden" : ""}`}
                  style={{ left: `${h.x * 100}%`, top: `${h.y * 100}%` }}
                  title={h.label ?? (h.target_map_id ? "Open map" : linked ? "Travel" : "Unlinked")}
                  onClick={(e) => {
                    e.stopPropagation();
                    pinClick(h);
                  }}
                >
                  <span className="cine-hotspot-dot" />
                  {h.label && <span className="cine-hotspot-label">{h.label}</span>}
                </button>
              );
            })}
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
