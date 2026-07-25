// Batch 5 lender ingestion — see scripts/batch5-data.mjs for the
// rationale and real guideline data. Resolves the real admin explicitly
// by email (the fix applied after batch 3's org-resolution bug).
import { createClient } from "@supabase/supabase-js";
import { readFileSync } from "node:fs";
import { LENDERS } from "./batch5-data.mjs";

const env = Object.fromEntries(
  readFileSync(".env.local", "utf8")
    .split("\n")
    .filter((l) => l.includes("="))
    .map((l) => {
      const i = l.indexOf("=");
      return [l.slice(0, i), l.slice(i + 1)];
    })
);
const supabase = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY);

async function main() {
  const REAL_ADMIN_EMAIL = "nonqmnexusadmin@gmail.com";
  const { data: adminUser, error: adminError } = await supabase
    .from("users")
    .select("id")
    .eq("email", REAL_ADMIN_EMAIL)
    .single();
  if (adminError || !adminUser) throw new Error(`Failed to resolve the real admin user: ${adminError?.message}`);
  const adminUserId = adminUser.id;

  const { data: membership, error: membershipError } = await supabase
    .from("memberships")
    .select("organization_id")
    .eq("user_id", adminUserId)
    .maybeSingle();
  if (membershipError || !membership) throw new Error(`Failed to resolve admin's organization: ${membershipError?.message}`);
  const organizationId = membership.organization_id;

  const results = [];
  for (const entry of LENDERS) {
    const { data: lender, error: lenderError } = await supabase
      .from("lenders")
      .insert({
        organization_id: organizationId,
        name: entry.name,
        tier_level: entry.tierLevel,
        active: true,
        is_sample_data: false,
        notes: entry.notes,
      })
      .select("id")
      .single();
    if (lenderError) {
      console.error(`FAILED lender ${entry.name}: ${lenderError.message}`);
      continue;
    }

    const config = { lenderId: lender.id, isSampleData: false, active: true, ...entry.program };
    const { data: program, error: programError } = await supabase
      .from("programs")
      .insert({
        organization_id: organizationId,
        lender_id: lender.id,
        name: entry.program.name,
        is_sample_data: false,
        active: true,
        config,
        created_by: adminUserId,
      })
      .select("id")
      .single();
    if (programError) {
      console.error(`FAILED program for ${entry.name}: ${programError.message}`);
      continue;
    }

    const { error: gvError } = await supabase.from("guideline_versions").insert({
      organization_id: organizationId,
      program_id: program.id,
      label: entry.program.guidelineVersionLabel,
      effective_date: entry.program.effectiveDate,
      last_verified_date: entry.program.lastVerifiedDate ?? null,
      verification_status: "human_verified",
      reviewed_by: adminUserId,
      published_at: new Date().toISOString(),
      source_url: entry.program.sourceCitation,
    });
    if (gvError) {
      console.error(`FAILED guideline_version for ${entry.name}: ${gvError.message}`);
      continue;
    }

    results.push({ name: entry.name, lenderId: lender.id, programId: program.id, tier: entry.tierLevel });
    console.log(`OK: ${entry.name} (tier ${entry.tierLevel}) -> lender ${lender.id}, program ${program.id}`);
  }

  console.log(`\nDone. ${results.length}/${LENDERS.length} lenders ingested (organization ${organizationId}).`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
