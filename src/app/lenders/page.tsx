import { getCurrentOrganizationId, getRepository } from "@/lib/session";
import { Card, SampleDataBadge } from "@/components/ui";

export const dynamic = "force-dynamic";

export default async function LendersPage() {
  const repo = await getRepository();
  const org = await getCurrentOrganizationId();
  const [lenders, programs] = await Promise.all([repo.listLenders(org), repo.listPrograms(org)]);

  return (
    <div className="space-y-4">
      <h1 className="text-2xl font-semibold">Lenders</h1>
      <p className="text-sm text-slate-500">
        All lenders below are fictional demonstration entries. Administrators replace them with verified lender records
        and guideline versions before production use.
      </p>
      <div className="grid md:grid-cols-2 gap-4">
        {lenders.map((l) => {
          const progs = programs.filter((p) => p.lenderId === l.id);
          return (
            <Card key={l.id}>
              <div className="flex items-start justify-between gap-2">
                <h2 className="font-semibold">{l.name}</h2>
                {l.isSampleData ? <SampleDataBadge /> : null}
              </div>
              <ul className="mt-2 space-y-1">
                {progs.map((p) => (
                  <li key={p.id} className="text-sm text-slate-600">
                    {p.name} <span className="text-xs text-slate-400">({p.guidelineVersionLabel}, eff. {p.effectiveDate})</span>
                  </li>
                ))}
              </ul>
            </Card>
          );
        })}
      </div>
    </div>
  );
}
