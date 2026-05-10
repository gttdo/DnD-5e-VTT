import { useDiceLog } from "../state/DiceLog";

export const DiceLogOverlay = () => {
  const { entries, clear } = useDiceLog();
  return (
    <div className="dice-log">
      <header>
        <span>Dice Log</span>
        <button className="ghost" onClick={clear} style={{ padding: "2px 8px", fontSize: 11 }}>Clear</button>
      </header>
      <div className="entries">
        {entries.length === 0 && (
          <div className="dim" style={{ padding: 12, fontSize: 12, textAlign: "center" }}>
            Click an ability score, skill, save, or attack to roll.
          </div>
        )}
        {entries.map((e) => (
          <div key={e.id} className="entry">
            <div className="row" style={{ justifyContent: "space-between" }}>
              <span className="label">{e.label}</span>
              <span className="total">{e.result.total}</span>
            </div>
            <div className="dim mono" style={{ fontSize: 11 }}>{e.result.detail}</div>
          </div>
        ))}
      </div>
    </div>
  );
};
