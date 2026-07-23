import { requirePlatformAdmin } from "@/lib/admin";
import { Card, SampleDataBadge } from "@/components/ui";
import { TierSelect } from "./tier-select";

export const dynamic = "force-dynamic";

interface LenderRow {
  id: string;
  name: string;
  is_sample_data: boolean;
  active: boolean;
  tier_level: number;
  organization_id: string;
}

export default async function AdminLendersPage() {
  const { supabase } = await requirePlatformAdmin();
  // Platform admins see lenders across every organization — the Top 12 /
  // Top 25 curation described in the membership spec is a single,
  // platform-wide list, not per-tenant.
  const { data, error } = await supabase
    .from("lenders")
    .select("id, name, is_sample_data, active, tier_level, organization_id")
    .is("deleted_at", null)
    .order("tier_level")
    .order("name");
  if (error) throw new Error(error.message);
  const lenders = (data ?? []) as LenderRow[];

  const byTier = { 1: 0, 2: 0, 3: 0 } as Record<number, number>;
  for (const l of lenders) byTier[l.tier_level] = (byTier[l.tier_level] ?? 0) + 1;

  return (
    <div className="space-y-4">
      <div>
        <h2 className="text-lg font-semibold text-slate-900">Lender tier assignment</h2>
        <p className="text-sm text-slate-500">
          Tier 1 (Essential) should hold your Top 12; Tier 2 (Professional) your Top 25 (Tier 1 lenders should
          usually also be included conceptually — assign each lender to the lowest tier that should see it). New
          lenders default to Tier 3 until you move them.
        </p>
        <p className="mt-1 text-xs text-slate-500">
          Tier 1: {byTier[1]} · Tier 2: {byTier[2]} · Tier 3: {byTier[3]}
        </p>
      </div>

      <Card>
        <table className="w-full text-sm">
          <thead>
            <tr className="text-left text-xs text-slate-500 uppercase tracking-wide">
              <th className="pb-2">Lender</th>
              <th className="pb-2">Status</th>
              <th className="pb-2">Tier</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {lenders.map((l) => (
              <tr key={l.id}>
                <td className="py-2 pr-4">
                  <span className="font-medium">{l.name}</span>{" "}
                  {l.is_sample_data ? <SampleDataBadge /> : null}
                </td>
                <td className="py-2 pr-4 text-slate-500">{l.active ? "Active" : "Inactive"}</td>
                <td className="py-2">
                  <TierSelect lenderId={l.id} tierLevel={l.tier_level} />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </Card>
    </div>
  );
}
