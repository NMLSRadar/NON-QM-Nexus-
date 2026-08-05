import { ShieldCheck, UsersRound } from "lucide-react";
import { requirePlatformAdmin } from "@/lib/admin";
import { createServiceRoleClient } from "@/lib/repository/serviceRoleClient";
import { Card, fmtUsd } from "@/components/ui";
import { SubscriptionRow } from "./subscription-row";
import { AdminInviteForm } from "./admin-invite-form";
import { AdminRoleControl } from "./admin-role-control";

export const dynamic = "force-dynamic";

interface UserRow {
  id: string;
  email: string;
  platform_admin: boolean;
  created_at: string;
}

export default async function AdminUsersPage() {
  const { supabase, userId: currentUserId } = await requirePlatformAdmin();
  const service = createServiceRoleClient();

  const [
    { data: users, error: usersError },
    { data: plans, error: plansError },
    { data: discounts, error: discountsError },
    { data: subs, error: subsError },
    authUsersResult,
  ] = await Promise.all([
    supabase.from("users").select("id, email, platform_admin, created_at").is("deleted_at", null).order("created_at"),
    supabase.from("membership_plans").select("id, name, monthly_price_cents").eq("is_active", true).order("sort_order"),
    supabase.from("discounts").select("id, name").eq("is_active", true).order("percent_off"),
    supabase.from("user_subscriptions").select("user_id, plan_id, discount_id, canceled_at, source, stripe_subscription_id"),
    service.auth.admin.listUsers({ page: 1, perPage: 1000 }),
  ]);

  if (usersError) throw new Error(usersError.message);
  if (plansError) throw new Error(plansError.message);
  if (discountsError) throw new Error(discountsError.message);
  if (subsError) throw new Error(subsError.message);
  if (authUsersResult.error) throw new Error(authUsersResult.error.message);

  const userRows = (users ?? []) as UserRow[];
  const subByUser = new Map((subs ?? []).map((subscription) => [subscription.user_id as string, subscription]));
  const authByUser = new Map(authUsersResult.data.users.map((user) => [user.id, user]));
  const adminCount = userRows.filter((user) => user.platform_admin).length;
  const pendingAdminCount = userRows.filter((user) => user.platform_admin && !authByUser.get(user.id)?.last_sign_in_at).length;

  return (
    <div className="space-y-5">
      <div className="grid gap-4 sm:grid-cols-2">
        <Card dark className="relative overflow-hidden">
          <div className="flex items-center gap-3">
            <span className="flex h-10 w-10 items-center justify-center rounded-full bg-amber-500/10 text-amber-300 ring-1 ring-amber-500/20">
              <ShieldCheck className="h-5 w-5" aria-hidden />
            </span>
            <div>
              <p className="text-2xl font-semibold text-white">{adminCount}</p>
              <p className="text-xs uppercase tracking-wider text-slate-500">Platform administrators</p>
            </div>
          </div>
        </Card>
        <Card dark className="relative overflow-hidden">
          <div className="flex items-center gap-3">
            <span className="flex h-10 w-10 items-center justify-center rounded-full bg-amber-500/10 text-amber-300 ring-1 ring-amber-500/20">
              <UsersRound className="h-5 w-5" aria-hidden />
            </span>
            <div>
              <p className="text-2xl font-semibold text-white">{pendingAdminCount}</p>
              <p className="text-xs uppercase tracking-wider text-slate-500">Pending admin invitations</p>
            </div>
          </div>
        </Card>
      </div>

      <Card dark title="Invite a platform administrator">
        <p className="mb-4 max-w-3xl text-sm leading-6 text-slate-400">
          Platform administrators can access every Admin area and manage users, subscriptions, lenders, programs, documents, and system settings.
        </p>
        <AdminInviteForm />
      </Card>

      <div>
        <h2 className="text-lg font-semibold text-white">Users, roles &amp; subscriptions</h2>
        <p className="text-sm text-slate-500">
          Change platform access, assign a membership plan, or apply an optional discount. Role changes take effect immediately.
        </p>
      </div>

      <Card dark className="p-0 overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full min-w-[900px] text-sm">
            <thead className="border-b border-amber-500/15 bg-black/30">
              <tr className="text-left text-[11px] uppercase tracking-wider text-slate-500">
                <th className="px-5 py-3">User</th>
                <th className="px-5 py-3">Access status</th>
                <th className="px-5 py-3">Platform role</th>
                <th className="px-5 py-3">Plan &amp; discount</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-white/5">
              {userRows.map((user) => {
                const subscription = subByUser.get(user.id);
                const authUser = authByUser.get(user.id);
                const isPendingInvite = user.platform_admin && !authUser?.last_sign_in_at;
                return (
                  <tr key={user.id} className="align-top hover:bg-white/[0.02]">
                    <td className="px-5 py-4 pr-6">
                      <div className="font-medium text-slate-100">{user.email}</div>
                      <div className="mt-1 text-[11px] text-slate-600">Added {new Date(user.created_at).toLocaleDateString()}</div>
                    </td>
                    <td className="px-5 py-4">
                      {isPendingInvite ? (
                        <span className="inline-flex rounded-full border border-amber-500/25 bg-amber-500/10 px-2 py-1 text-[11px] font-medium text-amber-300">Invitation pending</span>
                      ) : authUser?.last_sign_in_at ? (
                        <span className="inline-flex rounded-full border border-emerald-500/20 bg-emerald-500/10 px-2 py-1 text-[11px] font-medium text-emerald-300">Active</span>
                      ) : (
                        <span className="inline-flex rounded-full border border-slate-500/20 bg-slate-500/10 px-2 py-1 text-[11px] font-medium text-slate-400">Never signed in</span>
                      )}
                    </td>
                    <td className="px-5 py-4">
                      <AdminRoleControl
                        userId={user.id}
                        email={user.email}
                        isAdmin={user.platform_admin}
                        isCurrentUser={user.id === currentUserId}
                        isPendingInvite={isPendingInvite}
                      />
                    </td>
                    <td className="px-5 py-4">
                      <SubscriptionRow
                        userId={user.id}
                        userEmail={user.email}
                        currentPlanId={(subscription?.plan_id as string) ?? null}
                        currentDiscountId={(subscription?.discount_id as string) ?? null}
                        canceledAt={(subscription?.canceled_at as string) ?? null}
                        isLiveStripeSubscription={subscription?.source === "stripe" && Boolean(subscription?.stripe_subscription_id)}
                        plans={plans ?? []}
                        discounts={discounts ?? []}
                      />
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </Card>
      <p className="text-xs text-slate-600">
        Plan prices: {(plans ?? []).map((plan) => `${plan.name} ${fmtUsd(plan.monthly_price_cents / 100)}/mo`).join(" · ")}
      </p>
    </div>
  );
}
