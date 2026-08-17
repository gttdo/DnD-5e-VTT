import { useEffect, useState } from "react";

/**
 * Subscribe to a CSS media query from JS. Used where a layout difference is
 * structural rather than cosmetic — the mobile character sheet renders a
 * different component tree (paginated sections) instead of restyling the
 * desktop one, so CSS alone can't express it.
 *
 * Prefer plain CSS media queries for anything that's only a style change.
 */
export const useMediaQuery = (query: string): boolean => {
  const [matches, setMatches] = useState(
    () => typeof window !== "undefined" && window.matchMedia(query).matches
  );

  useEffect(() => {
    const mql = window.matchMedia(query);
    const onChange = () => setMatches(mql.matches);
    // Re-read on mount too: the query may have changed between the initial
    // render and the effect (e.g. an orientation flip during hydration).
    onChange();
    mql.addEventListener("change", onChange);
    return () => mql.removeEventListener("change", onChange);
  }, [query]);

  return matches;
};
