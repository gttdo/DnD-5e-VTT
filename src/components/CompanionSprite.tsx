/**
 * The Co-DM companion's avatar (#7). Renders whatever art we have for the
 * four states — idle, thinking, talking, nudge — and animates presence.
 *
 * Art is swappable: pass `art` (a URL per state) once the DM provides a
 * sprite and it cross-fades between them; with no art it falls back to a
 * hand-built beholder so the whole companion works before any asset exists.
 */

export type CompanionState = "idle" | "thinking" | "talking" | "nudge";

export interface CompanionArt {
  idle: string;
  thinking?: string;
  talking?: string;
  nudge?: string;
}

// ---- Beholder geometry -----------------------------------------------------
// Eyestalks are computed as tapering tentacles so they read as fleshy, not as
// wires. Each fans out from the body's upper hemisphere and curls at the tip.
const CX = 32;
const CY = 37;
const STALKS = [
  { a: -110, len: 13, curl: -5 },
  { a: -82, len: 18, curl: -6 },
  { a: -54, len: 14, curl: -4 },
  { a: -24, len: 18, curl: -2 },
  { a: 24, len: 18, curl: 2 },
  { a: 54, len: 14, curl: 4 },
  { a: 82, len: 18, curl: 6 },
  { a: 110, len: 13, curl: 5 },
];

const rad = (d: number) => (d * Math.PI) / 180;

function stalkPath({ a, len, curl }: { a: number; len: number; curl: number }) {
  const r = rad(a);
  const dir = { x: Math.sin(r), y: -Math.cos(r) }; // a=0 points straight up
  const perp = { x: Math.cos(r), y: Math.sin(r) };
  const base = 13, wBase = 3.6, wMid = 2.6, wTip = 1.2;
  const bx = CX + dir.x * base, by = CY + dir.y * base;
  const tx = CX + dir.x * (base + len) + perp.x * curl;
  const ty = CY + dir.y * (base + len) + perp.y * curl;
  const mx = (bx + tx) / 2 + perp.x * curl * 0.5;
  const my = (by + ty) / 2 + perp.y * curl * 0.5;
  const off = (px: number, py: number, s: number) => `${(px + perp.x * s).toFixed(1)} ${(py + perp.y * s).toFixed(1)}`;
  const d =
    `M ${off(bx, by, wBase / 2)} Q ${off(mx, my, wMid / 2)} ${off(tx, ty, wTip / 2)} ` +
    `L ${off(tx, ty, -wTip / 2)} Q ${off(mx, my, -wMid / 2)} ${off(bx, by, -wBase / 2)} Z`;
  return { d, tx, ty };
}

