/**
 * Quest documents (#user ask — "make quests real"). A quest is a note with
 * structure: a status, an objectives checklist the party can watch fill in,
 * and a reward. The structure lives on the doc's `meta` jsonb (same column
 * handouts use — no migration); the doc's `content` stays the hook/summary.
 */

export type QuestStatus = "active" | "completed" | "failed";

export interface QuestObjective {
  id: string;
  text: string;
  done: boolean;
}

export interface QuestMeta {
  status: QuestStatus;
  objectives: QuestObjective[];
  reward: string;
}

export const QUEST_STATUSES: Array<{ key: QuestStatus; label: string }> = [
  { key: "active", label: "Active" },
  { key: "completed", label: "Completed" },
  { key: "failed", label: "Failed" },
];

/** Read a doc's meta into a well-formed QuestMeta (tolerant of junk/absent). */
export const readQuestMeta = (meta: unknown): QuestMeta => {
  const m = (meta ?? {}) as Partial<QuestMeta>;
  const status: QuestStatus =
    m.status === "completed" || m.status === "failed" ? m.status : "active";
  const objectives = Array.isArray(m.objectives)
    ? m.objectives
        .map((o, i) => ({
          id: typeof o?.id === "string" ? o.id : `o${i}`,
          text: typeof o?.text === "string" ? o.text : "",
          done: Boolean(o?.done),
        }))
    : [];
  return { status, objectives, reward: typeof m.reward === "string" ? m.reward : "" };
};

/** Progress as done/total; total 0 when there are no objectives yet. */
export const questProgress = (meta: unknown): { done: number; total: number } => {
  const { objectives } = readQuestMeta(meta);
  return { done: objectives.filter((o) => o.done).length, total: objectives.length };
};

/** A fresh objective id that doesn't collide within this quest. Deterministic
 *  (index-based) so it never trips the no-Math.random rule in odd contexts. */
export const nextObjectiveId = (objectives: QuestObjective[]): string => {
  let n = objectives.length;
  const has = (id: string) => objectives.some((o) => o.id === id);
  while (has(`o${n}`)) n += 1;
  return `o${n}`;
};
