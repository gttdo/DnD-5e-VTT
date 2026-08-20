import { useMaps, type MapAsset } from "../state/useMaps";
import { Icon } from "./ui/Icon";
import { Card, CardMedia, CardBody, CardTitle, CardMeta } from "./ui/Card";
import { Dialog } from "./ui/Dialog";
import { EmptyState } from "./ui/EmptyState";

interface Props {
  /**
   * The map currently used on the scene, if any — highlighted in the picker
   * so the DM can see which library asset the scene came from.
   */
  currentMapId: string | null;
  /** Restrict the grid to these asset kinds (#Phase 2). Omit to show everything. */
  filterType?: Array<"battlemap" | "regional" | "cinematic">;
  /** Which copy variant to show. */
  slot?: "battlemap" | "backdrop" | "region";
  /** When present, the grid leads with a "clear this slot" tile (IA: setting
   *  and clearing a face live in the same place). */
  onClear?: () => void;
  onPick: (map: MapAsset) => void;
  onClose: () => void;
}

const COPY = {
  battlemap: { title: "Pick a battlemap", subtitle: "From your library. Click to use as this scene's tactical map." },
  backdrop: {
    title: "Pick a backdrop",
    subtitle: "From your library — a cinematic backdrop, or a regional map to make this a navigation scene.",
  },
  region: {
    title: "Pick a region map",
    subtitle: "From your library — the world your players will navigate. Generate regional maps in the Maps editor.",
  },
  all: { title: "Pick a map", subtitle: "From your library. Click to use on this scene." },
} as const;

/**
 * Grid of the DM's saved maps, optionally filtered by asset kind. Click one
 * → applies to the active scene. Empty state points the DM at the Cartographer.
 */
export const MapPickerDialog = ({ currentMapId, filterType, slot, onClear, onPick, onClose }: Props) => {
  const { maps, loading } = useMaps();
  // Pre-0037 rows have no map_type → treat them as battlemaps.
  const shown = filterType ? maps.filter((m) => filterType.includes(m.map_type ?? "battlemap")) : maps;
  const copy = COPY[slot ?? "all"];
  const clearLabel = slot === "backdrop" ? "Clear backdrop" : slot === "battlemap" ? "Clear battlemap" : "Clear";

  return (
    <Dialog onClose={onClose} size="lg" title={copy.title} subtitle={copy.subtitle}>
      {loading && <div className="dim">Loading library…</div>}

      {!loading && shown.length === 0 && !onClear && (
        <EmptyState icon="map" title="Nothing here yet" compact>
          Generate one from the scene menu, or head to the <strong>Maps</strong> tab to upload your own.
        </EmptyState>
      )}

      {!loading && (shown.length > 0 || onClear) && (
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(auto-fill, minmax(200px, 1fr))",
            gap: 12,
          }}
        >
          {onClear && (
            <button className="map-clear-tile" onClick={onClear} title={clearLabel}>
              <Icon name="delete" size={20} />
              <span>{clearLabel}</span>
              <span className="map-clear-tile-sub">The scene keeps its other face.</span>
            </button>
          )}
          {shown.map((m) => {
            const isCurrent = m.id === currentMapId;
            return (
              <Card
                key={m.id}
                onClick={() => onPick(m)}
                selected={isCurrent}
                title={m.prompt ?? m.name}
              >
                <CardMedia src={m.image_url} alt={m.name} aspect="3/2" />
                <CardBody>
                  <CardTitle>{m.name}</CardTitle>
                  <CardMeta>
                    {[m.family, m.style].filter(Boolean).join(" · ") || "—"}
                    {isCurrent && " · Currently on scene"}
                  </CardMeta>
                </CardBody>
              </Card>
            );
          })}
        </div>
      )}
    </Dialog>
  );
};
