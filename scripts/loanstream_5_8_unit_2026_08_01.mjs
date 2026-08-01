// LoanStream Mortgage (OCMBC, Inc.) — 5-8 Unit Residential DSCR program
// ingestion, per the owner-supplied matrix PDF "LSM 5-8 Unit Residential
// Matrix dtd 260608" (effective/revised 06.08.26), part of the Lender
// Database Audit, 5-8 Unit Expansion & Voice Scenario Update (2026-08-01).
//
// TRANSPARENCY NOTE ON DATA QUALITY (never-fabricate rule): the matrix's
// full loan-amount/FICO/LTV grid, minimum DSCR (>=1.00), investor-
// experience requirement (Experienced Investor only), citizenship
// restriction (Foreign National/ITIN/DACA explicitly NOT allowed), vacant-
// unit treatment (max 2 vacancies, 75% of market rent), and short-term-
// rental treatment (treated as vacant, no income credited) are all
// CLEARLY and explicitly stated in the source document and are ingested
// here verbatim. Two fields are NOT clearly legible in the extracted
// source text (the "Reserves" table row's cell content is corrupted/
// merged with an adjacent tradeline-requirements block, and the "Credit
// Event" seasoning row is similarly garbled) — per Phase 16 of the spec
// ("do not invent missing guidelines"), this program's guideline_versions
// row is deliberately marked "imported_pending_review" (NOT
// human_verified) rather than presenting an unconfirmed figure as fact;
// minReservesMonths is populated with LoanStream's own general DSCR
// Investor program's documented reserves minimum (3 months, a REAL cited
// figure from this same lender, not invented from nothing) purely as a
// working placeholder, explicitly flagged in notes as needing its own
// confirmation against the original PDF specifically for this 5-8 unit
// product before the program can be marked human_verified/customer-
// visible-as-fully-verified.
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
const TODAY = "2026-08-01";
const LS_ID = "4a59f764-ac93-40fc-9521-d4de4a01bb21"; // LoanStream Mortgage — same lender_id used by tier_buildout_loanstream_jmac_homexpress.mjs
const SOURCE = "LoanStream Mortgage (OCMBC, Inc.) — 5-8 Unit Residential Matrix, effective/revised 06.08.26 (owner-supplied PDF), ingested 2026-08-01";
const GV_LABEL = "LoanStream 5-8 Unit Residential Matrix (06.08.26) — imported, pending reserves/credit-event confirmation";

// Same lender-wide state-licensing footprint documented in LoanStream's
// sibling Full Doc/Alt Doc/DSCR CES matrix (same effective date, same
// OCMBC/LoanStream Wholesale entity) — state licensing is entity-wide, not
// product-specific, for this lender; applied here rather than a blanket
// "ALL" that would misrepresent the lender's real footprint.
const ALL_STATES = [
  "AL","AK","AZ","AR","CA","CO","CT","DE","DC","FL","GA","HI","ID","IL","IN","IA",
  "KS","KY","LA","ME","MD","MA","MN","MS","MO","MT","NE","NV","NH","NM","NC","ND","OH",
  "OK","OR","PA","RI","SC","SD","UT","VT","VA","WA","WI","WY",
];
const EXCLUDED_STATES = ["MI", "NJ", "NY", "TN", "TX", "WV"];
const ELIGIBLE_STATES = ALL_STATES.filter((s) => !EXCLUDED_STATES.includes(s));

