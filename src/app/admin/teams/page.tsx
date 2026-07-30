import { requirePlatformAdmin } from "@/lib/admin";
import { Card } from "@/components/ui";
import { CompForm } from "./comp-form";
import { CancelCompButton } from "./cancel-comp-button";

export const dynamic = "force-dynamic";

export default async function AdminTeamsPage() {
  const { supabase } = await requirePlatformAdmin();

  const [{ data: orgs }, { data: plans }, { data: orgSubs }] = await Promise.all([
    supabase.from("organizations").select("id, name").is("deleted_at", null).order("name"),
    supabase.from("membership_plans").select("id, name").eq("is_active", true).order("sort_order"),
    supabase
      .from("org_subscriptions")
      .select("id, organization_id, seat_count, status, source, plan:membership_plans(name)")
      .eq("status", "active"),
  ]);

  const orgSubByOrg = new Map((orgSubs ?? []).map((s) => [s.organization_id as string, s]));

  return (
    <div className="max-w-3xl space-y-6">
      <div>
        <h1 className="text-2xl font-semibold">Team subscriptions (admin-comped)</h1>
        <p className="text-sm text-ink-secondary">
          Grant a pilot brokerage free team access with no Stripe object involved — every grant is audit-logged. For a
          Stripe-billed team subscription, the org_admin subscribes themselves from /account/team/subscribe.
        </p>
      </div>

      <Card title="Grant / update a comped subscription">
        <CompForm
          organizations={(orgs ?? []).map((o) => ({ id: o.id as string, name: o.name as string }))}
          plans={(plans ?? []).map((p) => ({ id: p.id as string, name: p.name as string }))}
        />
      </Card>

      <Card title="Active comped subscriptions">
        <div className="space-y-2">
          {(orgs ?? [])
            .map((o) => ({ org: o, sub: orgSubByOrg.get(o.id as string) }))
            .filter((row) => row.sub && row.sub.source === "comped")
            .map(({ org, sub }) => (
              <div key={org.id as string} className="flex items-center justify-between border-b border-surface-border pb-2 last:border-0 last:pb-0">
                <p className="text-sm">
                  {org.name as string} — {(Array.isArray(sub!.plan) ? sub!.plan[0] : sub!.plan)?.name as string}, {sub!.seat_count as number} seats
                </p>
                <CancelCompButton orgSubscriptionId={sub!.id as string} />
              </div>
            ))}
          {(orgs ?? []).filter((o) => orgSubByOrg.get(o.id as string)?.source === "comped").length === 0 ? (
            <p className="text-sm text-ink-secondary">No comped team subscriptions yet.</p>
          ) : null}
        </div>
      </Card>
    </div>
  );
}
