export interface RollResult {
  expression: string;
  rolls: number[];
  modifier: number;
  total: number;
  detail: string;     // "[4, 6] + 3 = 13"
  /** for advantage/disadvantage tracking */
  kept?: number[];
  dropped?: number[];
}

const rollOne = (sides: number): number => Math.floor(Math.random() * sides) + 1;

/** Parse and roll something like "1d20+5" or "2d6-1" or "3d8" */
export const roll = (expr: string): RollResult => {
  const cleaned = expr.replace(/\s+/g, "");
  const m = cleaned.match(/^(\d+)d(\d+)([+-]\d+)?$/i);
  if (!m) {
    return { expression: expr, rolls: [], modifier: 0, total: 0, detail: "invalid" };
  }
  const count = parseInt(m[1], 10);
  const sides = parseInt(m[2], 10);
  const modifier = m[3] ? parseInt(m[3], 10) : 0;
  const rolls = Array.from({ length: count }, () => rollOne(sides));
  const sum = rolls.reduce((a, b) => a + b, 0);
  const total = sum + modifier;
  const detail =
    `[${rolls.join(", ")}]` + (modifier ? ` ${modifier >= 0 ? "+" : "-"} ${Math.abs(modifier)}` : "") + ` = ${total}`;
  return { expression: expr, rolls, modifier, total, detail };
};

/** Roll d20 with optional advantage/disadvantage and a flat modifier. */
export const rollD20 = (
  modifier: number,
  mode: "normal" | "adv" | "dis" = "normal"
): RollResult => {
  if (mode === "normal") {
    const r = rollOne(20);
    const total = r + modifier;
    return {
      expression: `1d20${formatMod(modifier)}`,
      rolls: [r],
      modifier,
      total,
      detail: `[${r}]${formatMod(modifier)} = ${total}`,
    };
  }
  const a = rollOne(20);
  const b = rollOne(20);
  const kept = mode === "adv" ? Math.max(a, b) : Math.min(a, b);
  const dropped = mode === "adv" ? Math.min(a, b) : Math.max(a, b);
  const total = kept + modifier;
  return {
    expression: `1d20${formatMod(modifier)} (${mode === "adv" ? "advantage" : "disadvantage"})`,
    rolls: [a, b],
    kept: [kept],
    dropped: [dropped],
    modifier,
    total,
    detail: `[${a}, ${b}] kept ${kept}${formatMod(modifier)} = ${total}`,
  };
};

const formatMod = (n: number): string => (n >= 0 ? `+${n}` : `${n}`);
