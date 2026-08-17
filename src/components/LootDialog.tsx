import { Dialog } from "./ui/Dialog";
import { Icon } from "./ui/Icon";
import type { Currency } from "../types/character";
import { type TokenLoot, type LootItem, lootIsEmpty, lootValueGp } from "../lib/loot";
import { Coin } from "./ui/Coin";
import type { Coin as CoinKey } from "../lib/currency";

/**
 * Loot dialog — the contents of a defeated creature or a container, taken into
 * the acting player's character. TableCanvas owns the transfer + persistence;
 * this is the presentation + the "steal" gate for a still-living target.
 */

const COIN_ORDER: (keyof Currency)[] = ["pp", "gp", "ep", "sp", "cp"];
const COIN_LABEL: Record<keyof Currency, string> = { pp: "pp", gp: "gp", ep: "ep", sp: "sp", cp: "cp" };

const kindIcon = (kind?: LootItem["kind"]): "swords" | "shield" | "sparkles" | "package" => {
  switch (kind) {
    case "weapon": return "swords";
    case "armor": return "shield";
    case "treasure": return "sparkles";
    default: return "package";
  }
};

interface Props {
  sourceName: string;
  loot: TokenLoot;
  /** Character receiving loot; null = the user owns no character to loot into. */
  looterName: string | null;
  onTakeItem: (itemId: string) => void;
  onTakeAll: () => void;
  onClose: () => void;
  /** Present when the target is alive — the loot list is gated behind a steal. */
  steal?: {
    sleightBonus: number;
    dc: number;
    rolling: boolean;
    onAttempt: () => void;
  };
}

export const LootDialog = ({ sourceName, loot, looterName, onTakeItem, onTakeAll, onClose, steal }: Props) => {
  const coins = COIN_ORDER.filter((k) => (loot.coins?.[k] ?? 0) > 0);
  const empty = lootIsEmpty(loot);

  // Living target: show the risk gate first. The player commits before seeing
  // what's there — a failed grab means no peek, and a fight.
  if (steal) {
    return (
      <Dialog onClose={onClose} size="sm" title={`Steal from ${sourceName}`} subtitle="Sleight of Hand vs their notice">
        <div className="loot">
          <p className="loot-warn">
            They're still alive. Palm something without being caught — fail and they'll know.
          </p>
          <div className="loot-steal-nums">
            <div><span className="loot-steal-k">Your Sleight of Hand</span><span className="loot-steal-v">{steal.sleightBonus >= 0 ? `+${steal.sleightBonus}` : steal.sleightBonus}</span></div>
            <div><span className="loot-steal-k">DC to beat</span><span className="loot-steal-v">{steal.dc}</span></div>
          </div>
          <div className="loot-actions">
            <button className="ghost" onClick={onClose} disabled={steal.rolling}>Back off</button>
            <button className="primary" onClick={steal.onAttempt} disabled={steal.rolling || !looterName}>
              {steal.rolling ? "Rolling…" : "Attempt the steal"}
            </button>
          </div>
          {!looterName && <p className="loot-nochar">Select one of your characters first to steal into their pack.</p>}
        </div>
      </Dialog>
    );
  }

  return (
    <Dialog
      onClose={onClose}
      size="sm"
      title={`Loot — ${sourceName}`}
      subtitle={empty ? "Picked clean." : `Worth about ${lootValueGp(loot)} gp`}
    >
      <div className="loot">
        {empty ? (
          <p className="loot-empty">Nothing left to take.</p>
        ) : (
          <>
            {coins.length > 0 && (
              <div className="loot-coins">
                {coins.map((k) => (
                  <span key={k} className="loot-coin">
                    <Coin coin={k as CoinKey} size={15} /> <b>{loot.coins[k]}</b> {COIN_LABEL[k]}
                  </span>
                ))}
              </div>
            )}
            {loot.items.length > 0 && (
              <ul className="loot-items">
                {loot.items.map((it) => (
                  <li key={it.id} className="loot-item">
                    <Icon name={kindIcon(it.kind)} size={16} />
                    <span className="loot-item-nm">
                      {it.name}
                      {it.qty > 1 && <span className="loot-item-qty">×{it.qty}</span>}
                    </span>
                    {it.value != null && <span className="loot-item-val">{it.value} gp</span>}
                    <button className="loot-take" onClick={() => onTakeItem(it.id)} disabled={!looterName}>
                      Take
                    </button>
                  </li>
                ))}
              </ul>
            )}
            {!looterName && (
              <p className="loot-nochar">Select one of your characters to loot into their inventory.</p>
            )}
            <div className="loot-actions">
              <button className="ghost" onClick={onClose}>Close</button>
              <button className="primary" onClick={onTakeAll} disabled={!looterName}>
                Take everything{looterName ? ` → ${looterName}` : ""}
              </button>
            </div>
          </>
        )}
      </div>
    </Dialog>
  );
};
