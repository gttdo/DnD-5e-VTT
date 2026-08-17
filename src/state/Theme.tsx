import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useState,
  type ReactNode,
} from "react";

/**
 * Theme (dark / light). Persists to localStorage and reflects onto the <html>
 * element as data-theme, which the CSS token layer keys off. Dark is the
 * primary identity, so it's the default.
 *
 * The initial attribute is set in main.tsx before render to avoid a flash;
 * this provider keeps it in sync and exposes the toggle.
 */

type Theme = "dark" | "light";
const STORAGE_KEY = "theme";

interface ThemeAPI {
  theme: Theme;
  toggleTheme: () => void;
}

const ThemeContext = createContext<ThemeAPI | null>(null);

const readInitial = (): Theme => {
  try {
    const saved = localStorage.getItem(STORAGE_KEY);
    if (saved === "light" || saved === "dark") return saved;
  } catch {
    /* ignore */
  }
  return "dark";
};

export const applyThemeAttribute = (theme: Theme) => {
  // Only stamp the attribute for light; dark is the default (no attribute), so
  // an unstyled first paint still looks right.
  if (theme === "light") document.documentElement.setAttribute("data-theme", "light");
  else document.documentElement.removeAttribute("data-theme");
};

export const ThemeProvider = ({ children }: { children: ReactNode }) => {
  const [theme, setTheme] = useState<Theme>(readInitial);

  useEffect(() => {
    applyThemeAttribute(theme);
    try {
      localStorage.setItem(STORAGE_KEY, theme);
    } catch {
      /* ignore */
    }
  }, [theme]);

  const toggleTheme = useCallback(() => {
    setTheme((t) => (t === "dark" ? "light" : "dark"));
  }, []);

  return (
    <ThemeContext.Provider value={{ theme, toggleTheme }}>{children}</ThemeContext.Provider>
  );
};

export const useTheme = (): ThemeAPI => {
  const ctx = useContext(ThemeContext);
  if (!ctx) return { theme: "dark", toggleTheme: () => {} };
  return ctx;
};
