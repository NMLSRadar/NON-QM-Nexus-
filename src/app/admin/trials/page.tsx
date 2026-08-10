import { requirePlatformAdmin } from "@/lib/admin";
import { Card } from "@/components/ui";
import { CreateCampaignForm } from "./create-campaign-form";
import { CampaignActiveToggle } from "./campaign-active-toggle";
import { CopyLinkButton } from "./copy-link-button";
import { RedemptionRowActions } from "./redemption-row-actions";
import { AdminOverrideForm } from "./admin-override-form";
import { InviteBetaForm } from "./invite-beta-form";
import { BetaFeedbackSection } from "./beta-feedback-section";

export const dynamic = "force-dynamic";

interface CampaignRow {
  id: string;
  name: string;
  slug: string;
  is_active: boolean;
  trial_duration_days: number;
  max_redemptions: number | null;
  created_at: string;
}

interface RedemptionRow {
  id: string;
  campaign_id: string;
  user_id: string;
  email: string;
  first_name: string | null;
  last_name: string | null;
  company_name: string | null;
  activated_at: string;
  expires_at: string;
  revoked_at: string | null;
  converted_at: string | null;
  converted_plan_key: string | null;
  last_login_at: string | null;
  scenarios_submitted_count: number;
  lender_comparisons_count: number;
  voice_scenarios_submitted_count: number;
}

