import { requirePlatformAdmin } from "@/lib/admin";
import { Card, fmtUsd } from "@/components/ui";
import { PlanForm } from "./plan-form";
import { ToggleActiveButton } from "./toggle-active-button";

export const dynamic = "force-dynamic";

interface PlanRow {
  id: string;
  key: string;
  name: string;
  monthly_price_cents: number;
  tier_level: number;
  description: string | null;
  is_active: boolean;
  sort_order: number;
}

export default async function AdminPlansPage() {
  const { supabase } = await requirePlatformAdmin();
  const { data, error } = await supabase
    .from("membership_plans")
    .select("id, key, name, monthly_price_cents, tier_level, description, is_active, sort_order")
    .order("sort_order");
  if (error) throw new Error(error.message);
  const plans = (data ?? []) as PlanRow[];

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-lg font-semibold text-slate-900">Membership plans</h2>
        <p className="text-sm text-slate-500">
          Prices, names, and the lender tier each plan unlocks are all editable here — changes apply immediately, no
          deploy needed.
        </p>
      </div>

      <div className="grid md:grid-cols-2 gap-4">
        {plans.map((plan) => (
          <Card key={plan.id} className={!plan.is_active ? "opacity-50" : ""}>
            <div className="flex items-start justify-between gap-2">
              <div>
                <h3 className="font-semibold">{plan.name}</h3>
                <p className="text-xs text-slate-400">key: {plan.key}</p>
              </div>
              <span className="text-lg font-semibold">{fmtUsd(plan.monthly_price_cents / 100)}/mo</span>
            </div>
            <p className="mt-1 text-sm text-slate-600">{plan.description}</p>
            <p className="mt-1 text-xs text-slate-500">Unlocks lender tier level: {plan.tier_level}</p>
            <div className="mt-3 flex items-center justify-between">
              <ToggleActiveButton id={plan.id} isActive={plan.is_active} />
            </div>
            <details className="mt-3">
              <summary className="cursor-pointer text-xs text-brand-700 hover:underline">Edit</summary>
              <div className="mt-2">
                <PlanForm plan={plan} />
              </div>
            </details>
          </Card>
        ))}
      </div>

      <Card title="Add a new plan">
        <PlanForm />
      </Card>
    </div>
  );
}
