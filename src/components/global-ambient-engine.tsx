/** The global AI ambient background — mounted ONCE in the root layout so it
 * runs behind every page without per-page wiring. Fixed, full-viewport,
 * pointer-events-none, and sits at z-index 0 behind all real content (every
 * page's content already establishes its own stacking context — the dark
 * hero sections use `relative z-10`, and light-theme pages use solid
 * `bg-white` cards — so this layer only ever shows through in the negative
 * space/margins, never competing with readable content).
 *
 * Deliberately server-rendered (no "use client", no JS animation loop) —
 * every effect here is pure CSS (opacity/transform only, GPU-friendly), so
 * it costs nothing at runtime beyond paint and adds zero client JS. All
 * motion is disabled under prefers-reduced-motion (see globals.css) per
 * the "should never feel distracting" brief — Apple/OpenAI/Tesla, not a
 * gaming site: everything here stays under ~10% opacity and moves slowly.
 */

// Fixed, deterministic node/particle positions (percent of viewport) —
// never Math.random() at render time, which would cause a hydration
// mismatch between server and client markup.
const NODES: Array<{ x: number; y: number; delay: number }> = [
  { x: 8, y: 15, delay: 0 },
  { x: 22, y: 62, delay: 1.4 },
  { x: 38, y: 28, delay: 2.8 },
  { x: 54, y: 74, delay: 0.7 },
  { x: 68, y: 20, delay: 3.6 },
  { x: 82, y: 55, delay: 2.1 },
  { x: 92, y: 12, delay: 1.9 },
  { x: 15, y: 85, delay: 4.2 },
];

// Connects a few of the nodes above — a stylized nod to "lenders <->
// guidelines" without needing real, data-driven positions for a purely
// decorative background layer.
const LINKS: Array<[number, number]> = [
  [0, 2],
  [2, 4],
  [4, 5],
  [1, 3],
  [3, 5],
  [5, 6],
  [1, 7],
];

const PARTICLES: Array<{ x: number; y: number; size: number; delay: number; duration: number }> = [
  { x: 12, y: 30, size: 2, delay: 0, duration: 22 },
  { x: 28, y: 70, size: 3, delay: 3, duration: 26 },
  { x: 45, y: 12, size: 2, delay: 6, duration: 20 },
  { x: 60, y: 45, size: 2, delay: 2, duration: 24 },
  { x: 75, y: 80, size: 3, delay: 8, duration: 28 },
  { x: 88, y: 25, size: 2, delay: 5, duration: 21 },
  { x: 95, y: 60, size: 2, delay: 1, duration: 25 },
  { x: 5, y: 55, size: 3, delay: 7, duration: 23 },
  { x: 35, y: 90, size: 2, delay: 4, duration: 27 },
  { x: 65, y: 5, size: 2, delay: 9, duration: 19 },
];

export function GlobalAmbientEngine() {
  return (
    <div className="ambient-engine" aria-hidden="true">
      {/* Slow-moving gradient lighting — two large, very soft blurred blobs. */}
      <div className="ambient-glow ambient-glow-a" />
      <div className="ambient-glow ambient-glow-b" />

      {/* Neural network: nodes + connecting lines, slow pulse. */}
      <svg className="ambient-network" viewBox="0 0 100 100" preserveAspectRatio="none">
        {LINKS.map(([a, b], i) => {
          const from = NODES[a];
          const to = NODES[b];
          if (!from || !to) return null;
          return (
            <line
              key={i}
              x1={from.x}
              y1={from.y}
              x2={to.x}
              y2={to.y}
              className="ambient-link"
              style={{ animationDelay: `${(from.delay + to.delay) / 2}s` }}
            />
          );
        })}
        {NODES.map((n, i) => (
          <circle key={i} cx={n.x} cy={n.y} r={0.5} className="ambient-node" style={{ animationDelay: `${n.delay}s` }} />
        ))}
      </svg>

      {/* Floating guideline nodes / particle field. */}
      <div className="ambient-particles">
        {PARTICLES.map((p, i) => (
          <span
            key={i}
            className="ambient-particle"
            style={{
              left: `${p.x}%`,
              top: `${p.y}%`,
              width: `${p.size}px`,
              height: `${p.size}px`,
              animationDelay: `${p.delay}s`,
              animationDuration: `${p.duration}s`,
            }}
          />
        ))}
      </div>
    </div>
  );
}
