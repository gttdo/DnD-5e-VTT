import { useState } from "react";
import type { Character, InventoryItem } from "../types/character";
import type { CharacterAPI } from "../state/useCharacter";
import { totalWeight, carryingCapacity } from "../lib/calc";

export const InventoryPanel = ({ character: c, api }: { character: Character; api: CharacterAPI }) => {
  const [newName, setNewName] = useState("");

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
              <div className="dim" style={{ fontSize: 10 }}>{coin.toUpperCase()}</div>
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
            <th style={{ width: 30 }}>Eq</th>
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
                <input
                  type="checkbox"
                  checked={!!i.equipped}
                  onChange={(e) => api.updateItem(i.id, { equipped: e.target.checked })}
                />
              </td>
              <td>
                <div>{i.name}</div>
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
                <button className="ghost" onClick={() => api.removeItem(i.id)} title="Remove">✕</button>
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
      </div>
    </div>
  );
};
