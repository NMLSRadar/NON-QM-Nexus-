// Resolves the tension between two legitimate regression tests added
// 2026-07-29: noFabricatedVerificationSweep.test.ts (a program must
// never be human_verified while its numeric minFico/baseMaxLtv are
// still the unset placeholder 0/0) and
// programGuidelineVerificationCoverage.test.ts (an active, non-sample
// program must never have ZERO guideline_versions rows at all).
//
// The correct state for a deliberately-incomplete program (real
// qualitative facts added, but a real numeric matrix genuinely not yet
// located) is a guideline_versions row with verification_status =
// 'draft' — visible to admins via listAllLenders(), but never
// customer-visible via listLenders()/listPrograms() (which require
// human_verified), and satisfying the "has some row" coverage test.
import { createClient } from "@supabase/supabase-js";
import fs from "fs";

const env = Object.fromEntries(
  fs.readFileSync(".env.local", "utf8").split("\n").filter((l) => l.includes("=")).map((l) => {
    const i = l.indexOf("=");
    return [l.slice(0, i), l.slice(i + 1)];
  })
);
const admin = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY);
const PLATFORM_ORG = "bfe87b1c-86e7-4186-b1c4-ecc25d0e4420";
const TODAY = "2026-07-29";

async function main() {
  const { data: adminUser } = await admin.from("users").select("id").eq("email", "nonqmnexusadmin@gmail.com").single();

  const { data: programs } = await admin.from("programs").select("id,name,lender_id,config").eq("organization_id", PLATFORM_ORG).eq("active", true).eq("is_sample_data", false);
  const { data: lenders } = await admin.from("lenders").select("id,name").eq("organization_id", PLATFORM_ORG);
  const lenderName = Object.fromEntries(lenders.map((l) => [l.id, l.name]));

  const { data: gvs } = await admin.from("guideline_versions").select("program_id");
  const hasAnyGv = new Set(gvs.map((g) => g.program_id));

  const orphaned = programs.filter((p) => !hasAnyGv.has(p.id) && (p.config.minFico ?? 0) === 0 && (p.config.baseMaxLtv ?? 0) === 0);
  console.log(`Found ${orphaned.length} deliberately-incomplete zero-row programs. Inserting draft-status rows:`);
  for (const p of orphaned) {
    const c = p.config;
    const { error } = await admin.from("guideline_versions").insert({
      organization_id: PLATFORM_ORG,
      program_id: p.id,
      label: c.guidelineVersionLabel ?? `${lenderName[p.lender_id]} — ${p.name} (pending numeric matrix)`,
      effective_date: c.effectiveDate ?? TODAY,
      last_verified_date: c.lastVerifiedDate ?? null,
      verification_status: "draft",
      reviewed_by: adminUser.id,
      published_at: null,
      source_url: c.sourceCitation ?? null,
    });
    console.log(error ? `  FAILED: ${lenderName[p.lender_id]} — ${p.name}: ${error.message}` : `  Draft row created: ${lenderName[p.lender_id]} — ${p.name}`);
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
