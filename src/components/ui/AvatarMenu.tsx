import { useEffect, useRef, useState } from "react";
import { Icon } from "./Icon";
import { Button } from "./Button";
import { useTheme } from "../../state/Theme";

/**
 * Avatar dropdown menu for the app header — replaces the inline email +
 * sign-out button. Matches the D&D Beyond pattern: avatar + "Hi, {name}" +
 * chevron trigger, opening a panel with account items and a filled SIGN OUT
 * button at the bottom. Closes on outside-click and Escape.
 */

interface Props {
  email: string | undefined;
  onSignOut: () => void;
}

const nameFromEmail = (email: string | undefined): string => {
  if (!email) return "Adventurer";
  const local = email.split("@")[0];
  // Title-case the first token (e.g. "vinces.gerardo" → "Vinces")
  const first = local.split(/[.\-_+]/)[0];
  return first.charAt(0).toUpperCase() + first.slice(1);
};

export const AvatarMenu = ({ email, onSignOut }: Props) => {
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement | null>(null);
  const { theme, toggleTheme } = useTheme();
  const name = nameFromEmail(email);
  const initial = name.charAt(0).toUpperCase();

  useEffect(() => {
    if (!open) return;
    const onDoc = (e: MouseEvent) => {
      if (rootRef.current && !rootRef.current.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    document.addEventListener("mousedown", onDoc);
    window.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDoc);
      window.removeEventListener("keydown", onKey);
    };
  }, [open]);

  return (
    <div className="avatar-menu" ref={rootRef}>
      <button
        className="avatar-trigger"
        onClick={() => setOpen((v) => !v)}
        aria-haspopup="menu"
        aria-expanded={open}
      >
        <span className="avatar-circle">{initial}</span>
        <span className="avatar-greeting">Hi, <strong>{name}</strong></span>
        <Icon name="down" size={14} className={open ? "avatar-chevron-up" : ""} />
      </button>

      {open && (
        <div className="avatar-dropdown" role="menu">
          <div className="avatar-dropdown-head">
            <span className="avatar-circle lg">{initial}</span>
            <div style={{ minWidth: 0 }}>
              <div className="avatar-dropdown-name">{name}</div>
              {email && <div className="avatar-dropdown-email">{email}</div>}
            </div>
          </div>

          <div className="avatar-dropdown-divider" />

          <button className="avatar-menu-item" role="menuitem" onClick={toggleTheme}>
            <Icon name={theme === "dark" ? "sun" : "moon"} size={15} />
            <span>{theme === "dark" ? "Light theme" : "Dark theme"}</span>
          </button>

          <div className="avatar-dropdown-divider" />

          <Button variant="danger" block icon="sign-out" onClick={onSignOut}>
            Sign Out
          </Button>
        </div>
      )}
    </div>
  );
};
