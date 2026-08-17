import { useEffect, useRef } from "react";

/**
 * A small looping casting-hand animation, shown over a token while a saving
 * throw it was hit with is still pending on the defender's screen — so the
 * caster sees "…they're rolling" rather than nothing. Rendered inside the board
 * SVG (foreignObject) so it rides the same pan/zoom as the tokens. Reuses the
 * spell-casting sprite sheet, windowed on each frame's measured center.
 */

const SHEET = {
  src: "/sprites/spell_casting_sprite.png",
  sheetW: 1536,
  sheetH: 1024,
  centers: [100, 280, 464, 660, 875, 1072, 1268, 1442],
  bandCenter: 456,
  winW: 180,
  winH: 220,
};
const FRAME_MS = 90;

export const CastingLoader = ({ cx, cy, size = 46 }: { cx: number; cy: number; size?: number }) => {
  const ref = useRef<HTMLDivElement | null>(null);
  const scale = size / SHEET.winW;
  const w = SHEET.winW * scale;
  const h = SHEET.winH * scale;

  useEffect(() => {
    let i = 0;
    let last = 0;
    let raf = 0;
    const top = SHEET.bandCenter - SHEET.winH / 2;
    const tick = (t: number) => {
      if (!last) last = t;
      if (t - last >= FRAME_MS) {
        last = t;
        const el = ref.current;
        if (el) {
          const left = SHEET.centers[i] - SHEET.winW / 2;
          el.style.backgroundPosition = `${-(left * scale)}px ${-(top * scale)}px`;
        }
        i = (i + 1) % SHEET.centers.length;
      }
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [scale]);

  return (
    <foreignObject
      x={cx - w / 2}
      y={cy - h - 12}
      width={w}
      height={h}
      style={{ overflow: "visible", pointerEvents: "none" }}
    >
      <div
        ref={ref}
        style={{
          width: w,
          height: h,
          backgroundImage: `url(${SHEET.src})`,
          backgroundSize: `${SHEET.sheetW * scale}px ${SHEET.sheetH * scale}px`,
          filter: "drop-shadow(0 2px 4px rgba(0,0,0,0.6))",
          animation: "cast-pulse 1s ease-in-out infinite",
        }}
      />
    </foreignObject>
  );
};
