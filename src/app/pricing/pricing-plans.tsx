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

// Feature bullets keyed by tier_level — the admin portal (/admin/plans)
// controls name, price, and tier_level live from the database; these
// descriptive bullets are presentational copy, not billing logic.
// Lender counts below are the real, verified count as of 2026-07-28 (a
// lender that is active AND has at least one active program backed by a
// human_verified guideline_version — see the external-audit fix and
// src/lib/repository/supabaseRepository.ts's verified-only filtering).
// Update these numbers only from a real query against production, never
// a guess — see docs/pricing-lender-count.md if one exists, or re-run the
// same query this fix used.
const TIER_FEATURES: Record<number, string[]> = {
  1: [
    "Compare guidelines from 10 NON-QM Lenders",
    "Deterministic eligibility matching",
    "Saved scenarios",
    "Email support",
  ],
  2: [
    "Everything in Essential",
    "Compare guidelines from 26 NON-QM Lenders",
    "Voice scenario intake",
    "Restructuring & needs-list generation",
    "Priority email support",
  ],
  3: [
    "Everything in Professional",
    "Full access to all 38 currently verified Non-QM lenders in the platform",
    "Automatically includes any future verified lenders added",
    "No restrictions on guideline comparisons",
    "Dedicated support",
  ],
};

function fmtDollars(cents: number): string {
  const dollars = cents / 100;
  return dollars % 1 === 0 ? String(dollars) : dollars.toFixed(2);
}

/** Percent saved by annual vs. 12x monthly, for the "Save N%" badge —
 * computed from whatever the admin actually set for each price, not
 * assumed to always be exactly 20%. */
function percentSaved(monthlyCents: number, annualCents: number): number {
  const equivalentMonthly = monthlyCents * 12;
  if (equivalentMonthly <= 0) return 0;
  return Math.round((1 - annualCents / equivalentMonthly) * 100);
}

export function PricingPlans({
  plans,
  isSignedIn,
  highlightedKey,
}: {
  plans: PricingPlanRow[];
  isSignedIn: boolean;
  highlightedKey: string | undefined;
}) {
  const anyAnnual = plans.some((p) => p.annualPriceCents != null);
  const [interval, setInterval_] = useState<"monthly" | "annual">("monthly");

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

      <div className="grid md:grid-cols-3 gap-6 items-stretch">
        {plans.map((plan) => {
          const highlighted = plan.key === highlightedKey;
          const hasAnnual = plan.annualPriceCents != null && plan.stripeAnnualPriceId != null;
          const useAnnual = interval === "annual" && hasAnnual;
          const priceCents = useAnnual ? plan.annualPriceCents! : plan.monthlyPriceCents;
          const priceId = useAnnual ? plan.stripeAnnualPriceId : plan.stripePriceId;
          const saved = hasAnnual ? percentSaved(plan.monthlyPriceCents, plan.annualPriceCents!) : 0;

          return (
            <Card
              key={plan.id}
              dark
              className={`flex flex-col ${highlighted ? "ring-2 ring-amber-400 shadow-lg gold-shimmer-border" : ""}`}
            >
              {highlighted ? (
                <span className="self-start mb-2 inline-block rounded-full bg-gradient-to-r from-amber-300 to-amber-600 text-black text-[11px] font-semibold px-2.5 py-0.5">
                  Most popular
                </span>
              ) : null}
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
                {(TIER_FEATURES[plan.tierLevel] ?? []).map((f) => (
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
                      className={`mt-6 w-full rounded-md text-sm font-medium px-4 py-2 focus:outline-none focus:ring-2 focus:ring-amber-400 ${
                        highlighted ? "gold-button gold-cta-glow" : "bg-white/5 border border-amber-500/20 text-white hover:bg-white/10"
                      }`}
                    >
                      Subscribe
                    </button>
                  </form>
                ) : (
                  <p className="mt-6 text-center text-xs text-slate-500">
                    {useAnnual ? "Annual billing not yet configured for this plan" : "Billing not yet configured for this plan"}
                  </p>
                )
              ) : (
                <Link
                  href={`/signup?next=/pricing`}
                  className={`mt-6 block text-center rounded-md text-sm font-medium px-4 py-2 focus:outline-none focus:ring-2 focus:ring-amber-400 ${
                    highlighted ? "gold-button gold-cta-glow" : "bg-white/5 border border-amber-500/20 text-white hover:bg-white/10"
                  }`}
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
