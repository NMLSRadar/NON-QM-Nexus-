import Link from "next/link";
import { UsersRound } from "lucide-react";
import { requirePlatformAdmin } from "@/lib/admin";
import { createServiceRoleClient } from "@/lib/repository/serviceRoleClient";
import { ACTIVITY_LABELS, ACTIVITY_EVENT_TYPES } from "@/lib/activity";
import { Card } from "@/components/ui";
import { ActivityTable } from "./activity-table";
import { ActivitySearch } from "./search-box";
import {
  type ActivityUserRow,
  type ActivityStatus,
  type ActivityFilter,
  type ActivitySort,
  FILTERS,
  SORTS,
  DAY_MS,
} from "./types";

export const dynamic = "force-dynamic";

const PAGE_SIZE = 25;

interface RawUser {
  id: string;
  email: string;
  created_at: string;
  is_beta_tester: boolean;
  beta_granted_at: string | null;
  user_profiles: { display_name: string | null; nmls_id: string | null } | Array<{ display_name: string | null; nmls_id: string | null }> | null;
  user_subscriptions:
    | {
        plan: { name: string; tier_level: number } | Array<{ name: string; tier_level: number }> | null;
        canceled_at: string | null;
        is_trial: boolean;
        trial_activated_at: string | null;
        trial_expires_at: string | null;
        started_at: string | null;
        source: string | null;
        current_period_end: string | null;
      }
    | Array<{
        plan: { name: string; tier_level: number } | Array<{ name: string; tier_level: number }> | null;
        canceled_at: string | null;
        is_trial: boolean;
        trial_activated_at: string | null;
        trial_expires_at: string | null;
        started_at: string | null;
        source: string | null;
        current_period_end: string | null;
      }>
    | null;
}

interface SummaryRow {
  user_id: string;
  logins: number;
  scenarios: number;
  voice_scenarios: number;
  ai_assistant: number;
  lender_list: number;
  programs: number;
  doc_needs: number;
  products: number;
  last_activity: string | null;
  last_login: string | null;
}

interface TimelineRow {
  user_id: string;
  event_type: string;
  occurred_at: string;
}

function asOne<T>(v: T | Array<T> | null | undefined): T | null {
  if (Array.isArray(v)) return v[0] ?? null;
  return v ?? null;
}

function deriveStatus(row: {
  canceledAt: string | null;
  isTrial: boolean;
  trialExpiresAt: string | null;
  planName: string | null;
  lastLogin: string | null;
  lastActivity: string | null;
}): ActivityStatus {
  const now = Date.now();
  const trialActive = row.isTrial && row.trialExpiresAt !== null && new Date(row.trialExpiresAt).getTime() > now;
  const trialExpired = row.trialExpiresAt !== null && new Date(row.trialExpiresAt).getTime() <= now;

  if (row.canceledAt && !trialActive) return "cancelled";
  if (trialActive && row.trialExpiresAt && new Date(row.trialExpiresAt).getTime() - now <= 7 * DAY_MS) return "trial_expiring";
  if (trialActive) return "trial";
  if (trialExpired) return "trial_expired";
  if (row.planName && !row.canceledAt) return "paid";
  if (!row.lastLogin) return "never_logged_in";
  if (!row.lastActivity || now - new Date(row.lastActivity).getTime() > 30 * DAY_MS) return "inactive";
  return "no_plan";
}

function topFeature(s: SummaryRow | null): string | null {
  if (!s) return null;
  const counts: Array<[string, number]> = ACTIVITY_EVENT_TYPES
    .filter((t) => t !== "login" && t !== "scenario_submitted")
    .map((t) => [t, (s as unknown as Record<string, number>)[t] ?? 0]);
  const best = counts.reduce<[string, number] | null>((acc, [t, n]) => (n > (acc?.[1] ?? -1) ? [t, n] : acc), null);
  return best && best[1] > 0 ? ACTIVITY_LABELS[best[0] as keyof typeof ACTIVITY_LABELS] : null;
}

