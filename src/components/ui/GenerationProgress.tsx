import { useEffect, useState } from "react";
import { Icon } from "./Icon";

/**
 * Live feedback while an AI image renders (avatar, backdrop, token…). Image
 * generation takes 30–90s with no real progress signal from the API, so a static
 * "Generating…" reads as a frozen app. This shows the system is alive: a
 * shimmering placeholder at the target aspect, an indeterminate progress bar,
 * an elapsed timer, and stage messages that advance over time.
 */

const STAGES = [
  "Sketching the composition…",
  "Blocking in shapes and forms…",
  "Painting in the detail…",
  "Working the light and color…",
  "Adding the finishing touches…",
];

export const GenerationProgress = ({
  aspect = "1 / 1",
  maxWidth = 220,
}: {
  /** CSS aspect-ratio for the shimmer canvas, e.g. "1 / 1" or "16 / 9". */
  aspect?: string;
  maxWidth?: number;
}) => {
  const [elapsed, setElapsed] = useState(0);
  useEffect(() => {
    const t = setInterval(() => setElapsed((e) => e + 1), 1000);
    return () => clearInterval(t);
  }, []);

  const stage =
    elapsed >= 55
      ? "Still painting — good art takes a moment…"
      : STAGES[Math.min(STAGES.length - 1, Math.floor(elapsed / 8))];
  const clock = `${Math.floor(elapsed / 60)}:${String(elapsed % 60).padStart(2, "0")}`;

  return (
    <div className="genprog" role="status" aria-live="polite">
      <div className="genprog-canvas" style={{ aspectRatio: aspect, maxWidth }}>
        <div className="genprog-shimmer" aria-hidden="true" />
        <Icon name="sparkles" size={26} />
      </div>
      <div className="genprog-bar" aria-hidden="true"><span /></div>
      <div className="genprog-status">
        <span>{stage}</span>
        <span className="mono dim">{clock}</span>
      </div>
      <div className="genprog-hint dim">Usually 30–60 seconds — keep this window open.</div>
    </div>
  );
};
