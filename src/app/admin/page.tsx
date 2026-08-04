import Link from "next/link";
import { requirePlatformAdmin } from "@/lib/admin";
import { Card, fmtUsd } from "@/components/ui";
import { getScenarioVolumeStats } from "@/lib/admin/scenarioVolumeStats";

export const dynamic = "force-dynamic";

export default async function AdminOverviewPage() {
  const { supabase } = await requirePlatformAdmin();

  const [plans, lenders, subs, discounts, scenarioVolume] = await Promise.all([
    supabase.from("membership_plans").select("id", { count: "exact", head: true }),
    supabase.from("lenders").select("id", { count: "exact", head: true }).is("deleted_at", null),
    supabase.from("user_subscriptions").select("id", { count: "exact", head: true }).not("plan_id", "is", null),
    supabase.from("discounts").select("id", { count: "exact", head: true }),
    getScenarioVolumeStats(),
  ]);

  return (
    <div className="space-y-4">
      <p className="text-sm text-slate-500">
        Manage membership plans, which lenders each tier can see, promotional discounts, and individual users&apos;
        subscriptions — no code changes needed.
      </p>
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <Link href="/admin/scenario-volume">
          <Card>
            <p className="text-3xl font-semibold">{fmtUsd(scenarioVolume.totalLoanVolume)}</p>
            <p className="text-sm text-slate-500">Total scenario loan volume</p>
          </Card>
        </Link>
        <Link href="/admin/plans">
          <Card>
            <p className="text-3xl font-semibold">{plans.count ?? 0}</p>
            <p className="text-sm text-slate-500">Membership plans</p>
          </Card>
        </Link>
        <Link href="/admin/lenders">
          <Card>
            <p className="text-3xl font-semibold">{lenders.count ?? 0}</p>
            <p className="text-sm text-slate-500">Lenders (all organizations)</p>
          </Card>
        </Link>
        <Link href="/admin/users">
          <Card>
            <p className="text-3xl font-semibold">{subs.count ?? 0}</p>
            <p className="text-sm text-slate-500">Active subscriptions</p>
          </Card>
        </Link>
        <Link href="/admin/discounts">
          <Card>
            <p className="text-3xl font-semibold">{discounts.count ?? 0}</p>
            <p className="text-sm text-slate-500">Discount definitions</p>
          </Card>
        </Link>
      </div>
    </div>
  );
}
