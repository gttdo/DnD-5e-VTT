import { useDiceLog } from "../state/DiceLog";
import { SheetDrawer } from "./ui/SheetDrawer";
import { Icon } from "./ui/Icon";

/**
 * Roll history, as a right-side drawer.
 *
 * Deliberately separate from the dice roller: the roller is an input (pick
 * dice, throw them) and the log is a record (what everyone has rolled). They
 * were previously stacked in one floating dock, which conflated the two and
 * meant opening the history also took over the corner you roll from.
 */

const relativeTime = (at: number): string => {
  const secs = Math.max(0, Math.round((Date.now() - at) / 1000));
  if (secs < 60) return "just now";
  const mins = Math.round(secs / 60);
  if (mins < 60) return `${mins} min ago`;
  const hrs = Math.round(mins / 60);
  return `${hrs} hr${hrs === 1 ? "" : "s"} ago`;
};

export const GameLog = ({ onClose, canClear = true }: { onClose: () => void; canClear?: boolean }) => {
  const { entries, clear } = useDiceLog();

  return (
    <SheetDrawer
      title="Game Log"
      onClose={onClose}
      footer={
        entries.length && canClear ? (
          <button className="ghost" onClick={clear}>
            Clear log
          </button>
        ) : undefined
      }
    >
      {entries.length === 0 ? (
        <div className="gamelog-empty">
          <span className="gamelog-empty-icon">
            <Icon name="dice" size={28} />
          </span>
          <div className="gamelog-empty-title">No rolls yet</div>
          <p className="gamelog-empty-body">
            Click an ability score, skill, save, or attack on your sheet — or
            open the dice roller. Every roll shows up here.
          </p>
        </div>
      ) : (
        <div className="gamelog-list">
          {entries.map((e) => (
            <article className="gamelog-entry" key={e.id}>
              <div className="gamelog-label">{e.label}</div>
              <div className="gamelog-result">
                <span className="gamelog-detail">{e.result.detail}</span>
                <span className="gamelog-total">{e.result.total}</span>
              </div>
              <div className="gamelog-meta">
                <span className="mono">{e.result.expression}</span>
                <span>{relativeTime(e.at)}</span>
              </div>
            </article>
          ))}
        </div>
      )}
    </SheetDrawer>
  );
};
