// Batch 3 lender ingestion — see scripts/batch3-data.mjs for the full
// rationale, the real lenders' guideline data, and the disclosed
// exclusions. This script only handles the DB writes.
import { createClient } from "@supabase/supabase-js";
import { readFileSync } from "node:fs";
import { LENDERS } from "./batch3-data.mjs";

const envPath = ".env.local";
const env = Object.fromEntries(
  readFileSync(envPath, "utf8")
    .split("\n")
    .filter((l) => l.includes("="))
    .map((l) => {
      const i = l.indexOf("=");
      return [l.slice(0, i), l.slice(i + 1)];
    })
);

const supabase = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY);

async function main() {
  const { data: org, error: orgError } = await supabase.from("organizations").select("id").limit(1).single();
  if (orgError || !org) throw new Error(`Failed to resolve organization: ${orgError?.message}`);
  const organizationId = org.id;

  const { data: adminUser, error: adminError } = await supabase
    .from("users")
    .select("id")
    .eq("platform_admin", true)
    .limit(1)
    .single();
  if (adminError || !adminUser) throw new Error(`Failed to resolve platform admin: ${adminError?.message}`);
  const adminUserId = adminUser.id;

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
    });
    if (gvError) {
      console.error(`FAILED guideline_version for ${entry.name}: ${gvError.message}`);
      continue;
    }

    results.push({ name: entry.name, lenderId: lender.id, programId: program.id, tier: entry.tierLevel });
    console.log(`OK: ${entry.name} (tier ${entry.tierLevel}) -> lender ${lender.id}, program ${program.id}`);
  }

  console.log(`\nDone. ${results.length}/${LENDERS.length} lenders ingested.`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
