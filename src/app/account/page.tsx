import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getEffectivePlan } from "@/lib/repository/membership";
import { Card, fmtUsd } from "@/components/ui";
import { PasswordForm } from "./password-form";
import { CancelSubscriptionForm } from "./cancel-subscription-form";
import { ReactivateSubscriptionForm } from "./reactivate-subscription-form";

export const dynamic = "force-dynamic";

export default async function AccountPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const plan = await getEffectivePlan(supabase, user.id);

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
                  {plan.canceledAt ? (
                    <span className="ml-2 text-xs rounded-full bg-slate-200 text-slate-700 px-2 py-0.5">Canceled</span>
                  ) : (
                    <span className="ml-2 text-xs rounded-full bg-emerald-100 text-emerald-800 px-2 py-0.5">
                      Active
                    </span>
                  )}
                </p>
                <p className="text-sm text-slate-500">
                  {fmtUsd((plan.effectivePriceCents ?? 0) / 100)}/month
                  {plan.discountPercentOff ? ` (${plan.discountPercentOff}% off applied)` : ""}
                </p>
                {plan.canceledAt ? (
                  <p className="text-xs text-slate-500 mt-1">
                    Canceled on {new Date(plan.canceledAt).toLocaleDateString()}
                  </p>
                ) : null}
              </div>
            </div>
            {!plan.canceledAt ? <CancelSubscriptionForm /> : <ReactivateSubscriptionForm />}
          </div>
        ) : (
          <p className="text-sm text-slate-500">
            You don&apos;t have an active plan yet. Visit{" "}
            <a href="/pricing" className="text-brand-700 underline">
              pricing
            </a>{" "}
            to see the available tiers, then contact us to get set up.
          </p>
        )}
      </Card>

      <Card title="Change password">
        <PasswordForm />
      </Card>
    </div>
  );
}
