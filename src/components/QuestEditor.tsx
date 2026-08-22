import { useRef, useState } from "react";
import { Icon } from "./ui/Icon";
import {
  QUEST_STATUSES,
  nextObjectiveId,
  readQuestMeta,
  type QuestMeta,
  type QuestObjective,
  type QuestStatus,
} from "../lib/quests";
import type { CampaignDoc } from "../state/useCampaign";

/**
 * The quest editor body (#user ask). The hook lives in the card's textarea
 * above; this manages the structure — status, an objectives checklist the DM
 * ticks off as the party earns them, and the reward. Persists to meta (debounced).
 */
export const QuestDocBody = ({
  doc,
  updateDoc,
}: {
  doc: CampaignDoc;
  updateDoc: (id: string, patch: { meta: Record<string, unknown> }) => Promise<{ error: string | null }>;
}) => {
  const [meta, setMeta] = useState<QuestMeta>(() => readQuestMeta(doc.meta));
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const save = (next: QuestMeta, immediate = false) => {
    setMeta(next);
    if (timer.current) clearTimeout(timer.current);
    const write = () => void updateDoc(doc.id, { meta: next as unknown as Record<string, unknown> });
    if (immediate) write();
    else timer.current = setTimeout(write, 700);
  };

  const setStatus = (status: QuestStatus) => save({ ...meta, status }, true);
  const setReward = (reward: string) => save({ ...meta, reward });
  const patchObjs = (objectives: QuestObjective[], immediate = false) => save({ ...meta, objectives }, immediate);

  const addObjective = () =>
    patchObjs([...meta.objectives, { id: nextObjectiveId(meta.objectives), text: "", done: false }], true);
  const toggle = (id: string) =>
    patchObjs(meta.objectives.map((o) => (o.id === id ? { ...o, done: !o.done } : o)), true);
  const editText = (id: string, text: string) =>
    patchObjs(meta.objectives.map((o) => (o.id === id ? { ...o, text } : o)));
  const remove = (id: string) => patchObjs(meta.objectives.filter((o) => o.id !== id), true);

  return (
    <div className="quest-editor">
      <div className="quest-statusrow">
        {QUEST_STATUSES.map((s) => (
          <button
            key={s.key}
            type="button"
            className={`quest-statusbtn is-${s.key} ${meta.status === s.key ? "is-active" : ""}`}
            onClick={() => setStatus(s.key)}
          >
            {s.label}
          </button>
        ))}
      </div>

      <div className="quest-objedit">
        {meta.objectives.map((o) => (
          <div key={o.id} className="quest-objrow">
            <button
              type="button"
              className={`quest-objcheck ${o.done ? "is-done" : ""}`}
              onClick={() => toggle(o.id)}
              title={o.done ? "Mark not done" : "Mark done"}
            >
              {o.done ? "✓" : ""}
            </button>
            <input
              className={o.done ? "is-done" : ""}
              value={o.text}
              placeholder="An objective the party can complete…"
              onChange={(e) => editText(o.id, e.target.value)}
            />
            <button type="button" className="quest-objdel" onClick={() => remove(o.id)} title="Remove objective">
              <Icon name="close" size={12} />
            </button>
          </div>
        ))}
        <button type="button" className="quest-objadd" onClick={addObjective}>
          ＋ Objective
        </button>
      </div>

      <label className="handout-field">
        <span>Reward</span>
        <input value={meta.reward} placeholder="50 gp and the Castellan's favor" onChange={(e) => setReward(e.target.value)} />
      </label>
    </div>
  );
};
