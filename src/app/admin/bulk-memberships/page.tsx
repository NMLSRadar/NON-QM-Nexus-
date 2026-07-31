import Link from "next/link";
import { requirePlatformAdmin } from "@/lib/admin";
import { Card } from "@/components/ui";
import { BULK_PLAN_KEY, formatCents } from "@/lib/bulkMembership";
import { RequestRowActions, SendNextInvoiceButton, CancelBulkButton } from "./row-actions";

export const dynamic = "force-dynamic";

export default async function AdminBulkMembershipsPage() {
  const { supabase } = await requirePlatformAdmin();

  const { data: bulkPlan } = await supabase.from("membership_plans").select("id").eq("key", BULK_PLAN_KEY).maybeSingle();

  const [{ data: requests }, { data: subs }] = await Promise.all([
    supabase
      .from("bulk_membership_requests")
      .select("id, company_name, contact_name, contact_email, contact_phone, seat_count_requested, notes, status, created_at")
      .order("created_at", { ascending: false }),
    bulkPlan
      ? supabase
          .from("org_subscriptions")
          .select(
            "id, organization_id, seat_count, status, billing_mode, custom_price_per_seat_cents, billing_contact_email, next_invoice_due_at, organization:organizations(name)"
          )
          .eq("plan_id", bulkPlan.id as string)
          .order("created_at", { ascending: false })
      : Promise.resolve({ data: [] as Record<string, unknown>[] }),
  ]);

  const pendingRequests = (requests ?? []).filter((r) => r.status === "new" || r.status === "contacted");

  return (
    <div className="max-w-4xl space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold">Bulk Memberships</h1>
          <p className="text-sm text-ink-secondary">
            One system for any brokerage from 1 up to 500 loan officers — fully custom-quoted, entirely separate
            from the self-serve Essential / Professional / Enterprise tiers.
          </p>
        </div>
        <Link href="/admin/bulk-memberships/new" className="rounded-md bg-slate-900 text-white text-sm font-medium px-4 py-2">
          New Bulk Membership
        </Link>
      </div>

      <Card title="Inbound requests">
        <div className="space-y-3">
          {pendingRequests.length === 0 ? (
            <p className="text-sm text-ink-secondary">No pending requests.</p>
          ) : (
            pendingRequests.map((r) => (
              <div key={r.id as string} className="flex items-center justify-between border-b border-surface-border pb-2 last:border-0 last:pb-0">
                <div>
                  <p className="text-sm font-medium">
                    {r.company_name as string} — {r.seat_count_requested as number} seats
                  </p>
                  <p className="text-xs text-ink-secondary">
                    {r.contact_name as string} · {r.contact_email as string} {r.contact_phone ? `· ${r.contact_phone}` : ""}
                  </p>
                  {r.notes ? <p className="text-xs text-ink-secondary mt-0.5">{r.notes as string}</p> : null}
                </div>
                <RequestRowActions requestId={r.id as string} />
              </div>
            ))
          )}
        </div>
      </Card>

      <Card title="Active & past Bulk Memberships">
        <div className="space-y-2">
          {(subs ?? []).length === 0 ? (
            <p className="text-sm text-ink-secondary">No Bulk Membership subscriptions yet.</p>
          ) : (
            (subs ?? []).map((s) => {
              const org = Array.isArray(s.organization) ? s.organization[0] : s.organization;
              const priceCents = s.custom_price_per_seat_cents as number | null;
              return (
                <div key={s.id as string} className="flex items-center justify-between border-b border-surface-border pb-2 last:border-0 last:pb-0">
                  <div>
                    <p className="text-sm">
                      {(org?.name as string | undefined) ?? "—"} — {s.seat_count as number} seats
                      {priceCents ? ` @ ${formatCents(priceCents)}/seat/mo` : ""}
                      <span className="ml-2 text-xs rounded-full bg-slate-100 px-2 py-0.5">{s.billing_mode as string}</span>
                      <span className={`ml-2 text-xs rounded-full px-2 py-0.5 ${s.status === "active" ? "bg-emerald-100 text-emerald-700" : "bg-slate-100 text-slate-500"}`}>
                        {s.status as string}
                      </span>
                    </p>
                    <p className="text-xs text-ink-secondary">
                      {s.billing_contact_email as string}
                      {s.next_invoice_due_at ? ` · next invoice due ${new Date(s.next_invoice_due_at as string).toLocaleDateString("en-US")}` : ""}
                    </p>
                  </div>
                  {s.status === "active" ? (
                    <div className="flex gap-2">
                      {s.billing_mode === "invoiced" ? <SendNextInvoiceButton orgSubscriptionId={s.id as string} /> : null}
                      <CancelBulkButton orgSubscriptionId={s.id as string} />
                    </div>
                  ) : null}
                </div>
              );
            })
          )}
        </div>
      </Card>
    </div>
  );
}
