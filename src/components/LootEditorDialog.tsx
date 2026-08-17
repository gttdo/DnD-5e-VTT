import { useState } from "react";
import { Dialog } from "./ui/Dialog";
import { Icon } from "./ui/Icon";
import type { Currency, InventoryItem } from "../types/character";
import type { TokenLoot, LootItem } from "../lib/loot";

/**
 * DM loot-placement tool — author the exact haul a carrier token yields:
 * meaningful coins plus specific items (a magic sword, a quest key). This runs
 * alongside the engine's incidental loot; whatever the DM saves here becomes the
 * token's frozen loot, so it overrides the random roll. DM-only.
 */

const COIN_ORDER: (keyof Currency)[] = ["pp", "gp", "ep", "sp", "cp"];
const KINDS: NonNullable<InventoryItem["type"]>[] = ["treasure", "weapon", "armor", "gear", "tool", "consumable"];

let seq = 0;
const newId = () => `dmloot-${Date.now().toString(36)}-${(seq++).toString(36)}`;

interface Props {
  tokenLabel: string;
  loot: TokenLoot | null;
  onSave: (loot: TokenLoot) => void;
  onClose: () => void;
}

export const LootEditorDialog = ({ tokenLabel, loot, onSave, onClose }: Props) => {
  const [coins, setCoins] = useState<Partial<Currency>>({ ...(loot?.coins ?? {}) });
  const [items, setItems] = useState<LootItem[]>(loot?.items ? loot.items.map((i) => ({ ...i })) : []);

  const [name, setName] = useState("");
  const [qty, setQty] = useState(1);
  const [value, setValue] = useState<number | "">("");
  const [kind, setKind] = useState<NonNullable<InventoryItem["type"]>>("treasure");

  const setCoin = (k: keyof Currency, v: string) => {
    const n = Math.max(0, parseInt(v, 10) || 0);
    setCoins((c) => ({ ...c, [k]: n }));
  };

  const addItem = () => {
    const nm = name.trim();
    if (!nm) return;
    setItems((list) => [
      ...list,
      { id: newId(), name: nm, qty: Math.max(1, qty), kind, value: value === "" ? undefined : Number(value) },
    ]);
    setName("");
    setQty(1);
    setValue("");
    setKind("treasure");
  };

  const removeItem = (id: string) => setItems((list) => list.filter((i) => i.id !== id));

  const save = () => {
    const cleanCoins: Partial<Currency> = {};
    COIN_ORDER.forEach((k) => {
      if (coins[k] && coins[k]! > 0) cleanCoins[k] = coins[k];
    });
    onSave({ coins: cleanCoins, items, looted: false });
    onClose();
  };

  return (
    <Dialog onClose={onClose} size="md" title={`Place loot — ${tokenLabel}`} subtitle="Coins & items this token will yield when looted">
      <div className="lootedit">
        <div className="lootedit-sec">
          <h4 className="lootedit-h">Coins</h4>
          <div className="lootedit-coins">
            {COIN_ORDER.map((k) => (
              <label key={k} className="lootedit-coin">
                <span>{k}</span>
                <input
                  type="number"
                  min={0}
                  value={coins[k] ?? 0}
                  onChange={(e) => setCoin(k, e.target.value)}
                />
              </label>
            ))}
          </div>
        </div>

        <div className="lootedit-sec">
          <h4 className="lootedit-h">Items</h4>
          {items.length === 0 ? (
            <p className="lootedit-empty">No items yet — add a magic item, quest object, or gear below.</p>
          ) : (
            <ul className="lootedit-items">
              {items.map((it) => (
                <li key={it.id} className="lootedit-item">
                  <span className="lootedit-item-nm">
                    {it.name}
                    {it.qty > 1 && <span className="lootedit-item-qty">×{it.qty}</span>}
                  </span>
                  <span className="lootedit-item-meta">
                    {it.kind}
                    {it.value != null ? ` · ${it.value} gp` : ""}
                  </span>
                  <button className="lootedit-del" onClick={() => removeItem(it.id)} aria-label={`Remove ${it.name}`}>
                    <Icon name="remove" size={15} />
                  </button>
                </li>
              ))}
            </ul>
          )}

          <div className="lootedit-add">
            <input
              className="lootedit-add-nm"
              placeholder="Item name (e.g. Flametongue Longsword)"
              value={name}
              onChange={(e) => setName(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && addItem()}
            />
            <select value={kind} onChange={(e) => setKind(e.target.value as NonNullable<InventoryItem["type"]>)}>
              {KINDS.map((k) => (
                <option key={k} value={k}>{k}</option>
              ))}
            </select>
            <input
              className="lootedit-add-qty"
              type="number"
              min={1}
              value={qty}
              onChange={(e) => setQty(Math.max(1, parseInt(e.target.value, 10) || 1))}
              aria-label="Quantity"
            />
            <input
              className="lootedit-add-val"
              type="number"
              min={0}
              placeholder="gp"
              value={value}
              onChange={(e) => setValue(e.target.value === "" ? "" : Math.max(0, parseInt(e.target.value, 10) || 0))}
              aria-label="Value in gp"
            />
            <button className="lootedit-add-btn" onClick={addItem} disabled={!name.trim()}>Add</button>
          </div>
        </div>

        <div className="lootedit-actions">
          <button className="ghost" onClick={onClose}>Cancel</button>
          <button className="primary" onClick={save}>Save loot</button>
        </div>
      </div>
    </Dialog>
  );
};
