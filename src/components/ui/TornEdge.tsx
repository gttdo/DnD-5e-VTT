/**
 * TornEdge — a jagged torn-paper divider, like the section breaks in the
 * D&D Beyond landing. Sharp straight-line jags (not smooth waves), but with
 * deliberately UNEVEN peak heights and spacing so it reads as genuinely torn
 * paper rather than a mechanical sawtooth.
 *
 * Rendered as a filled shape in the *adjacent* section's color, overlaid at a
 * band's edge so the image appears to tear into the next section.
 *
 *   <div className="landing-band">
 *     …image + content…
 *     <TornEdge position="bottom" />   // tears into the section below
 *   </div>
 */

interface Props {
  position: "top" | "bottom";
  /** Fill = the section this edge tears INTO (default: page ground). */
  color?: string;
  /** Height of the torn strip in px. */
  height?: number;
}

// Irregular torn silhouette across a 0–1440 viewBox. Gentler than a sawtooth:
// peak Y varies ~30–54 (softer amplitude), horizontal spacing is uneven, and
// the path is stroked with a round line-join so the tips read torn, not spiky.
const TORN_JAGS =
  "M0,44 L36,32 L60,50 L98,34 L132,52 L164,34 L208,48 L244,30 " +
  "L286,50 L320,38 L354,54 L394,32 L432,48 L472,32 L514,50 L550,38 " +
  "L590,52 L630,34 L674,48 L712,32 L754,50 L794,38 L838,52 L876,34 " +
  "L918,48 L958,32 L1002,50 L1042,38 L1086,52 L1124,32 L1172,48 " +
  "L1212,38 L1258,52 L1300,34 L1342,50 L1386,36 L1422,50 L1440,38";

export const TornEdge = ({ position, color = "var(--surface-0)", height = 52 }: Props) => {
  const isBottom = position === "bottom";
  const d = `${TORN_JAGS} L1440,80 L0,80 Z`;
  return (
    <svg
      className={`torn-edge is-${position}`}
      viewBox="0 0 1440 80"
      preserveAspectRatio="none"
      style={{ height, transform: isBottom ? undefined : "scaleY(-1)" }}
      aria-hidden="true"
    >
      {/* Fill + a matching stroke with round joins softens the sharp tips. */}
      <path
        d={d}
        fill={color}
        stroke={color}
        strokeWidth={5}
        strokeLinejoin="round"
      />
    </svg>
  );
};
