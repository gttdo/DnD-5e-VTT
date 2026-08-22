import { readQuestMeta } from "../lib/quests";

/**
 * A quest rendered read-only — status badge, objectives checklist (with the
 * party's progress), and the reward. Used in the player's Journal and the DM's
 * Story drawer. The doc's title + content (the hook) are rendered by the
 * surrounding card; this is just the structured part.
 */
export const QuestView = ({ meta }: { meta: unknown }) => {
  const { status, objectives, reward } = readQuestMeta(meta);
  if (objectives.length === 0 && !reward) return null;
  return (
    <div className={`quest quest--${status}`}>
      <span className={`quest-status is-${status}`}>{status}</span>
      {objectives.length > 0 && (
        <ul className="quest-objectives">
          {objectives.map((o) => (
            <li key={o.id} className={o.done ? "is-done" : ""}>
              <span className="quest-check" aria-hidden="true">{o.done ? "✓" : "○"}</span>
              <span className="quest-obj-text">{o.text || "…"}</span>
            </li>
          ))}
        </ul>
      )}
      {reward && (
        <div className="quest-reward">
          <span className="quest-reward-label">Reward</span>
          <span>{reward}</span>
        </div>
      )}
    </div>
  );
};
