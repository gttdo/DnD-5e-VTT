import { useEffect } from "react";
import { createPortal } from "react-dom";
import { useCharacter } from "../state/useCharacter";
import { MobileSheet } from "./MobileSheet";
import { Icon } from "./ui/Icon";

/**
 * The character sheet at the table — a right-side, NON-modal drawer. No
 * backdrop: the board and HUD stay visible and interactive while the sheet is
 * open (the one-popout rule in the HUD closes it when another panel opens).
 * Embeds the phone layout (MobileSheet), which is built for exactly this
 * column width, driven by its own useCharacter API (safe here: its realtime
 * topic is character:{id}, distinct from the roster's).
 */
export const SheetDrawer = ({ characterId, onClose }: { characterId: string; onClose: () => void }) => {
  const api = useCharacter(characterId);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  // Portaled to <body>: the HUD's backdrop-filter makes it the containing
  // block for fixed descendants, which trapped the "full-height" drawer
  // inside the bar. Rendering at the body level restores viewport anchoring.
  return createPortal(
    <aside className="sheet-drawer" aria-label="Character sheet">
      <div className="sheet-drawer-bar">
        <span className="sheet-drawer-t">
          <Icon name="drama" size={15} /> {api.character?.name ?? "Character"}
        </span>
        <button className="sheet-drawer-x" onClick={onClose} aria-label="Close the sheet">
          <Icon name="close" size={15} />
        </button>
      </div>
      <div className="sheet-drawer-body">
        {api.loading || !api.character ? (
          <div className="sheet-drawer-loading">Loading character…</div>
        ) : (
          <MobileSheet character={api.character} api={api} />
        )}
      </div>
    </aside>,
    document.body
  );
};
