import { requirePlatformAdmin } from "@/lib/admin";
import { Card, SampleDataBadge } from "@/components/ui";
import { SpecialistToggle } from "./specialist-toggle";

export const dynamic = "force-dynamic";

interface ProgramRow {
  id: string;
  name: string;
  is_sample_data: boolean;
  lender_id: string;
  config: {
    citizenshipEligible?: string[];
    incomeDocTypes?: string[];
    foreignNationalSpecialist?: boolean;
    itinSpecialist?: boolean;
    bankStatementCleanExecution?: boolean;
    bankStatementFlexible?: boolean;
  };
}

export default async function AdminSpecialistsPage() {
  const { supabase } = await requirePlatformAdmin();
  const { data: lenders, error: lenderError } = await supabase.from("lenders").select("id, name").is("deleted_at", null);
  if (lenderError) throw new Error(lenderError.message);
  const lenderName = Object.fromEntries((lenders ?? []).map((l) => [l.id, l.name as string]));

  const { data, error } = await supabase
    .from("programs")
    .select("id, name, is_sample_data, lender_id, config")
    .eq("active", true)
    .is("deleted_at", null);
  if (error) throw new Error(error.message);

  const allPrograms = (data ?? []).map((p) => p as unknown as ProgramRow);

  const citizenshipPrograms = allPrograms
    .filter((p) => {
      const cit = p.config.citizenshipEligible ?? [];
      return cit.includes("itin") || cit.includes("foreign_national");
    })
    .sort((a, b) => (lenderName[a.lender_id] ?? "").localeCompare(lenderName[b.lender_id] ?? ""));

  const bankStatementPrograms = allPrograms
    .filter((p) => (p.config.incomeDocTypes ?? []).includes("bank_statement"))
    .sort((a, b) => (lenderName[a.lender_id] ?? "").localeCompare(lenderName[b.lender_id] ?? ""));

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-lg font-semibold text-slate-900">ITIN / Foreign National / Bank Statement specialist flags</h2>
        <p className="text-sm text-slate-500">
          Editorial signal only — see the field&apos;s doc comment in <code>src/domain/types/program.ts</code>. Toggling this
          adds a small, disclosed 5-point factor to the real match score for the applicable scenario and shows a
          &ldquo;Specialist&rdquo;/&ldquo;Clean-File Execution&rdquo;/&ldquo;Bank Statement Flexibility&rdquo; badge on the
          lender card in Best Lender Matches. It NEVER overrides real eligibility — a program that fails a hard
          citizenship/LTV/etc. check is still excluded regardless of this flag, and it never silently reorders results
          on its own; a genuinely stronger real match from another lender still outranks it. The bank-statement
          &ldquo;Clean-File Execution&rdquo; boost only applies when THIS scenario&apos;s own file classification is
          Clean and Straightforward; &ldquo;Bank Statement Flexibility&rdquo; only applies when it is Moderate/High
          complexity or Manual Review Recommended.
        </p>
      </div>

      <Card>
        <h3 className="mb-2 text-sm font-semibold text-slate-800">ITIN / Foreign National</h3>
        <table className="w-full text-sm">
          <thead>
            <tr className="text-left text-xs text-slate-500 uppercase tracking-wide">
              <th className="pb-2">Lender</th>
              <th className="pb-2">Program</th>
              <th className="pb-2">Eligible for</th>
              <th className="pb-2">ITIN specialist</th>
              <th className="pb-2">Foreign National specialist</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {citizenshipPrograms.map((p) => {
              const cit = p.config.citizenshipEligible ?? [];
              return (
                <tr key={p.id}>
                  <td className="py-2 pr-4">
                    <span className="font-medium">{lenderName[p.lender_id] ?? "—"}</span>{" "}
                    {p.is_sample_data ? <SampleDataBadge /> : null}
                  </td>
                  <td className="py-2 pr-4 text-slate-700">{p.name}</td>
                  <td className="py-2 pr-4 text-slate-500 text-xs">
                    {[cit.includes("itin") ? "ITIN" : null, cit.includes("foreign_national") ? "Foreign National" : null]
                      .filter(Boolean)
                      .join(" · ")}
                  </td>
                  <td className="py-2 pr-4">
                    {cit.includes("itin") ? (
                      <SpecialistToggle programId={p.id} flag="itinSpecialist" checked={!!p.config.itinSpecialist} />
                    ) : (
                      <span className="text-slate-300">—</span>
                    )}
                  </td>
                  <td className="py-2">
                    {cit.includes("foreign_national") ? (
                      <SpecialistToggle
                        programId={p.id}
                        flag="foreignNationalSpecialist"
                        checked={!!p.config.foreignNationalSpecialist}
                      />
                    ) : (
                      <span className="text-slate-300">—</span>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </Card>

      <Card>
        <h3 className="mb-2 text-sm font-semibold text-slate-800">Bank Statement</h3>
        <table className="w-full text-sm">
          <thead>
            <tr className="text-left text-xs text-slate-500 uppercase tracking-wide">
              <th className="pb-2">Lender</th>
              <th className="pb-2">Program</th>
              <th className="pb-2">Clean-file execution</th>
              <th className="pb-2">Guideline flexibility</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {bankStatementPrograms.map((p) => (
              <tr key={p.id}>
                <td className="py-2 pr-4">
                  <span className="font-medium">{lenderName[p.lender_id] ?? "—"}</span>{" "}
                  {p.is_sample_data ? <SampleDataBadge /> : null}
                </td>
                <td className="py-2 pr-4 text-slate-700">{p.name}</td>
                <td className="py-2 pr-4">
                  <SpecialistToggle
                    programId={p.id}
                    flag="bankStatementCleanExecution"
                    checked={!!p.config.bankStatementCleanExecution}
                  />
                </td>
                <td className="py-2">
                  <SpecialistToggle
                    programId={p.id}
                    flag="bankStatementFlexible"
                    checked={!!p.config.bankStatementFlexible}
                  />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </Card>
    </div>
  );
}
