import type { LucideIcon } from "lucide-react";
import type { ReactNode } from "react";

type PremiumPageHeroProps = {
  icon: LucideIcon;
  title: ReactNode;
  description: ReactNode;
  eyebrow?: ReactNode;
  aside?: ReactNode;
  className?: string;
};

/** Shared section header used by the institutional light-mode workspace.
 * Dark mode keeps the established navy/gold treatment; light mode is styled
 * exclusively by the data-theme-scoped rules in light-theme.css. */
export function PremiumPageHero({ icon: Icon, title, description, eyebrow, aside, className = "" }: PremiumPageHeroProps) {
  return (
    <section className={`nexus-premium-hero gold-scenarios-panel relative overflow-hidden p-6 sm:p-8 ${className}`.trim()}>
      <div className="gold-ambient" />
      <div className="nexus-premium-hero__grid relative z-10 flex flex-wrap items-start justify-between gap-5">
        <div className="flex min-w-0 items-start gap-4">
          <span className="nexus-premium-medallion gold-header-icon relative flex h-14 w-14 shrink-0 items-center justify-center rounded-full">
            <Icon className="h-6 w-6 text-amber-300" aria-hidden />
          </span>
          <div className="min-w-0">
            {eyebrow ? <div className="nexus-premium-eyebrow mb-2">{eyebrow}</div> : null}
            <h1 className="nexus-premium-title text-[32px] font-bold leading-tight tracking-tight text-white">{title}</h1>
            <div className="nexus-premium-description mt-2 max-w-3xl text-sm leading-relaxed text-slate-400 sm:text-base">{description}</div>
          </div>
        </div>
        {aside ? <div className="nexus-premium-hero__aside shrink-0">{aside}</div> : null}
      </div>
    </section>
  );
}

export function GoldBadge({ children, tone = "gold", className = "" }: { children: ReactNode; tone?: "gold" | "green" | "red" | "navy"; className?: string }) {
  return <span className={`nexus-badge nexus-badge--${tone} ${className}`.trim()}>{children}</span>;
}

export function LuxuryCard({ children, className = "", as: Tag = "div" }: { children: ReactNode; className?: string; as?: "div" | "article" | "section" }) {
  return <Tag className={`nexus-luxury-card ${className}`.trim()}>{children}</Tag>;
}

export function DataMetric({ label, value, emphasis = false }: { label: ReactNode; value: ReactNode; emphasis?: boolean }) {
  return (
    <div className={`nexus-data-metric${emphasis ? " nexus-data-metric--emphasis" : ""}`}>
      <span>{label}</span>
      <strong>{value}</strong>
    </div>
  );
}

export function ConfidenceScore({ score }: { score: number }) {
  return (
    <span className="nexus-confidence-score">
      <strong>{Math.round(score)}%</strong> Confidence Score
    </span>
  );
}

export function ComplexityIndicator({ level, reasons = [] }: { level: "Low" | "Moderate" | "High"; reasons?: string[] }) {
  return (
    <aside className={`nexus-complexity nexus-complexity--${level.toLowerCase()}`}>
      <strong>Scenario Complexity: {level}</strong>
      {reasons.length ? <span>{reasons.slice(0, 3).join(" · ")}</span> : null}
    </aside>
  );
}
