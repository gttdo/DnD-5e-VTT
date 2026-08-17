import { useMaps, type MapAsset } from "../state/useMaps";
import { Card, CardMedia, CardBody, CardTitle, CardMeta } from "./ui/Card";
import { Dialog } from "./ui/Dialog";
import { EmptyState } from "./ui/EmptyState";

interface Props {
  /**
   * The map currently used on the scene, if any — highlighted in the picker
   * so the DM can see which library asset the scene came from.
   */
  currentMapId: string | null;
  onPick: (map: MapAsset) => void;
  onClose: () => void;
}

/**
 * Grid of the DM's saved maps. Click one → applies to the active scene.
 * Empty state points the DM at the Cartographer.
 */
export const MapPickerDialog = ({ currentMapId, onPick, onClose }: Props) => {
  const { maps, loading } = useMaps();

  return (
    <Dialog
      onClose={onClose}
      size="lg"
      title="Pick a map"
      subtitle="From your library. Click to use as this scene's background."
    >
      {loading && <div className="dim">Loading library…</div>}

      {!loading && maps.length === 0 && (
        <EmptyState icon="map" title="Your library is empty" compact>
          Head to the <strong>Maps</strong> tab to upload your own or generate one.
        </EmptyState>
      )}

      {!loading && maps.length > 0 && (
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(auto-fill, minmax(200px, 1fr))",
            gap: 12,
          }}
        >
          {maps.map((m) => {
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
