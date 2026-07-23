import { requirePlatformAdmin } from "@/lib/admin";
import { Card, fmtUsd } from "@/components/ui";
import { SubscriptionRow } from "./subscription-row";

export const dynamic = "force-dynamic";

interface UserRow {
  id: string;
  email: string;
  platform_admin: boolean;
}

export default async function AdminUsersPage() {
  const { supabase } = await requirePlatformAdmin();

  const [{ data: users, error: usersError }, { data: plans, error: plansError }, { data: discounts, error: discountsError }, { data: subs, error: subsError }] =
    await Promise.all([
      supabase.from("users").select("id, email, platform_admin").is("deleted_at", null).order("created_at"),
      supabase.from("membership_plans").select("id, name, monthly_price_cents").eq("is_active", true).order("sort_order"),
      supabase.from("discounts").select("id, name").eq("is_active", true).order("percent_off"),
      supabase.from("user_subscriptions").select("user_id, plan_id, discount_id"),
    ]);

  if (usersError) throw new Error(usersError.message);
  if (plansError) throw new Error(plansError.message);
  if (discountsError) throw new Error(discountsError.message);
  if (subsError) throw new Error(subsError.message);

  const subByUser = new Map((subs ?? []).map((s) => [s.user_id as string, s]));

  return (
    <div className="space-y-4">
      <div>
        <h2 className="text-lg font-semibold text-slate-900">Users &amp; subscriptions</h2>
        <p className="text-sm text-slate-500">
          Assign a plan and an optional discount to any account. Changes take effect immediately — no billing is
          charged (admin-controlled memberships, no live payment processing yet).
        </p>
      </div>

      <Card>
        <table className="w-full text-sm">
          <thead>
            <tr className="text-left text-xs text-slate-500 uppercase tracking-wide">
              <th className="pb-2">User</th>
              <th className="pb-2">Plan &amp; discount</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {(users as UserRow[]).map((u) => {
              const sub = subByUser.get(u.id);
              return (
                <tr key={u.id}>
                  <td className="py-2 pr-4">
                    <span className="font-medium">{u.email}</span>
                    {u.platform_admin ? (
                      <span className="ml-2 text-[11px] rounded-full bg-brand-100 text-brand-800 px-2 py-0.5">
                        admin
                      </span>
                    ) : null}
                  </td>
                  <td className="py-2">
                    <SubscriptionRow
                      userId={u.id}
                      currentPlanId={(sub?.plan_id as string) ?? null}
                      currentDiscountId={(sub?.discount_id as string) ?? null}
                      plans={plans ?? []}
                      discounts={discounts ?? []}
                    />
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </Card>
      <p className="text-xs text-slate-500">
        Plan prices: {(plans ?? []).map((p) => `${p.name} ${fmtUsd(p.monthly_price_cents / 100)}/mo`).join(" · ")}
      </p>
    </div>
  );
}
