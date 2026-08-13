"use client";

/**
 * GuidelineEngine — the homepage centerpiece, built to match the reference.
 *
 * A large transparent glass sphere sitting on a tiered metallic (gold) base.
 * Inside the sphere, glowing gold light filaments converge at a center point
 * labeled "GUIDELINE ENGINE". A floating translucent "Borrower Scenario —
 * Being Analyzed" card sits to the LEFT of the sphere; three circular gold
 * badges (#1 98% / #2 94% / #3 91% match) sit to the RIGHT. Everything
 * animates slowly and calmly (orbit filaments, pulsing light, gentle float),
 * is GPU-cheap (transform/opacity only), pauses when offscreen or the tab is
 * hidden, and is fully disabled under prefers-reduced-motion.
 *
 * This component is presentational (markup + CSS animation classes in
 * light-theme.css); it only adds scroll/tab-driven pausing.
 */
import { useEffect, useRef, useState } from "react";
import { FileText } from "lucide-react";

const MATCHES = [
  { rank: 1, pct: 98, top: 6, right: -4, delay: "0.1s" },
  { rank: 2, pct: 94, top: 40, right: -12, delay: "0.32s" },
  { rank: 3, pct: 91, bottom: 8, right: -2, delay: "0.54s" },
];

export function GuidelineEngine({ className = "" }: { className?: string }) {
  const rootRef = useRef<HTMLDivElement>(null);
  const [motionless, setMotionless] = useState(false);

  useEffect(() => {
    const root = rootRef.current;
    if (!root || typeof IntersectionObserver === "undefined") return;
    const io = new IntersectionObserver(
      (entries) => {
        for (const e of entries) setMotionless(!e.isIntersecting);
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
      aria-label="Animated guideline engine: a borrower scenario is analyzed and matched to three lenders — 98, 94 and 91 percent match"
    >
      {/* The glass sphere */}
      <div className="guideline-engine__sphere guideline-engine__enter">
        {/* Interior gold light filaments converging at center */}
        <svg className="guideline-engine__filaments" viewBox="0 0 100 100" aria-hidden="true">
          {[0, 30, 60, 90, 120, 150, 180, 210, 240, 270, 300, 330].map((angle, i) => (
            <line
              key={angle}
              className="guideline-engine__filament"
              x1="50"
              y1="50"
              x2={50 + 46 * Math.cos((angle * Math.PI) / 180)}
              y2={50 + 46 * Math.sin((angle * Math.PI) / 180)}
              style={{ animationDelay: `${i * 0.18}s` }}
            />
          ))}
          <circle className="guideline-engine__core-ring" cx="50" cy="50" r="22" />
        </svg>

        {/* Orbital rings */}
        <div className="guideline-engine__orbit" aria-hidden="true">
          <span className="guideline-engine__ring r1" />
          <span className="guideline-engine__ring r2" />
          <span className="guideline-engine__ring r3" />
          <span className="guideline-engine__dot d1" />
          <span className="guideline-engine__dot d2" />
          <span className="guideline-engine__dot d3" />
        </div>

        {/* Center label */}
        <div className="guideline-engine__core" aria-hidden="true">
          <span className="guideline-engine__core-label">Guideline Engine</span>
        </div>

        {/* Specular glass highlight */}
        <span className="guideline-engine__sheen" aria-hidden="true" />
      </div>

      {/* Tiered metallic base underneath the sphere */}
      <div className="guideline-engine__base" aria-hidden="true">
        <span className="guideline-engine__base-tier t1" />
        <span className="guideline-engine__base-tier t2" />
        <span className="guideline-engine__base-tier t3" />
        <span className="guideline-engine__base-glow" />
      </div>

      {/* Borrower scenario card — LEFT of sphere */}
      <div className="guideline-engine__node scenario" aria-hidden="true">
        <span className="guideline-engine__node-icon">
          <FileText className="h-5 w-5" />
        </span>
        <span className="guideline-engine__node-copy">
          <span className="guideline-engine__node-label">Borrower Scenario</span>
          <span className="guideline-engine__node-title">Being Analyzed</span>
        </span>
      </div>

      {/* Three match badges — RIGHT of sphere */}
      {MATCHES.map((m) => (
        <div
          key={m.rank}
          className="guideline-engine__match"
          style={{
            top: m.top !== undefined ? `${m.top}%` : undefined,
            bottom: m.bottom !== undefined ? `${m.bottom}%` : undefined,
            right: `${m.right}%`,
          }}
          aria-hidden="true"
        >
          <div className="guideline-engine__match-inner" style={{ animationDelay: m.delay }}>
            <span className="guideline-engine__match-pct">
              <span className="guideline-engine__match-num">{m.pct}</span>
              <span className="guideline-engine__match-percent">%</span>
            </span>
            <span className="guideline-engine__match-label">#{m.rank} · MATCH</span>
          </div>
        </div>
      ))}
    </div>
  );
}