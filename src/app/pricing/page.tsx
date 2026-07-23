import Link from "next/link";
import { Card } from "@/components/ui";
import { createClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

interface PlanRow {
  id: string;
  key: string;
  name: string;
  monthly_price_cents: number;
  tier_level: number;
  description: string | null;
}

// Feature bullets keyed by tier_level — the admin portal (/admin/plans)
// controls name, price, and tier_level live from the database; these
// descriptive bullets are presentational copy, not billing logic.
const TIER_FEATURES: Record<number, string[]> = {
  1: [
    "Compare guidelines from the Top 12 Non-QM lenders",
    "Deterministic eligibility matching",
    "Saved scenarios",
    "Email support",
  ],
  2: [
    "Everything in Essential",
    "Compare guidelines from the Top 25 Non-QM lenders",
    "Voice scenario intake",
    "Restructuring & needs-list generation",
    "Priority email support",
  ],
  3: [
    "Everything in Professional",
    "Full access to every Non-QM lender in the platform",
    "Automatically includes any future lenders added",
    "No restrictions on guideline comparisons",
    "Dedicated support",
  ],
};

export default async function PricingPage() {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("membership_plans")
    .select("id, key, name, monthly_price_cents, tier_level, description")
    .eq("is_active", true)
    .order("sort_order");

  if (error) throw new Error(`Failed to load plans: ${error.message}`);
  const plans = (data ?? []) as PlanRow[];
  const highlightedKey = plans[1]?.key; // the middle-priced active plan, if any

  return (
    <div className="space-y-8">
      <div className="text-center max-w-2xl mx-auto space-y-2">
        <h1 className="text-3xl font-semibold text-slate-900">Simple, transparent pricing</h1>
        <p className="text-slate-600">
          Every plan includes the deterministic calculation and matching engine — no black-box AI eligibility
          decisions, ever.
        </p>
      </div>

      <div className="grid md:grid-cols-3 gap-6 items-stretch">
        {plans.map((plan) => {
          const highlighted = plan.key === highlightedKey;
          const priceDollars = plan.monthly_price_cents / 100;
          return (
            <Card
              key={plan.id}
              className={`flex flex-col ${highlighted ? "ring-2 ring-brand-600 shadow-md" : ""}`}
            >
              {highlighted ? (
                <span className="self-start mb-2 inline-block rounded-full bg-brand-600 text-white text-[11px] font-medium px-2.5 py-0.5">
                  Most popular
                </span>
              ) : null}
              <h2 className="text-lg font-semibold text-slate-900">{plan.name}</h2>
              <p className="mt-1 flex items-baseline gap-1">
                <span className="text-3xl font-semibold text-slate-900">
                  ${priceDollars % 1 === 0 ? priceDollars : priceDollars.toFixed(2)}
                </span>
                <span className="text-sm text-slate-500">/month</span>
              </p>
              <p className="mt-2 text-sm text-slate-500">{plan.description}</p>

              <ul className="mt-4 space-y-2 flex-1">
                {(TIER_FEATURES[plan.tier_level] ?? []).map((f) => (
                  <li key={f} className="flex items-start gap-2 text-sm text-slate-700">
                    <span aria-hidden className="mt-0.5 text-emerald-600">✓</span>
                    <span>{f}</span>
                  </li>
                ))}
              </ul>

              <Link
                href="/signup"
                className={`mt-6 block text-center rounded-md text-sm font-medium px-4 py-2 focus:outline-none focus:ring-2 focus:ring-brand-500 ${
                  highlighted
                    ? "bg-brand-600 text-white hover:bg-brand-700"
                    : "bg-slate-100 text-slate-900 hover:bg-slate-200"
                }`}
              >
                Get started
              </Link>
            </Card>
          );
        })}
      </div>

      <p className="text-center text-xs text-slate-500 max-w-2xl mx-auto">
        Sign up, then contact us to activate your membership — plans are currently activated by our team while we
        finish rolling out self-serve billing. All lenders and programs shown elsewhere in this demonstration build
        are fictional sample data — see the disclaimer in the footer.
      </p>
    </div>
  );
}
