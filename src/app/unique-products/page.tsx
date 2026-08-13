import Link from "next/link";
import { ArrowRight, BadgeCheck, BriefcaseBusiness, Building2, GraduationCap, HeartPulse, House, Landmark, ShieldCheck } from "lucide-react";
import { UNIQUE_PRODUCT_CATEGORIES } from "@/domain/uniqueProducts";
import { recordPageView } from "@/lib/activity";
import { PremiumPageHero } from "@/components/premium-ui";

const icons = {
  JUMBO_AUS: Landmark,
  ITIN_DSCR: Building2,
  ITIN_PL_ONLY: BriefcaseBusiness,
  GRADUATE_MORTGAGE: GraduationCap,
  DOCTOR_MEDICAL_PROFESSIONAL: HeartPulse,
  NO_RATIO_PRIMARY_RESIDENCE: House,
} as const;

export default async function UniqueProductsPage() {
  await recordPageView("products");
  return (
    <div className="nexus-workspace nexus-products-page gold-theme gold-page -mx-4 -my-6 min-h-full space-y-8 rounded-b-3xl bg-[#050505] px-4 py-6 sm:px-6 sm:py-8">
      <PremiumPageHero
        icon={ShieldCheck}
        eyebrow={<>Specialty Mortgage Product Directory</>}
        title={<>Unique Non-QM <span className="nexus-title-gold">Products</span></>}
        description={<>Discover specialized financing programs that conventional lending cannot accommodate.</>}
        aside={<div className="nexus-hero-flow"><span>Choose type</span><ArrowRight /><span>Compare</span><ArrowRight /><span>Connect</span></div>}
      />

      <section aria-labelledby="program-types">
        <div className="mb-4 flex items-end justify-between gap-4">
          <div>
            <h2 id="program-types" className="text-2xl font-bold text-white">Choose a Program Type</h2>
            <p className="mt-1 text-sm text-slate-400">Fast lender discovery without running a full scenario.</p>
          </div>
          <span className="hidden text-sm text-slate-500 sm:block">{UNIQUE_PRODUCT_CATEGORIES.length} verified categories</span>
        </div>
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {UNIQUE_PRODUCT_CATEGORIES.map((category, index) => {
            const Icon = icons[category.programType];
            return (
              <Link
                key={category.slug}
                href={`/unique-products/${category.slug}`}
                className="gold-card gold-fade-up group flex min-h-[230px] flex-col rounded-2xl p-6 focus:outline-none focus:ring-2 focus:ring-amber-400"
                style={{ animationDelay: `${index * 55}ms` }}
              >
                <div className="flex items-start justify-between gap-3">
                  <span className="flex h-12 w-12 items-center justify-center rounded-xl border border-amber-400/35 bg-amber-400/10 text-amber-300">
                    <Icon className="h-6 w-6" />
                  </span>
                  <span className="inline-flex items-center gap-1 rounded-full border border-emerald-400/25 bg-emerald-400/10 px-2.5 py-1 text-[11px] font-semibold uppercase tracking-wide text-emerald-300">
                    <BadgeCheck className="h-3.5 w-3.5" /> Active
                  </span>
                </div>
                <h3 className="mt-5 text-xl font-bold text-white group-hover:text-amber-200">{category.name}</h3>
                <p className="mt-2 flex-1 text-sm leading-relaxed text-slate-400">{category.summary}</p>
                <div className="mt-5 flex items-center justify-between border-t border-amber-500/15 pt-4 text-sm">
                  <span className="text-slate-400">{category.lenders.length} {category.lenders.length === 1 ? "lender" : "lenders"}</span>
                  <span className="inline-flex items-center gap-1.5 font-semibold text-amber-300">View programs <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-1" /></span>
                </div>
              </Link>
            );
          })}
        </div>
      </section>

      <aside className="rounded-2xl border border-amber-500/20 bg-black/35 p-5 text-sm leading-relaxed text-slate-400">
        <strong className="text-amber-300">Built for accuracy:</strong> hybrid programs such as ITIN DSCR and ITIN P&amp;L Only appear only when that exact combination is recorded. Separate ITIN, DSCR, or P&amp;L eligibility is never combined automatically.
      </aside>
    </div>
  );
}
