"use client";

import { useRef, useState } from "react";
import Link from "next/link";
import { Crown, Check, ArrowRight, BadgeCheck, Sparkles } from "lucide-react";
import { startCheckout } from "./checkout-actions";
import { COMMITMENT_DISCLOSURE, COMMITMENT_DISCLOSURE_VERSION, PLANS, termTotalCents } from "@/config/pricing";
import { formatCents } from "@/lib/billing/money";

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
  stripeCommitmentPriceId: string | null;
}

const COMMITMENT_PRICE_CENTS = PLANS.commit_4mo.amountCents;
const STANDARD_PRICE_CENTS = PLANS.monthly.amountCents;
const COMMITMENT_MONTHS = PLANS.commit_4mo.termMonths;
const COMMITMENT_TOTAL_CENTS = termTotalCents(PLANS.commit_4mo);
const COMMITMENT_SAVINGS_CENTS = (STANDARD_PRICE_CENTS - COMMITMENT_PRICE_CENTS) * COMMITMENT_MONTHS;

// Feature bullets for the month-to-month membership, laid out in two
// columns exactly as in the reference design. The "N currently verified
// lenders" line is derived live from the same verified-only query the
// quarantine logic uses (getVerifiedLenderCount), so it can never drift.
function monthlyFeatures(_verifiedLenderCount: number): { left: string[]; right: string[] } {
  return {
    left: [
      "No long-term commitment — cancel anytime",
      "Full access to all verified programs across all lenders",
      "Automatically includes any future verified lenders added",
    ],
    right: [
      "No restrictions on guideline comparisons",
      "Dedicated support",
      `Billed ${formatCents(STANDARD_PRICE_CENTS)} monthly, month-to-month`,
    ],
  };
}

function fmtDollars(cents: number): string {
  return formatCents(cents).slice(1);
}