export default async function AdminTrialsPage({ searchParams }: { searchParams: Promise<{ q?: string }> }) {
  const { q } = await searchParams;
  const { supabase } = await requirePlatformAdmin();

  const [{ data: campaigns, error: campaignsError }, { data: redemptions, error: redemptionsError }, { data: plans, error: plansError }] = await Promise.all([
    supabase.from("trial_campaigns").select("id, name, slug, is_active, trial_duration_days, max_redemptions, created_at").order("created_at", { ascending: false }),
    supabase
      .from("trial_redemptions")
      .select(
        "id, campaign_id, user_id, email, first_name, last_name, company_name, activated_at, expires_at, revoked_at, converted_at, converted_plan_key, last_login_at, scenarios_submitted_count, lender_comparisons_count, voice_scenarios_submitted_count"
      )
      .order("activated_at", { ascending: false }),
    supabase.from("membership_plans").select("id, name").eq("is_active", true).order("sort_order"),
  ]);
  if (campaignsError) throw new Error(campaignsError.message);
  if (redemptionsError) throw new Error(redemptionsError.message);
  if (plansError) throw new Error(plansError.message);

  const allCampaigns = (campaigns ?? []) as CampaignRow[];
  const allRedemptions = (redemptions ?? []) as RedemptionRow[];
  const allPlans = (plans ?? []) as Array<{ id: string; name: string }>;
  const campaignById = new Map(allCampaigns.map((c) => [c.id, c]));

  const now = Date.now();
  const isExpired = (r: RedemptionRow) => (r.revoked_at ? true : new Date(r.expires_at).getTime() <= now);
  const isConverted = (r: RedemptionRow) => Boolean(r.converted_at);

  const query = (q ?? "").trim().toLowerCase();
  const filteredRedemptions = query
    ? allRedemptions.filter(
        (r) =>
          r.email.toLowerCase().includes(query) ||
          (r.first_name ?? "").toLowerCase().includes(query) ||
          (r.last_name ?? "").toLowerCase().includes(query) ||
          (r.company_name ?? "").toLowerCase().includes(query)
      )
    : allRedemptions;

  // Analytics summary (spec Phase 8). Registration/active/expired/
  // conversion-rate/login figures are computed from real timestamps
  // already on trial_redemptions. The per-feature usage counters
  // (scenarios/comparisons/voice-scenarios submitted) are schema-ready
  // but NOT YET incremented by any real app event — flagged explicitly
  // rather than presenting a silent 0 as if it were a measured usage
  // rate, per this platform's standing rule against fabricated numbers.
  const totalRegistrations = allRedemptions.length;
  const activeCount = allRedemptions.filter((r) => !isExpired(r) && !isConverted(r)).length;
  const expiredCount = allRedemptions.filter((r) => isExpired(r) && !isConverted(r)).length;
  const convertedCount = allRedemptions.filter(isConverted).length;
  const conversionRate = totalRegistrations > 0 ? ((convertedCount / totalRegistrations) * 100).toFixed(1) : "0.0";
  const neverLoggedIn = allRedemptions.filter((r) => !r.last_login_at).length;
  const companyCounts = new Map<string, number>();
  for (const r of allRedemptions) {
    if (r.company_name) companyCounts.set(r.company_name, (companyCounts.get(r.company_name) ?? 0) + 1);
  }
  const topCompanies = [...companyCounts.entries()].sort((a, b) => b[1] - a[1]).slice(0, 5);

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-lg font-semibold text-slate-900">Trial Access Management</h2>
        <p className="text-sm text-slate-500">
          Create and manage 14-day full-access promotional trial links. Trial expiration is enforced automatically and
          server-side (see membership.ts) — nothing here needs a background job to take effect.
        </p>
      </div>

      <Card title="Analytics summary">
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-sm">
          <div>
            <p className="text-xs text-slate-500">Total registrations</p>
            <p className="text-lg font-semibold text-slate-900">{totalRegistrations}</p>
          </div>
          <div>
            <p className="text-xs text-slate-500">Active trials</p>
            <p className="text-lg font-semibold text-slate-900">{activeCount}</p>
          </div>
          <div>
            <p className="text-xs text-slate-500">Expired trials</p>
            <p className="text-lg font-semibold text-slate-900">{expiredCount}</p>
          </div>
          <div>
            <p className="text-xs text-slate-500">Converted to paid/comped</p>
            <p className="text-lg font-semibold text-slate-900">
              {convertedCount} ({conversionRate}%)
            </p>
          </div>
          <div>
            <p className="text-xs text-slate-500">Never logged in</p>
            <p className="text-lg font-semibold text-slate-900">{neverLoggedIn}</p>
          </div>
          <div className="col-span-2 sm:col-span-3">
            <p className="text-xs text-slate-500">Most active companies (by trial registrations)</p>
            <p className="text-sm text-slate-700">
              {topCompanies.length > 0 ? topCompanies.map(([name, count]) => `${name} (${count})`).join(", ") : "No company names on file yet."}
            </p>
          </div>
        </div>
        <p className="mt-3 text-xs text-amber-700 bg-amber-50 border border-amber-200 rounded p-2">
          Per-feature usage metrics (avg. scenarios per trial user, Voice Scenario usage, lender-comparison usage, most
          frequently searched loan programs, most-recommended lenders, most-encountered qualification issues) are
          columns already present on trial_redemptions, but no application event currently increments them — this is
          flagged honestly here rather than shown as a measured rate. Wiring these requires adding an increment call at
          the actual scenario-save / voice-submit / comparison-view call sites, which is a straightforward fast-follow
          but wasn&apos;t done in this pass.
        </p>
      </Card>

      <Card title="Create a new trial campaign">
        <CreateCampaignForm />
      </Card>

      <Card title="Invite a beta tester (streamlined — no signup needed)">
        <p className="text-xs text-slate-500 mb-2">
          Enter a loan officer&apos;s email and pick a campaign. An invitation is emailed to them automatically — they
          create their account (or sign in) from that email, and their trial starts by itself. They never register
          here first.
        </p>
        <InviteBetaForm campaignSlugs={allCampaigns.map((c) => c.slug)} />
      </Card>

      <Card title="Admin override — bypass the one-trial-per-email restriction">
        <p className="text-xs text-slate-500 mb-2">
          For an existing account only (they must already have signed up). Creates a real trial_redemptions row and
          grants tier-3 access even if that email already used a trial.
        </p>
        <AdminOverrideForm campaignSlugs={allCampaigns.map((c) => c.slug)} />
      </Card>

      <Card title={`Campaigns (${allCampaigns.length})`}>
        <table className="w-full text-sm">
          <thead>
            <tr className="text-left text-xs text-slate-500 uppercase tracking-wide">
              <th className="pb-2">Name</th>
              <th className="pb-2">Link</th>
              <th className="pb-2">Redemptions</th>
              <th className="pb-2">Duration</th>
              <th className="pb-2">Status</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {allCampaigns.map((c) => {
              const redemptionCount = allRedemptions.filter((r) => r.campaign_id === c.id).length;
              const url = `${process.env.NEXT_PUBLIC_APP_URL ?? "https://nonqmnexus.com"}/trial/${c.slug}`;
              return (
                <tr key={c.id}>
                  <td className="py-2 pr-4 font-medium">{c.name}</td>
                  <td className="py-2 pr-4">
                    <div className="flex items-center gap-2">
                      <code className="text-xs text-slate-500">/trial/{c.slug}</code>
                      <CopyLinkButton url={url} />
                    </div>
                  </td>
                  <td className="py-2 pr-4">
                    {redemptionCount}
                    {c.max_redemptions ? ` / ${c.max_redemptions}` : ""}
                  </td>
                  <td className="py-2 pr-4">{c.trial_duration_days} days</td>
                  <td className="py-2">
                    <CampaignActiveToggle campaignId={c.id} isActive={c.is_active} />
                  </td>
                </tr>
              );
            })}
            {allCampaigns.length === 0 ? (
              <tr>
                <td colSpan={5} className="py-4 text-center text-slate-400">
                  No trial campaigns yet — create one above.
                </td>
              </tr>
            ) : null}
          </tbody>
        </table>
      </Card>

      <Card title={`Trial users (${filteredRedemptions.length}${query ? ` of ${allRedemptions.length}` : ""})`}>
        <form method="GET" className="mb-3">
          <input
            type="search"
            name="q"
            defaultValue={q ?? ""}
            placeholder="Search by name, email, or company…"
            className="w-full max-w-sm rounded border border-slate-300 px-3 py-1.5 text-sm"
          />
        </form>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-xs text-slate-500 uppercase tracking-wide">
                <th className="pb-2 pr-3">User</th>
                <th className="pb-2 pr-3">Campaign</th>
                <th className="pb-2 pr-3">Activated</th>
                <th className="pb-2 pr-3">Expires</th>
                <th className="pb-2 pr-3">Last login</th>
                <th className="pb-2 pr-3">Status</th>
                <th className="pb-2">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {filteredRedemptions.map((r) => {
                const expired = isExpired(r);
                const converted = isConverted(r);
                return (
                  <tr key={r.id}>
                    <td className="py-2 pr-3">
                      <p className="font-medium">
                        {r.first_name || r.last_name ? `${r.first_name ?? ""} ${r.last_name ?? ""}`.trim() : "—"}
                      </p>
                      <p className="text-xs text-slate-500">{r.email}</p>
                      {r.company_name ? <p className="text-xs text-slate-400">{r.company_name}</p> : null}
                    </td>
                    <td className="py-2 pr-3 text-xs text-slate-500">{campaignById.get(r.campaign_id)?.name ?? "—"}</td>
                    <td className="py-2 pr-3 text-xs text-slate-500">{new Date(r.activated_at).toLocaleDateString()}</td>
                    <td className="py-2 pr-3 text-xs text-slate-500">{new Date(r.expires_at).toLocaleDateString()}</td>
                    <td className="py-2 pr-3 text-xs text-slate-500">{r.last_login_at ? new Date(r.last_login_at).toLocaleDateString() : "Never"}</td>
                    <td className="py-2 pr-3">
                      {converted ? (
                        <span className="rounded-full bg-emerald-100 text-emerald-700 text-xs px-2 py-0.5">Converted ({r.converted_plan_key})</span>
                      ) : r.revoked_at ? (
                        <span className="rounded-full bg-slate-200 text-slate-600 text-xs px-2 py-0.5">Revoked</span>
                      ) : expired ? (
                        <span className="rounded-full bg-amber-100 text-amber-700 text-xs px-2 py-0.5">Expired</span>
                      ) : (
                        <span className="rounded-full bg-sky-100 text-sky-700 text-xs px-2 py-0.5">Active</span>
                      )}
                    </td>
                    <td className="py-2">
                      <RedemptionRowActions redemptionId={r.id} plans={allPlans} isRevoked={Boolean(r.revoked_at)} isConverted={converted} />
                    </td>
                  </tr>
                );
              })}
              {filteredRedemptions.length === 0 ? (
                <tr>
                  <td colSpan={7} className="py-4 text-center text-slate-400">
                    {query ? "No trial users match this search." : "No trial users yet."}
                  </td>
                </tr>
              ) : null}
            </tbody>
          </table>
        </div>
      </Card>

      {/* Beta Tester Feedback — automated Day-3 questionnaire + Day-5
          follow-up, with per-tester status/completion and aggregate
          analytics. Self-contained section; trial management above is
          untouched. */}
      <BetaFeedbackSection />
    </div>
  );
}
