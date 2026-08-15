import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getEffectivePlan } from "@/lib/repository/membership";
import { Card, fmtUsd } from "@/components/ui";
import { PasswordForm } from "./password-form";
import { CancelSubscriptionForm } from "./cancel-subscription-form";
import { ReactivateSubscriptionForm } from "./reactivate-subscription-form";
import { ManageBillingForm } from "./manage-billing-form";
import { KIND_COMMITMENT, KIND_COMMITMENT_COMPLETED } from "@/lib/billing/commitment";

export const dynamic = "force-dynamic";

function fmtDate(value: string | null | undefined): string | null {
  if (!value) return null;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return null;
  return date.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
}

export default async function AccountPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const plan = await getEffectivePlan(supabase, user.id);
  // Genuinely ended (or never had a plan) vs. "still active, but set to end
  // at the period's close" — Stripe subscriptions stay usable right up
  // until current_period_end even after cancel_at_period_end / cancel_at is
  // set, so these need distinct badges/actions rather than one flat
  // "canceled".
  const isFullyCanceled = Boolean(plan.canceledAt) && plan.tierLevel === 0;
  const isCancelingAtPeriodEnd =
    plan.source === "stripe" && (plan.cancelAtPeriodEnd || Boolean(plan.cancelAt)) && !isFullyCanceled;

  const inCommitment = plan.membershipKind === KIND_COMMITMENT;
  const commitmentCompleted = plan.membershipKind === KIND_COMMITMENT_COMPLETED;
  const displayPlanName = inCommitment ? "3-Month Commitment" : plan.planName;

  return (
    <div className="gold-theme gold-page -mx-4 -my-6 px-4 py-6 sm:px-6 sm:py-8 bg-[#050505] rounded-b-3xl max-w-2xl space-y-6">
      <div>
        <h1 className="text-2xl font-semibold text-white">Account settings</h1>
        <p className="text-sm text-slate-400">{user.email}</p>
      </div>

      <Card title="Subscription" dark>
        {plan.orgCoverage ? (
          <div className="mb-3 rounded border border-amber-500/20 bg-amber-500/5 p-3">
            <p className="text-sm text-white">
              Covered by <strong>{plan.orgCoverage.organizationName}</strong>&apos;s <strong>{plan.orgCoverage.planName}</strong> plan
            </p>
            <p className="text-xs text-slate-400 mt-0.5">
              Your access comes from your organization&apos;s team subscription — no billing action needed on your part.
            </p>
          </div>
        ) : null}
        {plan.planName ? (
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <div>
                <p className="font-medium text-white">
                  {inCommitment ? (
                    <>
                      <span className="text-amber-300">{displayPlanName}</span>
                      <span className="ml-2 text-xs rounded-full bg-amber-500/20 text-amber-300 px-2 py-0.5">Best value</span>
                    </>
                  ) : (
                    displayPlanName
                  )}
                  {isFullyCanceled ? (
                    <span className="ml-2 text-xs rounded-full bg-white/10 text-slate-300 px-2 py-0.5">Canceled</span>
                  ) : isCancelingAtPeriodEnd ? (
                    <span className="ml-2 text-xs rounded-full bg-amber-500/20 text-amber-300 px-2 py-0.5">
                      Canceling
                    </span>
                  ) : (
                    <span className="ml-2 text-xs rounded-full bg-emerald-500/20 text-emerald-300 px-2 py-0.5">
                      Active
                    </span>
                  )}
                  {plan.source === "stripe" ? (
                    <span className="ml-2 text-xs rounded-full bg-white/10 text-slate-300 px-2 py-0.5">Billed via Stripe</span>
                  ) : null}
                </p>
                <p className="text-sm text-slate-400">
                  {fmtUsd((plan.effectivePriceCents ?? 0) / 100)}/{plan.billingInterval === "annual" ? "year" : "month"}
                  {plan.discountPercentOff ? ` (${plan.discountPercentOff}% off applied)` : ""}
                </p>
                {isFullyCanceled && plan.canceledAt ? (
                  <p className="text-xs text-slate-500 mt-1">Canceled on {fmtDate(plan.canceledAt)}</p>
                ) : isCancelingAtPeriodEnd && plan.currentPeriodEnd ? (
                  <p className="text-xs text-amber-300 mt-1">
                    Access continues until {fmtDate(plan.currentPeriodEnd)}, then cancels.
                  </p>
                ) : null}
              </div>
            </div>

            {inCommitment ? (
              <div className="rounded-lg border border-amber-500/25 bg-amber-500/[0.06] p-4">
                <dl className="grid grid-cols-1 sm:grid-cols-2 gap-x-6 gap-y-3 text-sm">
                  <div>
                    <dt className="text-[11px] uppercase tracking-wider text-slate-500">Current rate</dt>
                    <dd className="mt-0.5 text-white font-semibold">
                      ${fmtUsd((plan.currentMonthlyPriceCents ?? 12000) / 100)}/month
                    </dd>
                    <dd className="text-xs text-slate-400">For your first 3 months</dd>
                  </div>
                  <div>
                    <dt className="text-[11px] uppercase tracking-wider text-slate-500">Commitment period</dt>
                    <dd className="mt-0.5 text-white font-semibold">
                      {plan.commitmentMonth ? `Month ${plan.commitmentMonth} of 3` : "Complete"}
                    </dd>
                    <dd className="text-xs text-slate-400">
                      {plan.commitmentStartDate ? `Started ${fmtDate(plan.commitmentStartDate)}` : ""}
                    </dd>
                  </div>
                  <div>
                    <dt className="text-[11px] uppercase tracking-wider text-slate-500">Next billing date</dt>
                    <dd className="mt-0.5 text-white font-semibold">{fmtDate(plan.currentPeriodEnd) ?? "—"}</dd>
                    <dd className="text-xs text-slate-400">Billed automatically by Stripe</dd>
                  </div>
                  <div>
                    <dt className="text-[11px] uppercase tracking-wider text-slate-500">Future rate</dt>
                    <dd className="mt-0.5 text-white font-semibold">$150/month</dd>
                    <dd className="text-xs text-slate-400">
                      {plan.standardRateStartDate
                        ? `Beginning ${fmtDate(plan.standardRateStartDate)} — no action needed, converts automatically`
                        : "Beginning after Month 3 — no action needed, converts automatically"}
                    </dd>
                  </div>
                </dl>
              </div>
            ) : null}

            {commitmentCompleted ? (
              <p className="text-xs text-slate-400">
                Your 3-month introductory period is complete — you&apos;re now billed month-to-month at $150/month on the same
                subscription. No re-enrollment or new payment information was needed.
              </p>
            ) : null}

            <div className="flex flex-wrap gap-3">
              {isFullyCanceled ? (
                <ReactivateSubscriptionForm />
              ) : isCancelingAtPeriodEnd ? (
                <ReactivateSubscriptionForm label="Resume subscription" />
              ) : (
                <CancelSubscriptionForm isStripe={plan.source === "stripe"} />
              )}
              {plan.source === "stripe" ? <ManageBillingForm /> : null}
            </div>
          </div>
        ) : plan.orgCoverage ? null : (
          <p className="text-sm text-slate-400">
            You don&apos;t have an active plan yet. Visit{" "}
            <a href="/pricing" className="text-amber-400 underline">
              pricing
            </a>{" "}
            to subscribe to the membership.
          </p>
        )}
      </Card>

      <Card title="Change password" dark>
        <PasswordForm />
      </Card>
    </div>
  );
}