function AttributionSelect() {
  return (
    <label className="mb-4 block text-sm text-slate-200">
      <span className="mb-2 block font-medium text-amber-200">How did you hear about us?</span>
      <select
        name="salesRep"
        required
        defaultValue=""
        className="w-full rounded-lg border border-amber-400/40 bg-black px-3 py-2 text-white focus:outline-none focus:ring-2 focus:ring-amber-400"
      >
        <option value="" disabled>Select one</option>
        <option value="bobby">Bobby</option>
        <option value="mike">Mike</option>
      </select>
    </label>
  );
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
  const plan = plans[0] ?? null; // the single active membership plan
  const hasAnnual = Boolean(plan && plan.annualPriceCents != null && plan.stripeAnnualPriceId != null);
  const hasCommitment = Boolean(plan && plan.stripeCommitmentPriceId != null);
  const [interval, setInterval_] = useState<"monthly" | "annual">("monthly");
  const [commitmentAcknowledged, setCommitmentAcknowledged] = useState(false);
  const disclosureRef = useRef<HTMLDivElement>(null);

  if (!plan) return null;

  const monthlyFeaturesCols = monthlyFeatures(verifiedLenderCount);
  const useAnnual = interval === "annual" && hasAnnual;

  const standardCard =
    plan && useAnnual ? (
      <p className="mt-5 text-center">
        <span className="text-5xl sm:text-6xl font-bold text-white">
          ${fmtDollars(plan.annualPriceCents!)}
        </span>
        <span className="ml-1 text-2xl font-semibold text-amber-400">/year</span>
      </p>
    ) : (
      <p className="mt-5 text-center">
        <span className="text-5xl sm:text-6xl font-bold text-white">${fmtDollars(STANDARD_PRICE_CENTS)}</span>
        <span className="ml-1 text-2xl font-semibold text-amber-400">/month</span>
      </p>
    );

  const standardSubNote = useAnnual ? (
    <p className="mt-1 text-center text-xs text-slate-400">
      equivalent to ${((plan!.annualPriceCents! / 100) / 12).toFixed(2)}/month, billed annually
    </p>
  ) : (
    <p className="mt-1 text-center text-xs text-slate-400">Billed month-to-month · cancel anytime</p>
  );

  return (
    <div className="space-y-8">
      {hasAnnual && (
        <div className="nexus-pricing-toggle flex flex-wrap items-center justify-center gap-x-3 gap-y-2">
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

      <div className="grid gap-6 lg:grid-cols-2 lg:items-stretch justify-items-center">
        {/* ─────────────────── Option 1 — Month-to-Month ─────────────────── */}
        <div className="pricing-membership-card relative w-full max-w-xl overflow-hidden rounded-2xl border border-amber-500/30 bg-[#0d0d0f]/90 shadow-[0_20px_50px_-20px_rgba(0,0,0,0.9)] transition-transform duration-300 hover:-translate-y-0.5">
          <div className="pointer-events-none absolute -top-28 left-1/2 h-56 w-[36rem] -translate-x-1/2 rounded-full bg-amber-500/10 blur-[90px]" />
          <div className="relative p-6 sm:p-8">
            <div className="flex items-center justify-center gap-2">
              <Crown className="h-5 w-5 text-amber-400" strokeWidth={2.2} />
              <span className="text-sm font-semibold uppercase tracking-[0.25em] text-amber-400">
                {plan ? plan.name : "Membership"}
              </span>
            </div>
            <p className="mt-4 text-center text-[11px] font-semibold uppercase tracking-[0.2em] text-slate-400">
              Maximum Flexibility
            </p>

            {standardCard}
            {standardSubNote}

            <p className="mx-auto mt-4 max-w-md text-center text-sm text-slate-300">
              Full access to every currently verified Non-QM lender in the platform, including future additions.
            </p>

            <div className="mt-7 grid gap-x-10 gap-y-4 sm:grid-cols-2">
              <FeatureList items={monthlyFeaturesCols.left} />
              <FeatureList items={monthlyFeaturesCols.right} />
            </div>

            <div className="mt-8">
              {isSignedIn ? (
                plan.stripePriceId || (useAnnual && plan.stripeAnnualPriceId) ? (
                  <form action={startCheckout}>
                    <input type="hidden" name="planId" value={plan.id} />
                    <input type="hidden" name="interval" value={useAnnual ? "annual" : "monthly"} />
                    <input type="hidden" name="membership" value="standard" />
                    <AttributionSelect />
                    <button
                      type="submit"
                      className="gold-to-black-button group flex w-full items-center justify-center gap-2 rounded-xl px-6 py-3.5 text-sm font-semibold focus:outline-none focus:ring-2 focus:ring-amber-400"
                    >
                      Start Monthly Membership
                      <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-0.5" strokeWidth={2.4} />
                    </button>
                  </form>
                ) : (
                  <p className="text-center text-xs text-slate-500">Billing not yet configured</p>
                )
              ) : (
                <Link
                  href={`/signup?next=/pricing`}
                  className="gold-to-black-button group flex w-full items-center justify-center gap-2 rounded-xl px-6 py-3.5 text-sm font-semibold focus:outline-none focus:ring-2 focus:ring-amber-400"
                >
                  Start Monthly Membership
                  <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-0.5" strokeWidth={2.4} />
                </Link>
              )}
            </div>
          </div>
        </div>

        {/* ── Option 2: 4-Month Commitment (Best Value) ── */}
        <div className="relative w-full max-w-xl">
          <div
            className={[
              "pricing-membership-card relative overflow-hidden rounded-2xl bg-gradient-to-b from-[#17130a] to-[#0d0b08]",
              "border-2 border-amber-400/60 shadow-[0_0_0_1px_rgba(212,175,82,0.25),0_24px_60px_-18px_rgba(251,191,36,0.35)]",
              "transition-all duration-300 hover:-translate-y-1 hover:shadow-[0_0_0_1px_rgba(212,175,82,0.4),0_30px_70px_-18px_rgba(251,191,36,0.5)]",
              "h-full",
            ].join(" ")}
          >
            {/* refined gold aura */}
            <div className="pointer-events-none absolute -top-24 left-1/2 h-52 w-[34rem] -translate-x-1/2 rounded-full bg-amber-400/20 blur-[90px]" />
            <div className="pointer-events-none absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-amber-300/70 to-transparent" />

            <div className="relative p-6 sm:p-8">
              <div className="flex items-center justify-center gap-2">
                <Sparkles className="h-4 w-4 text-amber-300" strokeWidth={2.2} />
                <span className="text-sm font-semibold uppercase tracking-[0.25em] text-amber-300">
                  4-Month Commitment
                </span>
              </div>

              <div className="mt-4 flex justify-center">
                <span className="inline-flex items-center gap-1.5 rounded-full border border-amber-400/60 bg-amber-400/10 px-3.5 py-1 text-[11px] font-bold uppercase tracking-[0.16em] text-amber-300 shadow-[0_0_18px_rgba(251,191,36,0.35)]">
                  <BadgeCheck className="h-3.5 w-3.5" strokeWidth={2.6} />
                  Best Value · Save ${fmtDollars(COMMITMENT_SAVINGS_CENTS)}
                </span>
              </div>

              <p className="mt-5 text-center">
                <span className="text-6xl sm:text-7xl font-extrabold text-amber-300 drop-shadow-[0_0_24px_rgba(251,191,36,0.35)]">
                  ${fmtDollars(COMMITMENT_PRICE_CENTS)}
                </span>
                <span className="ml-1 text-2xl font-semibold text-white">/month</span>
              </p>
              <p className="mt-1 text-center text-sm font-medium text-amber-200/90">Four required monthly payments</p>
              <p className="mt-1 text-center text-xs text-slate-400">
                {useAnnual ? (
                  <>Annual billing isn&apos;t offered for the 4-month commitment</>
                ) : (
                  <span className="text-slate-300">After payment four: {formatCents(STANDARD_PRICE_CENTS)}/month until canceled</span>
                )}
              </p>

              <div className="mx-auto mt-4 max-w-xs rounded-lg border border-amber-500/25 bg-black/40 px-3 py-2 text-center">
                <p className="text-[13px] text-amber-100">
                  <strong className="text-amber-300">{formatCents(COMMITMENT_TOTAL_CENTS)} total commitment</strong> across four months
                </p>
                <p className="mt-0.5 text-[11px] text-slate-500">
                  {formatCents(COMMITMENT_PRICE_CENTS)} today + three monthly {formatCents(COMMITMENT_PRICE_CENTS)} charges
                </p>
              </div>

              <ul className="mt-6 space-y-3">
                {[
                  `${formatCents(COMMITMENT_PRICE_CENTS)} today, then three monthly ${formatCents(COMMITMENT_PRICE_CENTS)} charges`,
                  `${formatCents(COMMITMENT_TOTAL_CENTS)} total four-month commitment`,
                  "Full NON-QM Nexus access — everything in the monthly membership",
                  `Automatically converts to ${formatCents(STANDARD_PRICE_CENTS)}/month after payment four`,
                  "Remaining commitment payments cannot be canceled mid-term",
                  "Continues month-to-month thereafter until canceled",
                ].map((f) => (
                  <li key={f} className="flex items-start gap-2.5 text-sm text-slate-200">
                    <span aria-hidden className="mt-0.5 shrink-0 text-amber-400">
                      <Check className="h-4 w-4" strokeWidth={3} />
                    </span>
                    <span>{f}</span>
                  </li>
                ))}
              </ul>

              {hasCommitment && isSignedIn && plan ? (
                <form action={startCheckout} className="mt-8">
                  <input type="hidden" name="planId" value={plan.id} />
                  <input type="hidden" name="interval" value="monthly" />
                  <input type="hidden" name="membership" value="commitment" />
                  <button
                    type="button"
                    onClick={() => {
                      setCommitmentAcknowledged(false);
                      setInterval_("monthly");
                      requestAnimationFrame(() => disclosureRef.current?.scrollIntoView({ behavior: "smooth", block: "nearest" }));
                    }}
                    className="gold-to-black-button group flex w-full items-center justify-center gap-2 rounded-xl px-6 py-3.5 text-sm font-semibold focus:outline-none focus:ring-2 focus:ring-amber-400"
                  >
                    Start 4-Month Commitment
                    <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-0.5" strokeWidth={2.4} />
                  </button>

                  {/* Checkout disclosure — affirmative acknowledgment required
                      before enrollment is submitted (spec: billing transition
                      disclosure immediately before checkout). Small, honest,
                      non-gimmicky — one sentence + one checkbox. */}
                  <div
                    ref={disclosureRef}
                    className="mt-4 rounded-xl border border-amber-500/25 bg-black/40 p-4 text-xs leading-relaxed text-slate-300"
                  >
                    <AttributionSelect />
                    <p className="font-medium text-amber-200">
                      {COMMITMENT_DISCLOSURE}
                    </p>
                    <input type="hidden" name="commitmentDisclosureVersion" value={COMMITMENT_DISCLOSURE_VERSION} />
                    <label className="mt-3 flex cursor-pointer items-start gap-2.5">
                      <input
                        type="checkbox"
                        name="commitmentAcknowledged"
                        value="yes"
                        required
                        checked={commitmentAcknowledged}
                        onChange={(e) => setCommitmentAcknowledged(e.target.checked)}
                        className="mt-0.5 h-4 w-4 shrink-0 accent-amber-400"
                      />
                      <span className="text-slate-300">
                        I have read and agree to four payments of {formatCents(COMMITMENT_PRICE_CENTS)} and the automatic transition to {formatCents(STANDARD_PRICE_CENTS)} per
                        month after the commitment.
                      </span>
                    </label>
                    <button
                      type="submit"
                      disabled={!commitmentAcknowledged}
                      className="mt-4 flex w-full items-center justify-center gap-2 rounded-xl bg-amber-400 px-6 py-3 text-sm font-bold text-black transition-all hover:bg-amber-300 disabled:cursor-not-allowed disabled:opacity-40"
                    >
                      Start 4-Month Commitment
                      <ArrowRight className="h-4 w-4" strokeWidth={2.6} />
                    </button>
                  </div>
                </form>
              ) : isSignedIn ? (
                !hasCommitment ? (
                  <p className="mt-8 text-center text-xs text-slate-500">
                    The 4-Month Commitment isn&apos;t configured yet — check back soon.
                  </p>
                ) : null
              ) : (
                <Link
                  href={`/signup?next=/pricing`}
                  className="gold-to-black-button group mt-8 flex w-full items-center justify-center gap-2 rounded-xl px-6 py-3.5 text-sm font-semibold focus:outline-none focus:ring-2 focus:ring-amber-400"
                >
                  Start 4-Month Commitment
                  <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-0.5" strokeWidth={2.4} />
                </Link>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}