import { useEffect, useRef } from "react";

/**
 * Board-space spell VFX — a sprite-sheet effect anchored to the board (rides
 * pan/zoom via <foreignObject>, stepped imperatively by a rAF loop). Three
 * shapes, chosen per-sheet:
 *
 *  • "projectile" — travels from the caster to the target, rotating to face the
 *    direction of flight (Magic Missile, Fire Bolt). The sheet reads left→right
 *    as a time sequence, which maps onto the flight.
 *  • "cone" — anchored at the caster with its apex at the origin, rotated toward
 *    the target, played in place as it grows (Cone of Cold). Does not travel.
 *  • "burst" — plays in place at a point (from == to), for teleports/impacts
 *    that don't travel or aim (Misty Step).
 *
 * Add a spell by dropping a `<name>_sprite.png` in `public/sprites/` and
 * registering its geometry in SHEETS. Art must point RIGHT at 0° (it's rotated
 * to aim).
 */

interface Sheet {
  src: string;
  sheetW: number;
  sheetH: number;
  cols: number;
  rows: number;
  /** On-screen width of one frame, in SVG units (~grid cells × 40). */
  dispW: number;
  /** Playback shape (default "projectile"). "burst" plays in place at the point
   *  (from == to), for teleports/impacts that don't travel or aim. */
  kind?: "projectile" | "cone" | "burst";
  /** Explicit playback order of grid indices (row-major). Use when the grid
   *  isn't fully packed — skips empty cells. Defaults to 0…cols*rows-1. */
  frameSeq?: number[];
  /** Vertical anchor as a fraction of frame height (0.5 = centered on the
   *  point). Raise it to lift art that rises above its origin (a plume). */
  anchorY?: number;
  /** Drop a black backdrop with `mix-blend-mode: screen` (sheets on black).
   *  Defaults on for cones; set explicitly for other black-backed sheets. */
  screen?: boolean;
}

const SHEETS: Record<string, Sheet> = {
  // public/sprites/magic_missile_sprite.png — 1536×391, one row of 6 frames.
  "magic-missile": { src: "/sprites/magic_missile_sprite.png", sheetW: 1536, sheetH: 391, cols: 6, rows: 1, dispW: 120 },
  // public/sprites/firebolt_sprite.png — 1997×326, one row of 8 frames (fireball → smoke).
  "firebolt": { src: "/sprites/firebolt_sprite.png", sheetW: 1997, sheetH: 326, cols: 8, rows: 1, dispW: 140 },
  // public/sprites/cone_of_cold_sprite.png — 1536×1024, one row of 5 frames; the cone
  // grows from an apex on the left. Anchored at the caster, aimed at the target.
  "cone-of-cold": { src: "/sprites/cone_of_cold_sprite.png", sheetW: 1536, sheetH: 1024, cols: 5, rows: 1, dispW: 480, kind: "cone" },
  // public/sprites/misty_step_animation.png — 2172×724, a 6×2 grid (12 frames); an
  // arcane plume that rises where a creature vanishes/reappears. Plays in place.
  "misty-step": { src: "/sprites/misty_step_animation.png", sheetW: 2172, sheetH: 724, cols: 6, rows: 2, dispW: 130, kind: "burst", anchorY: 0.72, screen: true },
};

/** How long a projectile takes to fly (or a cone takes to bloom), in ms.
 *  Exported so the resolver can land the spell's effect on arrival. */
export const SPELL_FX_TRAVEL_MS = 560;

export interface SpellFxInstance {
  id: string;
  vfx: string;
  fromX: number;
  fromY: number;
  toX: number;
  toY: number;
}

export const hasSpellFx = (vfx: string): boolean => vfx in SHEETS;

/** One spell effect. Renders nothing for an unknown vfx key (but still fires
 *  onDone so the parent cleans up). */
export const SpellProjectile = ({ fx, onDone }: { fx: SpellFxInstance; onDone: () => void }) => {
  const gRef = useRef<SVGGElement | null>(null);
  const spriteRef = useRef<HTMLDivElement | null>(null);
  const sheet = SHEETS[fx.vfx];

  useEffect(() => {
    if (!sheet) {
      onDone();
      return;
    }
    const travels = (sheet.kind ?? "projectile") === "projectile";
    const seq = sheet.frameSeq ?? Array.from({ length: sheet.cols * sheet.rows }, (_, i) => i);
    const frames = seq.length;
    const scale = sheet.dispW / (sheet.sheetW / sheet.cols);
    // Cone/projectile aim along from→target; a burst plays flat (no rotation).
    const angle = sheet.kind === "burst" ? 0 : (Math.atan2(fx.toY - fx.fromY, fx.toX - fx.fromX) * 180) / Math.PI;
    let start = 0;
    let raf = 0;
    const tick = (t: number) => {
      if (!start) start = t;
      const p = Math.min(1, (t - start) / SPELL_FX_TRAVEL_MS);
      // Projectile travels caster→target; a cone or burst stays put at the origin.
      const px = travels ? fx.fromX + (fx.toX - fx.fromX) * p : fx.fromX;
      const py = travels ? fx.fromY + (fx.toY - fx.fromY) * p : fx.fromY;
      const g = gRef.current;
      if (g) g.setAttribute("transform", `translate(${px} ${py}) rotate(${angle})`);
      const idx = seq[Math.min(frames - 1, Math.floor(p * frames))];
      const el = spriteRef.current;
      if (el) {
        const col = idx % sheet.cols;
        const row = Math.floor(idx / sheet.cols);
        const cw = (sheet.sheetW / sheet.cols) * scale;
        const ch = (sheet.sheetH / sheet.rows) * scale;
        el.style.backgroundPosition = `${-(col * cw)}px ${-(row * ch)}px`;
      }
      if (p >= 1) {
        onDone();
        return;
      }
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  if (!sheet) return null;
  const isCone = sheet.kind === "cone";
  const scale = sheet.dispW / (sheet.sheetW / sheet.cols);
  const w = (sheet.sheetW / sheet.cols) * scale;
  const h = (sheet.sheetH / sheet.rows) * scale;
  // A cone's apex sits at the origin (x=0), extending right; a projectile/burst
  // is centered on the origin. anchorY lifts art that rises above its point.
  const fx0 = isCone ? 0 : -w / 2;
  const fy0 = -h * (sheet.anchorY ?? 0.5);
  const useScreen = sheet.screen ?? isCone; // sheets on a black backdrop
  return (
    <g ref={gRef} style={{ pointerEvents: "none" }}>
      <foreignObject x={fx0} y={fy0} width={w} height={h} style={{ overflow: "visible" }}>
        <div
          ref={spriteRef}
          style={{
            width: w,
            height: h,
            backgroundImage: `url("${encodeURI(sheet.src)}")`,
            backgroundSize: `${sheet.sheetW * scale}px ${sheet.sheetH * scale}px`,
            // Sheets baked on black use "screen" to drop the backdrop over the map.
            mixBlendMode: useScreen ? "screen" : undefined,
          }}
        />
      </foreignObject>
    </g>
  );
};
