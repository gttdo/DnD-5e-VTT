import { GameGlyph } from "./GameGlyph";
import { weaponPropGlyph } from "../../lib/weaponProps";

/**
 * A weapon's properties as glyph + label chips (Finesse, Light, Thrown…). Each
 * property keeps its full text (including any parenthetical range/dice); the
 * glyph is a quick visual anchor. Properties with no art show as text alone.
 */
export const WeaponProps = ({ properties }: { properties?: string[] }) => {
  if (!properties || properties.length === 0) return null;
  return (
    <span className="wprop-list">
      {properties.map((p) => {
        const glyph = weaponPropGlyph(p);
        return (
          <span key={p} className="wprop" title={p}>
            {glyph && <GameGlyph src={glyph} size={13} className="wprop-ico" />}
            {p}
          </span>
        );
      })}
    </span>
  );
};
