import { requireOrgOrPlatformAdmin } from "@/lib/orgOrPlatformAdmin";
import { PLATFORM_CATALOG_ORGANIZATION_ID } from "@/lib/platformCatalog";
import { Card, SampleDataBadge } from "@/components/ui";
import { PostureForm } from "./posture-form";
import { seedProfiles, resolveAlias, type LenderFlexibilityProfile } from "@/domain/lenderPosture";

export const dynamic = "force-dynamic";

interface ProfileRow {
  id: string;
  lender_id: string;
  posture: LenderFlexibilityProfile["posture"];
  pricing_tendency: LenderFlexibilityProfile["pricingTendency"];
  exceptions_considered: boolean;
  exception_channel: string | null;
  posture_notes: string | null;
  is_verified: boolean;
  last_reviewed_at: string | null;
}

export default async function AdminLenderPosturePage() {
  const { supabase, scope } = await requireOrgOrPlatformAdmin();
  const org = scope.organizationId;

  const [lendersRes, profilesRes] = await Promise.all([
    supabase.from("lenders").select("id, name, is_sample_data, active").eq("organization_id", PLATFORM_CATALOG_ORGANIZATION_ID).is("deleted_at", null).order("name"),
    supabase.from("lender_flexibility_profiles").select("*").eq("organization_id", org).is("deleted_at", null),
  ]);
  if (lendersRes.error) throw new Error(lendersRes.error.message);
  if (profilesRes.error) throw new Error(profilesRes.error.message);

  const lenders = (lendersRes.data ?? []) as Array<{ id: string; name: string; is_sample_data: boolean; active: boolean }>;
  const profiles = (profilesRes.data ?? []) as ProfileRow[];
  const profileByLender = new Map(profiles.map((p) => [p.lender_id, p]));

  // Seed defaults (by canonical lender name) so admins can see + override the
  // 21 curated defaults even before a DB row exists.
  const seedByLenderName = new Map<string, LenderFlexibilityProfile>();
  for (const p of seedProfiles(org)) seedByLenderName.set(resolveAlias(p.lenderId), p);

  const isPlatform = scope.kind === "platform";

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-lg font-semibold text-slate-900">Lender posture profiles (flexibility)</h2>
        <p className="text-sm text-slate-500">
          Editorial metadata about lender flexibility — <strong>not a guideline and never a scoring input.</strong>{" "}
          {isPlatform
            ? "Platform admin view: edits the shared defaults every subscriber org inherits (they can override per-org)."
            : "Your organization&apos;s override view — these edits apply to your org only."}{" "}
          Keep <code>lastReviewedAt</code> current; profiles older than 180 days are flagged &ldquo;possibly stale.&rdquo;
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
              const seed = seedByLenderName.get(resolveAlias(lender.name));
              return (
                <tr key={lender.id} className="align-top">
                  <td className="py-2 pr-4">
                    <span className="font-medium">{lender.name}</span> {lender.is_sample_data ? <SampleDataBadge /> : null}
                    {!lender.active ? <span className="ml-1 text-xs text-slate-400">(inactive)</span> : null}
                    {!p && seed ? (
                      <span className="ml-1 rounded-full bg-slate-100 px-2 py-0.5 text-[10px] text-slate-500">seed default</span>
                    ) : null}
                  </td>
                  <td className="py-2">
                    <PostureForm
                      value={{
                        lenderId: lender.id,
                        profileId: p?.id,
                        posture: p?.posture ?? seed?.posture,
                        pricingTendency: p?.pricing_tendency ?? seed?.pricingTendency,
                        exceptionsConsidered: p?.exceptions_considered ?? seed?.exceptionsConsidered,
                        exceptionChannel: p?.exception_channel ?? seed?.exceptionChannel,
                        postureNotes: p?.posture_notes ?? seed?.postureNotes,
                        isVerified: p?.is_verified ?? seed?.isVerified,
                        lastReviewedAt: p?.last_reviewed_at ?? seed?.lastReviewedAt,
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