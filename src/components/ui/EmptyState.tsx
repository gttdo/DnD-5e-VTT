import type { ReactNode } from "react";
import { Icon, type IconName } from "./Icon";
import { Button } from "./Button";
import { OrnamentalFrame } from "./OrnamentalFrame";

/**
 * Empty-state panel — the "nothing here yet" moment. A large muted icon,
 * a cream headline, a dim subhead, and an optional primary CTA.
 *
 * Used on the library screens (no maps / no tokens), the games screen, the
 * character roster, and inside the picker dialogs. Consistent voice + shape
 * so an empty app still feels intentional.
 */

interface Props {
  icon?: IconName;
  title: string;
  children?: ReactNode;   // subhead copy
  cta?: {
    label: string;
    icon?: IconName;
    onClick: () => void;
  };
  /** Compact variant for inside dialogs (less vertical padding). */
  compact?: boolean;
}

export const EmptyState = ({ icon, title, children, cta, compact = false }: Props) => {
  const inner = (
    <>
      {icon && (
        <div className="ui-empty-icon">
          <Icon name={icon} size={compact ? 28 : 40} strokeWidth={1.5} />
        </div>
      )}
      <div className="ui-empty-title">{title}</div>
      {children && <div className="ui-empty-sub">{children}</div>}
      {cta && (
        <div style={{ marginTop: 4 }}>
          <Button variant="primary" icon={cta.icon} onClick={cta.onClick}>
            {cta.label}
          </Button>
        </div>
      )}
    </>
  );

  // Full empty states get the illuminated frame; the compact variant (inside
  // dialogs) stays plain so the ornament stays special.
  if (compact) {
    return <div className="ui-empty is-compact">{inner}</div>;
  }
  return <OrnamentalFrame className="ui-empty">{inner}</OrnamentalFrame>;
};
