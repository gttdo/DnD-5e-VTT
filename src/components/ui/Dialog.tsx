import { useEffect, useRef, type ReactNode } from "react";
import { Icon } from "./Icon";

/**
 * Dialog primitive — the base modal shell used by every generator/picker
 * dialog. Consolidates the overlay + panel + close-on-outside + esc-to-close
 * + body-scroll-lock + enter animation logic that used to be reimplemented
 * per-dialog.
 *
 * Usage:
 *   <Dialog onClose={close} size="md" title="Cartographer" subtitle="Saves to library.">
 *     <children — any content, header + close button are handled />
 *   </Dialog>
 */

type Size = "sm" | "md" | "lg";

interface Props {
  onClose: () => void;
  title?: ReactNode;
  subtitle?: ReactNode;
  size?: Size;
  children: ReactNode;
  /**
   * When false, clicking outside the panel or hitting Escape does nothing.
   * Use for critical flows where accidental dismiss is expensive. Defaults true.
   */
  dismissible?: boolean;
}

export const Dialog = ({
  onClose,
  title,
  subtitle,
  size = "md",
  children,
  dismissible = true,
}: Props) => {
  const panelRef = useRef<HTMLDivElement | null>(null);

  // Escape closes; body scroll locked while open.
  useEffect(() => {
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape" && dismissible) onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => {
      document.body.style.overflow = prevOverflow;
      window.removeEventListener("keydown", onKey);
    };
  }, [onClose, dismissible]);

  // Focus the first sensible element inside the panel on open — an input,
  // then a button. Keeps keyboard flow into the form immediate.
  useEffect(() => {
    if (!panelRef.current) return;
    const target =
      panelRef.current.querySelector<HTMLElement>(
        "input:not([type=hidden]), textarea, select, [autofocus]"
      ) ??
      panelRef.current.querySelector<HTMLElement>("button, [href], [tabindex]");
    target?.focus();
  }, []);

  return (
    <div
      className="ui-dialog-overlay"
      onClick={() => dismissible && onClose()}
      role="presentation"
    >
      <div
        ref={panelRef}
        className={`ui-dialog-panel is-${size}`}
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
        aria-label={typeof title === "string" ? title : undefined}
      >
        {(title || dismissible) && (
          <header className="ui-dialog-header">
            {(title || subtitle) && (
              <div className="ui-dialog-titles">
                {title && <h3 className="ui-dialog-title">{title}</h3>}
                {subtitle && <span className="ui-dialog-subtitle">{subtitle}</span>}
              </div>
            )}
            {dismissible && (
              <button
                type="button"
                className="ui-dialog-close"
                onClick={onClose}
                aria-label="Close"
              >
                <Icon name="close" size={16} />
              </button>
            )}
          </header>
        )}
        <div className="ui-dialog-body">{children}</div>
      </div>
    </div>
  );
};
