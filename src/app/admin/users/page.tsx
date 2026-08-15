import { ShieldCheck, UsersRound, Filter } from "lucide-react";
import { requirePlatformAdmin } from "@/lib/admin";
import { createServiceRoleClient } from "@/lib/repository/serviceRoleClient";
import { Card, fmtUsd } from "@/components/ui";
import { SubscriptionRow } from "./subscription-row";
import { AdminInviteForm } from "./admin-invite-form";
import { AdminRoleControl } from "./admin-role-control";
import { commitmentMonthOf } from "@/lib/billing/commitment";

export const dynamic = "force-dynamic";

interface UserRow {
  id: string;
  email: string;
  platform_admin: boolean;
  created_at: string;
}

interface SubscriptionRowData {
  user_id: string;
  plan_id: string | null;
  discount_id: string | null;
  canceled_at: string | null;
  source: string | null;
  stripe_subscription_id: string | null;
  stripe_customer_id: string | null;
  stripe_status: string | null;
  stripe_subscription_schedule_id: string | null;
  membership_kind: string | null;
  current_monthly_price_cents: number | null;
  commitment_start_date: string | null;
  commitment_end_date: string | null;
  standard_rate_start_date: string | null;
  current_period_end: string | null;
  cancel_at_period_end: boolean | null;
  cancel_at: string | null;
}

export type MemberFilter = "all" | "standard" | "commitment" | "commitment_completed" | "past_due" | "canceled";

const FILTERS: { value: MemberFilter; label: string }[] = [
  { value: "all", label: "All Members" },
  { value: "standard", label: "$150 Monthly Members" },
  { value: "commitment", label: "3-Month Commitment Members" },
  { value: "commitment_completed", label: "Commitment Completed" },
  { value: "past_due", label: "Past Due" },
  { value: "canceled", label: "Canceled" },
];

function isCanceled(row: SubscriptionRowData): boolean {
  const status = (row.stripe_status ?? "").toLowerCase();
  return Boolean(row.canceled_at || status === "canceled" || status === "unpaid" || status === "incomplete_expired");
}

function isFilterMatch(row: SubscriptionRowData, filter: MemberFilter): boolean {
  const status = (row.stripe_status ?? "").toLowerCase();
  const kind = row.membership_kind ?? "standard";
  switch (filter) {
    case "all":
      return true;
    case "standard":
      return kind === "standard";
    case "commitment":
      return kind === "commitment";
    case "commitment_completed":
      return kind === "commitment_completed";
    case "past_due":
      return status === "past_due" || status === "unpaid";
    case "canceled":
      return isCanceled(row);
  }
}

function MembershipCell({ row }: { row: SubscriptionRowData }) {
  const kind = (row.membership_kind ?? "standard") as string;
  const month = commitmentMonthOf(row.commitment_start_date, row.commitment_end_date);
  return (
    <div className="min-w-[180px]">
      <div className="flex items-center gap-2">
        <span className="font-medium text-slate-100">
          {kind === "commitment" ? "3-Month Commitment" : kind === "commitment_completed" ? "Monthly · Commitment done" : "Standard Monthly"}
        </span>
        {kind === "commitment" ? (
          <span className="inline-flex rounded-full border border-amber-500/25 bg-amber-500/10 px-2 py-0.5 text-[10px] font-semibold text-amber-300">
            {month ? `Month ${month} of 3` : "Commitment"}
          </span>
        ) : null}
      </div>
      <div className="mt-1 text-xs text-slate-400">
        {row.current_monthly_price_cents != null
          ? fmtUsd(row.current_monthly_price_cents / 100) + "/mo"
          : row.source === "stripe"
            ? "rate n/a"
            : "comped"}
      </div>
      {kind === "commitment" && row.standard_rate_start_date ? (
        <div className="text-[11px] text-slate-500">$150/mo from {new Date(row.standard_rate_start_date).toLocaleDateString()}</div>
      ) : null}
      {kind === "commitment" && row.commitment_start_date && row.commitment_end_date ? (
        <div className="text-[11px] text-slate-600">
          {new Date(row.commitment_start_date).toLocaleDateString()} → {new Date(row.commitment_end_date).toLocaleDateString()}
        </div>
      ) : null}
    </div>
  );
}

