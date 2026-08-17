import { useEffect, useState } from "react";
import { Icon } from "./ui/Icon";

/**
 * Nudges landscape on the VTT for phones held in portrait.
 *
 * Browsers can't FORCE orientation — screen.orientation.lock() only works
 * inside fullscreen, and iOS Safari doesn't support it at all. So this is a
 * dismissible prompt: "Enter landscape" makes a best-effort fullscreen + lock
 * (works on Android), and where that no-ops (iOS) the message itself is the
 * fallback. It auto-hides the moment the device is landscape.
 *
 * Scoped to the table (rendered inside TableCanvas), so it never appears on the
 * character sheet or elsewhere.
 */

const isPhonePortrait = (): boolean =>
  typeof window !== "undefined" &&
  window.matchMedia("(orientation: portrait)").matches &&
  window.matchMedia("(max-width: 820px)").matches;

export const RotateHint = () => {
  const [portrait, setPortrait] = useState(isPhonePortrait);
  // Sticky once dismissed — don't nag someone who chose portrait on purpose.
  const [dismissed, setDismissed] = useState(false);

  useEffect(() => {
    const update = () => setPortrait(isPhonePortrait());
    const mq = window.matchMedia("(orientation: portrait)");
    mq.addEventListener("change", update);
    window.addEventListener("resize", update);
    return () => {
      mq.removeEventListener("change", update);
      window.removeEventListener("resize", update);
    };
  }, []);

  if (!portrait || dismissed) return null;

  const goLandscape = async () => {
    try {
      if (document.documentElement.requestFullscreen) {
        await document.documentElement.requestFullscreen();
      }
      // Only resolves in fullscreen on browsers that support it (Android
      // Chrome). iOS throws / has no lock — caught below, prompt stays.
      const orientation = screen.orientation as ScreenOrientation & {
        lock?: (o: string) => Promise<void>;
      };
      await orientation.lock?.("landscape");
    } catch {
      /* unsupported — the user rotates their device manually */
    }
  };

  return (
    <div className="rotate-hint" role="dialog" aria-label="Rotate for the best view">
      <div className="rotate-hint-card">
        <span className="rotate-hint-icon">
          <Icon name="smartphone" size={30} />
        </span>
        <div className="rotate-hint-title">Turn your phone sideways</div>
        <p className="rotate-hint-body">
          The battle map is built for a wide screen. Rotate to landscape for the
          full table — or drag and pinch to explore it in portrait.
        </p>
        <div className="rotate-hint-actions">
          <button className="primary" onClick={goLandscape}>
            Enter landscape
          </button>
          <button className="ghost" onClick={() => setDismissed(true)}>
            Stay in portrait
          </button>
        </div>
      </div>
    </div>
  );
};
