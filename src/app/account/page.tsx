import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getEffectivePlan } from "@/lib/repository/membership";
import { Card, fmtUsd } from "@/components/ui";
import { PasswordForm } from "./password-form";
import { CancelSubscriptionForm } from "./cancel-subscription-form";
import { ReactivateSubscriptionForm } from "./reactivate-subscription-form";
import { ManageBillingForm } from "./manage-billing-form";

export const dynamic = "force-dynamic";

export default async function AccountPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const plan = await getEffectivePlan(supabase, user.id);
  // Genuinely ended (or never had a plan) vs. "still active, but set to end
  // at the period's close" — Stripe subscriptions stay usable right up
  // until current_period_end even after cancel_at_period_end is set, so
  // these need distinct badges/actions rather than one flat "canceled".
  const isFullyCanceled = Boolean(plan.canceledAt) && plan.tierLevel === 0;
  const isCancelingAtPeriodEnd = plan.source === "stripe" && plan.cancelAtPeriodEnd && !isFullyCanceled;

  return (
    <div className="max-w-2xl space-y-6">
      <div>
        <h1 className="text-2xl font-semibold text-slate-900">Account settings</h1>
        <p className="text-sm text-slate-500">{user.email}</p>
      </div>

      <Card title="Subscription">
        {plan.planName ? (
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <div>
                <p className="font-medium text-slate-900">
                  {plan.planName}
                  {isFullyCanceled ? (
                    <span className="ml-2 text-xs rounded-full bg-slate-200 text-slate-700 px-2 py-0.5">Canceled</span>
                  ) : isCancelingAtPeriodEnd ? (
                    <span className="ml-2 text-xs rounded-full bg-amber-100 text-amber-800 px-2 py-0.5">
                      Canceling
                    </span>
                  ) : (
                    <span className="ml-2 text-xs rounded-full bg-emerald-100 text-emerald-800 px-2 py-0.5">
                      Active
                    </span>
                  )}
                  {plan.source === "stripe" ? (
                    <span className="ml-2 text-xs rounded-full bg-slate-100 text-slate-600 px-2 py-0.5">Billed via Stripe</span>
                  ) : null}
                </p>
                <p className="text-sm text-slate-500">
                  {fmtUsd((plan.effectivePriceCents ?? 0) / 100)}/month
                  {plan.discountPercentOff ? ` (${plan.discountPercentOff}% off applied)` : ""}
                </p>
                {isFullyCanceled && plan.canceledAt ? (
                  <p className="text-xs text-slate-500 mt-1">Canceled on {new Date(plan.canceledAt).toLocaleDateString()}</p>
                ) : isCancelingAtPeriodEnd && plan.currentPeriodEnd ? (
                  <p className="text-xs text-amber-700 mt-1">
                    Access continues until {new Date(plan.currentPeriodEnd).toLocaleDateString()}, then cancels.
                  </p>
                ) : null}
              </div>
            </div>
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
        ) : (
          <p className="text-sm text-slate-500">
            You don&apos;t have an active plan yet. Visit{" "}
            <a href="/pricing" className="text-brand-700 underline">
              pricing
            </a>{" "}
            to see the available tiers and subscribe.
          </p>
        )}
      </Card>

      <Card title="Change password">
        <PasswordForm />
      </Card>
    </div>
  );
}
