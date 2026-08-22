import type { ReactNode } from "react";
import { AvatarMenu } from "./ui/AvatarMenu";
import { BrandMark } from "./ui/BrandMark";
import { Icon, type IconName } from "./ui/Icon";

/**
 * Global app shell — sticky top nav (brand + tabs + user menu) over main content.
 * Rendered around every authenticated screen. The auth screen sits outside
 * because pre-authentication has no nav.
 *
 * The nav's "active tab" is derived from the current screen; child screens
 * like the character sheet (came from roster) or the table canvas (came from
 * games) light up the tab of their origin section.
 */

export type ShellSection = "characters" | "maps" | "tokens" | "campaigns" | "marketplace";

interface Props {
  /** Active nav section, or null when on the home/landing view (no tab lit). */
  section: ShellSection | null;
  onSelectSection: (s: ShellSection) => void;
  onHome: () => void;
  userEmail: string | undefined;
  onSignOut: () => void;
  /** Full-bleed screens (the table) that supply their own chrome. On phones
   *  this hides the bottom tab bar so there aren't two stacked bottom bars. */
  immersive?: boolean;
  children: ReactNode;
}

// Icons are hidden on desktop (text-only nav) and carry the bottom tab bar on
// phones, where a label alone is too small a target to read at a glance.
const NAV: Array<{ key: ShellSection; label: string; icon: IconName }> = [
  { key: "characters",  label: "Characters",  icon: "users" },
  { key: "maps",        label: "Maps",        icon: "map" },
  { key: "tokens",      label: "Resources",   icon: "drama" },
  { key: "campaigns",   label: "Campaigns",   icon: "swords" },
  { key: "marketplace", label: "Marketplace", icon: "package" },
];

export const AppShell = ({
  section,
  onSelectSection,
  onHome,
  userEmail,
  onSignOut,
  immersive = false,
  children,
}: Props) => {
  return (
    <div className={`app-shell ${immersive ? "is-immersive" : ""}`}>
      <header className="app-header">
        <button
          className="app-brand"
          onClick={onHome}
          aria-label="The Table — home"
          title="View the home page"
        >
          <BrandMark size={28} />
          <span className="app-brand-text">The Table</span>
        </button>

        <nav className="app-nav" aria-label="Primary">
          {NAV.map((item) => (
            <button
              key={item.key}
              className={`app-nav-item ${item.key === section ? "active" : ""}`}
              onClick={() => onSelectSection(item.key)}
            >
              <Icon name={item.icon} size={20} className="app-nav-icon" />
              <span className="app-nav-label">{item.label}</span>
            </button>
          ))}
        </nav>

        <div className="app-user">
          <AvatarMenu email={userEmail} onSignOut={onSignOut} />
        </div>
      </header>

      <main className="app-main">{children}</main>
    </div>
  );
};
