import type { Character } from "../types/character";

/**
 * Hit-point arithmetic, in one place.
 *
 * The character sheet (useCharacter) and the in-game HUD both change HP, and
 * the rules that matter — healing never exceeds max, damage eats temporary HP
 * first, temp HP takes the higher value rather than stacking — must read the
 * same everywhere. So the maths lives here as pure functions over the `hp`
 * shape, and both surfaces call these instead of each re-deriving them.
 */

export type HpState = Character["hp"];

const clampPos = (n: number) => Math.max(0, n);

export const applyHeal = (hp: HpState, amount: number): HpState => ({
  ...hp,
  current: Math.min(hp.max, hp.current + clampPos(amount)),
});

export const applyDamage = (hp: HpState, amount: number): HpState => {
  let remaining = clampPos(amount);
  const fromTemp = Math.min(hp.temp, remaining);
  remaining -= fromTemp;
  return {
    ...hp,
    temp: hp.temp - fromTemp,
    current: Math.max(0, hp.current - remaining),
  };
};

/** Temporary HP doesn't stack — you keep the larger pool. */
export const applyTempHp = (hp: HpState, amount: number): HpState => ({
  ...hp,
  temp: Math.max(hp.temp, clampPos(amount)),
});
