"use client";

/** Ambient gold audio waveform — idle by default, more active while
 * `active` is true (voice recording in progress). Pure CSS bar heights,
 * cheap to animate (transform only), respects prefers-reduced-motion via
 * the .gold-wave-bar animation being disabled globally in that case. */
export function GoldWaveform({ active = false, className = "" }: { active?: boolean; className?: string }) {
  const bars = 40;
  return (
    <div className={`flex items-center gap-[3px] h-16 ${className}`} aria-hidden>
      {Array.from({ length: bars }).map((_, i) => {
        const base = 20 + Math.round(30 * Math.abs(Math.sin(i * 0.7)));
        return (
          <span
            key={i}
            className="w-[3px] rounded-full bg-gradient-to-t from-amber-600 via-amber-400 to-amber-200"
            style={{
              height: `${base}%`,
              animation: `gold-wave-bar ${active ? 0.6 : 2.4}s ease-in-out ${i * 0.04}s infinite alternate`,
              opacity: active ? 1 : 0.55,
            }}
          />
        );
      })}
      <style>{`
        @keyframes gold-wave-bar { from { transform: scaleY(0.4); } to { transform: scaleY(1); } }
        @media (prefers-reduced-motion: reduce) { span { animation: none !important; } }
      `}</style>
    </div>
  );
}
