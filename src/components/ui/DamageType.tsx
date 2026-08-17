import { GameGlyph } from "./GameGlyph";
import { damageGlyph, damageColor } from "../../lib/damageTypes";

/**
 * A damage type shown as its tinted library glyph + label — "🔥 fire". The
 * glyph takes the element's colour; the label stays in the surrounding text
 * colour. Renders nothing for an empty type, and label-only if we have no art.
 */
export const DamageType = ({
  type,
  size = 13,
  showLabel = true,
  className,
}: {
  type?: string | null;
  size?: number;
  showLabel?: boolean;
  className?: string;
}) => {
  if (!type) return null;
  const glyph = damageGlyph(type);
  return (
    <span className={`dmg-tag ${className ?? ""}`}>
      {glyph && (
        <span className="dmg-tag-ico" style={{ color: damageColor(type) }}>
          <GameGlyph src={glyph} size={size} />
        </span>
      )}
      {showLabel && <span className="dmg-tag-l">{type}</span>}
    </span>
  );
};