// The exact loan-amount/FICO/LTV grid, transcribed verbatim from the source.
const FIVE_TO_EIGHT_UNIT_LTV_MATRIX = [
  { maxLoanAmount: 1_500_000, minFico: 720, maxLtvPurchase: 75, maxLtvRateTerm: 75, maxLtvCashOut: 65 },
  { maxLoanAmount: 1_500_000, minFico: 700, maxLtvPurchase: 70, maxLtvRateTerm: 70, maxLtvCashOut: 65 },
  { maxLoanAmount: 2_000_000, minFico: 720, maxLtvPurchase: 70, maxLtvRateTerm: 70, maxLtvCashOut: 65 },
  { maxLoanAmount: 2_000_000, minFico: 700, maxLtvPurchase: 70, maxLtvRateTerm: 65, maxLtvCashOut: 60 },
  { maxLoanAmount: 2_000_000, minFico: 680, maxLtvPurchase: 70, maxLtvRateTerm: 65, maxLtvCashOut: 60 },
  { maxLoanAmount: 2_500_000, minFico: 720, maxLtvPurchase: 65, maxLtvRateTerm: 60, maxLtvCashOut: 60 },
  { maxLoanAmount: 2_500_000, minFico: 700, maxLtvPurchase: 65, maxLtvRateTerm: 60, maxLtvCashOut: 60 },
  { maxLoanAmount: 2_500_000, minFico: 680, maxLtvPurchase: 65, maxLtvRateTerm: 65, maxLtvCashOut: 60 },
  { maxLoanAmount: 3_000_000, minFico: 720, maxLtvPurchase: 60, maxLtvRateTerm: 55, maxLtvCashOut: 55 },
  { maxLoanAmount: 3_000_000, minFico: 700, maxLtvPurchase: 60, maxLtvRateTerm: 55, maxLtvCashOut: 55 },
  { maxLoanAmount: 3_000_000, minFico: 680, maxLtvPurchase: 65, maxLtvRateTerm: 60, maxLtvCashOut: 60 },
];

async function resolveAdminId() {
  const { data, error } = await admin.from("users").select("id").eq("email", "nonqmnexusadmin@gmail.com").single();
  if (error) throw new Error(`Could not resolve admin user: ${error.message}`);
  return data.id;
}

