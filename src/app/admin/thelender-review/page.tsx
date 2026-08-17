import { AlertTriangle, CheckCircle2, ExternalLink, FileSearch, ShieldCheck } from "lucide-react";
import { requirePlatformAdmin } from "@/lib/admin";

export const dynamic = "force-dynamic";

type Config = {
  category?: string;
  subcategory?: string;
  displayIncomeDocumentation?: string;
  incomeDocTypes?: string[];
  minFico?: number;
  baseMaxLtv?: number;
  eligibilityLtvMatrix?: Array<{ maxLtv: number }>;
  maxLoanAmount?: number;
  maxDti?: number;
  conditionalDtiRules?: Array<{ maxDti: number; minFico?: number; maxLtv?: number; loanPurposes?: string[] }>;
  occupancies?: string[];
  loanPurposes?: string[];
  majorRestrictions?: string[];
  matrixConfirmationRequired?: boolean;
  matrixConfirmationNotes?: string;
  guidelineVersionLabel?: string;
  effectiveDate?: string;
  lastVerifiedDate?: string;
  sourceCitation?: string;
  sourceDocuments?: string[];
};

type ProgramRow = { id: string; name: string; active: boolean; config: Config };
type VersionRow = { program_id: string; label: string; effective_date: string; last_verified_date: string | null; verification_status: string; source_url: string | null };

const label = (value: string) => value.replaceAll("_", " ").replace(/\b\w/g, (letter) => letter.toUpperCase());
const money = (value?: number) => value == null ? "Not confirmed" : new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 }).format(value);

