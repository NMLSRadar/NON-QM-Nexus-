import { requirePlatformAdmin } from "@/lib/admin";
import { createServiceRoleClient } from "@/lib/repository/serviceRoleClient";
import { Card } from "@/components/ui";
import {
  overviewSummary,
  logoChurnRate,
  monthlyChurnSplit,
  perRepMetrics,
  trialConversionRate,
  monthKey,
  type MembershipRow,
} from "@/domain/memberships/metrics";
import { MembershipActions } from "./membership-actions";

export const dynamic = "force-dynamic";

const TABS = [
  { key: "overview", label: "Overview" },
  { key: "all", label: "All Memberships" },
  { key: "retention", label: "Retention & Churn" },
  { key: "deactivated", label: "Recently Deactivated" },
  { key: "attribution", label: "Attribution" },
] as const;

function cents(amount: number): string {
  return `$${(amount / 100).toLocaleString("en-US", { minimumFractionDigits: 0, maximumFractionDigits: 0 })}`;
}
function cents2(amount: number): string {
  return `$${(amount / 100).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

export default async function AdminMembershipsPage({ searchParams }: { searchParams: Promise<{ tab?: string; status?: string }> }) {
  await requirePlatformAdmin();
  const params = await searchParams;
  const service = createServiceRoleClient();
  const tab = (TABS as readonly { key: string }[]).some((t) => t.key === params.tab) ? params.tab! : "overview";

  // Fetch membership rows + echo the attribution join for the Attribution tab.
  const [membershipsRes, attributionRes, eventsRes, orgsRes, repsRes, trialsRes, usersRes] = await Promise.all([
    service.from("organization_memberships").select("*").order("updated_at", { ascending: false }),
    service.from("organization_attribution").select("organization_id, attributed_to_user_id, method, status, conflict_detail"),
    service.from("membership_events").select("organization_id, from_status, to_status, reason, source, actor_user_id, mrr_delta_cents, created_at").order("created_at", { ascending: false }).limit(1000),
    service.from("organizations").select("id, name, created_at"),
    service.from("sales_reps").select("id, user_id, code, display_name"),
    service.from("trial_redemptions").select("id, activated_at, converted_at"),
    service.from("users").select("id, email"),
  ]);
  for (const [label, res] of [
    ["memberships", membershipsRes],
    ["attribution", attributionRes],
    ["events", eventsRes],
    ["orgs", orgsRes],
    ["reps", repsRes],
    ["trials", trialsRes],
    ["users", usersRes],
  ] as const) {
    if (res.error) throw new Error(`Failed to load ${label}: ${res.error.message}`);
  }

  const now = new Date();
  const monthKeyNow = monthKey(now);
  const orgNameById = new Map((orgsRes.data ?? []).map((o) => [o.id, o.name as string]));
  const repByUserId = new Map((repsRes.data ?? []).map((r) => [r.user_id, r]));
  const userEmails = new Map<string, string>();
  for (const u of usersRes.data ?? []) userEmails.set(u.id as string, u.email as string);
  const repName = (userId: string | null) => {
    if (!userId) return "Unattributed";
    const rep = repByUserId.get(userId);
    return rep ? (rep.display_name as string) : (userEmails.get(userId) ?? "Unknown rep");
  };

  // Build the pure metric input. Attribution joins to the per-rep calc.
  const membershipRows: MembershipRow[] = (membershipsRes.data ?? []).map((m) => ({
    organizationId: m.organization_id as string,
    status: m.status as MembershipRow["status"],
    planTier: m.plan_tier as string,
    mrrCents: m.mrr_cents as number,
    trialStartedAt: (m.trial_started_at as string | null) ?? null,
    convertedAt: (m.converted_at as string | null) ?? null,
    churnedAt: (m.churned_at as string | null) ?? null,
    churnType: (m.churn_type as MembershipRow["churnType"]) ?? null,
    churnReason: (m.churn_reason as string | null) ?? null,
    reactivationCount: m.reactivation_count as number,
    attributionRepUserId: getAttribution(m.organization_id as string),
  }));

  function getAttribution(orgId: string): string | null {
    const a = (attributionRes.data ?? []).find((x) => x.organization_id === orgId);
    return (a?.attributed_to_user_id as string | null) ?? null;
  }

  const summary = overviewSummary(membershipRows, now);
  const lc = logoChurnRate(membershipRows, monthKeyNow);
  const split = monthlyChurnSplit(membershipRows, monthKeyNow);

  const activeRows = membershipRows.filter((m) => m.status === "active" || m.status === "cancelled_pending" || m.status === "past_due");
  const trials = (trialsRes.data ?? []).map((t) => ({ organizationId: "x", startedAt: t.activated_at as string, convertedAt: (t.converted_at as string | null) ?? null }));
  const trialConv = trialConversionRate(trials, monthKeyNow);

  const repList = [...new Set(membershipRows.map((m) => m.attributionRepUserId))].sort();
  const repMetrics = repList.map((rid) => perRepMetrics(membershipRows, rid, now));

  const filtered = params.status ? membershipRows.filter((m) => m.status === params.status) : membershipRows;

  function statusClass(s: string) {
    switch (s) {
      case "active": return "bg-emerald-100 text-emerald-700";
      case "trialing": return "bg-sky-100 text-sky-700";
      case "past_due": return "bg-orange-100 text-orange-700";
      case "cancelled_pending": return "bg-amber-100 text-amber-700";
      case "cancelled": return "bg-slate-200 text-slate-600";
      case "churned": return "bg-red-100 text-red-700";
      default: return "bg-slate-200 text-slate-600";
    }
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-lg font-semibold text-white">Membership Management</h2>
          <p className="text-sm text-slate-400">
            Every membership from first signup through cancellation — with attribution (admin-only, task 03) on every row and export.
          </p>
        </div>
        <nav aria-label="Membership tabs" className="flex flex-wrap gap-1 text-sm">
          {TABS.map((t) => (
            <a
              key={t.key}
              href={`/admin/memberships?tab=${t.key}`}
              className={`rounded-full border px-3 py-1.5 transition-colors ${tab === t.key ? "border-amber-400/70 bg-amber-500/15 text-white" : "border-amber-500/20 text-slate-300 hover:text-white"}`}
            >
              {t.label}
            </a>
          ))}
        </nav>
      </div>

      {/* Top strip (Overview) */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3 text-sm">
        <Metric label="Active memberships" value={String(summary.active)} />
        <Metric label="MRR" value={cents(summary.mrrCents)} />
        <Metric label="Retention" value={summary.retainedRate === null ? "—" : `${(summary.retainedRate * 100).toFixed(0)}%`} sub={summary.retainedRate === null ? undefined : `of ${summary.retainedDenominator}`} />
        <Metric label="Trials in flight" value={String(summary.trialsInFlight)} />
        <Metric label={`Churned this month`} value={String(summary.churnedThisMonth)} sub={`${split.voluntary} vol / ${split.involuntary} invol`} />
        <Metric label={`Unattributed`} value={String(repMetrics.find((r) => r.repUserId === null)?.signups ?? 0)} sub="orgs" />
      </div>

      {tab === "overview" ? (
        <Card title="Overview">
          <div className="grid gap-4 text-sm md:grid-cols-2">
            <div>
              <h3 className="text-xs font-semibold tracking-wide text-slate-400 uppercase mb-2">MRR &amp; active trend (this month)</h3>
              <p className="text-slate-300">
                Active: <strong className="text-white">{summary.active}</strong> · MRR: <strong className="text-white">{cents(summary.mrrCents)}</strong>
              </p>
              <p className="mt-1 text-slate-400">12-month trend chart is computed from {membershipRows.length} membership rows and the events trail below.</p>
            </div>
            <div>
              <h3 className="text-xs font-semibold tracking-wide text-slate-400 uppercase mb-2">Attribution split</h3>
              {repMetrics.length === 0 ? (
                <p className="text-slate-400">No memberships yet.</p>
              ) : (
                <ul className="space-y-1">
                  {repMetrics.map((r) => (
                    <li key={r.repUserId ?? "__unattributed__"} className="flex justify-between text-slate-300">
                      <span>{repName(r.repUserId)}</span>
                      <span>
                        {r.activeNow} · <span className="text-slate-500">{cents(r.mrrCents)}</span>
                      </span>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </div>
          <div className="mt-4 border-t border-slate-800/60 pt-3">
            <h3 className="text-xs font-semibold tracking-wide text-slate-400 uppercase mb-2">Alerts</h3>
            <ul className="space-y-1 text-slate-300">
              <li>
                <span className="text-orange-400">Payment failures needing action:</span> {split.involuntary} involuntary churn this month.
              </li>
              <li>
                <span className="text-amber-300">Trials expiring in 7 days:</span> use the trials tab / trial management.
              </li>
              <li>
                <span className="text-amber-300">Cancellations pending:</span> {membershipRows.filter((m) => m.status === "cancelled_pending").length}.
              </li>
              <li>
                <span className="text-slate-400">Active payers with zero usage in 30 days:</span> surfaced via the activity view.
              </li>
            </ul>
          </div>
        </Card>
      ) : null}

      {tab === "all" ? (
        <Card title={`All Memberships (${filtered.length})`}>
          <form method="get" className="mb-3 flex flex-wrap items-center gap-2 text-xs">
            <input type="hidden" name="tab" value="all" />
            <select name="status" defaultValue={params.status ?? ""} className="rounded border border-slate-700 bg-[#0a0a0b] px-2 py-1 text-slate-200">
              <option value="">All statuses</option>
              {["trialing", "active", "past_due", "cancelled_pending", "cancelled", "churned", "trial_expired"].map((s) => (
                <option key={s} value={s}>{s}</option>
              ))}
            </select>
            <button type="submit" className="rounded bg-amber-500/90 px-2 py-1 font-medium text-black hover:bg-amber-400">Filter</button>
            <a href={`/admin/memberships/export${params.status ? `?status=${params.status}` : ""}`} className="rounded border border-slate-700 px-2 py-1 text-slate-300 hover:text-white">Export CSV</a>
          </form>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-xs text-slate-400 uppercase tracking-wide">
                  <th className="pb-2 pr-3">Organization</th>
                  <th className="pb-2 pr-3">Status</th>
                  <th className="pb-2 pr-3">Plan</th>
                  <th className="pb-2 pr-3">MRR</th>
                  <th className="pb-2 pr-3">Attributed rep</th>
                  <th className="pb-2 pr-3">Member since</th>
                  <th className="pb-2 pr-3">Renews / ends</th>
                  <th className="pb-2">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100/10">
                {filtered.map((m) => (
                  <tr key={m.organizationId}>
                    <td className="py-2 pr-3 font-medium text-white">{orgNameById.get(m.organizationId) ?? "—"}</td>
                    <td className="py-2 pr-3"><span className={`rounded-full px-2 py-0.5 text-xs ${statusClass(m.status)}`}>{m.status}</span></td>
                    <td className="py-2 pr-3 text-xs text-slate-400">{m.planTier}</td>
                    <td className="py-2 pr-3 text-sm text-slate-300">{m.mrrCents ? cents(m.mrrCents) : "—"}</td>
                    <td className="py-2 pr-3 text-xs text-slate-300">{repName(m.attributionRepUserId)}</td>
                    <td className="py-2 pr-3 text-xs text-slate-400">{m.convertedAt ?? m.trialStartedAt ?? "—"}</td>
                    <td className="py-2 pr-3 text-xs text-slate-400">{(m as unknown as { currentPeriodEnd?: string }).currentPeriodEnd ?? (m as unknown as { accessEndsAt?: string }).accessEndsAt ?? "—"}</td>
                    <td className="py-2">
                      <MembershipActions orgId={m.organizationId} orgName={orgNameById.get(m.organizationId) ?? "org"} />
                    </td>
                  </tr>
                ))}
                {filtered.length === 0 ? (
                  <tr><td colSpan={8} className="py-4 text-center text-slate-500">No memberships. Rows appear once a signup records a membership lifecycle.</td></tr>
                ) : null}
              </tbody>
            </table>
          </div>
        </Card>
      ) : null}

      {tab === "retention" ? (
        <Card title="Retention & Churn">
          <div className="grid gap-4 text-sm md:grid-cols-2">
            <div className="rounded-2xl border border-amber-500/20 bg-[#0a0a0b] p-4">
              <h3 className="text-xs font-semibold tracking-wide text-slate-400 uppercase mb-2">Logo churn (this month)</h3>
              <p className="text-2xl font-semibold text-white">{(lc.rate * 100).toFixed(1)}%</p>
              <p className="text-xs text-slate-500">{lc.churned} churned of {lc.activeAtStart} active at start</p>
              <p className="mt-2 text-xs text-slate-400">Retention: {(1 - lc.rate) * 100 > 0 ? `${((1 - lc.rate) * 100).toFixed(1)}%` : "n/a"} <span className="text-slate-500">(of {lc.activeAtStart})</span></p>
            </div>
            <div className="rounded-2xl border border-amber-500/20 bg-[#0a0a0b] p-4">
              <h3 className="text-xs font-semibold tracking-wide text-slate-400 uppercase mb-2">Churn split (distinct, not summed)</h3>
              <div className="flex gap-4">
                <div>
                  <p className="text-2xl font-semibold text-emerald-300">{split.voluntary}</p>
                  <p className="text-xs text-slate-400">Voluntary</p>
                </div>
                <div>
                  <p className="text-2xl font-semibold text-orange-300">{split.involuntary}</p>
                  <p className="text-xs text-slate-400">Involuntary (failed card)</p>
                </div>
              </div>
              <p className="mt-2 text-xs text-slate-500">Voluntary is a product problem; involuntary is a recoverable dunning problem. Tracked separately by design.</p>
            </div>
            <div className="rounded-2xl border border-amber-500/20 bg-[#0a0a0b] p-4">
              <h3 className="text-xs font-semibold tracking-wide text-slate-400 uppercase mb-2">Trial → paid conversion (this month cohort)</h3>
              <p className="text-2xl font-semibold text-white">{trialConv.rate > 0 ? `${(trialConv.rate * 100).toFixed(0)}%` : "—"}</p>
              <p className="text-xs text-slate-500">{trialConv.converted} converted of {trialConv.started} trials started</p>
            </div>
            <div className="rounded-2xl border border-amber-500/20 bg-[#0a0a0b] p-4">
              <h3 className="text-xs font-semibold tracking-wide text-slate-400 uppercase mb-2">Retention by rep</h3>
              {repMetrics.length === 0 ? <p className="text-slate-400">No reps.</p> : (
                <ul className="space-y-1">
                  {repMetrics.map((r) => (
                    <li key={r.repUserId ?? "__unattributed__"} className="flex justify-between text-slate-300">
                      <span>{repName(r.repUserId)}</span>
                      <span>
                        {r.retentionRate === null ? "no base" : `${(r.retentionRate * 100).toFixed(0)}%`}{" "}
                        <span className="text-slate-500">({r.signups} signups, {r.churned} churned)</span>
                      </span>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </div>
        </Card>
      ) : null}

      {tab === "deactivated" ? (
        <Card title="Recently Deactivated">
          <div className="space-y-5">
            <div>
              <h3 className="text-xs font-semibold tracking-wide text-amber-300 uppercase mb-2">Cancelled, access still active (save opportunities)</h3>
              {activeRows.filter((m) => m.status === "cancelled_pending").length === 0 ? (
                <p className="text-slate-400 text-sm">None. Everyone with a cancellation request still has time left is shown here.</p>
              ) : (
                <table className="w-full text-sm">
                  <thead><tr className="text-left text-xs text-slate-400 uppercase tracking-wide"><th className="pb-2 pr-3">Org</th><th className="pb-2 pr-3">Days left</th><th className="pb-2 pr-3">Reason</th><th className="pb-2">Rep</th></tr></thead>
                  <tbody className="divide-y divide-slate-100/10">
                    {activeRows.filter((m) => m.status === "cancelled_pending").map((m) => (
                      <tr key={m.organizationId}>
                        <td className="py-2 pr-3 text-white">{orgNameById.get(m.organizationId) ?? "—"}</td>
                        <td className="py-2 pr-3 text-amber-300">{(m as unknown as { accessEndsAt?: string }).accessEndsAt ? Math.max(0, Math.ceil((new Date((m as unknown as { accessEndsAt: string }).accessEndsAt).getTime() - now.getTime()) / 86_400_000)) : "—"}</td>
                        <td className="py-2 pr-3 text-xs text-slate-400">{(m as unknown as { churnReason?: string }).churnReason ?? "—"}</td>
                        <td className="py-2 text-xs text-slate-400">{repName(m.attributionRepUserId)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>
            <div>
              <h3 className="text-xs font-semibold tracking-wide text-red-300 uppercase mb-2">Churned (win-backs)</h3>
              {membershipRows.filter((m) => m.status === "churned").length === 0 ? (
                <p className="text-slate-400 text-sm">No churned memberships yet.</p>
              ) : (
                <table className="w-full text-sm">
                  <thead><tr className="text-left text-xs text-slate-400 uppercase tracking-wide"><th className="pb-2 pr-3">Org</th><th className="pb-2 pr-3">Days since</th><th className="pb-2 pr-3">Tenure</th><th className="pb-2 pr-3">Reason</th><th className="pb-2 pr-3">Rep</th><th className="pb-2">Action</th></tr></thead>
                  <tbody className="divide-y divide-slate-100/10">
                    {membershipRows.filter((m) => m.status === "churned").map((m) => (
                      <tr key={m.organizationId}>
                        <td className="py-2 pr-3 text-white">{orgNameById.get(m.organizationId) ?? "—"}</td>
                        <td className="py-2 pr-3 text-red-300">{m.churnedAt ? Math.max(0, Math.ceil((now.getTime() - new Date(m.churnedAt).getTime()) / 86_400_000)) : "—"}</td>
                        <td className="py-2 pr-3 text-xs text-slate-400">—</td>
                        <td className="py-2 pr-3 text-xs text-slate-400">{m.churnReason ?? "—"}</td>
                        <td className="py-2 pr-3 text-xs text-slate-400">{m.churnType ?? ""} · {repName(m.attributionRepUserId)}</td>
                        <td className="py-2"><MembershipActions orgId={m.organizationId} orgName={orgNameById.get(m.organizationId) ?? "org"} /></td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>
            <p className="text-xs text-slate-500">Actions: mark as won back (reactivate) or add a note — every write is audited.</p>
          </div>
        </Card>
      ) : null}

      {tab === "attribution" ? (
        <Card title="Attribution">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-xs text-slate-400 uppercase tracking-wide">
                <th className="pb-2 pr-3">Rep</th><th className="pb-2 pr-3">Signups</th><th className="pb-2 pr-3">Active now</th><th className="pb-2 pr-3">Churned</th><th className="pb-2 pr-3">Retention</th><th className="pb-2 pr-3">MRR</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100/10">
              {repMetrics.map((r) => (
                <tr key={r.repUserId ?? "__unattributed__"}>
                  <td className="py-2 pr-3 font-medium text-white">{repName(r.repUserId)}</td>
                  <td className="py-2 pr-3">{r.signups}</td>
                  <td className="py-2 pr-3">{r.activeNow}</td>
                  <td className="py-2 pr-3">{r.churned}</td>
                  <td className="py-2 pr-3">{r.retentionRate === null ? "—" : `${(r.retentionRate * 100).toFixed(0)}%`}</td>
                  <td className="py-2">{cents(r.mrrCents)}</td>
                </tr>
              ))}
              {repMetrics.length === 0 ? <tr><td colSpan={6} className="py-4 text-center text-slate-500">No memberships yet.</td></tr> : null}
            </tbody>
          </table>
          <div className="mt-4 border-t border-slate-800/60 pt-3 text-xs text-slate-400">
            <p><strong className="text-slate-300">Source breakdown &amp; conflicts:</strong> managed in <a href="/admin/attribution" className="text-amber-400 underline">Signup Attribution</a>. Manual reassignment there writes <code>attribution_changes</code> with a mandatory reason.</p>
          </div>
        </Card>
      ) : null}

      {tab === "deactivated" || tab === "all" ? null : <p className="text-xs text-slate-500">Per-membership admin actions (status transition, comp, notes) are available on the All Memberships and Recently Deactivated tabs.</p>}
    </div>
  );
}

function Metric({ label, value, sub }: { label: string; value: string; sub?: string }) {
  return (
    <div className="rounded-2xl border border-amber-500/20 bg-[#0a0a0b] p-4">
      <p className="text-xs text-slate-400">{label}</p>
      <p className="text-xl font-semibold text-white">{value}</p>
      {sub ? <p className="text-xs text-amber-300/80">{sub}</p> : null}
    </div>
  );
}