function BillingCell({ row }: { row: SubscriptionRowData }) {
  const status = (row.stripe_status ?? "").toLowerCase();
  const canceling = Boolean(row.cancel_at_period_end || row.cancel_at);
  const canceled = isCanceled(row);

  let badge: { text: string; cls: string } | null = null;
  if (canceled) badge = { text: "Canceled", cls: "bg-white/10 text-slate-300" };
  else if (status === "past_due" || status === "unpaid")
    badge = { text: "Past due", cls: "border border-rose-500/30 bg-rose-500/10 text-rose-300" };
  else if (canceling) badge = { text: "Canceling", cls: "border border-amber-500/30 bg-amber-500/10 text-amber-300" };
  else if (status === "active" || status === "trialing")
    badge = { text: "Active", cls: "border border-emerald-500/25 bg-emerald-500/10 text-emerald-300" };
  else if (status) badge = { text: status, cls: "border border-slate-500/25 bg-slate-500/10 text-slate-300" };

  return (
    <div className="min-w-[210px]">
      {badge ? (
        <span className={`inline-flex rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide ${badge.cls}`}>
          {badge.text}
        </span>
      ) : null}
      {row.current_period_end ? (
        <div className="mt-1 text-[11px] text-slate-500">Next billing: {new Date(row.current_period_end).toLocaleDateString()}</div>
      ) : null}
      {row.stripe_customer_id ? <div className="mt-1 font-mono text-[10px] text-slate-600">cus: {row.stripe_customer_id}</div> : null}
      {row.stripe_subscription_id ? (
        <div className="font-mono text-[10px] text-slate-600">sub: {row.stripe_subscription_id}</div>
      ) : null}
      {row.stripe_subscription_schedule_id ? (
        <div className="font-mono text-[10px] text-amber-700/90">sched: {row.stripe_subscription_schedule_id}</div>
      ) : null}
    </div>
  );
}

const FILTER_VALUES: MemberFilter[] = ["all", "standard", "commitment", "commitment_completed", "past_due", "canceled"];