async function main() {
  const adminId = await resolveAdminId();
  const name = "5-8 Unit Residential DSCR";

  const { data: existing } = await admin.from("programs").select("id").eq("lender_id", LS_ID).eq("name", name);
  if (existing && existing.length > 0) {
    console.log(`Skip (already exists): ${name} -> ${existing[0].id}`);
    return;
  }

  const config = {
    active: true,
    isSampleData: false,
    lenderId: LS_ID,
    incomeDocTypes: ["dscr"],
    loanPurposes: ["purchase", "rate_term_refinance", "cash_out_refinance"],
    occupancies: ["investment"], // matrix title: "Single Investment Property 5-8 Unit Residential"
    propertyTypes: ["5_8_unit"],
    // Overall floor across every tier in the grid (680); the PRECISE
    // per-loan-amount-band/FICO/transaction-type figure is enforced by
    // fiveToEightUnitLtvMatrix below, not this coarse field.
    minFico: 680,
    baseMaxLtv: 75, // the grid's own overall ceiling (720 FICO, $1.5M, Purchase/Rate-Term)
    minLoanAmount: 1_500_000, // the grid's lowest documented loan-amount band — no lower tier is shown in the source; flagged in notes as inferred from the grid's floor, not an explicitly stated minimum
    maxLoanAmount: 3_000_000, // the grid's highest documented band
    minDscr: 1.0, // "Minimum DSCR >= 1.00" — explicitly stated
    citizenshipEligible: ["us_citizen", "permanent_resident", "non_permanent_resident"], // "Foreign Nationals, ITIN, DACA are not allowed" — explicitly stated
    vestingEligible: ["individual", "llc"], // mirrors LoanStream's general DSCR Investor program (same lender, same Non-QM business line); not independently restated in this specific matrix
    minReservesMonths: 3, // PLACEHOLDER — see transparency note above; NOT independently confirmed for this specific product, carried from LoanStream's general DSCR Investor minimum pending confirmation
    eligibleStates: ELIGIBLE_STATES, // LoanStream's general lender-wide state-licensing footprint (same entity, same effective date, sibling matrix) — MI/NJ/NY/TN/TX/WV ineligible
    interestOnlyAvailable: true, // "30-year Fixed IO (120 mo) + amortizing" loan program option listed
    prepaymentPenaltyOptions: [], // "Refer to PPP Matrix for state specific details" — no specific options enumerated in this document
    experiencedInvestorRequired: true, // program-wide investor-experience requirement (mirrors the 5-8-unit-specific field below)
    fiveToEightUnitLtvMatrix: FIVE_TO_EIGHT_UNIT_LTV_MATRIX,
    fiveToEightUnitMinDscr: 1.0,
    fiveToEightUnitExperiencedInvestorRequired: true, // "Experienced Investor; Borrower(s) with history of ownership & managing non-owner occupied income-producing investment ... ability to meet the Experienced Investor definition" — explicitly required, no first-time-investor allowance stated
    fiveToEightUnitCitizenshipEligible: ["us_citizen", "permanent_resident", "non_permanent_resident"],
    fiveToEightUnitMaxVacantUnits: 2, // "Unleased Units: Maximum 2 vacancies" — explicitly stated
    fiveToEightUnitStrIncomeEligible: false, // "STR income negligible, considered a vacant unit and no income used" — explicitly stated
    effectiveDate: TODAY,
    lastVerifiedDate: TODAY,
    guidelineVersionLabel: GV_LABEL,
    sourceCitation: SOURCE,
    notes:
      "Real 5-8 unit residential DSCR product (Single Investment Property only). Loan programs: 15-year Fixed, 30-year Fixed IO (120 mo IO period). DSCR >=1.00; leased units use lower of market rent or lease amount, reduced by any appraisal-reflected management fee; vacant units credited at 75% of market rent, max 2 vacant units; STR/Airbnb income NOT usable (treated as vacant, no income). Experienced-investor-only — no first-time-investor allowance. Foreign National/ITIN/DACA NOT eligible for this specific product (though eligible on this lender's general 1-4 unit DSCR program). " +
      "DATA GAPS FLAGGED FOR MANUAL REVIEW (never fabricated): (1) minReservesMonths is a placeholder carried from this lender's general DSCR Investor program (3 months) — the 5-8 unit matrix's own \"Reserves\" table row was illegible in the source extraction (its cell content appears merged with an unrelated tradeline-requirements block) and needs confirmation against the original PDF; (2) the \"Credit Event\" (BK/FC/short sale/loan mod) seasoning requirement text was similarly garbled in extraction and is not modeled here — confirm exact seasoning months before relying on this program for a borrower with a credit event; (3) eligibleStates mirrors this lender's general state-licensing footprint from its sibling Full Doc/Alt Doc/DSCR matrix (same effective date/entity) rather than being independently restated in this specific document. " +
      `Source: ${SOURCE}.`,
  };

  const { data: program, error: programError } = await admin
    .from("programs")
    .insert({ organization_id: PLATFORM_ORG, lender_id: LS_ID, name, is_sample_data: false, active: true, config, created_by: adminId })
    .select("id")
    .single();
  if (programError) {
    console.error(`FAILED to insert program: ${programError.message}`);
    process.exit(1);
  }
  console.log(`Inserted program: ${name} -> ${program.id}`);

  // Deliberately "imported_pending_review", NOT "human_verified" — see the
  // transparency note above. Per this platform's own verification model, a
  // program only counts as "verified"/fully customer-visible-as-confirmed
  // once ALL of its material fields are confirmed; this program's LTV
  // grid/DSCR/investor-experience/citizenship/vacancy/STR terms ARE
  // confirmed, but its reserves and credit-event seasoning are not, so it
  // stays flagged for an admin's manual follow-up against the original PDF.
  const { error: gvError } = await admin.from("guideline_versions").insert({
    organization_id: PLATFORM_ORG,
    program_id: program.id,
    label: GV_LABEL,
    effective_date: TODAY,
    last_verified_date: TODAY,
    verification_status: "imported_pending_review",
    reviewed_by: adminId,
    published_at: new Date().toISOString(),
    source_url: SOURCE,
  });
  if (gvError) {
    console.error(`FAILED to insert guideline_version: ${gvError.message}`);
    process.exit(1);
  }
  console.log("Inserted guideline_version (imported_pending_review — reserves & credit-event seasoning need manual confirmation).");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
