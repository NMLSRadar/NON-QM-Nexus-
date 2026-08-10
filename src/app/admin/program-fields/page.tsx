import { requirePlatformAdmin } from "@/lib/admin";
import { Card, SampleDataBadge } from "@/components/ui";
import { ProgramFieldsForm, type ConfigField } from "./program-fields-form";

export const dynamic = "force-dynamic";

interface ProgramRow {
  id: string;
  name: string;
  is_sample_data: boolean;
  lender_id: string;
  config: ConfigField;
}

export default async function AdminProgramFieldsPage() {
  const { supabase } = await requirePlatformAdmin();
  const [lendersRes, programsRes] = await Promise.all([
    supabase.from("lenders").select("id, name"),
    supabase.from("programs").select("id, name, is_sample_data, lender_id, config").eq("active", true).is("deleted_at", null).order("name"),
  ]);
  if (lendersRes.error) throw new Error(lendersRes.error.message);
  if (programsRes.error) throw new Error(programsRes.error.message);

  const lenderName = Object.fromEntries((lendersRes.data ?? []).map((l) => [l.id, l.name as string]));
  const programs = (programsRes.data ?? []).map((p) => p as unknown as ProgramRow);

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-lg font-semibold text-slate-900">Chatbot-precision structured fields</h2>
        <p className="text-sm text-slate-500">
          Admin-edit the structured fields that make the assistant precise (Part 1 §5): mortgage-late tolerance,
          credit-event seasoning, exception policy, estimated turn times, and borrower/property eligibility. An
          unpopulated field makes the assistant say it&apos;s unpopulated — it never infers. Written to the program&apos;s
          config; follow the same review discipline as other guideline data.
        </p>
      </div>

      <Card>
        <div className="space-y-3">
          {programs.map((p) => (
            <details key={p.id} className="rounded border border-slate-200 p-3">
              <summary className="cursor-pointer text-sm font-medium text-slate-800">
                {lenderName[p.lender_id] ?? "—"} · {p.name} {p.is_sample_data ? <SampleDataBadge /> : null}
              </summary>
              <div className="mt-3">
                <ProgramFieldsForm programId={p.id} config={p.config} />
              </div>
            </details>
          ))}
        </div>
      </Card>
    </div>
  );
}