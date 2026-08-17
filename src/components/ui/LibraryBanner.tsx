import type { ReactNode } from "react";

/**
 * Cinematic header band for a library/section screen — a photo background with
 * the title + CTA over the dark negative-space side. Light text is scoped in
 * the .library-banner CSS so it reads over the photo in both themes.
 */
interface Props {
  /** public/ image path, e.g. "/art/map.png" */
  image: string;
  eyebrow: string;
  title: string;
  subtitle?: string;
  /** CTA button(s) shown below the subtitle. */
  children?: ReactNode;
  /** background-position override (default "center right"). */
  position?: string;
}

export const LibraryBanner = ({ image, eyebrow, title, subtitle, children, position }: Props) => (
  <div
    className="library-banner"
    style={{ backgroundImage: `url(${image})`, backgroundPosition: position }}
  >
    <div className="library-banner-scrim" aria-hidden="true" />
    <div className="library-banner-content">
      <div className="hero-eyebrow">{eyebrow}</div>
      <h1 className="hero-heading" style={{ marginTop: 6 }}>
        {title}
      </h1>
      {subtitle && (
        <div className="dim" style={{ fontSize: 12, marginTop: 8, marginBottom: children ? 18 : 0 }}>
          {subtitle}
        </div>
      )}
      {children}
    </div>
  </div>
);
