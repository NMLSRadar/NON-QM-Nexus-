import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft, ShieldCheck } from "lucide-react";
import { getCurrentOrganizationId, getRepository, requireSubscriberAccess } from "@/lib/session";
import { getUniqueProductCategory, UNIQUE_PRODUCT_CATEGORIES } from "@/domain/uniqueProducts";
import { SpecialtyProgramDirectory } from "./specialty-program-directory";

export const dynamic = "force-dynamic";

export function generateStaticParams() {
  return UNIQUE_PRODUCT_CATEGORIES.map((category) => ({ slug: category.slug }));
}

export default async function UniqueProductCategoryPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const category = getUniqueProductCategory(slug);
  if (!category) notFound();

  const repo = await getRepository();
  const org = await getCurrentOrganizationId();
  await requireSubscriberAccess();
  const lenders = (await repo.listAllLenders(org)).filter((lender) => lender.active && !lender.isSampleData);
  const lenderLinks: Record<string, string> = {};

  for (const specialty of category.lenders) {
    const acceptedNames = [specialty.lenderName, ...(specialty.aliases ?? [])].map((name) => name.toLowerCase());
    const lender = lenders.find((candidate) => acceptedNames.includes(candidate.name.toLowerCase()));
    if (lender) lenderLinks[specialty.id] = `/lenders/${lender.id}#account-executives`;
  }

  return (
    <div className="gold-theme gold-page -mx-4 -my-6 min-h-full space-y-6 rounded-b-3xl bg-[#050505] px-4 py-6 sm:px-6 sm:py-8">
      <Link href="/unique-products" className="inline-flex items-center gap-2 text-sm font-medium text-amber-300 hover:text-amber-200">
        <ArrowLeft className="h-4 w-4" /> All unique products
      </Link>

      <section className="relative overflow-hidden rounded-3xl border border-amber-500/25 bg-[#0a0a0b] p-6 sm:p-9">
        <div className="gold-ambient" />
        <div className="relative z-10 max-w-4xl">
          <div className="inline-flex items-center gap-2 rounded-full border border-amber-400/35 bg-amber-400/10 px-3 py-1.5 text-xs font-semibold uppercase tracking-[0.16em] text-amber-300">
            <ShieldCheck className="h-4 w-4" /> Unique Non-QM Products
          </div>
          <h1 className="mt-4 text-3xl font-bold tracking-tight text-white sm:text-5xl">Lenders Offering {category.name}</h1>
          <p className="mt-4 max-w-3xl text-base leading-relaxed text-slate-300">{category.description}</p>
          <p className="mt-3 text-sm text-slate-500">Quick-reference lender discovery. This page does not run the traditional scenario matching engine.</p>
        </div>
      </section>

      <SpecialtyProgramDirectory category={category} lenderLinks={lenderLinks} />

      <footer className="rounded-2xl border border-amber-500/25 bg-[#0d0d0f] p-5 sm:p-6">
        <p className="text-sm leading-relaxed text-slate-300">
          <strong className="text-white">Non-QM Nexus provides program information as an educational and lender-discovery resource.</strong>{" "}
          Mortgage guidelines, pricing, overlays, loan limits and eligibility requirements may change without notice. Always confirm current guidelines and scenario eligibility directly with an Account Executive at the lender before submitting a loan.
        </p>
      </footer>
    </div>
  );
}
