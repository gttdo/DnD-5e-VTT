/**
 * The Co-DM companion's avatar (#7) — the bespectacled scholar-beholder.
 *
 * Renders from a horizontal sprite sheet (public/sprites/beholder_sprite.png):
 * 8 poses, one mapped to each state. `art` (per-state image URLs) still
 * overrides if ever provided; otherwise the sheet is the default.
 */

export type CompanionState = "idle" | "thinking" | "talking" | "nudge";

export interface CompanionArt {
  idle: string;
  thinking?: string;
  talking?: string;
  nudge?: string;
}

// The beholder sheet: 8 frames across. Poses, left→right:
// 0 calm · 1 hand-on-chin · 2 finger-up "aha" · 3 exclaiming · 4 grinning ·
// 5 pointing · 6 gesturing · 7 frowning.
const SHEET_URL = "/sprites/beholder_sprite.png";
const SHEET_COLS = 8;
const STATE_FRAME: Record<CompanionState, number> = {
  idle: 0,
  thinking: 1,
  nudge: 2,
  talking: 4,
};

/** How many poses the sheet holds — callers can cycle through them (e.g. on hover). */
export const COMPANION_FRAMES = SHEET_COLS;

export const CompanionSprite = ({
  state,
  art,
  size = 56,
  frame: frameOverride,
}: {
  state: CompanionState;
  art?: CompanionArt;
  size?: number;
  /** Force a specific sheet frame, ignoring the state mapping (hover play). */
  frame?: number;
}) => {
  if (art) {
    const src = art[state] ?? art.idle;
    return (
      <span className={`cdm-sprite is-${state}`} style={{ width: size, height: size }}>
        <img src={src} alt="" draggable={false} />
      </span>
    );
  }

  // Sprite-sheet render: stretch the strip to COLS×1 and slide to the frame.
  const frame = frameOverride != null ? frameOverride : STATE_FRAME[state] ?? 0;
  const posX = SHEET_COLS > 1 ? (frame / (SHEET_COLS - 1)) * 100 : 0;
  return (
    <span
      className={`cdm-sprite cdm-sprite--sheet is-${state}`}
      style={{
        width: size,
        height: size,
        backgroundImage: `url(${SHEET_URL})`,
        backgroundSize: `${SHEET_COLS * 100}% 100%`,
        backgroundPosition: `${posX}% 0%`,
        backgroundRepeat: "no-repeat",
      }}
    />
  );
};
