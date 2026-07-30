import { createClient } from "@/lib/supabase/server";

/**
 * "Sponsored AE contact" cards on scenario results — presentation ONLY.
 * Shown for a lender's AE profile ONLY when that lender already
 * independently appears in this scenario's match list (evaluatedLenderIds
 * comes straight from analyzeScenario's real output); sponsorship never
 * adds, removes, or reorders which lenders appear here or anywhere else.
 */
export async function SponsoredAeContacts({ evaluatedLenderIds }: { evaluatedLenderIds: string[] }) {
  if (evaluatedLenderIds.length === 0) return null;

  const supabase = await createClient();
  const { data: activePlacements } = await supabase.from("ae_placements").select("ae_profile_id").eq("status", "active");
  if (!activePlacements || activePlacements.length === 0) return null;

  const sponsoredProfileIds = activePlacements.map((p) => p.ae_profile_id as string);
  const { data: profiles } = await supabase
    .from("ae_profiles")
    .select("id, lender_id, name, title, email, phone")
    .in("id", sponsoredProfileIds)
    .in("lender_id", evaluatedLenderIds)
    .eq("status", "claimed");

  if (!profiles || profiles.length === 0) return null;

  const { data: lenders } = await supabase.from("lenders").select("id, name").in("id", evaluatedLenderIds);
  const lenderName = new Map((lenders ?? []).map((l) => [l.id as string, l.name as string]));

  return (
    <div className="space-y-3">
      {profiles.map((p) => (
        <div key={p.id as string} className="rounded-card border-2 border-amber-500/50 bg-amber-500/5 p-4">
          <p className="text-xs font-semibold uppercase tracking-wide text-amber-300">Sponsored AE contact</p>
          <p className="mt-1 font-semibold text-white">
            {p.name as string} — {lenderName.get(p.lender_id as string) ?? ""}
          </p>
          {p.title ? <p className="text-sm text-slate-400">{p.title as string}</p> : null}
          <p className="mt-1 text-sm text-slate-300">
            {p.phone ? <a href={`tel:${p.phone as string}`}>{p.phone as string}</a> : null}
            {p.phone && p.email ? " · " : ""}
            <a href={`mailto:${p.email as string}`}>{p.email as string}</a>
          </p>
        </div>
      ))}
    </div>
  );
}
