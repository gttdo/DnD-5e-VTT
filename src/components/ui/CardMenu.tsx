import { useEffect, useRef, useState } from "react";
import { Icon, type IconName } from "./Icon";

/**
 * Kebab (⋮) overflow menu pinned to a card's top-right corner. Lets the card
 * itself own the primary action (click to open) while secondary/destructive
 * actions live behind the menu instead of a row of buttons.
 *
 * Drop it inside a <Card> that has a menu:
 *   <Card className="has-menu" onClick={open}>
 *     <CardMenu items={[{ label: "Delete", icon: "delete", danger: true, onClick: del }]} />
 *     …
 *   </Card>
 *
 * The `has-menu` class is required — it makes the card `overflow: visible` so
 * the dropdown isn't clipped, and gives it a positioning context.
 *
 * Clicks and Enter/Space inside the menu are stopped from reaching the card,
 * so opening the menu never also triggers the card's own onClick.
 */

export interface CardMenuItem {
  label: string;
  icon?: IconName;
  onClick: () => void;
  /** Renders in ember red — use for destructive actions. */
  danger?: boolean;
}

interface Props {
  items: CardMenuItem[];
  /** Accessible name for the trigger. */
  label?: string;
}

export const CardMenu = ({ items, label = "More actions" }: Props) => {
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (!open) return;
    const onDoc = (e: MouseEvent) => {
      if (rootRef.current && !rootRef.current.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    document.addEventListener("mousedown", onDoc);
    window.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDoc);
      window.removeEventListener("keydown", onKey);
    };
  }, [open]);

  return (
    <div
      className="card-menu"
      ref={rootRef}
      onClick={(e) => e.stopPropagation()}
      // Only swallow the card's activation keys — Escape must still reach the
      // window listener above so the menu can close.
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") e.stopPropagation();
      }}
    >
      <button
        type="button"
        className={`card-menu-trigger ${open ? "open" : ""}`}
        onClick={() => setOpen((v) => !v)}
        aria-haspopup="menu"
        aria-expanded={open}
        aria-label={label}
        title={label}
      >
        <Icon name="more" size={16} />
      </button>

      {open && (
        <div className="card-menu-dropdown" role="menu">
          {items.map((item) => (
            <button
              key={item.label}
              type="button"
              role="menuitem"
              className={`card-menu-item ${item.danger ? "is-danger" : ""}`}
              onClick={() => {
                setOpen(false);
                item.onClick();
              }}
            >
              {item.icon && <Icon name={item.icon} size={14} />}
              <span>{item.label}</span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
};
