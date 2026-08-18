import { useState } from "react";
import { useMaps, type MapAsset } from "../state/useMaps";
import { useAuth } from "../state/useAuth";
import { GenerateMapDialog } from "./GenerateMapDialog";
import { Card, CardMedia, CardBody, CardTitle, CardMeta } from "./ui/Card";
import { CardMenu } from "./ui/CardMenu";
import { Button } from "./ui/Button";
import { EmptyState } from "./ui/EmptyState";
import { LibraryBanner } from "./ui/LibraryBanner";
import { useConfirm } from "../state/Confirm";

/**
 * Top-level "Maps" screen. The DM's map library, decoupled from any game.
 * Generate here to build up assets, then pick from library inside a game.
 */
export const MapLibraryScreen = () => {
  const { maps, loading, renameMap, deleteMap, setMapPublic } = useMaps();
  const { user } = useAuth();
  const { confirm, prompt } = useConfirm();
  const [generateOpen, setGenerateOpen] = useState(false);
  const [preview, setPreview] = useState<MapAsset | null>(null);

  return (
    <div className="screen-enter" style={{ padding: 24 }}>
      <LibraryBanner
        image="/art/map.png"
        eyebrow="Your Library"
        title="Maps"
        subtitle={
          loading
            ? "Loading library…"
            : (() => {
                const mine = maps.filter((m) => m.owner_id === user?.id).length;
                const premade = maps.length - mine;
                return `${maps.length} map${maps.length === 1 ? "" : "s"} available` +
                  (premade > 0 ? ` · ${mine} yours, ${premade} premade` : ` in your library`) + ".";
              })()
        }
      >
        <Button variant="primary" size="lg" icon="palette" onClick={() => setGenerateOpen(true)}>
          Create map
        </Button>
      </LibraryBanner>

      {!loading && maps.length === 0 && (
        <EmptyState
          icon="map"
          title="No maps yet"
          cta={{ label: "Create your first map", icon: "palette", onClick: () => setGenerateOpen(true) }}
        >
          Upload your own battle map, or summon one with the cartographer —
          describe a scene and it paints a top-down map. Every one lands here.
        </EmptyState>
      )}

      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(auto-fill, minmax(240px, 1fr))",
          gap: 16,
        }}
      >
        {maps.map((m) => {
          const owned = m.owner_id === user?.id;
          return (
          <Card
            key={m.id}
            className={owned ? "has-menu" : undefined}
            onClick={() => setPreview(m)}
            title={m.prompt ?? undefined}
          >
            {owned ? (
              <>
                {m.is_public && (
                  <span className="card-badge is-shared" title="Published to the shared library — everyone can use it">Shared</span>
                )}
                <CardMenu
                  label={`Actions for ${m.name}`}
                  items={[
                    {
                      label: "Rename",
                      icon: "edit",
                      onClick: async () => {
                        const next = await prompt({ title: "Rename map", initialValue: m.name, confirmLabel: "Rename" });
                        if (next && next.trim() && next !== m.name) await renameMap(m.id, next.trim());
                      },
                    },
                    {
                      label: m.is_public ? "Remove from shared library" : "Publish to shared library",
                      icon: m.is_public ? "remove" : "star",
                      onClick: () => void setMapPublic(m.id, !m.is_public),
                    },
                    {
                      label: "Delete",
                      icon: "delete",
                      danger: true,
                      onClick: async () => {
                        if (
                          await confirm({
                            title: "Delete map",
                            message: `Delete "${m.name}"? Any scenes using it keep the image but lose the link.`,
                            confirmLabel: "Delete",
                            danger: true,
                          })
                        ) {
                          await deleteMap(m.id);
                        }
                      },
                    },
                  ]}
                />
              </>
            ) : (
              <span className="card-badge" title="Shared premade — from the built-in library">Premade</span>
            )}
            <CardMedia src={m.image_url} alt={m.name} aspect="3/2" />
            <CardBody>
              <CardTitle>{m.name}</CardTitle>
              <CardMeta>{[m.family, m.style].filter(Boolean).join(" · ") || "—"}</CardMeta>
            </CardBody>
          </Card>
          );
        })}
      </div>

      {generateOpen && (
        <GenerateMapDialog onClose={() => setGenerateOpen(false)} />
      )}

      {preview && (
        <div
          onClick={() => setPreview(null)}
          style={{
            position: "fixed",
            inset: 0,
            zIndex: 200,
            background: "rgba(0, 0, 0, 0.85)",
            display: "grid",
            placeItems: "center",
            padding: 24,
            cursor: "zoom-out",
          }}
        >
          <div style={{ maxWidth: "95vw", maxHeight: "90vh", textAlign: "center" }}>
            <img
              src={preview.image_url}
              alt={preview.name}
              style={{ maxWidth: "100%", maxHeight: "85vh", borderRadius: 4 }}
            />
            <div className="lightbox-caption" style={{ marginTop: 8 }}>
              <strong style={{ color: "var(--gold)" }}>{preview.name}</strong>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
