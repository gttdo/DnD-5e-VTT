/**
 * The Co-DM companion's avatar (#7). Renders whatever art we have for the
 * four states — idle, thinking, talking, nudge — and animates presence.
 *
 * Art is swappable: pass `frames` (a URL per state) once the DM provides a
 * sprite and it cross-fades between them; with no art it falls back to a
 * hand-built rune-orb so the whole companion works before any asset exists.
 */

export type CompanionState = "idle" | "thinking" | "talking" | "nudge";

export interface CompanionArt {
  idle: string;
  thinking?: string;
  talking?: string;
  nudge?: string;
}

export const CompanionSprite = ({
  state,
  art,
  size = 56,
}: {
  state: CompanionState;
  art?: CompanionArt;
  size?: number;
}) => {
  if (art) {
    const src = art[state] ?? art.idle;
    return (
      <span className={`cdm-sprite is-${state}`} style={{ width: size, height: size }}>
        <img src={src} alt="" draggable={false} />
      </span>
    );
  }
  // Placeholder: a floating arcane orb with a slit pupil, all CSS/SVG.
  return (
    <span className={`cdm-sprite cdm-sprite--orb is-${state}`} style={{ width: size, height: size }}>
      <svg viewBox="0 0 48 48" width="100%" height="100%" aria-hidden="true">
        <defs>
          <radialGradient id="cdm-core" cx="38%" cy="34%" r="70%">
            <stop offset="0%" stopColor="var(--candle-bright, #f4dca0)" />
            <stop offset="45%" stopColor="var(--candle, #d9a441)" />
            <stop offset="100%" stopColor="#5a3a12" />
          </radialGradient>
        </defs>
        <circle className="cdm-halo" cx="24" cy="24" r="21" fill="url(#cdm-core)" />
        <circle cx="24" cy="24" r="21" fill="none" stroke="rgba(0,0,0,0.35)" strokeWidth="1.2" />
        {/* pupil — narrows while thinking, widens on nudge via CSS */}
        <ellipse className="cdm-pupil" cx="24" cy="24" rx="4.5" ry="9" fill="#1a1206" />
        <circle className="cdm-glint" cx="21.5" cy="19" r="1.8" fill="rgba(255,250,235,0.9)" />
      </svg>
    </span>
  );
};
