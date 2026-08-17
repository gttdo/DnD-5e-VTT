import { useEffect, type RefObject } from "react";

/**
 * Close a popover/menu on an outside click or Escape — the behavior a user
 * expects from anything that floats over the page. Attach the returned ref to
 * the popover's outermost element (INCLUDING its trigger, when the trigger sits
 * inside it) so clicking the trigger to toggle doesn't immediately re-close it.
 *
 * Mirrors the inline pattern in AvatarMenu/CardMenu, extracted so every popover
 * dismisses the same way. `active` gates the listeners (skip them when closed).
 */
export const useDismiss = (
  ref: RefObject<HTMLElement | null>,
  onClose: () => void,
  active = true
): void => {
  useEffect(() => {
    if (!active) return;
    const onDown = (e: MouseEvent | TouchEvent) => {
      const el = ref.current;
      if (el && !el.contains(e.target as Node)) onClose();
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    document.addEventListener("mousedown", onDown);
    document.addEventListener("touchstart", onDown);
    window.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("touchstart", onDown);
      window.removeEventListener("keydown", onKey);
    };
  }, [ref, onClose, active]);
};
