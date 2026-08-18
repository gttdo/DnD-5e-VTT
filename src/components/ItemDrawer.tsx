import type { Character, InventoryItem } from "../types/character";
import type { CharacterAPI } from "../state/useCharacter";
import { isEquippable, isWeapon } from "../lib/attacks";
import { attackBonus, damageBonus, formatMod, abilityModFor } from "../lib/calc";
import { SheetDrawer } from "./ui/SheetDrawer";
import { useConfirm } from "../state/Confirm";
import { itemSpellGrant } from "../lib/itemSpellGrants";

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
  const { confirm } = useConfirm();
  const weapon = isWeapon(item);
  const equippable = isEquippable(item);

  // Item-granted spellcasting (#88): fall back to the curated SRD grant so a
  // premade whose data is prose-only still shows its charges + spells here,
  // matching the HUD's Items tab.
  const grant = itemSpellGrant(item.name);
  const charges = item.charges ?? (grant ? { max: grant.charges, current: grant.charges, recharge: grant.recharge } : undefined);
  const grantedSpells = item.grantedSpells?.length ? item.grantedSpells : grant?.spells;
  const spellCost = item.spellCost ?? grant?.cost;

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
  if (charges) {
    const rechargeTxt = charges.recharge
      ? ` · recharges ${charges.recharge === "short" ? "on a short rest" : charges.recharge === "long" ? "on a long rest" : "at dawn"}`
      : "";
    rows.push(["Charges", `${charges.current} / ${charges.max}${rechargeTxt}`]);
  }
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
            onClick={async () => {
              if (
                await confirm({
                  title: "Remove item",
                  message: `Remove ${item.name} from your inventory?`,
                  confirmLabel: "Remove",
                  danger: true,
                })
              ) {
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

      {grantedSpells?.length ? (
        <>
          <div className="drawer-section-title">Spells</div>
          <p className="drawer-note">
            {charges
              ? "Cast these from the item's charges via the Items tab in the game HUD:"
              : "This item can cast:"}
          </p>
          <div className="rules-table">
            {grantedSpells.map((s) => (
              <div className="rules-row" key={s}>
                <span>{s}</span>
                <span className="rules-value mono">{spellCost?.[s] ?? 1}⚡</span>
              </div>
            ))}
          </div>
        </>
      ) : null}

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
