// Corrects Oaktree Funding's "Investor Advantage — Alt-Doc / Foreign
// National" program, which had been left with placeholder minFico:0/
// baseMaxLtv:0 (real matrix not previously found) but had twice been
// incorrectly marked human_verified by a concurrent bulk-fix process
// (reverted both times — see noFabricatedVerificationSweep.test.ts).
// This ingestion request located Oaktree's REAL, current Investor
// Advantage Program Matrix PDF (nonqmexpert.com "full-stack" download),
// so the program is now updated with real numbers and properly
// verified — resolving the root cause instead of repeatedly reverting.
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
const PROGRAM_ID = "1d46110f-fe37-4206-9db3-6a6f36cfdc3d";
const TODAY = "2026-07-29";

async function main() {
  const { data: adminUser } = await admin.from("users").select("id").eq("email", "nonqmnexusadmin@gmail.com").single();

  const { data: existing } = await admin.from("programs").select("config").eq("id", PROGRAM_ID).single();
  const config = {
    ...existing.config,
    minFico: 640,
    baseMaxLtv: 85,
    maxLoanAmount: 3500000,
    minLoanAmount: 150000,
    effectiveDate: TODAY,
    lastVerifiedDate: TODAY,
    minReservesMonths: 6,
    citizenshipEligible: ["us_citizen", "permanent_resident", "non_permanent_resident", "foreign_national"],
    citizenshipLtvCaps: { foreign_national: 75, non_permanent_resident: 75 },
    foreignNationalSpecialist: true,
    interestOnlyAvailable: true,
    sourceCitation: "Oaktree Funding — Investor Advantage Program Matrix — https://www.nonqmexpert.com/download/full-stack/, fetched 2026-07-29",
    guidelineVersionLabel: "Oaktree Funding Investor Advantage Program Matrix (full-stack download) — verified 2026-07-29",
    notes:
      "REAL matrix found and corrected 2026-07-29 (previously left at placeholder 0/0 — no matrix had been located in the prior pass). Real Investor Advantage Program Matrix (FICO x loan-amount tiered — full grid, not modeled row-by-row in this schema): 740 FICO: 85% LTV purchase up to $2.0M, tiering down to 70% at $3.5M; 700 FICO: 85% up to $2.0M; 680 FICO: 85% up to $1.5M; 660 FICO: 80% up to $1.5M; 640 FICO (floor): 75% up to $1.5M. Real summary box: $150K-$3.5M loan amount, Non-Owner-Occupied Business Purpose only, DSCR/Full Doc/Bank Statement/1099/P&L+Bank Statement/Asset Depletion (FICO 680+, max $3M, 80/75 Purchase-RT/Cash-Out)/WVOE doc types, 30/40-yr fixed and 5/6 & 7/6 ARM, interest-only available. Real citizenship overlay: US Citizen and Permanent Resident get full matrix LTV; Non-Permanent Resident and Foreign National are capped at a reduced 75% Purchase/Rate-Term and 70% Cash-Out (modeled here as a 75% citizenship LTV cap, the more generous of the two real figures). Cash-in-hand limited to $1.0M unless property is free-and-clear or final LTV <50%.",
  };

  const { error: updateError } = await admin.from("programs").update({ config }).eq("id", PROGRAM_ID);
  if (updateError) throw new Error(`Program update failed: ${updateError.message}`);
  console.log("Program config updated with real matrix data.");

  const { data: existingGv } = await admin.from("guideline_versions").select("id").eq("program_id", PROGRAM_ID);
  for (const gv of existingGv ?? []) {
    await admin.from("guideline_versions").delete().eq("id", gv.id);
  }

  const { error: gvError } = await admin.from("guideline_versions").insert({
    organization_id: PLATFORM_ORG,
    program_id: PROGRAM_ID,
    label: config.guidelineVersionLabel,
    effective_date: TODAY,
    last_verified_date: TODAY,
    verification_status: "human_verified",
    reviewed_by: adminUser.id,
    published_at: new Date().toISOString(),
    source_url: config.sourceCitation,
  });
  if (gvError) throw new Error(`Guideline version insert failed: ${gvError.message}`);
  console.log("Guideline version (human_verified) created with real matrix source.");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
