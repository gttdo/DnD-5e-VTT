import { useEffect, useRef } from "react";

/**
 * Animated attack cursor for targeting mode.
 *
 * CSS `cursor:` can only show a static image, so an animated cursor has to be a
 * real element that follows the pointer and steps through a sprite sheet. While
 * targeting, the board hides the native cursor and renders this instead: it sits
 * on frame 0 (idle) and plays the swing → impact → settle frames once on each
 * click, then returns to idle.
 *
 * Three sheets share the rig, chosen by `kind`: a sword (weapons), a fist
 * (unarmed strikes), and a casting hand (spell attacks). The sheets are NOT
 * uniform — different pixel sizes, and frames that aren't evenly spaced (they're
 * AI-generated) — so every sprite carries its own geometry: each frame's
 * measured center x, the vertical band the art lives in, a crop window narrower
 * than the gap to its neighbours (so nothing bleeds in), the contact point
 * (blade tip / knuckles / orb) used as the pointer hotspot, and which frame is
 * the impact burst. A single shared SCALE keeps the on-screen art a consistent
 * size across all three. All pixel work is imperative on the element ref, so
 * there's no React re-render per pointer move or per frame.
 */

export type CursorKind = "sword" | "unarmed" | "spell" | "steal";

interface Sprite {
  src: string;
  sheetW: number;
  sheetH: number;
  centers: number[]; // measured center x of each frame
  bandCenter: number; // vertical center of the art band (single-row sheets)
  /** Per-frame center y — for grid sheets that wrap onto multiple rows. When
   *  absent, every frame sits on bandCenter (a single horizontal strip). */
  centersY?: number[];
  winW: number; // crop window width (< gap between frame centers)
  winH: number; // crop window height (covers the art band)
  contactX: number; // idle-frame contact point → pointer hotspot
  contactY: number;
  impact: number; // which sprite frame is the impact burst
  /** One-shot click sequence for this sheet; defaults to the shared CLICK_FRAMES. */
  clickFrames?: number[];
}

const SPRITES: Record<CursorKind, Sprite> = {
  sword: {
    src: "/sprites/sword_sprite.png",
    sheetW: 1774,
    sheetH: 887,
    centers: [123, 350, 562, 795, 1027, 1237, 1449, 1647],
    bandCenter: 442,
    winW: 220,
    winH: 222,
    contactX: 41,
    contactY: 374,
    impact: 3,
  },
  unarmed: {
    src: "/sprites/unarmed_strike_sprite.png",
    sheetW: 1774,
    sheetH: 887,
    centers: [104, 337, 604, 869, 1100, 1304, 1468, 1642],
    bandCenter: 442,
    winW: 220,
    winH: 222,
    contactX: 62,
    contactY: 405,
    impact: 3,
  },
  spell: {
    src: "/sprites/spell_casting_sprite.png",
    sheetW: 1536,
    sheetH: 1024,
    centers: [100, 280, 464, 660, 875, 1072, 1268, 1442],
    bandCenter: 456,
    winW: 180,
    winH: 220,
    contactX: 111,
    contactY: 461,
    impact: 4,
  },
  // Pickpocket: a hand going from open to a tight pinch. 5×2 grid (measured
  // content centers), so it carries per-frame Y and its own 10-frame sequence.
  steal: {
    src: "/sprites/stealing_sprite.png",
    sheetW: 1536,
    sheetH: 1024,
    centers: [206, 453, 781, 1060, 1329, 171, 460, 758, 1043, 1326],
    centersY: [318, 329, 333, 336, 339, 710, 709, 709, 706, 703],
    bandCenter: 318,
    winW: 240,
    winH: 250,
    contactX: 245,
    contactY: 240,
    impact: 4,
    clickFrames: [1, 2, 3, 4, 5, 6, 7, 8, 9, 0],
  },
};

// Shared: source→screen scale (keeps art a consistent size across sheets) and
// the click sequence + per-frame duration.
const SCALE = 64 / 220;
const IDLE_FRAME = 0;
/** One-shot on click: wind-up → charge → impact → recover → settle to idle. */
const CLICK_FRAMES = [1, 2, 3, 4, 5, 6, 7, IDLE_FRAME];
const FRAME_MS = 55;

