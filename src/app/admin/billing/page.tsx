import Link from "next/link";
import { AlertTriangle, DollarSign, TrendingUp, Users } from "lucide-react";
import { requirePlatformAdmin } from "@/lib/admin";
import { createServiceRoleClient } from "@/lib/repository/serviceRoleClient";
import { Card, fmtUsd, fmtPct } from "@/components/ui";
import {
  getBillingOverview,
  getDunningQueue,
  getRecentBillingEvents,
  getRecentCancellations,
  getRetentionSeries,
} from "@/lib/billingAnalytics";

export const dynamic = "force-dynamic";

const STATUS_LABEL: Record<string, { label: string; className: string }> = {
  past_due: { label: "Past due", className: "border-rose-500/25 bg-rose-500/10 text-rose-300" },
  unpaid: { label: "Unpaid", className: "border-rose-500/25 bg-rose-500/10 text-rose-300" },
  incomplete: { label: "Incomplete", className: "border-amber-500/25 bg-amber-500/10 text-amber-300" },
  incomplete_expired: { label: "Expired", className: "border-slate-500/25 bg-slate-500/10 text-slate-300" },
};

const EVENT_LABEL: Record<string, { label: string; className: string }> = {
  payment_failed: { label: "Payment declined", className: "border-rose-500/25 bg-rose-500/10 text-rose-300" },
  payment_succeeded: { label: "Payment recovered", className: "border-emerald-500/25 bg-emerald-500/10 text-emerald-300" },
  membership_started: { label: "Membership started", className: "border-sky-500/25 bg-sky-500/10 text-sky-300" },
  membership_canceled: { label: "Membership ended", className: "border-slate-500/25 bg-slate-500/10 text-slate-300" },
  cancel_requested: { label: "Cancel requested", className: "border-amber-500/25 bg-amber-500/10 text-amber-300" },
  cancel_revoked: { label: "Cancel revoked", className: "border-emerald-500/25 bg-emerald-500/10 text-emerald-300" },
};

const DEFAULT_EVENT_STYLE: { label: string; className: string } = { label: "Billing event", className: "border-slate-500/25 bg-slate-500/10 text-slate-300" };

function eventStyle(eventType: string): { label: string; className: string } {
  return EVENT_LABEL[eventType] ?? DEFAULT_EVENT_STYLE;
}

function fmtDate(iso: string | null | undefined): string {
  if (!iso) return "—";
  return new Date(iso).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
}

