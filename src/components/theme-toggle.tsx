"use client";

/** Global light/dark toggle for the header — shown on desktop and mobile.
 * Native-feeling icon button (sun / moon), gold-tinted to match the
 * NON-QM Nexus chrome, with keyboard focus + accessible label. The actual
 * data-theme swap + persistence live in the ThemeProvider. */
import { Moon, Sun } from "lucide-react";
import { useTheme } from "./theme-provider";

export function ThemeToggle({ className = "" }: { className?: string }) {
  const { theme, toggle } = useTheme();
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