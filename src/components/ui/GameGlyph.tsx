/**
 * A monochrome D&D glyph from the public/icons library (damage types, actions,
 * conditions, schools…). These SVGs are drawn with `fill="currentColor"`, so we
 * render them as a CSS mask over a `currentColor` fill rather than an <img> —
 * that lets the surrounding UI tint them (candle-gold on a hotbar tile, muted
 * on a chip) and keeps them theme-aware.
 *
 * `src` is a root-served path, e.g. "/icons/actions/attack_melee.svg".
 */
export const GameGlyph = ({
  src,
  size = 22,
  className,
}: {
  src: string;
  size?: number;
  className?: string;
}) => (
  <span
    className={`game-glyph ${className ?? ""}`}
    style={{
      width: size,
      height: size,
      WebkitMaskImage: `url("${src}")`,
      maskImage: `url("${src}")`,
    }}
    aria-hidden="true"
  />
);