// Warts scattered over the body for a lumpy hide; fixed so they never jitter.
const WARTS = [
  { x: 22, y: 30, r: 2.4 }, { x: 42, y: 32, r: 2.1 }, { x: 26, y: 46, r: 2.2 },
  { x: 38, y: 47, r: 1.9 }, { x: 18, y: 40, r: 1.8 }, { x: 46, y: 41, r: 1.7 },
  { x: 32, y: 50, r: 2.0 }, { x: 44, y: 25, r: 1.6 }, { x: 20, y: 24, r: 1.6 },
];
// Little chitin spikes around the lower rim.
const SPIKES = [-150, -130, 130, 150, 168, -168].map((a) => {
  const r = rad(a);
  const dir = { x: Math.sin(r), y: -Math.cos(r) };
  const perp = { x: Math.cos(r), y: Math.sin(r) };
  const bx = CX + dir.x * 19, by = CY + dir.y * 19;
  const tip = `${(bx + dir.x * 4).toFixed(1)} ${(by + dir.y * 4).toFixed(1)}`;
  const l = `${(bx + perp.x * 2).toFixed(1)} ${(by + perp.y * 2).toFixed(1)}`;
  const rr = `${(bx - perp.x * 2).toFixed(1)} ${(by - perp.y * 2).toFixed(1)}`;
  return `M ${l} L ${tip} L ${rr} Z`;
});

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

  // Placeholder: a hand-built beholder — warty orb, one big slit-pupil eye, a
  // fanged red maw, and tapering eyestalks that sway. Pure CSS/SVG; swapped for
  // real art once the DM provides frames. States animate via the is-<state> class.
  return (
    <span className={`cdm-sprite cdm-sprite--orb is-${state}`} style={{ width: size, height: size }}>
      <svg viewBox="0 0 64 64" width="100%" height="100%" aria-hidden="true">
        <defs>
          <radialGradient id="cdm-body" cx="42%" cy="34%" r="72%">
            <stop offset="0%" stopColor="#b08a57" />
            <stop offset="48%" stopColor="#836039" />
            <stop offset="100%" stopColor="#3f2c17" />
          </radialGradient>
          <radialGradient id="cdm-iris" cx="50%" cy="42%" r="62%">
            <stop offset="0%" stopColor="#f0cf78" />
            <stop offset="55%" stopColor="#c88a24" />
            <stop offset="100%" stopColor="#6b3f10" />
          </radialGradient>
          <radialGradient id="cdm-maw" cx="50%" cy="30%" r="80%">
            <stop offset="0%" stopColor="#7a2d34" />
            <stop offset="100%" stopColor="#341015" />
          </radialGradient>
        </defs>

        {/* Eyestalks — drawn first so they rise from behind the body. */}
        <g className="cdm-stalks">
          {STALKS.map((s, i) => {
            const { d, tx, ty } = stalkPath(s);
            return (
              <g className="cdm-stalk" key={i}>
                <path d={d} fill="#6f5130" stroke="#3f2c17" strokeWidth="0.6" strokeLinejoin="round" />
                <circle cx={tx} cy={ty} r="3" fill="#efe2c4" stroke="#3f2c17" strokeWidth="0.7" />
                <circle cx={tx} cy={ty} r="1.2" fill="#20150a" />
                <circle cx={tx - 0.7} cy={ty - 0.8} r="0.5" fill="rgba(255,250,235,0.9)" />
              </g>
            );
          })}
        </g>

        {/* Body */}
        <circle className="cdm-halo" cx={CX} cy={CY} r="20" fill="url(#cdm-body)" />
        <circle cx={CX} cy={CY} r="20" fill="none" stroke="#2c1d0e" strokeWidth="1.2" />
        {SPIKES.map((d, i) => (
          <path key={i} d={d} fill="#4a3419" stroke="#2c1d0e" strokeWidth="0.5" />
        ))}
        {/* warty hide */}
        {WARTS.map((w, i) => (
          <g key={i}>
            <circle cx={w.x} cy={w.y} r={w.r} fill="#5e4426" opacity="0.7" />
            <circle cx={w.x - w.r * 0.3} cy={w.y - w.r * 0.35} r={w.r * 0.5} fill="#b0885a" opacity="0.55" />
          </g>
        ))}

        {/* Brow ridge — the heavy scowl over the central eye. */}
        <path d="M20 27 Q32 21 44 27" fill="none" stroke="#2c1d0e" strokeWidth="2.4" strokeLinecap="round" />

        {/* Central eye */}
        <ellipse cx={CX} cy="34" rx="9.5" ry="9" fill="#f1e6cb" />
        <ellipse cx={CX} cy="34" rx="9.5" ry="9" fill="none" stroke="#2c1d0e" strokeWidth="1" />
        <circle className="cdm-iris" cx={CX} cy="34" r="5.6" fill="url(#cdm-iris)" />
        <ellipse className="cdm-pupil" cx={CX} cy="34" rx="1.7" ry="5" fill="#140d04" />
        <circle className="cdm-glint" cx={CX - 2} cy="31" r="1.3" fill="rgba(255,250,235,0.95)" />

        {/* Fanged maw */}
        <g className="cdm-maw">
          <path d="M20 46 Q32 44 44 46 Q40 56 32 56 Q24 56 20 46 Z" fill="url(#cdm-maw)" stroke="#2c1d0e" strokeWidth="0.9" />
          {/* upper teeth */}
          <path d="M21 46.4 l2 3 1.8 -2.6 1.9 3 1.8 -2.8 1.9 2.9 1.8 -2.8 1.9 2.9 2 -3"
            fill="#efe2c4" stroke="#2c1d0e" strokeWidth="0.4" strokeLinejoin="round" />
          {/* tongue */}
          <ellipse cx={CX} cy="53" rx="4" ry="2.2" fill="#9a4a52" opacity="0.9" />
        </g>
      </svg>
    </span>
  );
};
