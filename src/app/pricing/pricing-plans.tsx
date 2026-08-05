"use client";

import { useState } from "react";
import Link from "next/link";
import { Card } from "@/components/ui";
import { startCheckout } from "./checkout-actions";

export interface PricingPlanRow {
  id: string;
  key: string;
  name: string;
  monthlyPriceCents: number;
  annualPriceCents: number | null;
  tierLevel: number;
  description: string | null;
  stripePriceId: string | null;
  stripeAnnualPriceId: string | null;
}

// Feature bullets for the single NON-QM Nexus membership. The admin portal
// (/admin/plans) still controls name, price, and tier_level live from the
// database; since the July 2026 repricing collapsed the three tiers into one
// $150 membership, these descriptive bullets are a single presentational list,
// no longer keyed by tier. The "N currently verified lenders" line is derived
// live from the same verified-only query the quarantine logic uses
// (getVerifiedLenderCount in src/lib/repository/supabaseRepository.ts), so it
// can never drift from reality.
function membershipFeatures(verifiedLenderCount: number): string[] {
  return [
    `Full access to all ${verifiedLenderCount} currently verified Non-QM lenders in the platform`,
    "Automatically includes any future verified lenders added",
    "No restrictions on guideline comparisons",
    "Voice scenario intake",
    "Restructuring & needs-list generation",
    "Document checklists for every loan officer",
    "Deterministic eligibility matching",
    "Saved scenarios",
    "Email support",
  ];
}

function fmtDollars(cents: number): string {
  const dollars = cents / 100;
  return dollars % 1 === 0 ? String(dollars) : dollars.toFixed(2);
}

/** Percent saved by annual vs. 12x monthly — computed from whatever the admin
 * actually set, not assumed to always be exactly 20%. */
function percentSaved(monthlyCents: number, annualCents: number): number {
  const equivalentMonthly = monthlyCents * 12;
  if (equivalentMonthly <= 0) return 0;
  return Math.round((1 - annualCents / equivalentMonthly) * 100);
}

export function PricingPlans({
  plans,
  isSignedIn,
  verifiedLenderCount,
}: {
  plans: PricingPlanRow[];
  isSignedIn: boolean;
  verifiedLenderCount: number;
}) {
  const anyAnnual = plans.some((p) => p.annualPriceCents != null);
  const [interval, setInterval_] = useState<"monthly" | "annual">("monthly");
  const features = membershipFeatures(verifiedLenderCount);

  return (
    <div className="space-y-8">
      {anyAnnual && (
        <div className="flex flex-wrap items-center justify-center gap-x-3 gap-y-2">
          <span className={`shrink-0 text-sm font-medium ${interval === "monthly" ? "text-white" : "text-slate-400"}`}>
            Monthly
          </span>
          <button
            type="button"
            role="switch"
            aria-checked={interval === "annual"}
            onClick={() => setInterval_((v) => (v === "monthly" ? "annual" : "monthly"))}
            className="relative h-7 w-14 shrink-0 rounded-full border border-amber-400/40 bg-black/40 transition-colors focus:outline-none focus:ring-2 focus:ring-amber-400"
          >
            <span
              aria-hidden
              className={`absolute left-0.5 top-0.5 h-5 w-5 rounded-full bg-gradient-to-br from-amber-300 to-amber-600 shadow-md transition-transform ${
                interval === "annual" ? "translate-x-8" : "translate-x-0"
              }`}
            />
          </button>
          <span className={`shrink-0 text-sm font-medium ${interval === "annual" ? "text-white" : "text-slate-400"}`}>
            Annual
          </span>
          <span className="shrink-0 rounded-full border border-emerald-400/40 bg-emerald-500/10 text-emerald-300 text-[11px] font-semibold uppercase tracking-wide px-2.5 py-1">
            Save 20%
          </span>
        </div>
      )}

      <div className="grid gap-6 justify-items-center">
        {plans.map((plan) => {
          const hasAnnual = plan.annualPriceCents != null && plan.stripeAnnualPriceId != null;
          const useAnnual = interval === "annual" && hasAnnual;
          const priceCents = useAnnual ? plan.annualPriceCents! : plan.monthlyPriceCents;
          const priceId = useAnnual ? plan.stripeAnnualPriceId : plan.stripePriceId;
          const saved = hasAnnual ? percentSaved(plan.monthlyPriceCents, plan.annualPriceCents!) : 0;

          return (
            <Card dark key={plan.id} className={`flex flex-col w-full max-w-xl ring-2 ring-amber-400 shadow-lg gold-shimmer-border`}>
              <h2 className="text-lg font-semibold text-white">{plan.name}</h2>
              <p className="mt-1 flex items-baseline gap-1 flex-wrap">
                <span className="text-3xl font-semibold text-white">${fmtDollars(priceCents)}</span>
                <span className="text-sm text-slate-400">{useAnnual ? "/year" : "/month"}</span>
                {useAnnual && saved > 0 && (
                  <span className="ml-1 rounded-full bg-emerald-500/10 text-emerald-300 text-[11px] font-semibold px-2 py-0.5">
                    Save {saved}%
                  </span>
                )}
              </p>
              {useAnnual && (
                <p className="text-xs text-slate-500">
                  equivalent to ${(priceCents / 100 / 12).toFixed(2)}/month, billed annually
                </p>
              )}
              <p className="mt-2 text-sm text-slate-400">{plan.description}</p>

              <ul className="mt-4 space-y-2 flex-1">
                {features.map((f) => (
                  <li key={f} className="flex items-start gap-2 text-sm text-slate-300">
                    <span aria-hidden className="mt-0.5 text-emerald-400">✓</span>
                    <span>{f}</span>
                  </li>
                ))}
              </ul>

              {isSignedIn ? (
                priceId ? (
                  <form action={startCheckout}>
                    <input type="hidden" name="planId" value={plan.id} />
                    <input type="hidden" name="interval" value={useAnnual ? "annual" : "monthly"} />
                    <button
                      type="submit"
                      className="mt-6 w-full rounded-md text-sm font-medium px-4 py-2 focus:outline-none focus:ring-2 focus:ring-amber-400 gold-button gold-cta-glow"
                    >
                      Subscribe
                    </button>
                  </form>
                ) : (
                  <p className="mt-6 text-center text-xs text-slate-500">
                    {useAnnual ? "Annual billing not yet configured" : "Billing not yet configured"}
                  </p>
                )
              ) : (
                <Link
                  href={`/signup?next=/pricing`}
                  className="mt-6 block text-center rounded-md text-sm font-medium px-4 py-2 focus:outline-none focus:ring-2 focus:ring-amber-400 gold-button gold-cta-glow"
                >
                  Sign up to subscribe
                </Link>
              )}
            </Card>
          );
        })}
      </div>
    </div>
  );
}