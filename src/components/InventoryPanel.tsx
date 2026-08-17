import { useState } from "react";
import type { Character, InventoryItem } from "../types/character";
import type { CharacterAPI } from "../state/useCharacter";
import { totalWeight, carryingCapacity } from "../lib/calc";
import { isEquippable, isWeapon } from "../lib/attacks";
import { ItemDrawer } from "./ItemDrawer";
import { ItemLibraryPicker } from "./ItemLibraryPicker";
import { inventoryFromAsset } from "../lib/itemAsset";
import { Coin } from "./ui/Coin";
import { Icon } from "./ui/Icon";

export const InventoryPanel = ({ character: c, api }: { character: Character; api: CharacterAPI }) => {
  const [newName, setNewName] = useState("");
  // Item whose detail drawer is open. Resolved from the live inventory by id
  // so edits (equip, qty) made in the drawer reflect immediately.
  const [detailId, setDetailId] = useState<string | null>(null);
  const detail = detailId ? c.inventory.find((i) => i.id === detailId) ?? null : null;
  const [pickingItem, setPickingItem] = useState(false);

  const addBlank = () => {
    if (!newName.trim()) return;
    const item: InventoryItem = {
      id: `inv-${Date.now()}`,
      name: newName.trim(),
      qty: 1,
      weight: 0,
    };
    api.addItem(item);
    setNewName("");
  };

  return (
    <div>
      <div className="row" style={{ justifyContent: "space-between", marginTop: 8 }}>
        <div>
          <div className="dim" style={{ fontSize: 11 }}>WEIGHT</div>
          <div className="mono">{totalWeight(c).toFixed(1)} / {carryingCapacity(c)} lb</div>
        </div>
        <div className="row" style={{ gap: 8 }}>
          {(["pp", "gp", "ep", "sp", "cp"] as const).map((coin) => (
            <div key={coin} style={{ textAlign: "center" }}>
              <div className="dim coin-label" style={{ fontSize: 10 }}>
                <Coin coin={coin} size={12} /> {coin.toUpperCase()}
              </div>
              <input
                className="mono"
                style={{ width: 60, textAlign: "center" }}
                type="number"
                value={c.currency[coin]}
                onChange={(e) => api.setCurrency(coin, parseInt(e.target.value, 10) || 0)}
              />
            </div>
          ))}
        </div>
      </div>

      <table className="inv-table" style={{ marginTop: 10 }}>
        <thead>
          <tr>
            <th style={{ width: 30 }} title="Equipped — a checked weapon appears in your Actions">
              Eq
            </th>
            <th>Name</th>
            <th className="qty">Qty</th>
            <th>Wt</th>
            <th>Notes</th>
            <th />
          </tr>
        </thead>
        <tbody>
          {c.inventory.map((i) => (
            <tr key={i.id}>
              <td>
                {/* Only gear that can actually be worn or wielded gets a
                    checkbox — a rope or a ration has nothing to equip. For a
                    weapon this is what puts it in (or takes it out of) Actions. */}
                {isEquippable(i) ? (
                  <input
                    type="checkbox"
                    checked={!!i.equipped}
                    onChange={(e) => api.updateItem(i.id, { equipped: e.target.checked })}
                    title={
                      isWeapon(i)
                        ? `${i.equipped ? "Stow" : "Wield"} ${i.name} — ${
                            i.equipped ? "removes it from" : "adds it to"
                          } your Actions`
                        : `${i.equipped ? "Remove" : "Wear"} ${i.name}`
                    }
                    aria-label={`Equip ${i.name}`}
                  />
                ) : (
                  <span className="dim" aria-hidden="true">—</span>
                )}
              </td>
              <td>
                <button
                  className="inv-name"
                  onClick={() => setDetailId(i.id)}
                  title={`${i.name} — details`}
                >
                  {i.name}
                </button>
                {i.type && <div className="dim" style={{ fontSize: 10 }}>{i.type}</div>}
              </td>
              <td className="qty">
                <input
                  type="number"
                  className="mono"
                  style={{ width: 44, textAlign: "center" }}
                  value={i.qty}
                  onChange={(e) => api.updateItem(i.id, { qty: parseInt(e.target.value, 10) || 0 })}
                />
              </td>
              <td className="mono dim">{i.weight}</td>
              <td className="dim" style={{ fontSize: 11 }}>
                {i.damage ? `${i.damage} ` : ""}{i.properties?.join(", ")}
              </td>
              <td>
                <button
                  className="ghost"
                  onClick={() => api.removeItem(i.id)}
                  title="Remove"
                  aria-label="Remove item"
                  style={{ display: "inline-flex", alignItems: "center", padding: "4px 6px" }}
                >
                  <Icon name="close" size={12} />
                </button>
              </td>
            </tr>
          ))}
          {c.inventory.length === 0 && (
            <tr><td colSpan={6} className="dim center" style={{ padding: 16 }}>No items yet.</td></tr>
          )}
        </tbody>
      </table>

      <div className="row" style={{ marginTop: 10 }}>
        <input
          placeholder="Add item..."
          value={newName}
          onChange={(e) => setNewName(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && addBlank()}
          style={{ flex: 1 }}
        />
        <button onClick={addBlank}>+ Add</button>
        <button className="ghost" onClick={() => setPickingItem(true)} title="Add a saved homebrew item">
          <Icon name="package" size={15} /> From studio
        </button>
      </div>

      {pickingItem && (
        <ItemLibraryPicker
          onClose={() => setPickingItem(false)}
          onPick={(asset) => {
            const item = inventoryFromAsset(asset);
            if (item) api.addItem(item);
            setPickingItem(false);
          }}
        />
      )}

      {detail && (
        <ItemDrawer
          character={c}
          item={detail}
          api={api}
          onClose={() => setDetailId(null)}
        />
      )}
    </div>
  );
};
