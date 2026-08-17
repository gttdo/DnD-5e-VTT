import type { ReactNode } from "react";

/**
 * OrnamentalFrame — a decorative gold hairline border with illuminated corner
 * flourishes, matching the D&D Beyond "Explore More" section frame.
 *
 * Restrained by design: reserve it for one or two moments per screen (a hero
 * section, the auth card, an empty state) — never on every card or panel, or
 * it reads as costume rather than illumination.
 *
 * Implementation: a non-interactive overlay of one inset hairline rectangle
 * plus four fixed-size SVG corner ornaments (flipped via CSS), so the corners
 * never distort regardless of the container's size or aspect.
 */

const Corner = () => (
  <svg className="ornate-corner-svg" viewBox="0 0 40 40" fill="none" aria-hidden="true">
    {/* outer bracket */}
    <path d="M3 18 L3 3 L18 3" stroke="currentColor" strokeWidth="1.4" />
    {/* short diagonal from the vertex */}
    <path d="M4 4 L11 11" stroke="currentColor" strokeWidth="1" opacity="0.7" />
    {/* small diamond at the corner point */}
    <rect
      x="6"
      y="6"
      width="4.5"
      height="4.5"
      transform="rotate(45 8.25 8.25)"
      fill="currentColor"
    />
  </svg>
);

interface Props {
  children: ReactNode;
  className?: string;
  style?: React.CSSProperties;
}

export const OrnamentalFrame = ({ children, className, style }: Props) => (
  <div className={`ornate-frame ${className ?? ""}`} style={style}>
    <div className="ornate-border" aria-hidden="true" />
    <span className="ornate-corner tl"><Corner /></span>
    <span className="ornate-corner tr"><Corner /></span>
    <span className="ornate-corner bl"><Corner /></span>
    <span className="ornate-corner br"><Corner /></span>
    {children}
  </div>
);
