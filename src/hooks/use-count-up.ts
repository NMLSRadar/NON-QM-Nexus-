"use client";

import { useEffect, useRef, useState } from "react";

/**
 * useCountUp — counts from 0 to `target` once, when `active` becomes true.
 * Uses requestAnimationFrame with easeOutCubic so the number settles quickly
 * and reads cleanly, and falls back to the final value instantly when the
 * user prefers reduced motion. Returns the current (rounded) value plus the
 * raw progress so callers can place either the number or a fill bar.
 */
export function useCountUp(target: number, active: boolean, duration = 900): { value: number; progress: number } {
  const [value, setValue] = useState(0);
  const [progress, setProgress] = useState(0);
  const rafRef = useRef<number>(0);

  useEffect(() => {
    if (!active || target <= 0) return;
    const reduced = typeof window !== "undefined" && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    if (reduced) {
      setValue(target);
      setProgress(1);
      return;
    }
    const start = performance.now();
    const tick = (now: number) => {
      const p = Math.min((now - start) / duration, 1);
      const eased = 1 - Math.pow(1 - p, 3); // easeOutCubic — refined, not gimmicky
      setProgress(eased);
      setValue(Math.round(target * eased));
      if (p < 1) rafRef.current = requestAnimationFrame(tick);
    };
    rafRef.current = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(rafRef.current);
  }, [active, target, duration]);

  return { value, progress };
}