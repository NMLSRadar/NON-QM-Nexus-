// First-run catalog seeding: a brand-new organization has no lenders,
// programs, or rules yet. Rather than duplicating the fictional demo
// catalog (src/data/sample*.ts) into hand-written SQL, we reuse those same
// TypeScript arrays as the single source of truth and insert them for the
// organization the first time its catalog is requested and found empty.
//
// This mirrors the FINALIZE.md intent: sampleLenders/samplePrograms/
// sampleRules are demonstration data every org starts with, until an admin
// replaces them with verified real lender guidelines.
import type { SupabaseClient } from "@supabase/supabase-js";
import { sampleLenders, samplePrograms } from "@/data/sampleLenders";
import { sampleRules } from "@/data/sampleRules";

export async function seedCatalogForOrganization(supabase: SupabaseClient, organizationId: string): Promise<void> {
  const lenderIdMap = new Map<string, string>();
  const programIdMap = new Map<string, string>();
  const guidelineVersionIdMap = new Map<string, string>();

  const lendersPayload = sampleLenders.map((l) => ({
    organization_id: organizationId,
    name: l.name,
    is_sample_data: l.isSampleData,
    active: l.active,
    contact_email: l.contactEmail ?? null,
    notes: l.notes ?? null,
  }));
  const { data: insertedLenders, error: lendersError } = await supabase
    .from("lenders")
    .insert(lendersPayload)
    .select("id, name");
  if (lendersError) throw new Error(`Catalog seed failed (lenders): ${lendersError.message}`);
  sampleLenders.forEach((l, i) => lenderIdMap.set(l.id, insertedLenders![i]!.id));

  // One guideline_version row per distinct guidelineVersionId referenced by
  // the sample programs (programs and their rules share the same id).
  const seenGv = new Set<string>();
  const gvPayload = samplePrograms
    .filter((p) => !seenGv.has(p.guidelineVersionId) && seenGv.add(p.guidelineVersionId))
    .map((p) => ({
      organization_id: organizationId,
      label: p.guidelineVersionLabel,
      effective_date: p.effectiveDate,
      last_verified_date: p.lastVerifiedDate ?? null,
      verification_status: "human_verified",
      _sampleGvId: p.guidelineVersionId,
      _sampleProgramId: p.id,
    }));

  const programsPayload = samplePrograms.map((p) => ({
    organization_id: organizationId,
    lender_id: lenderIdMap.get(p.lenderId),
    name: p.name,
    is_sample_data: p.isSampleData,
    active: p.active,
    config: p,
  }));
  const { data: insertedPrograms, error: programsError } = await supabase
    .from("programs")
    .insert(programsPayload)
    .select("id");
  if (programsError) throw new Error(`Catalog seed failed (programs): ${programsError.message}`);
  samplePrograms.forEach((p, i) => programIdMap.set(p.id, insertedPrograms![i]!.id));

  const gvInsertPayload = gvPayload.map(({ _sampleGvId, _sampleProgramId, ...rest }) => ({
    ...rest,
    program_id: programIdMap.get(_sampleProgramId),
  }));
  const { data: insertedGvs, error: gvError } = await supabase
    .from("guideline_versions")
    .insert(gvInsertPayload)
    .select("id");
  if (gvError) throw new Error(`Catalog seed failed (guideline_versions): ${gvError.message}`);
  gvPayload.forEach((gv, i) => guidelineVersionIdMap.set(gv._sampleGvId, insertedGvs![i]!.id));

  const rulesPayload = sampleRules.map((r) => ({
    organization_id: organizationId,
    program_id: programIdMap.get(r.programId),
    guideline_version_id: guidelineVersionIdMap.get(r.guidelineVersionId),
    category: r.category,
    name: r.name,
    definition: {
      conditions: r.conditions,
      outcomeWhenTrue: r.outcomeWhenTrue,
      outcomeWhenFalse: r.outcomeWhenFalse,
      setsField: r.setsField ?? null,
    },
    severity: r.severity,
    user_explanation: r.userExplanation,
    internal_explanation: r.internalExplanation ?? null,
    source_section: r.sourceSection ?? null,
    source_page: r.sourcePage ?? null,
    effective_date: r.effectiveDate ?? null,
    expiration_date: r.expirationDate ?? null,
    verification_status: r.verificationStatus,
  }));
  const { error: rulesError } = await supabase.from("rules").insert(rulesPayload);
  if (rulesError) throw new Error(`Catalog seed failed (rules): ${rulesError.message}`);
}
