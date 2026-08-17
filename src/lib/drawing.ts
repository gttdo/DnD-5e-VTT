import type { DrawKind } from "../state/useDrawings";

/**
 * Pure geometry for the drawing layer — SVG path building and click hit-testing
 * for erase. No React, no Supabase, so it's unit-testable.
 *
 * All coordinates are SVG user units (the canvas's own space). Points are a
 * flat array: pen = the whole path [x0,y0,x1,y1,…]; shapes/arrow = two
 * defining points [x0,y0,x1,y1].
 */

/** `M x0 y0 L x1 y1 …` for a freehand path. */
export const penPathD = (pts: number[]): string => {
  if (pts.length < 2) return "";
  let d = `M${pts[0]},${pts[1]}`;
  for (let i = 2; i + 1 < pts.length; i += 2) d += `L${pts[i]},${pts[i + 1]}`;
  return d;
};

/** Axis-aligned box for a two-point shape. */
export const shapeBox = (pts: number[]) => ({
  x: Math.min(pts[0], pts[2]),
  y: Math.min(pts[1], pts[3]),
  w: Math.abs(pts[2] - pts[0]),
  h: Math.abs(pts[3] - pts[1]),
});

/** Filled polygon points for an arrowhead at the segment's end. */
export const arrowHead = (pts: number[], size = 13): string => {
  const [ax, ay, bx, by] = pts;
  const ang = Math.atan2(by - ay, bx - ax);
  const wing = (2 * Math.PI) / 7; // ~26° half-spread
  const p1x = bx - size * Math.cos(ang - wing);
  const p1y = by - size * Math.sin(ang - wing);
  const p2x = bx - size * Math.cos(ang + wing);
  const p2y = by - size * Math.sin(ang + wing);
  return `${bx},${by} ${p1x},${p1y} ${p2x},${p2y}`;
};

const distToSeg = (
  px: number, py: number,
  ax: number, ay: number,
  bx: number, by: number
): number => {
  const dx = bx - ax;
  const dy = by - ay;
  const len2 = dx * dx + dy * dy;
  if (len2 === 0) return Math.hypot(px - ax, py - ay);
  let t = ((px - ax) * dx + (py - ay) * dy) / len2;
  t = Math.max(0, Math.min(1, t));
  return Math.hypot(px - (ax + t * dx), py - (ay + t * dy));
};

/** Is the point within `tol` of the drawing (for click-to-erase)? */
export const hitsDrawing = (
  d: { kind: DrawKind; points: number[] },
  px: number, py: number,
  tol: number
): boolean => {
  const p = d.points;
  if (d.kind === "pen") {
    for (let i = 0; i + 3 < p.length; i += 2) {
      if (distToSeg(px, py, p[i], p[i + 1], p[i + 2], p[i + 3]) <= tol) return true;
    }
    return p.length >= 2 && Math.hypot(px - p[0], py - p[1]) <= tol;
  }
  if (d.kind === "arrow") {
    return distToSeg(px, py, p[0], p[1], p[2], p[3]) <= tol;
  }
  // rect / ellipse: forgiving — anywhere inside the (slightly grown) box.
  const x0 = Math.min(p[0], p[2]) - tol;
  const x1 = Math.max(p[0], p[2]) + tol;
  const y0 = Math.min(p[1], p[3]) - tol;
  const y1 = Math.max(p[1], p[3]) + tol;
  return px >= x0 && px <= x1 && py >= y0 && py <= y1;
};

export const DRAW_COLORS = ["#e8c076", "#b23a24", "#60a5fa", "#4ade80", "#a855f7", "#f6ecd2"];
