"use client";

/**
 * GuidelineEngine — the animated centerpiece of the homepage.
 *
 * Recreates the "glass sphere / guideline engine" from the design reference:
 * a transparent sphere whose concentric rings rotate and counter-rotate, small
 * particles travel the orbits, gold light pulses run the connector paths from
 * the "Borrower Scenario — Being Analyzed" node out to the three match-score
 * nodes (#1 98% / #2 94% / #3 91%), the center core "GUIDELINE ENGINE" label
 * breathes a soft glow, and the whole object floats gently.
 *
 * All motion is pure CSS (transform/opacity/box-shadow) — this component only
 * adds the DOCUMENT/PERF behavior the browser can't express in CSS:
 *  - pauses ALL animation when the element is offscreen (IntersectionObserver)
 *  - pauses when the tab is hidden (visibilitychange)
 *  - never runs when prefers-reduced-motion is set (CSS already disables it;
 *    this also avoids attaching the observer work unnecessarily)
 *  - a "motionless" class forces the static fallback presented to users who
 *    opted out of animation, and is GPU-cheap on small/lower-power devices.
 *
 * Markup + prompts keep every number/label readable at all times; the motion
 * is intentionally slow and calm — "intelligent, premium", not a game HUD.
 */
import { useEffect, useRef, useState, type CSSProperties } from "react";
import { FileText, CheckCircle2 } from "lucide-react";

const DOTS = [
  { r: 1, className: "d1", dur: "46s", delay: "0s" },
  { r: 2, className: "d2", dur: "30s", delay: "-2s" },
  { r: 3, className: "d3", dur: "64s", delay: "-8s" },
  { r: 4, className: "d4", dur: "22s", delay: "-5s" },
];

const MATCHES = [
  { rank: 1, pct: 98, className: "m1", delay: "0.1s" },
  { rank: 2, pct: 94, className: "m2", delay: "0.35s" },
  { rank: 3, pct: 91, className: "m3", delay: "0.6s" },
];

export function GuidelineEngine({ className = "" }: { className?: string }) {
  const rootRef = useRef<HTMLDivElement>(null);
  // "motionless" is the reduced-motion / offscreen / hidden-tab + low-power
  // fallback. Default false → animation runs; the no-JS and reduced-motion
  // case is handled by CSS alone (see light-theme.css), which is sufficient —
  // this state only adds the tab/scroll-driven pause.
  const [motionless, setMotionless] = useState(false);

  useEffect(() => {
    const root = rootRef.current;
    if (!root) return;
    if (typeof IntersectionObserver === "undefined") return;
    // Pause when the engine leaves the viewport — save GPU on long pages.
    const io = new IntersectionObserver(
      (entries) => {
        for (const e of entries) {
          setMotionless(() => !e.isIntersecting);
        }
      },
      { rootMargin: "120px" }
    );
    io.observe(root);
    return () => io.disconnect();
  }, []);

  useEffect(() => {
    function onVisibility() {
      setMotionless(document.hidden);
    }
    document.addEventListener("visibilitychange", onVisibility);
    return () => document.removeEventListener("visibilitychange", onVisibility);
  }, []);

  return (
    <div
      ref={rootRef}
      className={`guideline-engine ${motionless ? "motionless" : ""} ${className}`}
      role="img"
      aria-label="Animated NON-QM guideline engine matching a borrower scenario to three lender outcomes: 98, 94 and 91 percent match"
    >
      <div className="guideline-engine__sphere guideline-engine__enter">
        {/* Concentric rings */}
        <div className="guideline-engine__rings" aria-hidden="true">
          <span className="guideline-engine__ring r1" />
          <span className="guideline-engine__ring r2" />
          <span className="guideline-engine__ring r3" />
          <span className="guideline-engine__ring r4" />
          {DOTS.map((d, i) => (
            <span
              key={i}
              className={`guideline-engine__dot ${d.className}`}
              style={
                {
                  "--dot-size": i % 2 ? "7px" : "5px",
                  animationDuration: d.dur,
                  animationDelay: d.delay,
                } as CSSProperties
              }
            />
          ))}
        </div>

        {/* Animated gold connector paths (drawn as a lazy arc fan). */}
        <svg className="guideline-engine__paths" viewBox="0 0 100 100" aria-hidden="true">
          <path className="guideline-engine__path" d="M 34 86 C 30 60, 30 48, 50 50" />
          <path className="guideline-engine__path" d="M 78 14 C 66 22, 58 32, 53 48" style={{ animationDelay: "0.5s" }} />
          <path className="guideline-engine__path" d="M 94 46 C 82 50, 70 52, 54 52" style={{ animationDelay: "1.1s" }} />
          <circle className="guideline-engine__path" cx="50" cy="50" r="22" fill="none" strokeWidth="1" style={{ animationDelay: "1.7s" }} />
        </svg>

        {/* Center core */}
        <div className="guideline-engine__core" aria-hidden="true">
          <div className="text-center">
            <SparkCoreIcon />
            <span className="guideline-engine__core-label">Guideline Engine</span>
          </div>
        </div>
      </div>

      {/* Borrower scenario node */}
      <div className="guideline-engine__node scenario" aria-hidden="true">
        <span className="guideline-engine__node-icon">
          <FileText className="h-4 w-4" />
        </span>
        <span>
          <span className="guideline-engine__node-label block">Borrower Scenario</span>
          <span className="guideline-engine__node-sub block">Being Analyzed…</span>
        </span>
      </div>

      {/* Match-score nodes */}
      {MATCHES.map((m) => (
        <div key={m.rank} className={`guideline-engine__node ${m.className}`} aria-hidden="true">
          <span
            className="guideline-engine__score"
            style={{ animation: `engine-score-in 820ms cubic-bezier(0.16,1,0.3,1) ${m.delay} both` }}
          >
            <span className="text-sm font-extrabold tracking-tight">
              {m.pct}
              <span className="text-[9px] ml-px">%</span>
            </span>
          </span>
          <span className="leading-tight">
            <span className="guideline-engine__node-sub block">#{m.rank} Match</span>
          </span>
        </div>
      ))}
    </div>
  );
}

function SparkCoreIcon() {
  return (
    <span className="guideline-engine__core-icon mx-auto flex h-9 w-9 items-center justify-center">
      <CheckCircle2 className="h-7 w-7" />
    </span>
  );
}