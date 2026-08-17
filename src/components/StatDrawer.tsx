import type { ReactNode } from "react";
import type { Breakdown } from "../lib/breakdown";
import { formatTerm } from "../lib/breakdown";
import { RULE_TEXT } from "../lib/ruleText";
import { SheetDrawer } from "./ui/SheetDrawer";

/**
 * Detail drawer for a single stat: the value's breakdown (labelled terms that
 * sum to the total), any caveats, then a short paraphrased rules explainer.
 * The generic shell behind the reference's AC / Initiative / Speed / … drawers.
 */

interface Props {
  title: string;
  breakdown: Breakdown;
  /** Key into RULE_TEXT for the explainer paragraphs. */
  ruleKey?: string;
  /** Extra content between the breakdown and the rules text. */
  children?: ReactNode;
  onClose: () => void;
}

export const StatDrawer = ({ title, breakdown, ruleKey, children, onClose }: Props) => (
  <SheetDrawer title={title} onClose={onClose}>
    <div className="stat-total">
      <span className="stat-total-value">{breakdown.total}</span>
    </div>

    <div className="drawer-section-title">How it's calculated</div>
    <div className="rules-table">
      {breakdown.terms.map((t) => (
        <div className="rules-row" key={t.label}>
          <span>{t.label}</span>
          <span className="rules-value mono">{formatTerm(t)}</span>
        </div>
      ))}
      <div className="rules-row stat-sum-row">
        <span>Total</span>
        <span className="rules-value mono">{breakdown.total}</span>
      </div>
    </div>

    {breakdown.notes?.map((n) => (
      <p className="drawer-note" style={{ marginTop: 8 }} key={n}>
        {n}
      </p>
    ))}

    {children}

    {ruleKey && RULE_TEXT[ruleKey] && (
      <>
        <div className="drawer-section-title">The rule</div>
        {RULE_TEXT[ruleKey].map((p) => (
          <p className="drawer-lede" style={{ marginBottom: 10 }} key={p}>
            {p}
          </p>
        ))}
      </>
    )}
  </SheetDrawer>
);
