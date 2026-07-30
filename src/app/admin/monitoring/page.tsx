import { requirePlatformAdmin } from "@/lib/admin";
import { Card } from "@/components/ui";

export const dynamic = "force-dynamic";

interface MonitoredGuideline {
  id: string;
  label: string;
  source_url: string | null;
  last_checked_at: string | null;
  change_detected: boolean;
  programs: { name: string; lenders: { name: string } | { name: string }[] } | null;
}

export default async function AdminMonitoringPage() {
  const { supabase } = await requirePlatformAdmin();

  const { data, error } = await supabase
    .from("guideline_versions")
    .select("id, label, source_url, last_checked_at, change_detected, programs(name, lenders(name))")
    .not("source_url", "is", null)
    .eq("verification_status", "human_verified")
    .order("last_checked_at", { ascending: true, nullsFirst: true });
  if (error) throw new Error(error.message);

  const rows = (data ?? []) as unknown as MonitoredGuideline[];
  const changedCount = rows.filter((r) => r.change_detected).length;

  return (
    <div className="space-y-4">
      <div>
        <h2 className="text-lg font-semibold text-slate-900">Guideline monitoring</h2>
        <p className="text-sm text-slate-500">
          Every approved guideline&apos;s public source URL is re-checked automatically every 6 weeks (a hash of the
          page/PDF content is compared to the last check). A change never edits the program automatically — it only
          flags it here (and emails the admin) for a human to re-review and re-approve.
        </p>
        {changedCount > 0 ? (
          <p className="mt-2 text-sm font-medium text-amber-700">
            {changedCount} guideline{changedCount > 1 ? "s" : ""} changed since last review.
          </p>
        ) : null}
      </div>

      <Card>
        <table className="w-full text-sm">
          <thead>
            <tr className="text-left text-xs text-slate-500 uppercase tracking-wide">
              <th className="pb-2">Lender / Program</th>
              <th className="pb-2">Guideline</th>
              <th className="pb-2">Source</th>
              <th className="pb-2">Last checked</th>
              <th className="pb-2">Status</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {rows.map((r) => {
              const lenderObj = r.programs ? (Array.isArray(r.programs.lenders) ? r.programs.lenders[0] : r.programs.lenders) : undefined;
              return (
                <tr key={r.id}>
                  <td className="py-2 pr-4">
                    <div className="font-medium">{lenderObj?.name}</div>
                    <div className="text-slate-500">{r.programs?.name}</div>
                  </td>
                  <td className="py-2 pr-4 text-slate-500">{r.label}</td>
                  <td className="py-2 pr-4 max-w-xs truncate">
                    <a href={r.source_url ?? "#"} className="text-blue-600 hover:underline" target="_blank" rel="noreferrer">
                      {r.source_url}
                    </a>
                  </td>
                  <td className="py-2 pr-4 text-slate-500">
                    {r.last_checked_at ? new Date(r.last_checked_at).toLocaleString() : "Never — pending first run"}
                  </td>
                  <td className="py-2">
                    {r.change_detected ? (
                      <span className="rounded-full bg-amber-100 px-2 py-0.5 text-xs font-medium text-amber-800">
                        Changed — review needed
                      </span>
                    ) : r.last_checked_at ? (
                      <span className="rounded-full bg-emerald-100 px-2 py-0.5 text-xs font-medium text-emerald-800">Unchanged</span>
                    ) : (
                      <span className="rounded-full bg-slate-100 px-2 py-0.5 text-xs font-medium text-slate-600">Pending</span>
                    )}
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