export default async function AdminActivityPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string; filter?: string; sort?: string; page?: string }>;
}) {
  await requirePlatformAdmin();
  const sp = await searchParams;
  const q = (sp.q ?? "").trim().toLowerCase();
  const filter: ActivityFilter = (FILTERS.find((f) => f.key === sp.filter)?.key ?? "total");
  const sort: ActivitySort = (SORTS.find((s) => s.key === sp.sort)?.key ?? "last_activity");
  const page = Math.max(1, Number(sp.page) || 1);

  const service = createServiceRoleClient();

  const [{ data: users, error: usersError }, { data: summaryRows, error: summaryError }] = await Promise.all([
    service
      .from("users")
      .select(
        "id, email, created_at, is_beta_tester, beta_granted_at, user_profiles(display_name, nmls_id), user_subscriptions(plan:membership_plans(name, tier_level), canceled_at, is_trial, trial_activated_at, trial_expires_at, started_at, source, current_period_end)"
      )
      .is("deleted_at", null),
    service.from("user_activity_summary").select("*"),
  ]);
  if (usersError) throw new Error(usersError.message);
  if (summaryError) throw new Error(summaryError.message);

  const summaryByUser = new Map<string, SummaryRow>((summaryRows ?? []).map((s) => [s.user_id as string, s]));

  const all: ActivityUserRow[] = ((users ?? []) as RawUser[]).map((u) => {
    const sub = asOne(u.user_subscriptions);
    const plan = asOne(sub?.plan);
    const profile = asOne(u.user_profiles);
    const s = summaryByUser.get(u.id);
    return {
      id: u.id,
      email: u.email,
      displayName: profile?.display_name ?? null,
      nmlsId: profile?.nmls_id ?? null,
      createdAt: u.created_at,
      isBeta: u.is_beta_tester,
      betaGrantedAt: u.beta_granted_at,
      planName: plan?.name ?? null,
      tierLevel: plan ? (plan.tier_level ?? null) : null,
      canceledAt: sub?.canceled_at ?? null,
      isTrial: Boolean(sub?.is_trial),
      trialActivatedAt: sub?.trial_activated_at ?? null,
      trialExpiresAt: sub?.trial_expires_at ?? null,
      subscriptionStartedAt: sub?.started_at ?? null,
      source: sub?.source ?? null,
      currentPeriodEnd: sub?.current_period_end ?? null,
      status: deriveStatus({
        canceledAt: sub?.canceled_at ?? null,
        isTrial: Boolean(sub?.is_trial),
        trialExpiresAt: sub?.trial_expires_at ?? null,
        planName: plan?.name ?? null,
        lastLogin: s?.last_login ?? null,
        lastActivity: s?.last_activity ?? null,
      }),
      lastLogin: s?.last_login ?? null,
      lastActivity: s?.last_activity ?? null,
      logins: s?.logins ?? 0,
      scenarios: s?.scenarios ?? 0,
      voiceScenarios: s?.voice_scenarios ?? 0,
      aiAssistant: s?.ai_assistant ?? 0,
      lenderList: s?.lender_list ?? 0,
      programs: s?.programs ?? 0,
      docNeeds: s?.doc_needs ?? 0,
      products: s?.products ?? 0,
      topFeature: s ? topFeature(s) : null,
      timeline: [],
    };
  });

  // ---- Summary cards (counts over ALL users, not the filtered view) ----
  const now = Date.now();
  const count = (pred: (u: ActivityUserRow) => boolean) => all.filter(pred).length;
  const counts: Record<ActivityFilter, number> = {
    total: all.length,
    paid: count((u) => u.status === "paid"),
    trial: count((u) => u.status === "trial" || u.status === "trial_expiring"),
    beta: count((u) => u.isBeta),
    active7: count((u) => u.lastActivity !== null && now - new Date(u.lastActivity).getTime() <= 7 * DAY_MS),
    active30: count((u) => u.lastActivity !== null && now - new Date(u.lastActivity).getTime() <= 30 * DAY_MS),
    expired: count((u) => u.status === "trial_expired"),
    inactive: count((u) => u.status === "inactive"),
  };
  const betaTotal = counts.beta;
  const betaPaid = count((u) => u.isBeta && u.status === "paid");
  const conversion = betaTotal > 0 ? ((betaPaid / betaTotal) * 100).toFixed(1) : "—";

  // ---- Filter + search ----
  let rows = all.filter((u) => {
    if (filter === "paid") return u.status === "paid";
    if (filter === "trial") return u.status === "trial" || u.status === "trial_expiring";
    if (filter === "beta") return u.isBeta;
    if (filter === "active7") return u.lastActivity !== null && now - new Date(u.lastActivity).getTime() <= 7 * DAY_MS;
    if (filter === "active30") return u.lastActivity !== null && now - new Date(u.lastActivity).getTime() <= 30 * DAY_MS;
    if (filter === "expired") return u.status === "trial_expired";
    if (filter === "inactive") return u.status === "inactive";
    return true;
  });

  if (q) {
    rows = rows.filter(
      (u) => u.email.toLowerCase().includes(q) || (u.displayName ?? "").toLowerCase().includes(q)
    );
  }

  rows.sort((a, b) => {
    const dir = sort === "created" || sort === "trial_expiration" ? -1 : 1;
    let av: number | null;
    let bv: number | null;
    if (sort === "created") {
      av = new Date(a.createdAt).getTime();
      bv = new Date(b.createdAt).getTime();
    } else if (sort === "logins") {
      av = a.logins;
      bv = b.logins;
    } else if (sort === "scenarios") {
      av = a.scenarios;
      bv = b.scenarios;
    } else if (sort === "trial_expiration") {
      av = a.trialExpiresAt ? new Date(a.trialExpiresAt).getTime() : null;
      bv = b.trialExpiresAt ? new Date(b.trialExpiresAt).getTime() : null;
    } else {
      av = a.lastActivity ? new Date(a.lastActivity).getTime() : null;
      bv = b.lastActivity ? new Date(b.lastActivity).getTime() : null;
    }
    // nulls sort last regardless of direction
    if (av === null && bv === null) return 0;
    if (av === null) return 1;
    if (bv === null) return -1;
    return (av - bv) * dir;
  });

  const totalRows = rows.length;
  const totalPages = Math.max(1, Math.ceil(totalRows / PAGE_SIZE));
  const currentPage = Math.min(page, totalPages);
  const pageRows = rows.slice((currentPage - 1) * PAGE_SIZE, currentPage * PAGE_SIZE);

  // ---- Timeline (last 20 events) for the current page's users ----
  if (pageRows.length > 0) {
    const ids = pageRows.map((u) => u.id);
    const { data: timeline, error: timelineError } = await service
      .from("user_activity_timeline")
      .select("user_id, event_type, occurred_at")
      .in("user_id", ids)
      .order("occurred_at", { ascending: false });
    if (timelineError) throw new Error(timelineError.message);
    const byUser = new Map<string, TimelineRow[]>();
    for (const t of (timeline ?? []) as TimelineRow[]) {
      const arr = byUser.get(t.user_id) ?? [];
      if (arr.length < 20) arr.push(t);
      byUser.set(t.user_id, arr);
    }
    for (const u of pageRows) {
      u.timeline = (byUser.get(u.id) ?? []).map((t) => ({ eventType: t.event_type, occurredAt: t.occurred_at }));
    }
  }

  const emptyMessage = q
    ? "No users match this search."
    : filter !== "total"
    ? "No users match this filter."
    : "No users yet.";

  const baseHref = (params: Record<string, string | undefined>) => {
    const p = new URLSearchParams();
    if (q) p.set("q", q);
    if (filter !== "total") p.set("filter", filter);
    if (sort !== "last_activity") p.set("sort", sort);
    for (const [k, v] of Object.entries(params)) {
      if (v !== undefined && v !== "") p.set(k, v);
      else p.delete(k);
    }
    const qs = p.toString();
    return `/admin/activity${qs ? `?${qs}` : ""}`;
  };

  return (
    <div className="space-y-5">
      <div>
        <h2 className="text-lg font-semibold text-white">Active Users &amp; Beta Testers</h2>
        <p className="text-sm text-slate-500">
          Who is actually using NEXUS, how often, which features, and whether beta testers convert. Every figure is
          derived from a single activity table — no parallel tracking.
        </p>
      </div>

      {/* Summary cards — each is a one-click filter */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4 lg:grid-cols-9">
        {FILTERS.map((f) => {
          const active = filter === f.key;
          return (
            <Link
              key={f.key}
              href={active ? baseHref({ filter: undefined }) : baseHref({ filter: f.key, page: undefined })}
              aria-current={active ? "true" : undefined}
              title={f.title}
              className={`group rounded-card border p-3 transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-amber-400 ${
                active
                  ? "border-amber-400/60 bg-amber-500/10"
                  : "border-amber-500/15 bg-white/[0.02] hover:border-amber-400/40 hover:bg-white/[0.04]"
              }`}
            >
              <p className={`text-lg font-semibold tabular-nums ${active ? "text-amber-300" : "text-white"}`}>
                {counts[f.key]}
              </p>
              <p className={`text-[11px] uppercase tracking-wider ${active ? "text-amber-300/80" : "text-slate-500"}`}>
                {f.label}
              </p>
            </Link>
          );
        })}
        {/* Non-clickable conversion card */}
        <div className="rounded-card border border-white/10 bg-black/20 p-3">
          <p className="text-lg font-semibold tabular-nums text-white">
            {conversion === "—" ? "—" : `${conversion}%`}
          </p>
          <p className="text-[11px] uppercase tracking-wider text-slate-500">
            Beta → Paid · {betaPaid}/{betaTotal || 0}
          </p>
        </div>
      </div>

      {/* Search + sort row */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <ActivitySearch defaultValue={q} />
        <div className="flex flex-wrap items-center gap-1 text-xs" role="group" aria-label="Sort users">
          <span className="mr-1 text-slate-500">Sort:</span>
          {SORTS.map((s) => {
            const active = sort === s.key;
            return (
              <Link
                key={s.key}
                href={baseHref({ sort: s.key, page: undefined })}
                aria-current={active ? "true" : undefined}
                className={`rounded-full border px-2.5 py-1 transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-amber-400 ${
                  active
                    ? "border-amber-400/60 bg-amber-500/10 text-amber-300"
                    : "border-white/10 text-slate-400 hover:border-amber-400/40 hover:text-slate-200"
                }`}
              >
                {s.label}
              </Link>
            );
          })}
        </div>
      </div>

      <Card dark className="p-0 overflow-hidden">
        <div className="flex items-center justify-between border-b border-white/5 px-4 py-3">
          <span className="inline-flex items-center gap-2 text-sm text-slate-400">
            <UsersRound className="h-4 w-4 text-amber-300" aria-hidden />
            {totalRows} user{totalRows === 1 ? "" : "s"}
            {filter !== "total" ? ` · ${FILTERS.find((f) => f.key === filter)?.label}` : ""}
          </span>
          <span className="text-xs text-slate-500">
            {totalRows === 0
              ? "—"
              : `${(currentPage - 1) * PAGE_SIZE + 1}–${Math.min(currentPage * PAGE_SIZE, totalRows)} of ${totalRows}`}
          </span>
        </div>
        <ActivityTable rows={pageRows} emptyMessage={emptyMessage} />
      </Card>

      {/* Pagination */}
      {totalPages > 1 ? (
        <div className="flex items-center justify-between text-sm">
          <Link
            href={baseHref({ page: String(Math.max(1, currentPage - 1)) })}
            aria-disabled={currentPage <= 1}
            className={`rounded-lg border px-3 py-1.5 focus:outline-none focus-visible:ring-2 focus-visible:ring-amber-400 ${
              currentPage <= 1
                ? "pointer-events-none border-white/5 text-slate-600"
                : "border-amber-500/20 text-slate-300 hover:border-amber-400/50 hover:text-white"
            }`}
          >
            Previous
          </Link>
          <span className="text-xs text-slate-500">
            Page {currentPage} of {totalPages}
          </span>
          <Link
            href={baseHref({ page: String(Math.min(totalPages, currentPage + 1)) })}
            aria-disabled={currentPage >= totalPages}
            className={`rounded-lg border px-3 py-1.5 focus:outline-none focus-visible:ring-2 focus-visible:ring-amber-400 ${
              currentPage >= totalPages
                ? "pointer-events-none border-white/5 text-slate-600"
                : "border-amber-500/20 text-slate-300 hover:border-amber-400/50 hover:text-white"
            }`}
          >
            Next
          </Link>
        </div>
      ) : null}

      <p className="text-xs text-slate-600">
        Status is computed in order: Cancelled → Trial Expired → Trial Expiring → Trial → Paid → Never Logged In →
        Inactive → No Plan (has recent activity but no plan). Beta is a separate chip. &ldquo;Active&rdquo; requires an
        activity event — an account alone never counts.
      </p>
    </div>
  );
}