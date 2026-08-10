import { requirePlatformAdmin } from "@/lib/admin";
import { PLATFORM_CATALOG_ORGANIZATION_ID } from "@/lib/platformCatalog";
import { Card, SampleDataBadge } from "@/components/ui";
import { PostureForm } from "./posture-form";
import type { GuidelinePosture, PricingTendency } from "@/domain/lenderPosture";

export const dynamic = "force-dynamic";

interface ProfileRow {
  id: string;
  lender_id: string;
  posture: GuidelinePosture;
  pricing_tendency: PricingTendency;
  exceptions_considered: boolean;
  exception_channel: string | null;
  posture_notes: string | null;
  is_verified: boolean;
  last_reviewed_at: string | null;
}

export default async function AdminLenderPosturePage() {
  const { supabase } = await requirePlatformAdmin();
  const org = PLATFORM_CATALOG_ORGANIZATION_ID;

  const [lendersRes, profilesRes] = await Promise.all([
    supabase.from("lenders").select("id, name, is_sample_data, active").is("deleted_at", null).order("name"),
    supabase.from("lender_flexibility_profiles").select("*").eq("organization_id", org).is("deleted_at", null),
  ]);
  if (lendersRes.error) throw new Error(lendersRes.error.message);
  if (profilesRes.error) throw new Error(profilesRes.error.message);

  const lenders = (lendersRes.data ?? []) as Array<{ id: string; name: string; is_sample_data: boolean; active: boolean }>;
  const profiles = (profilesRes.data ?? []) as ProfileRow[];
  const profileByLender = new Map(profiles.map((p) => [p.lender_id, p]));

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-lg font-semibold text-slate-900">Lender posture profiles (flexibility)</h2>
        <p className="text-sm text-slate-500">
          Editorial metadata about lender flexibility — <strong>not a guideline and never a scoring input.</strong> These
          shared defaults are inherited by every subscriber org (they can override per-org). Keep{" "}
          <code>lastReviewedAt</code> current; profiles older than 180 days are flagged &ldquo;possibly stale.&rdquo;
        </p>
      </div>

      <Card>
        <table className="w-full text-sm">
          <thead>
            <tr className="text-left text-xs text-slate-500 uppercase tracking-wide">
              <th className="pb-2">Lender</th>
              <th className="pb-2">Posture / pricing / exceptions</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {lenders.map((lender) => {
              const p = profileByLender.get(lender.id);
              return (
                <tr key={lender.id} className="align-top">
                  <td className="py-2 pr-4">
                    <span className="font-medium">{lender.name}</span> {lender.is_sample_data ? <SampleDataBadge /> : null}
                    {!lender.active ? <span className="ml-1 text-xs text-slate-400">(inactive)</span> : null}
                  </td>
                  <td className="py-2">
                    <PostureForm
                      value={{
                        lenderId: lender.id,
                        profileId: p?.id,
                        posture: p?.posture,
                        pricingTendency: p?.pricing_tendency,
                        exceptionsConsidered: p?.exceptions_considered,
                        exceptionChannel: p?.exception_channel ?? undefined,
                        postureNotes: p?.posture_notes ?? undefined,
                        isVerified: p?.is_verified,
                        lastReviewedAt: p?.last_reviewed_at,
                      }}
                    />
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </Card>
    </div>
  );
}