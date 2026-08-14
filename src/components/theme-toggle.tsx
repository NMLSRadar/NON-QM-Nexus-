"use client";

/** Global light/dark toggle for the header.
 *
 * Theme state intentionally lives in this small button instead of an app-wide
 * React context. The root no-flash script applies the saved theme before first
 * paint; this component only updates the DOM attribute and persistence when a
 * user toggles it. Keeping the boundary local avoids re-hydrating the entire
 * application for a purely visual preference.
 */
import { Moon, Sun } from "lucide-react";
import { useEffect, useState } from "react";

export type Theme = "dark" | "light";
export const THEME_STORAGE_KEY = "nq-theme";

function readTheme(): Theme {
  if (typeof document === "undefined") return "dark";
  const value = document.documentElement.getAttribute("data-theme");
  return value === "light" ? "light" : "dark";
}

export function ThemeToggle({ className = "" }: { className?: string }) {
  const [theme, setTheme] = useState<Theme>("dark");

  useEffect(() => {
    setTheme(readTheme());
  }, []);

  function toggle() {
    const next: Theme = readTheme() === "dark" ? "light" : "dark";
    document.documentElement.setAttribute("data-theme", next);
    try {
      window.localStorage.setItem(THEME_STORAGE_KEY, next);
    } catch {
      // Storage may be unavailable in hardened/private browser modes.
    }
    setTheme(next);
  }

  const isDark = theme === "dark";
  return (
    <button
      type="button"
      onClick={toggle}
      aria-label={isDark ? "Switch to light mode" : "Switch to dark mode"}
      title={isDark ? "Light mode" : "Dark mode"}
      className={`premium-theme-toggle inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border border-amber-400/35 bg-black/40 text-amber-200 transition-colors hover:border-amber-400/70 hover:bg-black/60 hover:text-amber-100 focus:outline-none focus:ring-2 focus:ring-amber-400 ${className}`}
    >
      {isDark ? <Sun className="h-4 w-4" aria-hidden="true" /> : <Moon className="h-4 w-4" aria-hidden="true" />}
    </button>
  );
}
