import { useEffect } from "react";
import type { ReactNode } from "react";
import { Icon } from "./Icon";

/**
 * Right-side drawer for character-sheet actions.
 *
 * Per the D&D Beyond reference, buttons like Short Rest / Long Rest /
 * Conditions don't fire immediately — they slide out a panel that explains the
 * rule, offers its options, and puts the commit behind an explicit button. That
 * makes the rules discoverable at the moment you need them and makes a
 * destructive-ish action (a long rest resets a lot of state) deliberate.
 *
 * Non-modal by design: the sheet stays readable and interactive beside it, so
 * you can check a feature's charges while deciding whether to rest.
 */

interface Props {
  title: string;
  onClose: () => void;
  children: ReactNode;
  /** Sticky action row pinned under the body (e.g. Take Long Rest / Reset). */
  footer?: ReactNode;
}

export const SheetDrawer = ({ title, onClose, children, footer }: Props) => {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  return (
    <aside className="sheet-drawer" role="dialog" aria-label={title}>
      <header className="sheet-drawer-head">
        <h2 className="sheet-drawer-title">{title}</h2>
        <button className="ghost" onClick={onClose} aria-label="Close" title="Close">
          <Icon name="close" size={14} />
        </button>
      </header>
      <div className="sheet-drawer-body">{children}</div>
      {footer && <div className="sheet-drawer-foot">{footer}</div>}
    </aside>
  );
};
