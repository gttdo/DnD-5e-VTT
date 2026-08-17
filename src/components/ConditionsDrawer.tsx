import type { Character, Condition } from "../types/character";
import type { CharacterAPI } from "../state/useCharacter";
import { useRules } from "../state/Rules";
import { SheetDrawer } from "./ui/SheetDrawer";

/**
 * Conditions drawer — a switch per condition with what it actually does.
 *
 * Effects come from public/data/conditions.json rather than being written here:
 * the dataset carries the real per-condition effect list ("Can't See: …",
 * "Attacks Affected: …"), which is both more accurate and more complete than
 * the one-liners this component used to hardcode.
 */

/** Fallback order — the data is keyed by name, and object key order is not
 *  guaranteed to be the order players expect. */
const ORDER: Condition[] = [
  "Blinded", "Charmed", "Deafened", "Frightened", "Grappled",
  "Incapacitated", "Invisible", "Paralyzed", "Petrified", "Poisoned",
  "Prone", "Restrained", "Stunned", "Unconscious", "Exhaustion",
];

interface Props {
  character: Character;
  api: CharacterAPI;
  onClose: () => void;
}

export const ConditionsDrawer = ({ character: c, api, onClose }: Props) => {
  const { conditions: data } = useRules();
  const active = c.conditions.length;

  return (
    <SheetDrawer title="Conditions" onClose={onClose}>
      <p className="drawer-lede">
        {active
          ? `${active} active condition${active === 1 ? "" : "s"}.`
          : "No active conditions."}
      </p>

      <div className="cond-switch-list">
        {ORDER.map((name) => {
          const on = c.conditions.includes(name);
          const effects = data?.[name]?.effects ?? [];
          return (
            <label key={name} className={`cond-switch ${on ? "on" : ""}`}>
              <span className="cond-switch-text">
                <span className="cond-switch-name">{name}</span>
                {effects.length > 0 && (
                  <span className="cond-switch-effect">
                    {effects.map((e) => (
                      <span className="cond-effect-line" key={e}>{e}</span>
                    ))}
                  </span>
                )}
              </span>
              <input
                type="checkbox"
                checked={on}
                onChange={() => api.toggleCondition(name)}
                aria-label={name}
              />
              <span className="cond-switch-track" aria-hidden="true" />
            </label>
          );
        })}
      </div>
    </SheetDrawer>
  );
};