export default async function TheLenderReviewPage() {
  const { supabase } = await requirePlatformAdmin();
  const { data: lenders, error: lenderError } = await supabase
    .from("lenders")
    .select("id,name,notes")
    .eq("organization_id", "bfe87b1c-86e7-4186-b1c4-ecc25d0e4420")
    .is("deleted_at", null)
    .in("name", ["theLender", "Hometown Equity Mortgage", "Hometown Equity Mortgage, LLC"]);
  if (lenderError) throw new Error(lenderError.message);
  const lender = (lenders ?? []).find((row) => row.name === "theLender") ?? lenders?.[0];

  let programs: ProgramRow[] = [];
  let versions: VersionRow[] = [];
  if (lender) {
    const [{ data: programData, error: programError }, { data: versionData, error: versionError }] = await Promise.all([
      supabase.from("programs").select("id,name,active,config").eq("lender_id", lender.id).is("deleted_at", null).order("name"),
      supabase.from("guideline_versions").select("program_id,label,effective_date,last_verified_date,verification_status,source_url").eq("organization_id", "bfe87b1c-86e7-4186-b1c4-ecc25d0e4420"),
    ]);
    if (programError) throw new Error(programError.message);
    if (versionError) throw new Error(versionError.message);
    programs = (programData ?? []) as ProgramRow[];
    const ids = new Set(programs.map((program) => program.id));
    versions = ((versionData ?? []) as VersionRow[]).filter((version) => ids.has(version.program_id));
  }

  const latestVersion = (programId: string) => versions
    .filter((version) => version.program_id === programId)
    .sort((a, b) => b.effective_date.localeCompare(a.effective_date))[0];
  const needsReviewCount = programs.filter((program) => {
    const version = latestVersion(program.id);
    return program.config.matrixConfirmationRequired || version?.verification_status !== "human_verified";
  }).length;

  return (
    <main className="gold-theme min-h-screen rounded-3xl border border-amber-400/20 bg-[#070708] p-4 text-white shadow-2xl shadow-black/50 sm:p-6">
      <div className="gold-ambient" />
      <div className="relative z-10 space-y-6">
        <header className="gold-glass overflow-hidden rounded-2xl border border-amber-400/25 p-5 sm:p-7">
          <div className="flex flex-col gap-5 lg:flex-row lg:items-end lg:justify-between">
            <div>
              <div className="mb-3 flex flex-wrap items-center gap-2 text-xs font-semibold uppercase tracking-[0.2em] text-amber-300">
                <ShieldCheck className="h-4 w-4" aria-hidden /> Admin Review · Lender Integration
              </div>
              <h1 className="text-3xl font-semibold tracking-tight text-white sm:text-4xl">theLender</h1>
              <p className="mt-2 max-w-3xl text-sm leading-6 text-slate-300">
                Hometown Equity Mortgage, LLC DBA theLender · NMLS 133519. Programs are intentionally separated by qualifying income method; conditional matrices, not marketing maximums, control eligibility.
              </p>
            </div>
            <div className="grid grid-cols-2 gap-3 text-center sm:flex">
              <div className="rounded-xl border border-amber-400/20 bg-black/35 px-4 py-3">
                <div className="text-2xl font-semibold text-amber-200">{programs.length}</div>
                <div className="text-[11px] uppercase tracking-wider text-slate-400">Program cards</div>
              </div>
              <div className="rounded-xl border border-amber-400/20 bg-black/35 px-4 py-3">
                <div className="text-2xl font-semibold text-amber-200">{needsReviewCount}</div>
                <div className="text-[11px] uppercase tracking-wider text-slate-400">Need review</div>
              </div>
            </div>
          </div>
        </header>

        {!lender ? (
          <section className="rounded-2xl border border-amber-500/30 bg-amber-500/10 p-6 text-amber-100">
            theLender has not been ingested in this environment yet. Run the production ingestion before final approval.
          </section>
        ) : null}

        <section className="grid gap-4 xl:grid-cols-2">
          {programs.map((program) => {
            const config = program.config ?? {};
            const version = latestVersion(program.id);
            const needsReview = config.matrixConfirmationRequired || version?.verification_status !== "human_verified";
            const matrixMax = config.eligibilityLtvMatrix?.length ? Math.max(...config.eligibilityLtvMatrix.map((row) => row.maxLtv)) : config.baseMaxLtv;
            const advertisedDti = Math.max(config.maxDti ?? 0, ...(config.conditionalDtiRules ?? []).map((rule) => rule.maxDti));
            const source = version?.source_url ?? config.sourceDocuments?.[0];
            return (
              <article key={program.id} className={`gold-glass rounded-2xl border p-5 ${needsReview ? "border-amber-400/40" : "border-emerald-400/25"}`}>
                <div className="flex items-start justify-between gap-4">
                  <div>
                    <div className="mb-2 flex flex-wrap gap-2">
                      <span className="rounded-full border border-amber-400/25 bg-amber-400/10 px-2.5 py-1 text-[10px] font-semibold uppercase tracking-wider text-amber-200">{config.category ?? "Specialty Non-QM"}</span>
                      {config.subcategory ? <span className="rounded-full border border-white/10 bg-white/5 px-2.5 py-1 text-[10px] uppercase tracking-wider text-slate-300">{config.subcategory}</span> : null}
                    </div>
                    <h2 className="text-lg font-semibold text-white">{program.name}</h2>
                    <p className="mt-1 text-sm text-slate-400">Income: {config.displayIncomeDocumentation ?? config.incomeDocTypes?.map(label).join(", ") ?? "Not confirmed"}</p>
                  </div>
                  <div className={`flex shrink-0 items-center gap-1.5 rounded-full border px-2.5 py-1 text-[10px] font-semibold uppercase tracking-wider ${needsReview ? "border-amber-400/30 bg-amber-400/10 text-amber-200" : "border-emerald-400/30 bg-emerald-400/10 text-emerald-200"}`}>
                    {needsReview ? <AlertTriangle className="h-3.5 w-3.5" aria-hidden /> : <CheckCircle2 className="h-3.5 w-3.5" aria-hidden />}
                    {needsReview ? "Needs Review" : "Verified"}
                  </div>
                </div>

                <dl className="mt-5 grid grid-cols-2 gap-3 sm:grid-cols-4">
                  {[
                    ["Min FICO", config.minFico?.toString() ?? "Not confirmed"],
                    ["Maximum LTV", matrixMax != null ? `Up to ${matrixMax}% · matrix` : "Not confirmed"],
                    ["Maximum Loan", money(config.maxLoanAmount)],
                    ["Maximum DTI", advertisedDti ? `Up to ${advertisedDti}% · conditional` : "N/A"],
                  ].map(([term, value]) => (
                    <div key={term} className="rounded-xl border border-white/8 bg-black/25 p-3">
                      <dt className="text-[10px] uppercase tracking-wider text-slate-500">{term}</dt>
                      <dd className="mt-1 text-sm font-medium text-slate-100">{value}</dd>
                    </div>
                  ))}
                </dl>

                <div className="mt-4 grid gap-4 sm:grid-cols-2">
                  <div>
                    <h3 className="text-xs font-semibold uppercase tracking-wider text-amber-200">Occupancies</h3>
                    <p className="mt-1 text-sm text-slate-300">{config.occupancies?.map(label).join(" · ") ?? "Not confirmed"}</p>
                  </div>
                  <div>
                    <h3 className="text-xs font-semibold uppercase tracking-wider text-amber-200">Transactions</h3>
                    <p className="mt-1 text-sm text-slate-300">{config.loanPurposes?.map(label).join(" · ") ?? "Not confirmed"}</p>
                  </div>
                </div>

                <div className="mt-4 border-t border-white/8 pt-4">
                  <h3 className="text-xs font-semibold uppercase tracking-wider text-amber-200">Major restrictions</h3>
                  <ul className="mt-2 space-y-1.5 text-sm leading-5 text-slate-300">
                    {(config.majorRestrictions?.length ? config.majorRestrictions : [config.matrixConfirmationNotes ?? "No additional card-level restriction summary stored."]).slice(0, 6).map((restriction) => (
                      <li key={restriction} className="flex gap-2"><span className="mt-2 h-1 w-1 shrink-0 rounded-full bg-amber-300" />{restriction}</li>
                    ))}
                  </ul>
                </div>

                <footer className="mt-4 flex flex-col gap-2 border-t border-white/8 pt-4 text-xs text-slate-400 sm:flex-row sm:items-end sm:justify-between">
                  <div>
                    <p>Source matrix: <span className="text-slate-200">{version?.label ?? config.guidelineVersionLabel ?? "Not confirmed"}</span></p>
                    <p>Effective: {version?.effective_date ?? config.effectiveDate ?? "Unknown"} · Last verified: {version?.last_verified_date ?? config.lastVerifiedDate ?? "Unknown"}</p>
                  </div>
                  {source ? <a href={source} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1.5 font-medium text-amber-300 hover:text-amber-200"><FileSearch className="h-3.5 w-3.5" aria-hidden /> Open source <ExternalLink className="h-3 w-3" aria-hidden /></a> : null}
                </footer>
              </article>
            );
          })}
        </section>
      </div>
    </main>
  );
}
