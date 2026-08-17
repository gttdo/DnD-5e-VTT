import { useState } from "react";
import { useRules } from "../state/Rules";
import { SheetDrawer } from "./ui/SheetDrawer";

/**
 * In-game rules reference for the table — the lookups a DM reaches for
 * mid-session, so nobody has to leave the app to check a DC or what
 * Restrained does. All content comes from the bundled PHB data
 * (public/data/tables.json + conditions.json); nothing here is hardcoded.
 */

const DC_LABELS: Record<string, string> = {
  very_easy: "Very Easy",
  easy: "Easy",
  medium: "Medium",
  hard: "Hard",
  very_hard: "Very Hard",
  nearly_impossible: "Nearly Impossible",
};

const COVER_LABELS: Record<string, string> = {
  half: "Half Cover",
  three_quarters: "Three-Quarters Cover",
  total: "Total Cover",
};

type Section = "dcs" | "cover" | "conditions" | "travel";

export const RulesReference = ({ onClose }: { onClose: () => void }) => {
  const { tables, conditions } = useRules();
  const [open, setOpen] = useState<Section>("dcs");

  const toggle = (s: Section) => setOpen(s);

  return (
    <SheetDrawer title="Rules Reference" onClose={onClose}>
      {/* Section tabs — one visible at a time keeps the drawer scannable. */}
      <div className="rules-tabs">
        {(
          [
            ["dcs", "DCs"],
            ["cover", "Cover"],
            ["conditions", "Conditions"],
            ["travel", "Travel"],
          ] as Array<[Section, string]>
        ).map(([key, label]) => (
          <button
            key={key}
            className={open === key ? "active" : ""}
            onClick={() => toggle(key)}
          >
            {label}
          </button>
        ))}
      </div>

      {open === "dcs" && tables && (
        <>
          <div className="drawer-section-title">Typical Difficulty Classes</div>
          <div className="rules-table">
            {Object.entries(tables.typical_dcs).map(([key, dc]) => (
              <div className="rules-row" key={key}>
                <span>{DC_LABELS[key] ?? key}</span>
                <span className="rules-value mono">DC {dc}</span>
              </div>
            ))}
          </div>
        </>
      )}

      {open === "cover" && tables && (
        <>
          <div className="drawer-section-title">Cover</div>
          {Object.entries(tables.cover).map(([key, c]) => (
            <div className="rules-block" key={key}>
              <div className="rules-block-head">
                <span>{COVER_LABELS[key] ?? key}</span>
                <span className="rules-value mono">
                  {c.ac_bonus === null ? "Untargetable" : `+${c.ac_bonus} AC / +${c.save_bonus} DEX saves`}
                </span>
              </div>
              <p className="drawer-note">{c.desc}</p>
            </div>
          ))}
        </>
      )}

      {open === "conditions" && conditions && (
        <>
          <div className="drawer-section-title">Conditions</div>
          {Object.entries(conditions).map(([name, data]) => (
            <div className="rules-block" key={name}>
              <div className="rules-block-head">
                <span>{name}</span>
              </div>
              <ul className="drawer-list" style={{ fontSize: 12 }}>
                {data.effects.map((e) => (
                  <li key={e}>{e}</li>
                ))}
              </ul>
            </div>
          ))}
        </>
      )}

      {open === "travel" && tables && (
        <>
          <div className="drawer-section-title">Travel Pace</div>
          <div className="rules-table">
            <div className="rules-row rules-head-row">
              <span>Pace</span>
              <span className="rules-value">ft/min · mi/hr · mi/day</span>
            </div>
            {Object.entries(tables.travel_pace).map(([pace, p]) => (
              <div className="rules-row" key={pace}>
                <span>{pace}</span>
                <span className="rules-value mono">
                  {p.per_minute_ft} · {p.per_hour_mi} · {p.per_day_mi}
                </span>
              </div>
            ))}
          </div>
          <p className="drawer-note" style={{ marginTop: 10 }}>
            Fast pace imposes −5 to passive Perception; slow pace allows Stealth.
          </p>
        </>
      )}
    </SheetDrawer>
  );
};
