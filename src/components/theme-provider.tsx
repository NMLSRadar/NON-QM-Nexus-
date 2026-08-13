"use client";

/**
 * ThemeProvider — app-wide light/dark theme.
 *
 * Default is DARK (the existing, unchanged gold/navy design). Light mode
 * applies the ivory/cream + deep-navy + champagne-gold palette from the
 * reference homepage across the ENTIRE application (every page, tab,
 * component, and state), driven by a `data-theme="dark" | "light"`
 * attribute on <html>. The visual swap itself is pure CSS (the light
 * override layer in globals.css), so this provider only manages state:
 *
 *  - reads the persisted value (localStorage `nq-theme`, fallback cookie)
 *  - writes `data-theme` on <html> before/at mount
 *  - persists on every change and keeps server + client in sync via a cookie
 *
 * The no-flash inline script in the root layout applies the saved theme
 * BEFORE first paint (see layout.tsx), so this component never causes a
 * theme flash on load. `prefers-reduced-motion` is untouched here — motion
 * is handled purely in CSS.
 */

import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from "react";

export type Theme = "dark" | "light";
export const THEME_STORAGE_KEY = "nq-theme";
export const THEME_COOKIE = "nq-theme";

const ThemeContext = createContext<{ theme: Theme; toggle: () => void; setTheme: (t: Theme) => void } | null>(null);

/** Read the persisted theme from localStorage without crashing on SSR. */
export function readStoredTheme(): Theme {
  try {
    const raw = window.localStorage.getItem(THEME_STORAGE_KEY);
    const val = document.documentElement.getAttribute("data-theme");
    if (raw === "light" || raw === "dark") return raw;
    if (val === "light" || val === "dark") return val;
  } catch {
    /* ignore */
  }
  return "dark";
}

export function ThemeProvider({ children }: { children: ReactNode }) {
  const [theme, setThemeState] = useState<Theme>("dark");

  // Hydrate the client state from whatever the no-flash script already put
  // on <html>. Runs once on mount.
  useEffect(() => {
    setThemeState(readStoredTheme());
  }, []);

  const setTheme = useMemo(
    () => (next: Theme) => {
      document.documentElement.setAttribute("data-theme", next);
      try {
        window.localStorage.setItem(THEME_STORAGE_KEY, next);
      } catch {
        /* ignore */
      }
      // Keep server and client in sync so the next SSR render (and the
      // no-flash script) uses the same value on reload.
      try {
        document.cookie = `${THEME_COOKIE}=${next};path=/;max-age=31536000;samesite=lax`;
      } catch {
        /* ignore */
      }
      setThemeState(next);
    },
    []
  );

  const toggle = useMemo(() => () => setTheme(theme === "dark" ? "light" : "dark"), [theme, setTheme]);

  return <ThemeContext.Provider value={{ theme, toggle, setTheme }}>{children}</ThemeContext.Provider>;
}

export function useTheme() {
  const ctx = useContext(ThemeContext);
  if (!ctx) throw new Error("useTheme must be used within ThemeProvider");
  return ctx;
}