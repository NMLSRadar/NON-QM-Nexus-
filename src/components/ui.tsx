import type { ReactNode } from "react";
import { MatchStatus, SAMPLE_DATA_LABEL } from "@/domain/types/enums";

export function Card({
  title,
  children,
  className = "",
  dark = false,
}: {
  title?: string;
  children: ReactNode;
  className?: string;
  dark?: boolean;
}) {
  const base = dark
    ? "bg-[#111113] rounded-card border border-amber-500/20 shadow-lg"
    : "bg-white rounded-card border border-surface-border shadow-soft";
  return (
    <section className={`${base} p-5 transition-shadow duration-200 ${className}`}>
      {title ? (
        <h2 className={`text-sm font-semibold uppercase tracking-wide mb-3 ${dark ? "text-amber-300/80" : "text-ink-secondary"}`}>{title}</h2>
      ) : null}
      {children}
    </section>
  );
}

const STATUS_STYLES: Record<MatchStatus, { label: string; className: string }> = {
  strong_match: { label: "Strong match", className: "bg-emerald-100 text-emerald-800" },
  eligible: { label: "Eligible", className: "bg-green-100 text-green-800" },
  conditional: { label: "Conditional", className: "bg-amber-100 text-amber-800" },
  eligible_with_restructuring: { label: "Eligible w/ restructuring", className: "bg-amber-100 text-amber-800" },
  manual_review: { label: "Manual review", className: "bg-sky-100 text-sky-800" },
  ineligible: { label: "Ineligible", className: "bg-rose-100 text-rose-800" },
};

export function StatusBadge({ status }: { status: MatchStatus }) {
  const s = STATUS_STYLES[status];
  return <span className={`inline-block rounded-full px-2.5 py-0.5 text-xs font-medium ${s.className}`}>{s.label}</span>;
}

export function SampleDataBadge() {
  return (
    <span className="inline-block rounded bg-amber-50 border border-amber-300 text-amber-800 text-[11px] px-1.5 py-0.5">
      {SAMPLE_DATA_LABEL}
    </span>
  );
}

export function Stat({ label, value }: { label: string; value: ReactNode }) {
  return (
    <div>
      <dt className="text-xs text-ink-secondary">{label}</dt>
      <dd className="text-sm font-medium text-ink-primary">{value}</dd>
    </div>
  );
}