export default async function AdminUsersPage({ searchParams }: { searchParams: Promise<{ filter?: string }> }) {
  const { supabase, userId: currentUserId } = await requirePlatformAdmin();
  const service = createServiceRoleClient();
  const { filter: filterParam } = await searchParams;
  const filter: MemberFilter = FILTER_VALUES.includes(filterParam as MemberFilter) ? (filterParam as MemberFilter) : "all";

  const [usersResult, plansResult, discountsResult, subsResult, authUsersResult] = await Promise.all([
    supabase.from("users").select("id, email, platform_admin, created_at").is("deleted_at", null).order("created_at"),
    supabase.from("membership_plans").select("id, name, monthly_price_cents").eq("is_active", true).order("sort_order"),
    supabase.from("discounts").select("id, name").eq("is_active", true).order("percent_off"),
    supabase
      .from("user_subscriptions")
      .select(
        "user_id, plan_id, discount_id, canceled_at, source, stripe_subscription_id, stripe_customer_id, stripe_status, stripe_subscription_schedule_id, membership_kind, current_monthly_price_cents, commitment_start_date, commitment_end_date, standard_rate_start_date, current_period_end, cancel_at_period_end, cancel_at"
      ),
    service.auth.admin.listUsers({ page: 1, perPage: 1000 }),
  ]);

  if (usersResult.error) throw new Error(usersResult.error.message);
  if (plansResult.error) throw new Error(plansResult.error.message);
  if (discountsResult.error) throw new Error(discountsResult.error.message);
  if (subsResult.error) throw new Error(subsResult.error.message);
  if (authUsersResult.error) throw new Error(authUsersResult.error.message);

  const userRows = (usersResult.data ?? []) as UserRow[];
  const subByUser = new Map(
    (subsResult.data ?? []).map((s) => [s.user_id as string, s as SubscriptionRowData])
  );
  const authByUser = new Map(authUsersResult.data.users.map((user) => [user.id, user]));
  const adminCount = userRows.filter((user) => user.platform_admin).length;
  const pendingAdminCount = userRows.filter((user) => user.platform_admin && !authByUser.get(user.id)?.last_sign_in_at).length;

  const visibleUsers =
    filter === "all"
      ? userRows
      : userRows.filter((user) => {
          const sub = subByUser.get(user.id);
          return sub ? isFilterMatch(sub, filter) : false;
        });
  const filteredCountText = `${filter === "all" ? userRows.length : visibleUsers.length} shown`;

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

      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h2 className="text-lg font-semibold text-white">Users, roles &amp; subscriptions</h2>
          <p className="text-sm text-slate-500">
            Change platform access, assign a membership plan, or apply an optional discount. Role changes take effect immediately.
          </p>
        </div>
      </div>

      {/* Membership filters */}
      <div className="flex flex-wrap items-center gap-2">
        <span className="inline-flex items-center gap-1.5 text-[11px] uppercase tracking-wider text-slate-500">
          <Filter className="h-3.5 w-3.5" aria-hidden /> Filter <span className="text-slate-600">({filteredCountText})</span>
        </span>
        {FILTERS.map((f) => (
          <a
            key={f.value}
            href={`/admin/users${f.value === "all" ? "" : `?filter=${f.value}`}`}
            className={[
              "rounded-full border px-3 py-1 text-[11px] font-medium transition-colors",
              filter === f.value
                ? "border-amber-400/50 bg-amber-500/15 text-amber-300"
                : "border-white/10 bg-white/[0.03] text-slate-400 hover:text-slate-200",
            ].join(" ")}
          >
            {f.label}
          </a>
        ))}
      </div>

      <Card dark className="p-0 overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full min-w-[1250px] text-sm">
            <thead className="border-b border-amber-500/15 bg-black/30">
              <tr className="text-left text-[11px] uppercase tracking-wider text-slate-500">
                <th className="px-5 py-3">User</th>
                <th className="px-5 py-3">Access status</th>
                <th className="px-5 py-3">Membership</th>
                <th className="px-5 py-3">Billing</th>
                <th className="px-5 py-3">Plan / discount</th>
                <th className="px-5 py-3">Platform role</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-white/5">
              {visibleUsers.map((user) => {
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
                      {subscription ? <MembershipCell row={subscription} /> : <span className="text-xs text-slate-600">—</span>}
                    </td>
                    <td className="px-5 py-4">
                      {subscription ? <BillingCell row={subscription} /> : <span className="text-xs text-slate-600">—</span>}
                    </td>
                    <td className="px-5 py-4">
                      <SubscriptionRow
                        userId={user.id}
                        userEmail={user.email}
                        currentPlanId={(subscription?.plan_id as string) ?? null}
                        currentDiscountId={(subscription?.discount_id as string) ?? null}
                        canceledAt={(subscription?.canceled_at as string) ?? null}
                        isLiveStripeSubscription={subscription?.source === "stripe" && Boolean(subscription?.stripe_subscription_id)}
                        plans={plansResult.data ?? []}
                        discounts={discountsResult.data ?? []}
                      />
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
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </Card>
      <p className="text-xs text-slate-600">
        Plan prices: {(plansResult.data ?? []).map((plan) => `${plan.name} ${fmtUsd(plan.monthly_price_cents / 100)}/mo`).join(" · ")}
      </p>
    </div>
  );
}