// The live pointer position, tracked always-on so a cursor that activates from
// a click (casting a spell from the panel, no mouse move) can appear at the
// mouse immediately instead of off-screen until the next move.
const lastPointer = { x: -9999, y: -9999 };
if (typeof window !== "undefined") {
  window.addEventListener(
    "pointermove",
    (e) => {
      lastPointer.x = e.clientX;
      lastPointer.y = e.clientY;
    },
    { passive: true }
  );
}

const clickFramesFor = (kind: CursorKind): number[] => SPRITES[kind].clickFrames ?? CLICK_FRAMES;

/** Total swing duration (ms) — how long to keep the cursor alive after a click. */
export const CURSOR_SWING_MS = CLICK_FRAMES.length * FRAME_MS;
/** Per-kind swing duration (sheets with longer sequences run longer). */
export const cursorSwingMs = (kind: CursorKind): number => clickFramesFor(kind).length * FRAME_MS;
/** When during the swing the blow lands for this kind — sync the roll to it. */
export const cursorImpactMs = (kind: CursorKind): number =>
  (clickFramesFor(kind).indexOf(SPRITES[kind].impact) + 1) * FRAME_MS;

export const AttackCursor = ({
  active,
  kind = "sword",
}: {
  active: boolean;
  kind?: CursorKind;
}) => {
  const ref = useRef<HTMLDivElement | null>(null);
  const pos = useRef({ x: -9999, y: -9999 });
  const playing = useRef(false);
  const raf = useRef(0);

  const s = SPRITES[kind];
  const clickFrames = s.clickFrames ?? CLICK_FRAMES;
  const bandOf = (f: number): number => s.centersY?.[f] ?? s.bandCenter;
  const dispW = Math.round(s.winW * SCALE);
  const dispH = Math.round(s.winH * SCALE);
  const winLeft0 = s.centers[IDLE_FRAME] - s.winW / 2;
  const winTop0 = bandOf(IDLE_FRAME) - s.winH / 2;
  const hotspotX = (s.contactX - winLeft0) * SCALE;
  const hotspotY = (s.contactY - winTop0) * SCALE;

  const place = () => {
    const el = ref.current;
    if (!el) return;
    el.style.transform = `translate(${pos.current.x - hotspotX}px, ${pos.current.y - hotspotY}px)`;
  };

  const setFrame = (f: number) => {
    const el = ref.current;
    if (!el) return;
    const left = s.centers[f] - s.winW / 2;
    const top = bandOf(f) - s.winH / 2;
    el.style.backgroundPosition = `${-(left * SCALE)}px ${-(top * SCALE)}px`;
  };

  const play = () => {
    if (playing.current) return;
    playing.current = true;
    let i = 0;
    let last = 0;
    const tick = (t: number) => {
      if (!last) last = t;
      if (t - last >= FRAME_MS) {
        last = t;
        setFrame(clickFrames[i]);
        i += 1;
        if (i >= clickFrames.length) {
          playing.current = false;
          setFrame(IDLE_FRAME);
          return;
        }
      }
      raf.current = requestAnimationFrame(tick);
    };
    raf.current = requestAnimationFrame(tick);
  };

  useEffect(() => {
    if (!active) return;
    // Seed from the live pointer so the cursor appears AT the mouse the moment
    // it activates — otherwise, casting from a panel (a click, no move) would
    // leave it off-screen (and the native cursor is hidden) until you move.
    pos.current = { ...lastPointer };
    setFrame(IDLE_FRAME);
    place();
    const onMove = (e: PointerEvent) => {
      pos.current = { x: e.clientX, y: e.clientY };
      place();
    };
    // Capture phase so the swing kicks off on the same click that resolves the
    // attack, before the token handler stops propagation.
    const onDown = () => play();
    window.addEventListener("pointermove", onMove, { passive: true });
    window.addEventListener("pointerdown", onDown, true);
    return () => {
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerdown", onDown, true);
      cancelAnimationFrame(raf.current);
      playing.current = false;
    };
    // Rebind on kind change so the geometry/closure track the active sheet.
  }, [active, kind]);

  if (!active) return null;
  return (
    <div
      ref={ref}
      className="attack-cursor"
      aria-hidden
      style={{
        backgroundImage: `url(${s.src})`,
        width: dispW,
        height: dispH,
        backgroundSize: `${s.sheetW * SCALE}px ${s.sheetH * SCALE}px`,
      }}
    />
  );
};
