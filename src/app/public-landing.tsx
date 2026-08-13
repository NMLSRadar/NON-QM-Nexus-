import Link from "next/link";
import {
  ArrowRight,
  BarChart3,
  ClipboardCheck,
  Mic,
  Mic2,
  Star,
  Gauge,
  Target,
  Users,
  FileStack,
  CheckCircle2,
} from "lucide-react";
import { GuidelineEngine } from "@/components/guideline-engine";

/* ---------------------------------------------------------------------------
   Homepage rebuilt to match the reference EXACTLY (cream / ivory hero,
   serif headline, gold metallic buttons, glass-sphere-on-metallic-base
   centerpiece, features highlights row, and three white detail cards).
   The homepage is the LIGHT design from the reference — it renders this way
   regardless of the app's dark/light toggle so it always matches the image.
--------------------------------------------------------------------------- */

const BADGES = [
  { icon: <Star className="h-3 w-3" fill="currentColor" />, label: "NON-QM Decision Intelligence" },
  { icon: <span className="h-1.5 w-1.5 rounded-full bg-emerald-500 shadow-[0_0_8px_2px_rgba(16,185,129,0.5)]" />, label: "Live Guideline Intelligence", live: true },
];

const HIGHLIGHTS = [
  { icon: <Users className="h-6 w-6" />, value: "50+", label: "Lenders" },
  { icon: <FileStack className="h-6 w-6" />, value: "Hundreds", label: "Programs" },
  { icon: <Target className="h-6 w-6" />, value: "Guideline-First", label: "Matching" },
];

export function PublicLanding() {
  return (
    <div className="nexus-home-light -mx-4 -my-6 overflow-hidden px-4 pb-14 pt-5 sm:px-6 sm:pb-20">
      {/* HERO — headline left, glass-sphere engine right */}
      <section className="relative mx-auto max-w-[1200px]">
        <div className="grid items-center gap-8 lg:grid-cols-[0.98fr_1.02fr] lg:gap-4">
          <div className="nexus-home-hero-copy">
            <div className="flex flex-wrap gap-2">
              {BADGES.map((b) => (
                <span key={b.label} className="nexus-home-badge">
                  <span className="flex items-center">{b.icon}</span>
                  {b.label}
                </span>
              ))}
            </div>

            <h1 className="nexus-home-headline">
              <span>Match a Non-QM scenario to the right lender —</span>
              <span className="nexus-home-gold">in seconds, not hours</span>
            </h1>

            <p className="nexus-home-subhead">Hundreds of non-QM programs at your fingertips.</p>

            <div className="mt-7 flex flex-wrap items-center gap-3">
              <Link href="/scenarios/new" className="nexus-home-cta nexus-home-cta--gold group">
                <span>Start a Scenario</span>
                <ArrowRight className="h-4 w-4 transition-transform duration-200 group-hover:translate-x-1" />
              </Link>
              <Link href="/scenarios/voice" className="nexus-home-cta nexus-home-cta--light">
                <Mic className="h-4 w-4" />
                <span>Voice Scenario</span>
              </Link>
            </div>
          </div>

          {/* The centerpiece — glass sphere on a tiered metallic base */}
          <div className="nexus-home-engine relative">
            <GuidelineEngine />
          </div>
        </div>
      </section>

      {/* FEATURE HIGHLIGHTS — middle row (50+ Lenders / Hundreds / Guideline-First) */}
      <section className="relative mx-auto mt-14 max-w-[1000px]">
        <div className="nexus-home-highlights">
          {HIGHLIGHTS.map((h) => (
            <div key={h.label} className="nexus-home-highlight">
              <span className="nexus-home-highlight-icon">{h.icon}</span>
              <span className="nexus-home-highlight-text">
                <span className="value">{h.value}</span> {h.label}
              </span>
            </div>
          ))}
        </div>
      </section>

      {/* FEATURE DETAIL CARDS — three white cards with drop shadows */}
      <section className="relative z-10 mx-auto mt-10 grid max-w-[1200px] gap-6 lg:grid-cols-3">
        <FeatureCard
          icon={<Mic2 className="h-6 w-6" />}
          iconClass="nexus-home-feature-icon--blue"
          title="Voice Intake"
          href="/scenarios/voice"
          cta="View all"
        >
          <p className="nexus-home-feature-desc">
            Capture complex scenarios naturally with AI-powered voice intake.
          </p>
          <div className="mt-4">
            <div className="nexus-home-listening">
              <span className="h-2 w-2 rounded-full bg-emerald-500" />
              Listening…
              <span className="tracking-wide text-slate-500">00:24</span>
              <span className="nexus-home-wave" aria-hidden="true">
                <i /><i /><i /><i /><i /><i /><i /><i />
              </span>
            </div>
            <div className="mt-3 grid grid-cols-2 gap-2">
              <Tag label="Loan Purpose" value="DSCR Investor" />
              <Tag label="Property Type" value="SFR" />
              <Tag label="Credit Score" value="680" />
              <Tag label="LTV" value="75%" />
            </div>
          </div>
        </FeatureCard>

        <FeatureCard
          icon={<Gauge className="h-6 w-6" />}
          iconClass="nexus-home-feature-icon--gold"
          title="Guideline-first ranking"
          href="/scenarios"
          cta="View all"
        >
          <p className="nexus-home-feature-desc">
            Our engine evaluates thousands of data points to surface the best-fitting non-QM programs.
          </p>
          <div className="mt-4 space-y-2">
            <RankRow name="Lender A" program="Flex Prime Elite" pct={98} />
            <RankRow name="Lender B" program="Signature DSCR Plus" pct={94} />
            <RankRow name="Lender C" program="Investor Edge Pro" pct={91} />
          </div>
        </FeatureCard>

        <FeatureCard
          icon={<ClipboardCheck className="h-6 w-6" />}
          iconClass="nexus-home-feature-icon--gold"
          title="Document checklists"
          href="/document-checklists"
          cta="View all"
        >
          <p className="nexus-home-feature-desc">
            Instant, program-specific checklists so you collect the right docs the first time.
          </p>
          <div className="mt-4">
            <div className="nexus-home-progress">
              <div className="nexus-home-progress-ring">
                <div className="nexus-home-progress-inner">
                  <span className="done">12/16</span>
                  <span className="pct">75%</span>
                </div>
              </div>
              <span className="nexus-home-progress-title">Checklist progress</span>
            </div>
            <ul className="mt-3 space-y-1.5 text-sm">
              <CheckItem label="Full Loan Application" done />
              <CheckItem label="DSCR Analysis" done />
              <CheckItem label="Bank Statements (12 Months)" done />
              <CheckItem label="Rent Roll" inProgress />
            </ul>
          </div>
        </FeatureCard>
      </section>

      {/* CLOSING */}
      <section className="relative z-10 mx-auto mt-14 max-w-4xl text-center">
        <div className="nexus-home-closing">
          <span className="nexus-home-divider" />
          <p>
            <Star className="h-4 w-4 fill-current" />
            Ready to see it on your own book of business?
          </p>
          <span className="nexus-home-divider" />
        </div>
        <div className="mt-5 flex flex-wrap items-center justify-center gap-3">
          <Link href="/pricing" className="nexus-home-cta nexus-home-cta--gold">
            View pricing
          </Link>
          <Link href="/login" className="nexus-home-cta nexus-home-cta--ghost">
            Sign in
          </Link>
        </div>
      </section>
    </div>
  );
}

