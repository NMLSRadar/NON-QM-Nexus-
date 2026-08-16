import { requirePlatformAdmin } from "@/lib/admin";
import { createServiceRoleClient } from "@/lib/repository/serviceRoleClient";
import { Card } from "@/components/ui";
import { ReassignRepForm } from "./reassign-rep-form";
import { CreateRepForm } from "./create-rep-form";
import { RepActiveToggle } from "./rep-active-toggle";

export const dynamic = "force-dynamic";

export default async function AdminAttributionPage() {
  await requirePlatformAdmin();
  const service = createServiceRoleClient();

  const [{ data: reps, error: repsError }, { data: orgAttributions, error: orgsError }, { data: captures, error: capturesError }, { data: changes, error: changesError }, { data: repUsers, error: repUsersError }, { data: allUsers, error: allUsersError }] =
    await Promise.all([
      service.from("sales_reps").select("id, user_id, code, display_name, is_active").order("display_name"),
      service
        .from("organization_attribution")
        .select("id, organization_id, attributed_to_user_id, method, status, conflict_detail, first_captured_at")
        .order("first_captured_at", { ascending: false }),
      service.from("attribution_captures").select("id, organization_id, rep_code, rep_user_id, method, source, resolved, created_at").order("created_at", { ascending: false }),
      service.from("attribution_changes").select("id, organization_id, from_user_id, to_user_id, reason, changed_by, created_at").order("created_at", { ascending: false }),
      service.from("organizations").select("id, name"),
      service.from("users").select("id, email").is("deleted_at", null).order("email"),
    ]);
  if (repsError) throw new Error(repsError.message);
  if (orgsError) throw new Error(orgsError.message);
  if (capturesError) throw new Error(capturesError.message);
  if (changesError) throw new Error(changesError.message);
  if (repUsersError) throw new Error(repUsersError.message);
  if (allUsersError) throw new Error(allUsersError.message);

  const emailByUserId = new Map<string, string>();
  for (const rep of reps ?? []) {
    const { data: user, error } = await service.from("users").select("email").eq("id", rep.user_id).maybeSingle();
    if (!error && user) emailByUserId.set(rep.user_id, user.email as string);
  }

  const orgNameById = new Map((repUsers ?? []).map((o) => [o.id, o.name as string]));
  const repByUserId = new Map((reps ?? []).map((r) => [r.user_id, r]));
  const capturesByOrg = new Map<string, typeof captures>();
  for (const c of captures ?? []) {
    const list = capturesByOrg.get(c.organization_id) ?? [];
    list.push(c);
    capturesByOrg.set(c.organization_id, list);
  }
  const changesByOrg = new Map<string, typeof changes>();
  for (const c of changes ?? []) {
    const list = changesByOrg.get(c.organization_id) ?? [];
    list.push(c);
    changesByOrg.set(c.organization_id, list);
  }

  const rows = (orgAttributions ?? []).map((row) => ({
    ...row,
    organization_name: orgNameById.get(row.organization_id) ?? "Unknown org",
    captures: capturesByOrg.get(row.organization_id) ?? [],
    changes: changesByOrg.get(row.organization_id) ?? [],
  }));

  const repLabel = (userId: string | null) => {
    if (!userId) return null;
    const rep = repByUserId.get(userId);
    return { name: rep?.display_name ?? emailByUserId.get(userId) ?? "Unknown user", code: rep?.code ?? null };
  };

  const needsReview = rows.filter((r) => r.status === "needs_review");
  const classifiedCount = rows.filter((r) => r.status !== "unattributed").length;
  const unattributedCount = rows.filter((r) => r.status === "unattributed").length;

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-lg font-semibold text-white">Signup Attribution</h2>
        <p className="text-sm text-slate-400">
          Which sales rep brought in each organization — captured at signup, admin-only. Members never see this data (RLS) and no member-facing route
          returns it. Reassignment writes an audited change row with a mandatory reason.
        </p>
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-sm">
        <div className="rounded-2xl border border-amber-500/20 bg-[#0a0a0b] p-4">
          <p className="text-xs text-slate-400">Organizations tracked</p>
          <p className="text-xl font-semibold text-white">{rows.length}</p>
        </div>
        <div className="rounded-2xl border border-amber-500/20 bg-[#0a0a0b] p-4">
          <p className="text-xs text-slate-400">Attributed to a rep</p>
          <p className="text-xl font-semibold text-white">{classifiedCount}</p>
        </div>
        <div className="rounded-2xl border border-red-500/30 bg-[#0a0a0b] p-4">
          <p className="text-xs text-slate-400">Conflicts needing review</p>
          <p className="text-xl font-semibold text-red-400">{needsReview.length}</p>
        </div>
        <div className="rounded-2xl border border-amber-500/20 bg-[#0a0a0b] p-4">
          <p className="text-xs text-slate-400">Unattributed</p>
          <p className="text-xl font-semibold text-white">{unattributedCount}</p>
        </div>
      </div>

      <Card title={`Conflicts needing review (${needsReview.length})`}>
        {needsReview.length === 0 ? (
          <p className="text-sm text-slate-400">No conflicts — every captured signup matches its org&apos;s rep.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-xs text-slate-400 uppercase tracking-wide">
                  <th className="pb-2 pr-3">Organization</th>
                  <th className="pb-2 pr-3">Current rep</th>
                  <th className="pb-2 pr-3">Conflict detail</th>
                  <th className="pb-2 pr-3">Captured via</th>
                  <th className="pb-2">Resolve</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800/60">
                {needsReview.map((row) => {
                  const current = repLabel(row.attributed_to_user_id);
                  const capturedCodes = row.captures
                    .map((c) => (c.rep_user_id ? repLabel(c.rep_user_id)?.code ?? c.rep_code : c.rep_code))
                    .filter(Boolean);
                  return (
                    <tr key={row.id}>
                      <td className="py-2 pr-3 font-medium text-white">{row.organization_name}</td>
                      <td className="py-2 pr-3 text-slate-300">{current ? `${current.name}${current.code ? ` (${current.code})` : ""}` : "—"}</td>
                      <td className="py-2 pr-3 text-xs text-amber-300/90">{row.conflict_detail ?? "Multiple captures reference different reps."}</td>
                      <td className="py-2 pr-3 text-xs text-slate-400">{capturedCodes.length ? capturedCodes.filter(Boolean).join(", ") : "—"}</td>
                      <td className="py-2">
                        <ReassignRepForm orgId={row.organization_id} orgName={row.organization_name} reps={reps ?? []} />
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </Card>

      <Card title={`All organizations (${rows.length})`}>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-xs text-slate-400 uppercase tracking-wide">
                <th className="pb-2 pr-3">Organization</th>
                <th className="pb-2 pr-3">Attributed rep</th>
                <th className="pb-2 pr-3">Method</th>
                <th className="pb-2 pr-3">Status</th>
                <th className="pb-2 pr-3">First captured</th>
                <th className="pb-2 pr-3">Reassignment history</th>
                <th className="pb-2">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100/10">
              {rows.map((row) => {
                const rep = repLabel(row.attributed_to_user_id);
                return (
                  <tr key={row.id}>
                    <td className="py-2 pr-3 font-medium text-white">{row.organization_name}</td>
                    <td className="py-2 pr-3 text-slate-300">
                      {rep ? (
                        <>
                          {rep.name}
                          {rep.code ? <span className="text-xs text-slate-500"> ({rep.code})</span> : null}
                        </>
                      ) : (
                        <span className="text-slate-500">Unattributed</span>
                      )}
                    </td>
                    <td className="py-2 pr-3 text-xs text-slate-400">{row.method}</td>
                    <td className="py-2 pr-3">
                      <span
                        className={`rounded-full px-2 py-0.5 text-xs ${
                          row.status === "confirmed"
                            ? "bg-emerald-100 text-emerald-700"
                            : row.status === "needs_review"
                              ? "bg-amber-100 text-amber-700"
                              : "bg-slate-200 text-slate-600"
                        }`}
                      >
                        {row.status}
                      </span>
                    </td>
                    <td className="py-2 pr-3 text-xs text-slate-400">{new Date(row.first_captured_at).toLocaleDateString()}</td>
                    <td className="py-2 pr-3">
                      {row.changes.length > 0 ? (
                        <span className="text-xs text-slate-500">
                          {row.changes.length} change{row.changes.length === 1 ? "" : "s"} (last:{" "}
                          {row.changes[0] ? new Date(row.changes[0].created_at).toLocaleDateString() : "—"})
                        </span>
                      ) : (
                        <span className="text-xs text-slate-600">—</span>
                      )}
                    </td>
                    <td className="py-2">
                      <ReassignRepForm orgId={row.organization_id} orgName={row.organization_name} reps={reps ?? []} />
                    </td>
                  </tr>
                );
              })}
              {rows.length === 0 ? (
                <tr>
                  <td colSpan={7} className="py-4 text-center text-slate-500">
                    No attribution rows yet — they appear as soon as users sign up.
                  </td>
                </tr>
              ) : null}
            </tbody>
          </table>
        </div>
      </Card>

      <Card title={`Sales reps (${(reps ?? []).length})`}>
        <div className="flex flex-col gap-4">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-xs text-slate-400 uppercase tracking-wide">
                <th className="pb-2 pr-3">Display name</th>
                <th className="pb-2 pr-3">Code</th>
                <th className="pb-2 pr-3">User</th>
                <th className="pb-2 pr-3">Status</th>
                <th className="pb-2">Share link</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100/10">
              {(reps ?? []).map((rep) => (
                <tr key={rep.id}>
                  <td className="py-2 pr-3 font-medium text-white">{rep.display_name}</td>
                  <td className="py-2 pr-3 font-mono text-xs text-slate-400">{rep.code}</td>
                  <td className="py-2 pr-3 text-xs text-slate-500">{emailByUserId.get(rep.user_id) ?? "—"}</td>
                  <td className="py-2 pr-3">
                    <RepActiveToggle repId={rep.id} isActive={rep.is_active} />
                  </td>
                  <td className="py-2 pr-3 text-xs text-slate-400">
                    <code className="text-amber-300/90">/signup?ref={rep.code}</code>
                  </td>
                </tr>
              ))}
              {(reps ?? []).length === 0 ? (
                <tr>
                  <td colSpan={5} className="py-4 text-center text-slate-500">
                    No sales reps yet — add the first one below.
                  </td>
                </tr>
              ) : null}
            </tbody>
          </table>
          <CreateRepForm users={(allUsers ?? []).map((u) => ({ id: u.id as string, email: u.email as string }))} />
        </div>
      </Card>
    </div>
  );
}