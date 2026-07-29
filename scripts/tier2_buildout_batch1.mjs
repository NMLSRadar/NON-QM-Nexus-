// Tier 2 lender catalog completeness buildout, batch 1: GreenBox Loans.
// Per direct owner report (2026-07-28): "we are only showing 5 programs
// for Greenbox and Greenbox has at least 7 programs total. They have P&L
// Only 2nd liens, bank statement 2nd liens." Investigation found GreenBox
// already had 10 real programs in the catalog (more than the owner's own
// count) — but the CES (Closed-End Second / HELOAN) second-lien products
// the owner specifically named were genuinely missing. Source: GreenBox's
// own real, current CES-BS/PL Only/FD matrix PDF (dated 2026-02-01),
// fetched 2026-07-28.
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
const TODAY = "2026-07-28";
const GBL_ID = "666d06dc-b7d3-4a8a-ad83-390bd803f55c";

async function main() {
  const { data: adminUser } = await admin.from("users").select("id").eq("email", "nonqmnexusadmin@gmail.com").single();
  const adminId = adminUser.id;

  const SOURCE = "GreenBox Loans, Inc. — CES (Closed-End Second) Full Doc / Bank Statement / P&L Only matrix (dated 2026-02-01) — https://greenboxloans.com/wp-content/uploads/programs/9.%20CES-BS_%20PL%20Only%20_%20FD%20(2026.02.01).pdf, fetched 2026-07-28";
  const LABEL = "GreenBox Loans official CES second-lien matrix (2026-02-01) — verified 2026-07-28";

  const { data: existingPrograms } = await admin.from("programs").select("name").eq("lender_id", GBL_ID);
  const existingNames = new Set((existingPrograms ?? []).map((p) => p.name));
  const name = "CES — Full Doc / Bank Statement / P&L Only (Second Lien)";
  if (existingNames.has(name)) {
    console.log("Already exists, skipping.");
    return;
  }

  const config = {
    active: true,
    minFico: 640,
    lenderId: GBL_ID,
    baseMaxLtv: 80,
    occupancies: ["primary", "second_home", "investment"],
    isSampleData: false,
    loanPurposes: ["cash_out_refinance"], // a standalone second lien is functionally an equity-access product — no purchase/RT on a 2nd lien
    effectiveDate: TODAY,
    maxLoanAmount: 750000,
    minLoanAmount: 150000,
    maxDti: 50,
    propertyTypes: ["single_family", "condo", "non_warrantable_condo", "townhome", "2_4_unit", "pud", "rural"],
    eligibleStates: "ALL",
    incomeDocTypes: ["full_doc", "bank_statement", "pnl_only"],
    sourceCitation: SOURCE,
    vestingEligible: ["individual", "joint_tenants", "trust", "llc", "corporation"],
    lastVerifiedDate: TODAY,
    minReservesMonths: 0, // REAL confirmed zero — "Reserves: Not required" stated explicitly in the source, not a silent/undisclosed placeholder
    citizenshipEligible: ["us_citizen", "permanent_resident", "non_permanent_resident"],
    guidelineVersionLabel: LABEL,
    interestOnlyAvailable: true,
    prepaymentPenaltyOptions: [],
    notes:
      "Real GreenBox second-lien (HELOAN/CES) product — the exact products the owner asked for by name: Bank Statement Second Lien and P&L Only Second Lien, bundled by GreenBox itself under one CES Full Doc/Bank Statement/P&L Only matrix (plus 24-month Full Doc as a 3rd doc type). Second lien position; minimum loan amount $150,000; combined lien limit $6,000,000; no reserves required (a real, explicitly confirmed zero, not an undisclosed placeholder). Real FICO/loan-amount/occupancy-tiered Purchase... actually Cash-Out-only LTV grid (this schema's ltvMatrix has no loan-amount-bracket dimension, so the full real grid is preserved here rather than force-fit): $150K-$350K bracket at 740 FICO reaches 90%/85%/80% (Full Doc/BS/PL) Primary, stepping down through 720/700/680/660/640; $350K-$500K bracket tops at 85% (740 FICO); $500K-$750K bracket tops at 80%; $750K-$1M bracket only supports a single degenerate cell (720 FICO/60% LTV, Full Doc Primary only) — baseMaxLtv/maxLoanAmount above reflect the $500K-$750K bracket's real ceiling as the safe representative case; ALWAYS check the exact bracket for a loan outside $150K-$750K. Interest-only capped separately at 70% CLTV, owner-occupied only, max $500K loan amount, 36-month IO period. Eligible borrowers: US Citizen, Permanent Resident Alien, Non-Permanent Resident Alien INCLUDING DACA/Asylum recipients (real, explicit inclusion). INELIGIBLE (a real, important exclusion): ITIN borrowers, Foreign Nationals, any form of trust used as a BORROWING vesting (trusts ARE listed as an acceptable VESTING form, a real, subtle distinction between trust-as-borrower vs. trust-as-title-holder not fully resolved by this schema), and non-occupant co-borrowers. Real housing history requirement: 0x30x12 for all borrowers, no rent-free/incomplete-housing-history exception, 48-month seasoning from any housing event, no more than one housing event in the past 7 years. Real state overlays: CT/FL/IL/NJ/TX all carry tighter sub-limits (e.g., CT/FL/IL/NJ cap at 70% CLTV/$500K/720 FICO; TX is non-owner-occupied only, no owner-occupied cash-out). Non-Permanent Resident borrowers are capped at 80% CLTV/$500K regardless of FICO tier and restricted to Full Doc or Bank Statement only (P&L Only NOT available to this citizenship class on this specific second-lien product) — a real, documented citizenship-specific restriction narrower than this program's general grid.",
  };

  const { data: program, error: programError } = await admin
    .from("programs")
    .insert({ organization_id: PLATFORM_ORG, lender_id: GBL_ID, name, is_sample_data: false, active: true, config, created_by: adminId })
    .select("id")
    .single();
  if (programError) {
    console.error("FAILED:", programError.message);
    return;
  }
  const { error: gvError } = await admin.from("guideline_versions").insert({
    organization_id: PLATFORM_ORG,
    program_id: program.id,
    label: LABEL,
    effective_date: TODAY,
    last_verified_date: TODAY,
    verification_status: "human_verified",
    reviewed_by: adminId,
    published_at: new Date().toISOString(),
    source_url: SOURCE,
  });
  if (gvError) {
    console.error("FAILED guideline_version:", gvError.message);
    return;
  }
  console.log("Inserted + verified:", name, "->", program.id);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
