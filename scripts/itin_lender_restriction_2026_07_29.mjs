import { createClient } from "@supabase/supabase-js";
import fs from "fs";

// Per direct guidance from the platform's licensed domain expert (2026-07-29):
// only ACC Mortgage, GreenBox Loans, Champions Funding, FundLoans, Acra
// Lending, HomeXpress Mortgage, and LendSure Mortgage Corp. actually offer
// ITIN programs per their real guidelines. This script removes "itin" from
// Program.citizenshipEligible for every OTHER active, non-sample program
// that was (incorrectly) carrying it — it never removes any other
// citizenship value from those programs, and never touches the 7 allowed
// lenders. Adding FundLoans/LendSure's real ITIN program data is a SEPARATE
// follow-up once their exact guideline figures (max LTV, min FICO, income
// doc types) are supplied — this script does not fabricate that data.

const env = Object.fromEntries(
  fs.readFileSync(".env.local", "utf8").split("\n").filter((l) => l.includes("=")).map((l) => {
    const i = l.indexOf("=");
    return [l.slice(0, i), l.slice(i + 1)];
  })
);
const admin = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY);
const PLATFORM_ORG = "bfe87b1c-86e7-4186-b1c4-ecc25d0e4420";

const ALLOWED_ITIN_LENDER_NAMES = new Set([
  "ACC Mortgage",
  "GreenBox Loans",
  "Champions Funding",
  "FundLoans",
  "Acra Lending",
  "HomeXpress Mortgage",
  "LendSure Mortgage Corp.",
]);

async function main() {
  const dryRun = process.argv.includes("--dry-run");

  const { data: lenders, error: lErr } = await admin.from("lenders").select("id, name").eq("organization_id", PLATFORM_ORG);
  if (lErr) throw lErr;
  const lenderById = new Map(lenders.map((l) => [l.id, l.name]));

  const { data: programs, error } = await admin
    .from("programs")
    .select("id, name, lender_id, config")
    .eq("organization_id", PLATFORM_ORG)
    .eq("active", true)
    .eq("is_sample_data", false);
  if (error) throw error;

  let corrected = 0;
  const changes = [];

  for (const p of programs) {
    const lenderName = lenderById.get(p.lender_id);
    if (ALLOWED_ITIN_LENDER_NAMES.has(lenderName)) continue; // one of the 7 allowed lenders — never touched

    const citizenshipEligible = p.config.citizenshipEligible ?? [];
    if (!citizenshipEligible.includes("itin")) continue; // wasn't flagged — nothing to correct

    const newEligible = citizenshipEligible.filter((c) => c !== "itin");
    changes.push({ lender: lenderName, program: p.name, before: citizenshipEligible, after: newEligible });

    if (!dryRun) {
      const { error: upErr } = await admin
        .from("programs")
        .update({ config: { ...p.config, citizenshipEligible: newEligible } })
        .eq("id", p.id);
      if (upErr) throw upErr;
    }
    corrected++;
  }

  console.log(`${dryRun ? "[DRY RUN] " : ""}Corrected ${corrected} program(s):`);
  for (const c of changes) {
    console.log(`  - ${c.lender} / ${c.program}: ${JSON.stringify(c.before)} -> ${JSON.stringify(c.after)}`);
  }
}

main().catch((e) => { console.error(e); process.exit(1); });
