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
  // Placeholder: a little beholder — floating orb, one big central eye, a
  // fanged grin, and eyestalks that sway. All CSS/SVG; swapped for real art
  // once the DM provides frames. States animate via the is-<state> class.
  return (
    <span className={`cdm-sprite cdm-sprite--orb is-${state}`} style={{ width: size, height: size }}>
      <svg viewBox="0 0 48 48" width="100%" height="100%" aria-hidden="true">
        <defs>
          <radialGradient id="cdm-core" cx="40%" cy="34%" r="72%">
            <stop offset="0%" stopColor="var(--candle-bright, #f4dca0)" />
            <stop offset="42%" stopColor="var(--candle, #d9a441)" />
            <stop offset="100%" stopColor="#4a2f10" />
          </radialGradient>
          <radialGradient id="cdm-iris" cx="50%" cy="45%" r="60%">
            <stop offset="0%" stopColor="#e9c96a" />
            <stop offset="100%" stopColor="#7a4a12" />
          </radialGradient>
        </defs>

        {/* Eyestalks — drawn first so they rise from behind the body. */}
        <g className="cdm-stalks" fill="none" stroke="#6a4718" strokeWidth="1.6" strokeLinecap="round">
          <g className="cdm-stalk"><path d="M20 16 Q13 9 10 6" /><circle cx="10" cy="6" r="2.6" fill="#f2e6c6" stroke="none" /><circle cx="10" cy="6" r="1.1" fill="#241708" stroke="none" /></g>
          <g className="cdm-stalk"><path d="M23 14 Q21 6 20 3" /><circle cx="20" cy="3" r="2.6" fill="#f2e6c6" stroke="none" /><circle cx="20" cy="3" r="1.1" fill="#241708" stroke="none" /></g>
          <g className="cdm-stalk"><path d="M25 14 Q27 6 28 3" /><circle cx="28" cy="3" r="2.6" fill="#f2e6c6" stroke="none" /><circle cx="28" cy="3" r="1.1" fill="#241708" stroke="none" /></g>
          <g className="cdm-stalk"><path d="M28 16 Q35 9 38 6" /><circle cx="38" cy="6" r="2.6" fill="#f2e6c6" stroke="none" /><circle cx="38" cy="6" r="1.1" fill="#241708" stroke="none" /></g>
        </g>

        {/* Body */}
        <ellipse className="cdm-halo" cx="24" cy="28" rx="16" ry="14" fill="url(#cdm-core)" />
        <ellipse cx="24" cy="28" rx="16" ry="14" fill="none" stroke="rgba(0,0,0,0.35)" strokeWidth="1.1" />

        {/* Fanged maw */}
        <path className="cdm-maw" d="M14 34 Q24 41 34 34 Q24 37 14 34 Z" fill="#2a1a08" />
        <path d="M17 34.6 l1.6 2.4 1.4 -2 M27 35 l1.4 2 1.6 -2.4" stroke="#f2e6c6" strokeWidth="0.9" fill="none" strokeLinejoin="round" />

        {/* Central eye */}
        <circle cx="24" cy="24" r="7" fill="#f4ecd8" />
        <circle cx="24" cy="24" r="7" fill="none" stroke="rgba(0,0,0,0.3)" strokeWidth="0.8" />
        <circle className="cdm-iris" cx="24" cy="24" r="4.2" fill="url(#cdm-iris)" />
        <ellipse className="cdm-pupil" cx="24" cy="24" rx="1.9" ry="3.2" fill="#160f04" />
        <circle className="cdm-glint" cx="22.4" cy="22" r="1.1" fill="rgba(255,250,235,0.95)" />
      </svg>
    </span>
  );
};
