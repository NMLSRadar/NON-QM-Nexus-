import { requirePlatformAdmin } from "@/lib/admin";
import { Card } from "@/components/ui";
import { getEffectivePostureProfiles } from "@/lib/lenderPosture";
import { isProfileStale, EDITORIAL_DISCLAIMER, PRICING_TENDENCY_EXPLAINER, POSTURE_LABELS } from "@/domain/lenderPosture";
import { PostureEditor } from "./posture-editor";

export const dynamic = "force-dynamic";

/**
 * Lender posture maintenance (chatbot upgrade Part 2). Editorial market-
 * experience metadata only — this page maintains the flexibility/exception
 * layer; it never touches guideline data, rule outcomes, or match scoring.
 */
export default async function LenderPosturePage() {
  const { supabase } = await requirePlatformAdmin();
  const profiles = await getEffectivePostureProfiles(supabase);
  const now = new Date();
  const stale = profiles.filter((p) => isProfileStale(p, now));

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-lg font-semibold text-white">Lender Posture Profiles</h2>
        <p className="mt-1 text-sm text-slate-400">
          {EDITORIAL_DISCLAIMER} Values here are advisory display context only — they can never affect eligibility, rule
          outcomes, or match scores. Review each profile at least every 180 days.
        </p>
        <p className="mt-2 text-xs text-slate-500">{PRICING_TENDENCY_EXPLAINER}</p>
      </div>

      {stale.length > 0 && (
        <Card>
          <p className="text-sm font-semibold text-amber-300">
            {stale.length} profile{stale.length === 1 ? "" : "s"} possibly stale (last reviewed over 180 days ago):{" "}
            {stale.map((p) => p.canonicalName).join(", ")}
          </p>
        </Card>
      )}

      <div className="space-y-3">
        {[...profiles]
          .sort((a, b) => a.canonicalName.localeCompare(b.canonicalName))
          .map((p) => (
            <Card key={p.id}>
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <p className="text-sm font-semibold text-white">
                    {p.canonicalName}{" "}
                    <span className="ml-1 rounded-full border border-amber-500/25 px-2 py-0.5 text-[10px] text-amber-300">
                      {POSTURE_LABELS[p.posture]}
                    </span>
                    {isProfileStale(p, now) && (
                      <span className="ml-1 rounded-full border border-rose-500/40 px-2 py-0.5 text-[10px] text-rose-400">
                        possibly stale
                      </span>
                    )}
                  </p>
                  <p className="mt-0.5 text-xs text-slate-500">
                    {p.source} · {p.isVerified ? "verified" : "unverified"} · confidence {p.confidence} · last reviewed{" "}
                    {p.lastReviewedAt ?? "never"} · aliases: {p.aliases.join(", ") || "—"}
                  </p>
                  <p className="mt-1 text-xs text-slate-400">{p.postureNotes}</p>
                </div>
                <PostureEditor profile={{
                  canonicalName: p.canonicalName,
                  posture: p.posture,
                  pricingTendency: p.pricingTendency,
                  postureNotes: p.postureNotes,
                  exceptionsConsidered: p.exceptionsConsidered,
                  exceptionChannel: p.exceptionChannel ?? "",
                  aliases: p.aliases,
                }} />
              </div>
            </Card>
          ))}
      </div>
    </div>
  );
}
