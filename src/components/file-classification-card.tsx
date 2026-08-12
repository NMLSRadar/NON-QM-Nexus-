import {
  AlertTriangle,
  CheckCircle2,
  ClipboardList,
  Scale,
  SearchCheck,
  ShieldCheck,
  type LucideIcon,
} from "lucide-react";
import type {
  BankStatementComplexityResult,
  BankStatementFileClassification,
} from "@/domain/matching/bankStatementComplexity";

type ClassificationStyle = {
  accent: string;
  accentSoft: string;
  glow: string;
  Icon: LucideIcon;
  Watermark: LucideIcon;
};

const styles: Record<BankStatementFileClassification, ClassificationStyle> = {
  clean: {
    accent: "#f0c860",
    accentSoft: "rgba(212, 175, 55, 0.18)",
    glow: "rgba(212, 175, 55, 0.34)",
    Icon: ShieldCheck,
    Watermark: CheckCircle2,
  },
  moderate_complexity: {
    accent: "#67e8f9",
    accentSoft: "rgba(34, 211, 238, 0.13)",
    glow: "rgba(34, 211, 238, 0.28)",
    Icon: ClipboardList,
    Watermark: Scale,
  },
  high_complexity: {
    accent: "#fbbf24",
    accentSoft: "rgba(245, 158, 11, 0.15)",
    glow: "rgba(245, 158, 11, 0.3)",
    Icon: AlertTriangle,
    Watermark: Scale,
  },
  manual_review_recommended: {
    accent: "#fb7185",
    accentSoft: "rgba(244, 63, 94, 0.13)",
    glow: "rgba(244, 63, 94, 0.28)",
    Icon: SearchCheck,
    Watermark: AlertTriangle,
  },
};

export function FileClassificationCard({ result }: { result: BankStatementComplexityResult }) {
  const treatment = styles[result.classification];
  const Icon = treatment.Icon;
  const Watermark = treatment.Watermark;

  return (
    <section
      aria-labelledby="file-classification-title"
      className="relative mb-5 overflow-hidden rounded-2xl border bg-[#08090b] px-4 py-5 shadow-[0_22px_55px_-34px_rgba(0,0,0,0.95)] sm:px-6 sm:py-6"
      style={{
        borderColor: treatment.accent,
        backgroundImage: `linear-gradient(105deg, ${treatment.accentSoft} 0%, rgba(8, 9, 11, 0.97) 48%, #08090b 100%)`,
        boxShadow: `inset 0 0 0 1px ${treatment.accentSoft}, 0 0 30px -18px ${treatment.glow}`,
      }}
    >
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-y-0 right-0 hidden w-40 opacity-50 sm:block"
        style={{
          backgroundImage: `radial-gradient(${treatment.accentSoft} 1.25px, transparent 1.25px)`,
          backgroundSize: "10px 10px",
          maskImage: "linear-gradient(to left, black, transparent)",
          WebkitMaskImage: "linear-gradient(to left, black, transparent)",
        }}
      />

      <div className="relative z-10 grid items-center gap-4 sm:grid-cols-[92px_1px_minmax(0,1fr)_92px] sm:gap-6">
        <div className="relative flex h-16 w-16 items-center justify-center justify-self-start sm:h-20 sm:w-20 sm:justify-self-center">
          <div
            aria-hidden="true"
            className="absolute inset-x-1 bottom-0 h-5 rounded-full blur-xl"
            style={{ backgroundColor: treatment.glow }}
          />
          <div
            className="relative flex h-14 w-14 items-center justify-center rounded-2xl border sm:h-16 sm:w-16"
            style={{
              borderColor: treatment.accentSoft,
              color: treatment.accent,
              background: `linear-gradient(145deg, ${treatment.accentSoft}, rgba(0,0,0,0.35))`,
              boxShadow: `0 0 24px -10px ${treatment.glow}`,
            }}
          >
            <Icon className="h-9 w-9 sm:h-10 sm:w-10" strokeWidth={1.8} aria-hidden="true" />
          </div>
        </div>

        <div className="hidden h-full min-h-24 sm:block" style={{ backgroundColor: treatment.accentSoft }} aria-hidden="true" />

        <div className="min-w-0">
          <p className="text-[11px] font-bold uppercase tracking-[0.16em] sm:text-xs" style={{ color: treatment.accent }}>
            File Classification
          </p>
          <h2 id="file-classification-title" className="mt-1 text-xl font-bold leading-tight tracking-tight text-white sm:text-2xl">
            {result.label}
          </h2>
          <p className="mt-2 max-w-3xl text-sm leading-6 text-slate-200/90 sm:text-[15px]">
            {result.explanation}
          </p>
        </div>

        <div className="relative hidden h-24 items-center justify-center sm:flex" aria-hidden="true">
          <Watermark className="h-20 w-20" strokeWidth={1.35} style={{ color: treatment.accent, opacity: 0.2 }} />
        </div>
      </div>
    </section>
  );
}
