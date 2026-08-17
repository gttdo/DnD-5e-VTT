import { useMemo, useState } from "react";
import { Dialog } from "./ui/Dialog";
import { Icon } from "./ui/Icon";
import { useTokenAssets } from "../state/useTokenAssets";
import { itemFromAsset } from "../lib/itemAsset";
import type { TokenAsset } from "../state/useTokenAssets";

/**
 * Picks a saved item from the token studio to drop into a character's
 * inventory. Lists the player's own `item`-typed assets (art + name + rarity);
 * choosing one hands the asset back so the caller can map it to an inventory
 * row. This is the studio → sheet half of the item loop.
 */
export const ItemLibraryPicker = ({
  onPick,
  onClose,
}: {
  onPick: (asset: TokenAsset) => void;
  onClose: () => void;
}) => {
  const { assets, loading } = useTokenAssets();
  const [q, setQ] = useState("");

  const items = useMemo(() => {
    const term = q.trim().toLowerCase();
    return assets
      .filter((a) => a.details?.kind === "item")
      .filter((a) => !term || a.name.toLowerCase().includes(term));
  }, [assets, q]);

  return (
    <Dialog onClose={onClose} size="lg" title="Add from studio" subtitle="Your saved homebrew items.">
      <div className="ilp">
        <div className="ilp-search">
          <Icon name="search" size={15} />
          <input
            autoFocus
            placeholder="Search items…"
            value={q}
            onChange={(e) => setQ(e.target.value)}
          />
        </div>

        {loading ? (
          <div className="dim center" style={{ padding: 24 }}>Loading your library…</div>
        ) : items.length === 0 ? (
          <div className="ilp-empty">
            <Icon name="package" size={22} />
            <div style={{ fontWeight: 600 }}>{q ? "No items match." : "No items in your library yet."}</div>
            <div className="dim" style={{ fontSize: 13 }}>
              Create one in the Token Studio (choose <em>Item</em>), then it shows up here.
            </div>
          </div>
        ) : (
          <div className="ilp-grid">
            {items.map((a) => {
              const m = itemFromAsset(a);
              return (
                <button key={a.id} className="ilp-card" onClick={() => onPick(a)} title={m?.description ?? a.name}>
                  <span className="ilp-art">
                    {a.image_url ? <img src={a.image_url} alt="" /> : <Icon name="package" size={20} />}
                  </span>
                  <span className="ilp-name">{a.name}</span>
                  {m?.rarity && <span className="ilp-rarity">{m.rarity}</span>}
                </button>
              );
            })}
          </div>
        )}
      </div>
    </Dialog>
  );
};
