"use client";

import { useState } from "react";
import Link from "next/link";
import { Crown, Check, ArrowRight } from "lucide-react";
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

// Feature bullets for the single NON-QM Nexus membership, laid out in two
// columns exactly as in the reference design. The "N currently verified
// lenders" line is derived live from the same verified-only query the
// quarantine logic uses (getVerifiedLenderCount), so it can never drift.
function membershipFeatures(verifiedLenderCount: number): { left: string[]; right: string[] } {
  return {
    left: [
      "Everything in the platform — matching, voice intake, restructuring",
      `Full access to all ${verifiedLenderCount} currently verified Non-QM lenders in the platform`,
      "Automatically includes any future verified lenders added",
    ],
    right: ["No restrictions on guideline comparisons", "Dedicated support", "Cancel anytime"],
  };
}

function fmtDollars(cents: number): string {
  const dollars = cents / 100;
  return dollars % 1 === 0 ? String(dollars) : dollars.toFixed(2);
}

function FeatureList({ items }: { items: string[] }) {
  return (
    <ul className="space-y-3">
      {items.map((f) => (
        <li key={f} className="flex items-start gap-2.5 text-sm text-slate-200">
          <span aria-hidden className="mt-0.5 shrink-0 text-amber-400">
            <Check className="h-4 w-4" strokeWidth={3} />
          </span>
          <span>{f}</span>
        </li>
      ))}
    </ul>
  );
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
            className="relative h-7 w-14 shrink-0 rounded-full border border-amber-400/50 bg-black/50 transition-colors focus:outline-none focus:ring-2 focus:ring-amber-400"
          >
            <span
              aria-hidden
              className={`absolute left-1 top-1 h-5 w-5 rounded-full bg-white shadow-[0_0_10px_rgba(255,255,255,0.7)] transition-transform ${
                interval === "annual" ? "translate-x-7" : "translate-x-0"
              }`}
            />
          </button>
          <span className={`shrink-0 text-sm font-medium ${interval === "annual" ? "text-white" : "text-slate-400"}`}>
            Annual
          </span>
          <span className="shrink-0 rounded-full border border-emerald-400/50 bg-emerald-500/15 text-emerald-300 text-[11px] font-semibold uppercase tracking-wide px-2.5 py-1">
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
          const denom = useAnnual ? "/year" : "/month";

          return (
            <div
              key={plan.id}
              className="relative w-full max-w-2xl overflow-hidden rounded-2xl border border-amber-500/30 bg-[#0d0d0f]/90 shadow-[0_20px_50px_-20px_rgba(0,0,0,0.9)]"
            >
              {/* ambient gold glow behind the card */}
              <div className="pointer-events-none absolute -top-28 left-1/2 h-56 w-[36rem] -translate-x-1/2 rounded-full bg-amber-500/20 blur-[90px]" />

              <div className="relative p-6 sm:p-10">
                <div className="flex items-center justify-center gap-2">
                  <Crown className="h-5 w-5 text-amber-400" strokeWidth={2.2} />
                  <span className="text-sm font-semibold uppercase tracking-[0.25em] text-amber-400">
                    {plan.name}
                  </span>
                </div>

                <p className="mt-5 text-center">
                  <span className="text-5xl sm:text-6xl font-bold text-white">${fmtDollars(priceCents)}</span>
                  <span className="ml-1 text-2xl font-semibold text-amber-400">{denom}</span>
                </p>
                {useAnnual && (
                  <p className="mt-1 text-center text-xs text-slate-400">
                    equivalent to ${(priceCents / 100 / 12).toFixed(2)}/month, billed annually
                  </p>
                )}

                <p className="mx-auto mt-4 max-w-md text-center text-sm text-slate-300">
                  Full access to every currently verified Non-QM lender in the platform, including future additions.
                </p>

                <div className="mt-8 grid gap-x-10 gap-y-4 sm:grid-cols-2">
                  <FeatureList items={features.left} />
                  <FeatureList items={features.right} />
                </div>

                {isSignedIn ? (
                  priceId ? (
                    <form action={startCheckout} className="mt-9">
                      <input type="hidden" name="planId" value={plan.id} />
                      <input type="hidden" name="interval" value={useAnnual ? "annual" : "monthly"} />
                      <button
                        type="submit"
                        className="gold-to-black-button group flex w-full items-center justify-center gap-2 rounded-xl px-6 py-3.5 text-sm font-semibold focus:outline-none focus:ring-2 focus:ring-amber-400"
                      >
                        Subscribe Now
                        <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-0.5" strokeWidth={2.4} />
                      </button>
                    </form>
                  ) : (
                    <p className="mt-9 text-center text-xs text-slate-500">
                      {useAnnual ? "Annual billing not yet configured" : "Billing not yet configured"}
                    </p>
                  )
                ) : (
                  <Link
                    href={`/signup?next=/pricing`}
                    className="gold-to-black-button group mt-9 flex w-full items-center justify-center gap-2 rounded-xl px-6 py-3.5 text-sm font-semibold focus:outline-none focus:ring-2 focus:ring-amber-400"
                  >
                    Subscribe Now
                    <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-0.5" strokeWidth={2.4} />
                  </Link>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}