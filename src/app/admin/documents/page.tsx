import { requirePlatformAdmin } from "@/lib/admin";
import { Card } from "@/components/ui";
import { PLATFORM_CATALOG_ORGANIZATION_ID } from "@/lib/platformCatalog";
import { UploadForm } from "./upload-form";
import { ExtractionReviewCard } from "./extraction-review";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

interface ExtractionRow {
  id: string;
  document_id: string;
  fields: { lenderNameFound?: string | null; programs: unknown[] };
  documents: { file_name: string; lender_id: string; lenders: { name: string } | { name: string }[] | null } | null;
}

export default async function AdminDocumentsPage() {
  const { supabase } = await requirePlatformAdmin();

  const [{ data: lenders, error: lendersError }, { data: extractions, error: extractionsError }] = await Promise.all([
    // Scoped to the shared platform catalog (see src/lib/platformCatalog.ts)
    // and excludes sample/demo lenders — without this, a platform admin's
    // unrestricted RLS read returns every lender across every leftover
    // test-run organization ever created, producing a bloated, duplicated
    // dropdown (this was a real bug found live: sample lenders like "Atlas
    // Investor Finance (Sample)" appeared 8x, one per stray test org).
    supabase
      .from("lenders")
      .select("id, name")
      .eq("organization_id", PLATFORM_CATALOG_ORGANIZATION_ID)
      .eq("is_sample_data", false)
      .is("deleted_at", null)
      .order("name"),
    supabase
      .from("document_extractions")
      .select("id, document_id, fields, documents(file_name, lender_id, lenders(name))")
      .order("created_at", { ascending: false }),
  ]);

  if (lendersError) throw new Error(lendersError.message);
  if (extractionsError) throw new Error(extractionsError.message);

  const pending = ((extractions ?? []) as unknown as ExtractionRow[]).filter((e) => e.fields.programs.length > 0);

  return (
    <div className="space-y-4">
      <div>
        <h2 className="text-lg font-semibold text-slate-900">Lender guideline documents</h2>
        <p className="text-sm text-slate-500">
          Upload a lender&apos;s guideline/matrix PDF. AI reads it and proposes programs — nothing goes live until
          you review and approve each one below.
        </p>
      </div>

      <Card title="Upload a guideline PDF">
        <UploadForm lenders={lenders ?? []} />
      </Card>

      <Card title={`Pending review (${pending.reduce((n, e) => n + e.fields.programs.length, 0)} program(s))`}>
        {pending.length === 0 ? (
          <p className="text-sm text-slate-500">Nothing waiting on review right now.</p>
        ) : (
          <div className="space-y-3">
            {pending.map((extraction) =>
              extraction.fields.programs.map((program, i) => {
                const doc = extraction.documents;
                const lenderName = doc
                  ? Array.isArray(doc.lenders)
                    ? doc.lenders[0]?.name
                    : doc.lenders?.name
                  : undefined;
                return (
                  <ExtractionReviewCard
                    key={`${extraction.id}-${i}`}
                    extractionId={extraction.id}
                    documentFileName={doc?.file_name ?? "unknown file"}
                    lenderName={lenderName ?? "unknown lender"}
                    programIndex={i}
                    program={program}
                  />
                );
              })
            )}
          </div>
        )}
      </Card>
    </div>
  );
}
