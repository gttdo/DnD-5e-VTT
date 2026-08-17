/**
 * The Table brand coin — the gold variant from /public, used in both themes.
 */
interface Props {
  size?: number;
}

export const BrandMark = ({ size = 28 }: Props) => (
  <img
    className="app-brand-img"
    src="/favicon_gold.png"
    alt=""
    width={size}
    height={size}
  />
);