export function fmtUsd(n: number | null | undefined): string {
  if (n == null) return "—";
  return n.toLocaleString("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 });
}

export function fmtPct(n: number | null | undefined, digits = 2): string {
  if (n == null) return "—";
  return `${n.toFixed(digits)}%`;
}

export function fmtNum(n: number | null | undefined, digits = 2): string {
  if (n == null) return "—";
  return n.toFixed(digits);
}

// ---------------------------------------------------------------------------
// Premium SaaS redesign primitives (see docs/ui-redesign.md). Additive only —
// nothing above this line changed its public shape, so every existing caller
// keeps working unmodified.
// ---------------------------------------------------------------------------

/** Small gold-tinted circular icon badge — used throughout the redesign for
 * feature cards, metric tiles, and section headers. */
export function IconBadge({
  children,
  size = "md",
  className = "",
}: {
  children: ReactNode;
  size?: "sm" | "md" | "lg";
  className?: string;
}) {
  const sizes = { sm: "h-8 w-8", md: "h-11 w-11", lg: "h-16 w-16" };
  return (
    <span
      className={`inline-flex items-center justify-center rounded-full bg-brand-50 text-brand-600 shrink-0 ${sizes[size]} ${className}`}
      aria-hidden
    >
      {children}
    </span>
  );
}

/** Primary/secondary/ghost button — consistent radius, transitions, and
 * hover/focus states across the whole app. Renders a <button> by default;
 * pass `as="a"` semantics simply by wrapping a Link/anchor around it, or use
 * className overrides for link-styled call sites. */
export function Button({
  children,
  variant = "primary",
  size = "md",
  className = "",
  ...props
}: {
  children: ReactNode;
  variant?: "primary" | "secondary" | "ghost";
  size?: "sm" | "md" | "lg";
  className?: string;
} & React.ButtonHTMLAttributes<HTMLButtonElement>) {
  const base =
    "inline-flex items-center justify-center gap-2 rounded-control font-medium transition-all duration-200 focus:outline-none focus:ring-2 focus:ring-brand-500 focus:ring-offset-1 disabled:opacity-50 disabled:pointer-events-none";
  const variants = {
    primary: "bg-brand-600 text-white hover:bg-brand-700 shadow-soft hover:shadow-soft-hover",
    secondary: "bg-white text-ink-primary border border-surface-border hover:border-brand-500 hover:text-brand-700",
    ghost: "text-ink-secondary hover:text-brand-700 hover:bg-brand-50",
  };
  const sizes = { sm: "text-xs px-3 py-1.5", md: "text-sm px-4 py-2", lg: "text-base px-6 py-3.5" };
  return (
    <button className={`${base} ${variants[variant]} ${sizes[size]} ${className}`} {...props}>
      {children}
    </button>
  );
}

/** Same visual system as Button, but as a Next.js Link — for navigational
 * CTAs (hero buttons, page-header actions). */
export function LinkButton({
  href,
  children,
  variant = "primary",
  size = "md",
  className = "",
}: {
  href: string;
  children: ReactNode;
  variant?: "primary" | "secondary" | "ghost";
  size?: "sm" | "md" | "lg";
  className?: string;
}) {
  const base =
    "inline-flex items-center justify-center gap-2 rounded-control font-medium transition-all duration-200 focus:outline-none focus:ring-2 focus:ring-brand-500 focus:ring-offset-1";
  const variants = {
    primary: "bg-brand-600 text-white hover:bg-brand-700 shadow-soft hover:shadow-soft-hover",
    secondary: "bg-white text-ink-primary border border-surface-border hover:border-brand-500 hover:text-brand-700",
    ghost: "text-ink-secondary hover:text-brand-700 hover:bg-brand-50",
  };
  const sizes = { sm: "text-xs px-3 py-1.5", md: "text-sm px-4 py-2", lg: "text-base px-6 py-3.5" };
  return (
    <a href={href} className={`${base} ${variants[variant]} ${sizes[size]} ${className}`}>
      {children}
    </a>
  );
}

/** A generic pill badge for callouts like "Best Match", "AI-Powered", etc. */
export function Pill({
  children,
  tone = "gold",
  className = "",
}: {
  children: ReactNode;
  tone?: "gold" | "neutral" | "green" | "amber" | "rose" | "sky";
  className?: string;
}) {
  const tones = {
    gold: "bg-brand-50 text-brand-700 border-brand-200",
    neutral: "bg-slate-50 text-ink-secondary border-surface-border",
    green: "bg-emerald-50 text-emerald-800 border-emerald-200",
    amber: "bg-amber-50 text-amber-800 border-amber-200",
    rose: "bg-rose-50 text-rose-800 border-rose-200",
    sky: "bg-sky-50 text-sky-800 border-sky-200",
  };
  return (
    <span className={`inline-flex items-center rounded-full border px-2.5 py-0.5 text-[11px] font-semibold uppercase tracking-wide ${tones[tone]} ${className}`}>
      {children}
    </span>
  );
}

/** A page-level title + subtitle + right-aligned actions row — shared header
 * shape across Dashboard, Scenarios list, and other top-level pages. */
export function PageHeader({
  title,
  subtitle,
  actions,
}: {
  title: ReactNode;
  subtitle?: ReactNode;
  actions?: ReactNode;
}) {
  return (
    <div className="flex items-start justify-between gap-4 flex-wrap">
      <div>
        <h1 className="text-2xl sm:text-3xl font-bold tracking-tight text-ink-primary">{title}</h1>
        {subtitle ? <p className="mt-1 text-sm text-ink-secondary">{subtitle}</p> : null}
      </div>
      {actions ? <div className="flex items-center gap-2 flex-wrap">{actions}</div> : null}
    </div>
  );
}

/** One tile inside a metrics grid — large bold value, small label, optional
 * gold accent bar and helper/tooltip text. Used for scenario snapshots and
 * calculation summaries. */
export function MetricTile({
  label,
  value,
  help,
  accent = true,
}: {
  label: string;
  value: ReactNode;
  help?: ReactNode;
  accent?: boolean;
}) {
  return (
    <div className="relative rounded-control border border-surface-border bg-white p-4 overflow-hidden">
      {accent ? <span className="absolute inset-x-0 top-0 h-0.5 bg-gradient-to-r from-brand-500 to-brand-200" aria-hidden /> : null}
      <p className="text-xs text-ink-secondary">{label}</p>
      <p className="mt-1 text-xl font-bold tabular-nums text-ink-primary">{value}</p>
      {help ? <div className="mt-1 text-xs text-ink-secondary">{help}</div> : null}
    </div>
  );
}

/** A section header with an IconBadge, title, and optional description —
 * used above feature-card grids and major page sections. */
export function SectionHeading({
  icon,
  title,
  description,
  actions,
}: {
  icon?: ReactNode;
  title: ReactNode;
  description?: ReactNode;
  actions?: ReactNode;
}) {
  return (
    <div className="flex items-start justify-between gap-4 flex-wrap">
      <div className="flex items-start gap-3">
        {icon ? <IconBadge size="sm">{icon}</IconBadge> : null}
        <div>
          <h2 className="text-lg font-bold text-ink-primary">{title}</h2>
          {description ? <p className="text-sm text-ink-secondary">{description}</p> : null}
        </div>
      </div>
      {actions ? <div className="flex items-center gap-2">{actions}</div> : null}
    </div>
  );
}
