import { GameGlyph } from "./GameGlyph";
import { coinGlyph, COIN_COLOR, COIN_NAME, type Coin as CoinKey } from "../../lib/currency";

/**
 * A coin glyph tinted to its metal (platinum / gold / electrum / silver /
 * copper). Just the icon — the caller supplies the amount and any label.
 */
export const Coin = ({ coin, size = 14 }: { coin: CoinKey; size?: number }) => (
  <span className="coin-ico" style={{ color: COIN_COLOR[coin] }} title={COIN_NAME[coin]}>
    <GameGlyph src={coinGlyph(coin)} size={size} />
  </span>
);