function fmtDateTime(iso: string | null | undefined): string {
  if (!iso) return "—";
  return new Date(iso).toLocaleString("en-US", { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" });
}

/** Mini 12-month retention bar chart — pure CSS so the admin page stays
 * dependency-free. Each bar is a month; gold = retained, slate = churned. */
function RetentionBars({ series }: { series: Array<{ month: string; retentionRate: number; churnRate: number }> }) {
  const max = 1;
  return (
    <div className="flex items-end gap-1.5 h-32" aria-label="Monthly retention rate chart">
      {series.map((point) => {
        const retainedHeight = Math.round((point.retentionRate / max) * 100);
        return (
          <div key={point.month} className="flex flex-1 flex-col items-center gap-1 group" title={`${point.month}: ${fmtPct(point.retentionRate * 100, 1)} retained`}>
            <div className="flex w-full flex-col-reverse items-center h-24">
              <div className="w-full rounded-t-sm bg-slate-700/50" style={{ height: `${Math.max(4, 100 - retainedHeight)}%` }} />
              <div className="w-full rounded-t-sm bg-gradient-to-t from-amber-600 to-amber-300 transition-all group-hover:brightness-110" style={{ height: `${retainedHeight}%` }} />
            </div>
            <span className="text-[9px] text-slate-600">{point.month.slice(2)}</span>
          </div>
        );
      })}
    </div>
  );
}

export default async function AdminBillingPage() {
  await requirePlatformAdmin();
  const supabase = createServiceRoleClient();

  const [overview, dunning, events, cancellations, retention] = await Promise.all([
    getBillingOverview(supabase),
    getDunningQueue(supabase),
    getRecentBillingEvents(supabase),
    getRecentCancellations(supabase),
    getRetentionSeries(supabase, 12),
  ]);

  const kpiCards = [
    {
      label: "Active members",
      value: String(overview.activeMembers),
      sub: `${overview.activeStripe} on a live Stripe subscription`,
      icon: Users,
      href: "/admin/users",
    },
    {
      label: "Monthly recurring revenue",
      value: fmtUsd(overview.mrrCents / 100),
      sub: "live subscriptions, current price",
      icon: DollarSign,
      href: null,
    },
    {
      label: "Declined right now",
      value: String(overview.inDunning),
      sub: `${overview.recentFailures7d} payments failed in 7 days`,
      icon: AlertTriangle,
      href: null,
      danger: overview.inDunning > 0,
    },
    {
      label: "Cancel requested",
      value: String(overview.cancelRequestedNow),
      sub: "At-period-end cancels (save targets)",
      icon: TrendingUp,
      href: null,
    },
  ];

  return (
    <div className="space-y-5">
      <div>
        <h2 className="text-lg font-semibold text-white">Billing &amp; Retention</h2>
        <p className="text-sm text-slate-500">
          Every declined payment, daily dunning email, membership start/cancel, and the resulting retention rate — updated automatically by the Stripe webhook and the daily{" "}
          <code className="rounded bg-amber-500/10 px-1 py-0.5 text-[11px] text-amber-300">billing-dunning</code> cron (see{" "}
          <Link href="/docs" className="text-amber-300 underline">docs/billing-runbook.md</Link>).
        </p>
      </div>

      {/* KPI cards */}
      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        {kpiCards.map((card) => (
          <Card key={card.label} dark className={card.danger ? "border-rose-500/40" : ""}>
            <div className="flex items-center gap-3">
              <span className={`flex h-10 w-10 items-center justify-center rounded-full ring-1 ${card.danger ? "bg-rose-500/10 text-rose-300 ring-rose-500/25" : "bg-amber-500/10 text-amber-300 ring-amber-500/20"}`}>
                <card.icon className="h-5 w-5" aria-hidden />
              </span>
              <div>
                <p className="text-2xl font-semibold text-white">{card.value}</p>
                <p className="text-[11px] uppercase tracking-wider text-slate-500">{card.label}</p>
              </div>
            </div>
            {card.sub ? <p className="mt-2 text-xs text-slate-500">{card.sub}</p> : null}
          </Card>
        ))}
      </div>

      <div className="grid gap-4 lg:grid-cols-3">
        {/* Declined right now */}
        <Card dark title="Declined payments — dunning queue" className="lg:col-span-2">
          {dunning.length === 0 ? (
            <p className="text-sm text-slate-500">No failed payments right now. Every declined card payment lands here, and the member automatically gets one follow-up email per day until it&apos;s resolved.</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full min-w-[640px] text-sm">
                <thead className="border-b border-amber-500/15 bg-black/30 text-left text-[11px] uppercase tracking-wider text-slate-500">
                  <tr>
                    <th className="px-4 py-2.5">Member</th>
                    <th className="px-4 py-2.5">Status</th>
                    <th className="px-4 py-2.5">Declines</th>
                    <th className="px-4 py-2.5">Last failed</th>
                    <th className="px-4 py-2.5">Next attempt</th>
                    <th className="px-4 py-2.5">Emails sent</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-white/5">
                  {dunning.map((d) => (
                    <tr key={d.subscriptionId} className="hover:bg-white/[0.02]">
                      <td className="px-4 py-3">
                        <div className="font-medium text-slate-100">{d.displayName || d.email}</div>
                        <div className="text-[11px] text-slate-600">{d.planName ?? "No plan"}</div>
                      </td>
                      <td className="px-4 py-3">
                        <span className={`inline-flex rounded-full border px-2 py-0.5 text-[11px] font-medium ${STATUS_LABEL[d.stripeStatus ?? ""]?.className ?? "border-slate-500/25 bg-slate-500/10 text-slate-300"}`}>
                          {STATUS_LABEL[d.stripeStatus ?? ""]?.label ?? d.stripeStatus}
                        </span>
                      </td>
                      <td className="px-4 py-3">{d.declineCount}</td>
                      <td className="px-4 py-3 text-slate-400">{fmtDateTime(d.lastPaymentFailedAt)}</td>
                      <td className="px-4 py-3 text-slate-400">{fmtDateTime(d.nextPaymentAttemptAt)}</td>
                      <td className="px-4 py-3 text-slate-400">{d.dunningEmailCount}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </Card>

        {/* Recent payment activity */}
        <Card dark title="Recent payment activity">
          <div className="space-y-2.5">
            {events.length === 0 ? (
              <p className="text-sm text-slate-500">No payment events recorded yet. Once the webhook starts delivering invoice events, every decline and recovery shows here.</p>
            ) : (
              events.slice(0, 12).map((e) => {
                const style = eventStyle(e.eventType);
                return (
                  <div key={e.createdAt + e.eventType} className="flex items-start gap-2.5 border-b border-white/5 pb-2.5 last:border-0">
                    <span className={`mt-0.5 inline-flex rounded-full border px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide ${style.className}`}>{style.label}</span>
                    <div className="min-w-0 flex-1">
                      <div className="truncate text-xs text-slate-300">{e.email ?? "team subscription"}</div>
                      <div className="text-[11px] text-slate-600">
                        {fmtDateTime(e.createdAt)}
                        {e.amountCents ? ` · ${fmtUsd(e.amountCents / 100)}` : ""}
                        {e.failureCode ? ` · ${e.failureCode}` : ""}
                      </div>
                    </div>
                  </div>
                );
              })
            )}
          </div>
        </Card>
      </div>

      {/* Retention */}
      <Card dark title="Retention by month (12-month view)">
        <div className="grid gap-6 lg:grid-cols-5">
          <div className="lg:col-span-3">
            <RetentionBars series={retention} />
            <div className="mt-3 flex flex-wrap gap-x-5 gap-y-1 text-[11px] text-slate-500">
              <span className="inline-flex items-center gap-1.5"><span className="h-2 w-2 rounded-sm bg-gradient-to-t from-amber-600 to-amber-300" /> Retained</span>
              <span className="inline-flex items-center gap-1.5"><span className="h-2 w-2 rounded-sm bg-slate-700" /> Churned</span>
            </div>
          </div>
          <div className="lg:col-span-2 overflow-x-auto">
            <table className="w-full min-w-[320px] text-sm">
              <thead className="bg-black/30 text-left text-[11px] uppercase tracking-wider text-slate-500">
                <tr>
                  <th className="px-3 py-2">Month</th>
                  <th className="px-3 py-2 text-right">Active</th>
                  <th className="px-3 py-2 text-right">New</th>
                  <th className="px-3 py-2 text-right">Canceled</th>
                  <th className="px-3 py-2 text-right">Retention</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-white/5">
                {retention.map((point) => (
                  <tr key={point.month}>
                    <td className="px-3 py-2 text-slate-300">{point.month}</td>
                    <td className="px-3 py-2 text-right">{point.activeAtStart}</td>
                    <td className="px-3 py-2 text-right text-emerald-300">{point.newMembers > 0 ? `+${point.newMembers}` : "0"}</td>
                    <td className="px-3 py-2 text-right text-rose-300">{point.canceled > 0 ? `−${point.canceled}` : "0"}</td>
                    <td className="px-3 py-2 text-right font-medium text-amber-300">{fmtPct(point.retentionRate * 100, 1)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </Card>

      {/* Failure reasons + recent cancellations */}
      <div className="grid gap-4 lg:grid-cols-3">
        <Card dark title="Decline reasons (30 days)">
          {overview.failuresByReason.length === 0 ? (
            <p className="text-sm text-slate-500">No declines recorded in the last 30 days.</p>
          ) : (
            <div className="space-y-2">
              {overview.failuresByReason.slice(0, 8).map((item) => (
                <div key={item.reason} className="flex items-center justify-between gap-2 text-sm">
                  <span className="truncate font-mono text-[12px] text-slate-300">{item.reason}</span>
                  <span className="rounded-full bg-amber-500/10 px-2 py-0.5 text-xs text-amber-300">{item.count}</span>
                </div>
              ))}
            </div>
          )}
        </Card>

        <Card dark title="Recent cancellations" className="lg:col-span-2">
          {cancellations.length === 0 ? (
            <p className="text-sm text-slate-500">No canceled memberships on record. When a member cancels (at period end) or is canceled by a failed payment, they appear here with their tenure.</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full min-w-[560px] text-sm">
                <thead className="bg-black/30 text-left text-[11px] uppercase tracking-wider text-slate-500">
                  <tr>
                    <th className="px-4 py-2.5">Member</th>
                    <th className="px-4 py-2.5">Started</th>
                    <th className="px-4 py-2.5">Canceled</th>
                    <th className="px-4 py-2.5">Tenure</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-white/5">
                  {cancellations.map((c, i) => (
                    <tr key={`${c.email}-${c.canceledAt}`} className="hover:bg-white/[0.02]">
                      <td className="px-4 py-3">
                        <div className="font-medium text-slate-100">{c.email}</div>
                        <div className="text-[11px] text-slate-600">{c.planName ?? "—"}</div>
                      </td>
                      <td className="px-4 py-3 text-slate-400">{fmtDate(c.startedAt)}</td>
                      <td className="px-4 py-3 text-slate-400">{fmtDate(c.canceledAt)}</td>
                      <td className="px-4 py-3 text-slate-400">{c.tenureDays != null ? `${c.tenureDays}d` : "—"}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </Card>
      </div>
    </div>
  );
}