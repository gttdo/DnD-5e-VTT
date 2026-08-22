import { useEffect, useState } from "react";
import { fetchShelf, fetchManifest, installPack, type PackCard } from "../lib/packs";
import { useAuth } from "../state/useAuth";
import { useToast } from "../state/Toast";
import { Card, CardBody } from "./ui/Card";
import { Button } from "./ui/Button";
import { EmptyState } from "./ui/EmptyState";

/**
 * The marketplace shelf (packs P1) — published packs a DM can add to their
 * campaign list. Install always creates a NEW campaign; we hand its id back so
 * the caller can refresh and drop the DM into the editor.
 *
 * `standalone` = the dedicated Marketplace page: show loading/empty states and
 * drop the inline section title (the page's banner carries it). Embedded (the
 * default) stays quiet — renders nothing until there's a shelf to show.
 */
export const PackMarketplace = ({
  onInstalled,
  standalone = false,
}: {
  onInstalled: (gameId: string) => void;
  standalone?: boolean;
}) => {
  const { user } = useAuth();
  const toast = useToast();
  const [packs, setPacks] = useState<PackCard[]>([]);
  const [loading, setLoading] = useState(true);
  const [installing, setInstalling] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      const shelf = await fetchShelf();
      if (!cancelled) {
        // The shelf policy also returns a publisher's own drafts; the public
        // marketplace shows only what's published.
        setPacks(shelf.filter((p) => p.published));
        setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const install = async (card: PackCard) => {
    if (!user || installing) return;
    setInstalling(card.id);
    const manifest = await fetchManifest(card.id);
    if (!manifest) {
      setInstalling(null);
      toast.error("Couldn't load that pack.");
      return;
    }
    const { gameId, error } = await installPack(card, manifest, user.id);
    setInstalling(null);
    if (error || !gameId) {
      toast.error(error ?? "Install failed");
      return;
    }
    toast.success(`"${card.name}" added to your campaigns.`);
    onInstalled(gameId);
  };

  if (loading) return standalone ? <div className="dim">Loading the shelf…</div> : null;
  if (packs.length === 0)
    return standalone ? (
      <EmptyState
        icon="package"
        title="Nothing on the shelf yet"
        body="Published adventure packs will appear here — add one and it becomes a new campaign of your own."
      />
    ) : null;

  return (
    <>
      {!standalone && (
        <div className="panel-title" style={{ marginTop: 8 }}>
          From the marketplace
        </div>
      )}
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(auto-fill, minmax(300px, 1fr))",
          gap: 16,
          marginBottom: 24,
        }}
      >
        {packs.map((p) => (
          <Card key={p.id}>
            {p.cover_url && (
              <div className="pack-cover" style={{ backgroundImage: `url("${p.cover_url}")` }} />
            )}
            <CardBody>
              <div className="pack-name">{p.name}</div>
              {p.tagline && <div className="pack-tagline">{p.tagline}</div>}
              <div className="pack-meta">
                {p.level_min != null && p.level_max != null && (
                  <span className="pack-levels">
                    Levels {p.level_min}–{p.level_max}
                  </span>
                )}
              </div>
              <Button
                variant="primary"
                size="sm"
                block
                icon="add"
                onClick={() => void install(p)}
                disabled={installing === p.id}
              >
                {installing === p.id ? "Adding…" : "Add to my campaigns"}
              </Button>
            </CardBody>
          </Card>
        ))}
      </div>
    </>
  );
};
