import type { EquipSlot, InventoryItem } from "../types/character";
import { isWeapon } from "./attacks";

/**
 * Paper-doll equip logic.
 *
 * The inventory's `equipped` flag is the one truth (it already drives Actions
 * and AC). The paper doll adds a *place* for each equipped thing: a `slot`. An
 * item may carry an explicit `slot`; when it doesn't, we infer one from its
 * type so existing characters light up the doll without a data migration.
 */

export const EQUIP_SLOTS: { key: EquipSlot; label: string }[] = [
  { key: "head", label: "Head" },
  { key: "amulet", label: "Amulet" },
  { key: "cloak", label: "Cloak" },
  { key: "chest", label: "Armor" },
  { key: "hands", label: "Hands" },
  { key: "main", label: "Main hand" },
  { key: "off", label: "Off hand" },
  { key: "ring", label: "Ring" },
  { key: "boots", label: "Boots" },
];

const has = (item: InventoryItem, prop: string) =>
  (item.properties ?? []).some((p) => p.toLowerCase().includes(prop));

/** The slot an item occupies — explicit if set, else inferred from its type. */
export const slotOf = (item: InventoryItem): EquipSlot | null => {
  if (item.slot) return item.slot;
  if (item.type === "armor") return "chest";
  if (isWeapon(item)) return has(item, "light") ? "off" : "main";
  return null;
};

/** Can this item be worn/wielded at all (i.e. does it map to a slot)? */
export const isEquipable = (item: InventoryItem): boolean => slotOf(item) !== null;

/** The equipped item currently filling a slot, if any. */
export const equippedInSlot = (inventory: InventoryItem[], slot: EquipSlot): InventoryItem | undefined =>
  inventory.find((i) => i.equipped && slotOf(i) === slot);

/**
 * Toggle an item equipped. Equipping something clears whatever shared its slot,
 * so a slot never holds two things — the paper-doll invariant.
 */
export const toggleEquipped = (inventory: InventoryItem[], itemId: string): InventoryItem[] => {
  const target = inventory.find((i) => i.id === itemId);
  if (!target) return inventory;
  const slot = slotOf(target);
  if (!slot) return inventory; // not equipable — nothing to do
  const willEquip = !target.equipped;
  return inventory.map((i) => {
    if (i.id === itemId) return { ...i, equipped: willEquip };
    // Unequip a same-slot rival only when we're equipping this one.
    if (willEquip && i.equipped && slotOf(i) === slot) return { ...i, equipped: false };
    return i;
  });
};

/** Move an item to sit just before another (drag-to-reorder). */
export const reorder = (inventory: InventoryItem[], fromId: string, toId: string): InventoryItem[] => {
  if (fromId === toId) return inventory;
  const from = inventory.findIndex((i) => i.id === fromId);
  const to = inventory.findIndex((i) => i.id === toId);
  if (from < 0 || to < 0) return inventory;
  const next = inventory.slice();
  const [moved] = next.splice(from, 1);
  next.splice(to, 0, moved);
  return next;
};

/**
 * One-time tidy: equipped first, then weapons → armor → other wearables → the
 * rest, alphabetical within each band. A stable action, never a sticky mode, so
 * it can't fight a manual arrangement afterwards.
 */
export const sortInventory = (inventory: InventoryItem[]): InventoryItem[] => {
  const band = (i: InventoryItem): number => {
    if (i.equipped) return 0;
    if (isWeapon(i)) return 1;
    if (i.type === "armor") return 2;
    if (isEquipable(i)) return 3;
    return 4;
  };
  return inventory
    .slice()
    .sort((a, b) => band(a) - band(b) || a.name.localeCompare(b.name));
};
