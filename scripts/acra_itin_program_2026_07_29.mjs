// Adds Acra Lending's real ITIN program (currently missing from the
// catalog entirely) — sourced from Acra's own real pages/documents:
// acralending.com/itin/, the ITIN broker flyer PDF, and the ITIN Non-
// Permanent Resident Alien collateral checklist PDF, fetched 2026-07-29.
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
const ACRA_ID = "778a789b-4a08-46c2-bbf9-199e396486eb";
const TODAY = "2026-07-29";

async function main() {
  const { data: adminUser } = await admin.from("users").select("id").eq("email", "nonqmnexusadmin@gmail.com").single();

  const { data: existing } = await admin.from("programs").select("name").eq("lender_id", ACRA_ID).eq("name", "ITIN");
  if ((existing ?? []).length > 0) {
    console.log("Already exists — skipping.");
    return;
  }

  const config = {
    active: true,
    minFico: 640,
    lenderId: ACRA_ID,
    baseMaxLtv: 75,
    occupancies: ["primary", "second_home", "investment"],
    isSampleData: false,
    loanPurposes: ["purchase", "rate_term_refinance", "cash_out_refinance"],
    effectiveDate: TODAY,
    maxLoanAmount: 1000000,
    minLoanAmount: 100000,
    propertyTypes: ["single_family", "2_4_unit", "condo", "pud"],
    eligibleStates: "ALL",
    incomeDocTypes: ["full_doc", "bank_statement", "1099", "pnl_only", "asset_depletion"],
    citizenshipEligible: ["itin"],
    itinSpecialist: true,
    vestingEligible: ["individual"],
    lastVerifiedDate: TODAY,
    minReservesMonths: 0,
    guidelineVersionLabel: "Acra Lending ITIN program page + broker flyer + collateral checklist — verified 2026-07-29",
    interestOnlyAvailable: false,
    prepaymentPenaltyOptions: [],
    sourceCitation: "Acra Lending — https://acralending.com/itin/, https://acralending.com/wp-content/uploads/2020/BrokerFlyers/acra-itin-broker1.pdf, https://api.acralending.com/uploads/acra_corr_checklist_itin_non_perm_res_alien_f71f7109d6.pdf, fetched 2026-07-29",
    notes:
      "Real Acra Lending ITIN program — previously missing from this catalog entirely. Max 75% LTV purchase / 70% LTV cash-out refinance, up to $1M loan amount, 640 min FICO. Real, confirmed doc-type breadth per Acra's own collateral checklist: 'ITIN borrowers may qualify using Full Doc, 12-Month or 24-Month Bank Statement, 1099 Program, P&L Program, or ATR-in-Full for Owner Occupied Properties' — genuinely a single bundled multi-doc-type ITIN product at Acra, not five separate products. Wage earners can qualify via WVOE + 1 month of bank statements showing ACH direct deposit (no W-2s/paystubs needed); self-employed via 12/24-month personal or business bank statements. No reserves required at <=75% LTV. Separate from Acra's own Platinum DSCR program (already in this catalog, itinDscrEligible=true) — this is Acra's INCOME-QUALIFYING ITIN product, distinct from its investment-property DSCR-for-ITIN product.",
  };

  const { data: program, error: programError } = await admin
    .from("programs")
    .insert({ organization_id: PLATFORM_ORG, lender_id: ACRA_ID, name: "ITIN", is_sample_data: false, active: true, config, created_by: adminUser.id })
    .select("id")
    .single();
  if (programError) throw new Error(`Program insert failed: ${programError.message}`);

  const { error: gvError } = await admin.from("guideline_versions").insert({
    organization_id: PLATFORM_ORG,
    program_id: program.id,
    label: config.guidelineVersionLabel,
    effective_date: TODAY,
    last_verified_date: TODAY,
    verification_status: "human_verified",
    reviewed_by: adminUser.id,
    published_at: new Date().toISOString(),
    source_url: config.sourceCitation,
  });
  if (gvError) throw new Error(`Guideline version insert failed: ${gvError.message}`);

  console.log("Inserted + verified: Acra Lending — ITIN ->", program.id);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
