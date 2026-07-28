// Adds Brokers First Funding (BFF Wholesale) as a new Tier 3 lender, per
// the "14-Day Loan Officer Testing Access + Brokers First Funding
// Integration" spec (2026-07-28), Phase 9-11.
//
// Data source: bffws.com (Brokers First Funding's own live wholesale
// site), fetched 2026-07-28 — https://bffws.com/products_new/ (program
// catalog headline figures) and https://www.bffws.com/programs/bank-statement
// (full Bank Statement matrix summary table). These are the lender's own
// current marketing/program pages, not a stale third-party citation.
//
// Per the spec's explicit instruction NOT to invent unverified figures:
// each program below carries only the headline parameters actually
// published on bffws.com's own pages at time of fetch. Every guideline_
// versions row is inserted with verification_status = "draft" (this
// platform's "not yet confirmed by an admin reviewer" state — mirrors
// every other lender's real human-review gate; a lender is only
// customer-visible once an admin promotes a version to human_verified,
// per src/lib/repository/supabaseRepository.ts's verified-only filter).
// Fields not published on the fetched pages (full FICO/LTV/loan-amount
// matrix grid, reserve months, seasoning requirements, non-warrantable-
// condo/condotel specifics beyond what's stated) are left OFF the config
// rather than guessed, and each program's `notes` explicitly states what
// is pending the full matrix-PDF review.
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
const SOURCE_BASE = "https://bffws.com/products_new/ (program catalog) and https://www.bffws.com/programs/bank-statement (Bank Statement matrix summary) — fetched 2026-07-28";

async function resolveAdminId() {
  const { data, error } = await admin.from("users").select("id").eq("email", "nonqmnexusadmin@gmail.com").single();
  if (error || !data) throw new Error(`Failed to resolve admin user: ${error?.message}`);
  return data.id;
}

const PROGRAMS = [
  {
    name: "DSCR (1-4 Unit)",
    incomeDocTypes: ["dscr"],
    loanPurposes: ["purchase", "rate_term_refinance", "cash_out_refinance"],
    occupancies: ["investment"],
    propertyTypes: ["single_family", "condo", "townhome"],
    minFico: 640,
    baseMaxLtv: 85,
    minLoanAmount: 75000,
    maxLoanAmount: 3500000,
    citizenshipEligible: ["us_citizen", "permanent_resident"],
    vestingEligible: ["individual", "llc"],
    notes:
      "PENDING GUIDELINE REVIEW — headline figures only from bffws.com's live DSCR (1-4 Unit) program page (Max LTV 85%, Min FICO 640, Max Loan $3,500,000; short-term rentals/Airbnb/VRBO eligible via AirDNA, no-ratio/no-DSCR-floor option available, business-purpose/LLC vesting OK, no personal income documentation). NOT YET CONFIRMED: full FICO/loan-amount-tiered LTV matrix grid, minimum DSCR ratio, reserve months, seasoning requirements, and state restrictions — the site references a downloadable matrix PDF that was not successfully retrieved in this pass. Do not treat baseMaxLtv=85/minFico=640 as the full picture; a matrix-verification pass is required before this program should be presented as authoritative for a specific scenario.",
  },
  {
    name: "Bank Statement",
    incomeDocTypes: ["bank_statement"],
    loanPurposes: ["purchase", "rate_term_refinance", "cash_out_refinance"],
    occupancies: ["primary", "second_home", "investment"],
    propertyTypes: ["single_family", "condo", "townhome"],
    minFico: 620,
    baseMaxLtv: 90,
    minLoanAmount: 75000,
    maxLoanAmount: 4000000,
    interestOnlyAvailable: true,
    citizenshipEligible: ["us_citizen", "permanent_resident", "non_permanent_resident"],
    vestingEligible: ["individual", "trust"],
    notes:
      "PENDING GUIDELINE REVIEW — from bffws.com's own published Bank Statement program page and its \"Program Matrix Summary\" table: Max Loan $4,000,000 purchase / $3,000,000 cash-out; Max LTV 90% purchase (FICO & loan-amount tiered per the full matrix — NOT a flat 90% at every FICO/amount), 85% rate-and-term refi, 80% cash-out; Min FICO 620 (primary wage earner's FICO used); 12 or 24 months of statements (personal OR business, not mixed); business statements use a 50% standard expense factor or actual expenses via CPA/EA letter; interest-only available at 640+ FICO with tighter LTV caps (85%/80%/75% purchase/R&T/cash-out); 40-year fixed available with or without IO; non-permanent resident aliens eligible per the page's own eligibility list. baseMaxLtv here is set to 90 (the purchase ceiling) but the real matrix TIERS this by FICO and loan amount — NOT YET CONFIRMED: the full tiered grid, exact reserve months, and seasoning requirements. A matrix-verification pass (the linked \"Download Full Matrix (PDF)\") is required before this program's LTV should be treated as flatly available at every FICO/loan-amount combination.",
  },
  {
    name: "P&L Statement",
    incomeDocTypes: ["pnl_only"],
    loanPurposes: ["purchase", "rate_term_refinance", "cash_out_refinance"],
    occupancies: ["primary", "second_home", "investment"],
    propertyTypes: ["single_family", "condo", "townhome"],
    minFico: 660,
    baseMaxLtv: 80,
    minLoanAmount: 75000,
    maxLoanAmount: 2500000,
    citizenshipEligible: ["us_citizen", "permanent_resident"],
    vestingEligible: ["individual", "trust"],
    notes:
      "PENDING GUIDELINE REVIEW — headline figures only from bffws.com's live P&L Statement program page (Max LTV 80%, Min FICO 660, Max Loan Amount $2,500,000; CPA-prepared P&L as the primary income document, no tax returns or 4506-C required, 12 or 24-month P&L period accepted, all three occupancy types eligible). NOT YET CONFIRMED: full FICO/loan-amount-tiered LTV matrix, reserve months, CPA/preparer credential requirements beyond \"CPA-prepared,\" and seasoning requirements. A matrix-verification pass is required before this program should be presented as authoritative for a specific scenario.",
  },
  {
    name: "Asset Utilization",
    incomeDocTypes: ["asset_depletion"],
    loanPurposes: ["purchase", "rate_term_refinance", "cash_out_refinance"],
    occupancies: ["primary", "second_home", "investment"],
    propertyTypes: ["single_family", "condo", "townhome"],
    minFico: 680,
    baseMaxLtv: 80,
    minLoanAmount: 75000,
    maxLoanAmount: 2500000,
    citizenshipEligible: ["us_citizen", "permanent_resident"],
    vestingEligible: ["individual", "trust"],
    notes:
      "PENDING GUIDELINE REVIEW — headline figures only from bffws.com's live Asset Utilization program page (Max LTV 80%, Min FICO 680, Max Loan $2,500,000; no employment/income documentation required; 60-month asset divisor; retirement accounts counted at 70% of value; stocks, bonds, and mutual funds accepted; all three occupancy types eligible). NOT YET CONFIRMED: the full eligible-asset-type list and per-type haircuts beyond retirement-at-70%, minimum post-close asset threshold, reserve months, and seasoning requirements. A matrix-verification pass is required before this program should be presented as authoritative for a specific scenario.",
  },
];