/* Small primitives -------------------------------------------------------- */

function FeatureCard({
  icon,
  iconClass,
  title,
  href,
  cta,
  children,
}: {
  icon: React.ReactNode;
  iconClass: string;
  title: string;
  href: string;
  cta: string;
  children: React.ReactNode;
}) {
  return (
    <article className="nexus-home-feature">
      <div className="flex items-start justify-between">
        <span className={`nexus-home-feature-icon ${iconClass}`}>{icon}</span>
        <BarChart3IconHint />
      </div>
      <h2 className="nexus-home-feature-title">{title}</h2>
      {children}
      <Link href={href} className="nexus-home-feature-cta">
        {cta} <ArrowRight className="h-3.5 w-3.5" />
      </Link>
    </article>
  );
}

function BarChart3IconHint() {
  return (
    <span className="nexus-home-feature-art" aria-hidden="true">
      <BarChart3 className="h-10 w-10 opacity-40" />
    </span>
  );
}

function Tag({ label, value }: { label: string; value: string }) {
  return (
    <span className="nexus-home-tag">
      <span className="label">{label}</span> <span className="value">{value}</span>
    </span>
  );
}

function RankRow({ name, program, pct }: { name: string; program: string; pct: number }) {
  return (
    <div className="nexus-home-rank">
      <div className="flex items-center justify-between text-sm">
        <span className="rank-name">{name}</span>
        <span className="rank-pct">{pct}%</span>
      </div>
      <div className="rank-bar">
        <span className="rank-bar-fill" style={{ width: `${pct}%` }} />
      </div>
      <span className="rank-program">{program}</span>
    </div>
  );
}

function CheckItem({ label, done, inProgress }: { label: string; done?: boolean; inProgress?: boolean }) {
  return (
    <li className="flex items-center gap-2">
      {done ? (
        <CheckCircle2 className="h-4 w-4 shrink-0 text-emerald-600" />
      ) : (
        <span className="h-4 w-4 shrink-0 rounded-full border-2 border-amber-500/70" />
      )}
      <span className={done ? "text-slate-800" : "text-slate-900"}>{label}</span>
      <span className="ml-auto text-[10px] font-semibold uppercase tracking-wide text-slate-500">
        {done ? "Completed" : inProgress ? "In progress" : ""}
      </span>
    </li>
  );
}