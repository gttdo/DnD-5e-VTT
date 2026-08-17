import type { ButtonHTMLAttributes, ReactNode } from "react";
import { Icon, type IconName } from "./Icon";

/**
 * Button primitive. Replaces the scattered
 *   <button className="primary" style={{ fontSize, padding, display, gap }}>
 * pattern with a typed component.
 *
 * Variants:
 *   primary      — candle gold, dark text. The main action on a surface.
 *   secondary    — filled neutral surface. Supporting action.
 *   ghost        — transparent, candle text. Low-emphasis / toolbar.
 *   danger       — ember red. Destructive, high-emphasis (delete confirm).
 *   danger-ghost — transparent, ember text. Destructive, low-emphasis (inline delete).
 *
 * Sizes: sm | md | lg. Icons via `icon` (leading) / `iconAfter` (trailing).
 */

type Variant = "primary" | "secondary" | "ghost" | "danger" | "danger-ghost";
type Size = "sm" | "md" | "lg";

interface Props extends Omit<ButtonHTMLAttributes<HTMLButtonElement>, "className"> {
  variant?: Variant;
  size?: Size;
  icon?: IconName;
  iconAfter?: IconName;
  block?: boolean;   // full-width
  children?: ReactNode;
  className?: string;
}

const ICON_SIZE: Record<Size, number> = { sm: 12, md: 14, lg: 16 };

export const Button = ({
  variant = "secondary",
  size = "md",
  icon,
  iconAfter,
  block = false,
  children,
  className,
  ...rest
}: Props) => {
  const classes = [
    "ui-btn",
    `ui-btn--${variant}`,
    `ui-btn--${size}`,
    block ? "ui-btn--block" : "",
    // Icon-only buttons get square padding + centering
    !children && (icon || iconAfter) ? "ui-btn--icon-only" : "",
    className ?? "",
  ]
    .filter(Boolean)
    .join(" ");

  const iconPx = ICON_SIZE[size];

  return (
    <button className={classes} {...rest}>
      {icon && <Icon name={icon} size={iconPx} />}
      {children}
      {iconAfter && <Icon name={iconAfter} size={iconPx} />}
    </button>
  );
};
