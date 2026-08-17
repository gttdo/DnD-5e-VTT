import type { Character, InventoryItem } from "../types/character";
import type { CharacterAPI } from "../state/useCharacter";
import { isEquippable, isWeapon } from "../lib/attacks";
import { attackBonus, damageBonus, formatMod, abilityModFor } from "../lib/calc";
import { SheetDrawer } from "./ui/SheetDrawer";

/**
 * Detail drawer for one inventory item — the reference's Dagger panel.
 * Everything shown comes from fields the item actually has; nothing invented.
 * UNEQUIP here is the same flag as the inventory checkbox, so it also adds or
 * removes the weapon from the Actions tab (see lib/attacks).
 */

interface Props {
  character: Character;
  item: InventoryItem;
  api: CharacterAPI;
  onClose: () => void;
}

export const ItemDrawer = ({ character: c, item, api, onClose }: Props) => {
  const weapon = isWeapon(item);
  const equippable = isEquippable(item);

  // Mirror how a derived attack would roll this weapon (finesse → best of
  // STR/DEX, ranged → DEX) so the drawer shows the numbers Actions will use.
  const ability =
    item.range?.includes("/") || item.properties?.some((p) => p.toLowerCase() === "ammunition")
      ? "DEX"
      : item.finesse || item.properties?.some((p) => p.toLowerCase() === "finesse")
        ? abilityModFor(c, "DEX") > abilityModFor(c, "STR") ? "DEX" : "STR"
        : "STR";

  const rows: Array<[string, string]> = [];
  if (item.type) rows.push(["Type", item.type[0].toUpperCase() + item.type.slice(1)]);
  if (weapon) {
    rows.push(["Attack ability", ability]);
    rows.push(["To hit", formatMod(attackBonus(c, { ability, proficient: true }))]);
    rows.push([
      "Damage",
      `${item.damage}${damageBonus(c, { ability }) ? formatMod(damageBonus(c, { ability })) : ""}${
        item.damageType ? ` ${item.damageType}` : ""
      }`,
    ]);
  }
  if (item.range) rows.push(["Range", `${item.range} ft.`]);
  rows.push(["Quantity", String(item.qty)]);
  rows.push(["Weight", `${item.weight} lb${item.qty > 1 ? ` (${(item.weight * item.qty).toFixed(1)} total)` : ""}`]);
  if (item.cost != null) rows.push(["Cost", `${item.cost} gp`]);
  if (item.properties?.length) rows.push(["Properties", item.properties.join(", ")]);

  return (
    <SheetDrawer
      title={item.name}
      onClose={onClose}
      footer={
        <>
          {equippable && (
            <button
              className={item.equipped ? "" : "primary"}
              onClick={() => api.updateItem(item.id, { equipped: !item.equipped })}
            >
              {item.equipped ? (weapon ? "Stow" : "Take off") : weapon ? "Wield" : "Wear"}
            </button>
          )}
          <button
            className="ghost"
            onClick={() => {
              if (confirm(`Remove ${item.name} from your inventory?`)) {
                api.removeItem(item.id);
                onClose();
              }
            }}
          >
            Delete
          </button>
        </>
      }
    >
      {item.equipped && (
        <p className="drawer-lede" style={{ color: "var(--candle)" }}>
          {weapon ? "Wielded — appears in your Actions." : "Currently worn."}
        </p>
      )}

      <div className="rules-table">
        {rows.map(([k, v]) => (
          <div className="rules-row" key={k}>
            <span>{k}</span>
            <span className="rules-value mono">{v}</span>
          </div>
        ))}
      </div>

      {item.notes && (
        <>
          <div className="drawer-section-title">Notes</div>
          <p className="drawer-note">{item.notes}</p>
        </>
      )}

      {weapon && !item.equipped && (
        <p className="drawer-note" style={{ marginTop: 10 }}>
          Carried but not wielded — it won't show in Actions until you wield it.
        </p>
      )}
    </SheetDrawer>
  );
};