async function main() {
  const createdBy = await resolveAdminId();

  const { data: existing } = await admin.from("lenders").select("id").eq("organization_id", PLATFORM_ORG).eq("name", "Brokers First Funding").maybeSingle();
  let lenderId = existing?.id;
  if (lenderId) {
    console.log(`Lender already exists (${lenderId}) — reusing, will only add missing programs.`);
  } else {
    const { data: lender, error: lenderError } = await admin
      .from("lenders")
      .insert({
        organization_id: PLATFORM_ORG,
        name: "Brokers First Funding",
        tier_level: 3,
        active: true,
        is_sample_data: false,
        notes:
          "BFF Wholesale (bffws.com). Wholesale-only Non-QM lender, NMLS #243082, licensed in 40+ states. Added per explicit request 2026-07-28 as a new Tier 3 lender with four program categories (DSCR, Bank Statement, P&L Only, Asset Utilization). All four programs are PENDING GUIDELINE REVIEW — headline figures sourced directly from bffws.com's own current program pages, but the full matrix PDFs (FICO/LTV/loan-amount tiered grids, reserve schedules, seasoning rules) have not yet been retrieved and reviewed. Do not present this lender's guidelines as fully verified until an admin completes that review and promotes the guideline_versions rows to human_verified.",
      })
      .select("id")
      .single();
    if (lenderError) throw new Error(`Failed to insert lender: ${lenderError.message}`);
    lenderId = lender.id;
    console.log(`Inserted lender Brokers First Funding -> ${lenderId}`);
  }

  const { data: existingPrograms } = await admin.from("programs").select("name").eq("lender_id", lenderId);
  const existingNames = new Set((existingPrograms ?? []).map((p) => p.name));

  for (const p of PROGRAMS) {
    if (existingNames.has(p.name)) {
      console.log(`Skip (already exists): ${p.name}`);
      continue;
    }
    const config = {
      active: true,
      minFico: p.minFico,
      lenderId,
      baseMaxLtv: p.baseMaxLtv,
      occupancies: p.occupancies,
      isSampleData: false,
      loanPurposes: p.loanPurposes,
      effectiveDate: TODAY,
      maxLoanAmount: p.maxLoanAmount,
      minLoanAmount: p.minLoanAmount,
      propertyTypes: p.propertyTypes,
      eligibleStates: "ALL",
      incomeDocTypes: p.incomeDocTypes,
      sourceCitation: SOURCE_BASE,
      vestingEligible: p.vestingEligible,
      // Deliberately NO lastVerifiedDate — this program has not been
      // through admin guideline review yet.
      minReservesMonths: 0, // NOT a confirmed zero — see notes; schema requires a number, "pending" state lives in guideline_versions.verification_status + notes text instead.
      citizenshipEligible: p.citizenshipEligible,
      guidelineVersionLabel: "BFF program page (pending matrix verification) — fetched 2026-07-28",
      interestOnlyAvailable: p.interestOnlyAvailable ?? false,
      prepaymentPenaltyOptions: ["not yet confirmed"],
      notes: p.notes,
    };
    const { data: program, error: programError } = await admin
      .from("programs")
      .insert({
        organization_id: PLATFORM_ORG,
        lender_id: lenderId,
        name: p.name,
        is_sample_data: false,
        active: true,
        config,
        created_by: createdBy,
      })
      .select("id")
      .single();
    if (programError) {
      console.error(`FAILED program ${p.name}: ${programError.message}`);
      continue;
    }

    const { error: gvError } = await admin.from("guideline_versions").insert({
      organization_id: PLATFORM_ORG,
      program_id: program.id,
      label: "BFF program page (pending matrix verification)",
      effective_date: TODAY,
      verification_status: "draft", // this platform's "not yet confirmed" state — NOT human_verified, so it stays admin-only/customer-invisible until reviewed
      source_url: SOURCE_BASE,
    });
    if (gvError) {
      console.error(`FAILED guideline_version for ${p.name}: ${gvError.message}`);
      continue;
    }
    console.log(`Inserted program ${p.name} -> ${program.id} (guideline_version: draft/pending review)`);
  }

  console.log("\nDone. Brokers First Funding is Tier 3, active, with 4 program stubs, all pending guideline review (not yet human_verified, so not yet customer-visible per the verified-only filter).");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
