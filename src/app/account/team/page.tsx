import { requireOrgAdmin } from "@/lib/orgAdmin";
import { createServiceRoleClient } from "@/lib/repository/serviceRoleClient";
import { Card } from "@/components/ui";
import { ManageBillingForm } from "@/app/account/manage-billing-form";
import { InviteForm } from "./invite-form";
import { BulkInviteForm } from "./bulk-invite-form";
import { MembersList, type MemberRow } from "./members-list";
import { InvitesList, type InviteRow } from "./invites-list";
import { SeatsForm } from "./seats-form";
import { BULK_PLAN_KEY, formatCents } from "@/lib/bulkMembership";
import Link from "next/link";

export const dynamic = "force-dynamic";

export default async function TeamPage() {
  const { userId, organizationId } = await requireOrgAdmin();
  // Service-role reads here purely for the joined shape (member name/email
  // + role + coverage in one query) — every row is still scoped to the
  // CALLER's own organizationId, resolved server-side by requireOrgAdmin
  // above, never from client input. Mutations go through
  // src/app/account/team/actions.ts, which re-derives organizationId the
  // same way on every call.
  const service = createServiceRoleClient();

  const [{ data: org }, { data: memberships }, { data: invites }, { data: orgSub }] = await Promise.all([
    service.from("organizations").select("name").eq("id", organizationId).maybeSingle(),
    service
      .from("memberships")
      .select("id, user_id, role, covered_by_org_plan, created_at, user:users(email, profile:user_profiles(display_name))")
      .eq("organization_id", organizationId)
      .is("deleted_at", null)
      .order("created_at", { ascending: true }),
    service
      .from("org_invites")
      .select("id, email, role, expires_at, created_at, accepted_at, revoked_at")
      .eq("organization_id", organizationId)
      .is("accepted_at", null)
      .is("revoked_at", null)
      .order("created_at", { ascending: false }),
    service
      .from("org_subscriptions")
      .select(
        "id, seat_count, status, source, current_period_end, canceled_at, billing_mode, custom_price_per_seat_cents, plan:membership_plans(name, key)"
      )
      .eq("organization_id", organizationId)
      .eq("status", "active")
      .maybeSingle(),
  ]);

  const members: MemberRow[] = (memberships ?? []).map((m) => {
    const user = Array.isArray(m.user) ? m.user[0] : m.user;
    const profile = user ? (Array.isArray(user.profile) ? user.profile[0] : user.profile) : null;
    return {
      id: m.id as string,
      userId: m.user_id as string,
      email: (user?.email as string | undefined) ?? "—",
      displayName: (profile?.display_name as string | undefined) ?? null,
      role: m.role as string,
      covered: Boolean(m.covered_by_org_plan),
      isSelf: m.user_id === userId,
    };
  });

  const invitesList: InviteRow[] = (invites ?? []).map((i) => ({
    id: i.id as string,
    email: i.email as string,
    role: i.role as string,
    expiresAt: i.expires_at as string,
    createdAt: i.created_at as string,
  }));

  const seatsUsed = members.filter((m) => m.covered).length;
  const seatsTotal = (orgSub?.seat_count as number | undefined) ?? 0;
  const plan = orgSub ? (Array.isArray(orgSub.plan) ? orgSub.plan[0] : orgSub.plan) : null;
  const isBulk = (plan as { key?: string } | null)?.key === BULK_PLAN_KEY;
  const customPricePerSeatCents = orgSub?.custom_price_per_seat_cents as number | null | undefined;

  return (
    <div className="gold-theme gold-page -mx-4 -my-6 px-4 py-6 sm:px-6 sm:py-8 bg-[#050505] rounded-b-3xl max-w-3xl space-y-6">
      <div>
        <h1 className="text-2xl font-semibold text-white">Team management</h1>
        <p className="text-sm text-slate-400">{(org?.name as string | undefined) ?? "Your organization"}</p>
      </div>

      <Card title="Subscription" dark>
        {orgSub ? (
          <div className="space-y-3">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div>
                <p className="font-medium text-white">
                  {(plan?.name as string | undefined) ?? "Team plan"}
                  <span className="ml-2 text-xs rounded-full bg-emerald-500/20 text-emerald-300 px-2 py-0.5">Active</span>
                  {orgSub.source === "comped" ? (
                    <span className="ml-2 text-xs rounded-full bg-white/10 text-slate-300 px-2 py-0.5">Comped</span>
                  ) : orgSub.source === "invoiced" ? (
                    <span className="ml-2 text-xs rounded-full bg-white/10 text-slate-300 px-2 py-0.5">Invoiced (NET-30)</span>
                  ) : (
                    <span className="ml-2 text-xs rounded-full bg-white/10 text-slate-300 px-2 py-0.5">Billed via Stripe</span>
                  )}
                </p>
                <p className="text-sm text-slate-400">
                  {seatsUsed} of {seatsTotal} seats covered
                  {isBulk && customPricePerSeatCents ? ` · ${formatCents(customPricePerSeatCents)}/seat/mo` : ""}
                </p>
              </div>
              <div className="flex items-center gap-3">
                <SeatsForm currentSeatCount={seatsTotal} />
                {orgSub.source === "stripe" ? <ManageBillingForm /> : null}
              </div>
            </div>
          </div>
        ) : (
          <p className="text-sm text-slate-400">
            No active team subscription yet.{" "}
            <Link href="/account/team/subscribe" className="text-amber-400 underline">
              Subscribe your team
            </Link>{" "}
            to start covering seats.
          </p>
        )}
      </Card>

      <Card title="Members" dark>
        <MembersList members={members} seatsUsed={seatsUsed} seatsTotal={seatsTotal} />
      </Card>

      <Card title="Invite a teammate" dark>
        <InviteForm />
      </Card>

      <Card title="Bulk invite" dark>
        <BulkInviteForm />
      </Card>

      {invitesList.length > 0 ? (
        <Card title="Pending invites" dark>
          <InvitesList invites={invitesList} />
        </Card>
      ) : null}
    </div>
  );
}
