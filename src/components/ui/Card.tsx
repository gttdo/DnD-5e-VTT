import type { ReactNode, CSSProperties } from "react";

/**
 * Card primitive — the base surface for the roster / games / maps / tokens
 * grids and for the picker dialogs. Composable subcomponents so the same
 * base handles both image-forward (map thumbnail on top) and text-forward
 * (character info at top) shapes without prop explosion.
 *
 * Usage:
 *   <Card onClick={open} selected={isCurrent}>
 *     <CardMedia src={img} aspect="3/2" />
 *     <CardBody>
 *       <CardTitle>Cave of the Sunless Fen</CardTitle>
 *       <CardMeta>Realistic · Cavern</CardMeta>
 *     </CardBody>
 *     <CardActions>
 *       <button>Rename</button>
 *       <button className="danger">Delete</button>
 *     </CardActions>
 *   </Card>
 */

interface CardProps {
  children: ReactNode;
  onClick?: () => void;
  hover?: boolean;
  selected?: boolean;
  className?: string;
  style?: CSSProperties;
  title?: string;
}

export const Card = ({
  children,
  onClick,
  hover = true,
  selected = false,
  className,
  style,
  title,
}: CardProps) => {
  const classes = [
    "ui-card",
    hover ? "is-hover" : "",
    selected ? "is-selected" : "",
    onClick ? "is-clickable" : "",
    className ?? "",
  ]
    .filter(Boolean)
    .join(" ");

  return (
    <div
      className={classes}
      onClick={onClick}
      role={onClick ? "button" : undefined}
      tabIndex={onClick ? 0 : undefined}
      onKeyDown={
        onClick
          ? (e) => {
              if (e.key === "Enter" || e.key === " ") {
                e.preventDefault();
                onClick();
              }
            }
          : undefined
      }
      style={style}
      title={title}
    >
      {children}
    </div>
  );
};

interface CardMediaProps {
  src?: string | null;
  alt?: string;
  /** e.g. "3/2", "1/1", "16/9". Defaults to landscape 3:2. */
  aspect?: string;
  /** "rect" (default) or "circle" for round token portraits */
  shape?: "rect" | "circle";
  /** Content to overlay when src is missing (initials, icon). */
  fallback?: ReactNode;
}

export const CardMedia = ({
  src,
  alt = "",
  aspect = "3/2",
  shape = "rect",
  fallback,
}: CardMediaProps) => {
  const classes = ["ui-card-media", shape === "circle" ? "is-circle" : ""]
    .filter(Boolean)
    .join(" ");
  return (
    <div className={classes} style={shape === "circle" ? undefined : { aspectRatio: aspect }}>
      {src ? (
        <img src={src} alt={alt} loading="lazy" />
      ) : (
        <div className="ui-card-media-fallback">{fallback}</div>
      )}
    </div>
  );
};

export const CardBody = ({ children }: { children: ReactNode }) => (
  <div className="ui-card-body">{children}</div>
);

export const CardTitle = ({ children }: { children: ReactNode }) => (
  <div className="ui-card-title">{children}</div>
);

export const CardMeta = ({ children }: { children: ReactNode }) => (
  <div className="ui-card-meta">{children}</div>
);

export const CardActions = ({ children }: { children: ReactNode }) => (
  <div className="ui-card-actions">{children}</div>
);
