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
const TODAY = "2026-07-27";

async function resolveAdminId() {
  const { data } = await admin.from("users").select("id").eq("email", "nonqmnexusadmin@gmail.com").single();
  return data.id;
}

async function main() {
  const createdBy = await resolveAdminId();

  // --- 1) UPDATE Acra Lending's real Platinum DSCR Program to the CURRENT
  // published guideline (DSCR Program Summary dated 02.02.2026 v1.1, a newer
  // version than the 05.15.2025 one this row was originally ingested from).
  // The new source explicitly lists Condotel/PUDtel as an eligible property
  // type (with reduced CLTV), a "DSCR < 1.0 or No Ratio" sub-tier, and ITIN +
  // Foreign National citizenship eligibility — all absent from the older
  // version this row previously reflected.
  const acraId = "778a789b-4a08-46c2-bbf9-199e396486eb";
  const { data: acraProgram } = await admin
    .from("programs")
    .select("id, config")
    .eq("lender_id", acraId)
    .eq("name", "Platinum DSCR Program")
    .single();
  const acraConfig = {
    ...acraProgram.config,
    propertyTypes: [...new Set([...acraProgram.config.propertyTypes, "condotel"])],
    citizenshipEligible: [...new Set([...acraProgram.config.citizenshipEligible, "itin", "foreign_national"])],
    guidelineVersionLabel: "DSCR Program Summary — 02.02.2026 v1.1",
    effectiveDate: "2026-02-02",
    lastVerifiedDate: TODAY,
    sourceCitation:
      "Acra Lending DSCR Program Summary 02.02.2026 v1.1 — https://api.acralending.com/uploads/DSCR_Program_Summary_2_02_2026_v1_1_1_ffc2a85bdc.pdf",
    notes:
      "Updated guideline (02.02.2026 v1.1) supersedes the prior version this program was originally ingested from (05.15.2025), which listed condotels as ineligible — condotels/PUDtels are now eligible at reduced CLTV (75% purchase / 70% rate-term refi / 65% cash-out refi, an additional 5% CLTV reduction for Florida properties). A 'DSCR < 1.0 or No Ratio' sub-tier is available at reduced CLTV (75%/70%/65%) and min FICO 640 — the standard tier requires min DSCR 1.20. Standard tier: <=$2,000,000 loan amount at 721+ FICO gets 80% purchase/80% R&T/65% cash-out; loan <$350k or >$1.5M capped at 75% max CLTV; rural properties and short-term rentals remain ineligible; 2-unit and warrantable condo capped at 75% CLTV; interest-only 5yr term available, capped at 75% CLTV. Citizenship now explicitly includes ITIN and Foreign National per the updated guideline (Foreign National: max $1.5M loan, 70%/65% CLTV, priced at 700 FICO; ITIN: max $1.0M loan, FICO-tiered CLTV 60-70%).",
  };
  await admin.from("programs").update({ config: acraConfig }).eq("id", acraProgram.id);
  console.log("Updated Acra Lending Platinum DSCR Program with condotel/no-ratio/ITIN/foreign-national coverage.");

  // --- 2) UPDATE Orion Lending's COIN X program: add condotel (explicitly
  // listed as a restricted-but-eligible property type on the Foreign
  // National guideline PDF) and foreign_national citizenship (that PDF is
  // literally the Foreign National guideline for this exact product).
  const orionId = "63f35b61-0518-4b48-b486-43e88c536a10";
  const { data: coinX } = await admin
    .from("programs")
    .select("id, config")
    .eq("lender_id", orionId)
    .eq("name", "COIN X Business Purpose Investor Cash Flow (1-4 Units)")
    .single();
  const coinXConfig = {
    ...coinX.config,
    propertyTypes: [...new Set([...coinX.config.propertyTypes, "condotel"])],
    citizenshipEligible: [...new Set([...coinX.config.citizenshipEligible, "foreign_national"])],
    notes:
      (coinX.config.notes ? coinX.config.notes + " " : "") +
      "Foreign National eligible per Orion's 'COIN X Business Purpose Investor Cash Flow Guidelines - Foreign National' (05.01.2026): max loan $1,500,000, min $150,000; 2-4 units/condos/condotel capped at 70% purchase/rate-term, 65% cash-out; rural capped at 70%/65%; first-time investor allowed; OFAC/sanctioned-country and diplomatic-immunity exclusions apply; citizens of China/Russia/Iran/North Korea excluded from TX (and, per governmental-affiliation ties, from AZ) transactions.",
  };
  await admin.from("programs").update({ config: coinXConfig }).eq("id", coinX.id);
  console.log("Updated Orion Lending COIN X with condotel + Foreign National coverage.");

  // --- 3) NEW real GreenBox Loans programs, from their own published
  // GBL Programs matrix (greenboxloans.com/gbl-programs/), verified today.
  const greenboxId = "666d06dc-b7d3-4a8a-ad83-390bd803f55c";
  const GBL_SOURCE = "GreenBox Loans GBL Programs matrix — https://greenboxloans.com/gbl-programs/";
  const newPrograms = [
    {
      name: "Elite Plus – Bank Statement",
      incomeDocTypes: ["bank_statement"],
      loanPurposes: ["purchase", "rate_term_refinance", "cash_out_refinance"],
      occupancies: ["primary", "second_home", "investment"],
      propertyTypes: ["single_family", "condo", "townhome", "pud", "2_4_unit"],
      minFico: 660,
      baseMaxLtv: 90,
      minLoanAmount: 100000,
      maxLoanAmount: 3500000,
      minReservesMonths: 0,
      interestOnlyAvailable: true,
      citizenshipEligible: ["us_citizen", "permanent_resident"],
      vestingEligible: ["individual", "joint_tenants", "trust"],
      notes:
        "Best pricing for qualified self-employed borrowers. Doc Type: 12/24-Mo bank statements (GreenBox does not publish separate matrices for 12-mo vs 24-mo — both are qualified under this single tier). Minimum loan amount not explicitly published; $100,000 assumed consistent with GreenBox's other published minimums.",
    },
    {
      name: "Elite Plus – P&L Only",
      incomeDocTypes: ["pnl_only"],
      loanPurposes: ["purchase", "rate_term_refinance", "cash_out_refinance"],
      occupancies: ["primary", "second_home"],
      propertyTypes: ["single_family", "condo", "townhome", "pud"],
      minFico: 680,
      baseMaxLtv: 80,
      minLoanAmount: 100000,
      maxLoanAmount: 2500000,
      minReservesMonths: 0,
      interestOnlyAvailable: false,
      citizenshipEligible: ["us_citizen", "permanent_resident"],
      vestingEligible: ["individual", "joint_tenants", "trust"],
      notes:
        "P&L must be prepared by the borrower's own licensed tax preparer (no bank statements required). Minimum loan amount not explicitly published; $100,000 assumed. Occupancy not explicitly stated on GBL Programs page; primary/second home assumed as typical for this doc type.",
    },
    {
      name: "Elite – P&L Only",
      incomeDocTypes: ["pnl_only"],
      loanPurposes: ["purchase", "rate_term_refinance", "cash_out_refinance"],
      occupancies: ["primary", "second_home"],
      propertyTypes: ["single_family", "condo", "townhome", "pud"],
      minFico: 660,
      baseMaxLtv: 80,
      minLoanAmount: 100000,
      maxLoanAmount: 2500000,
      minReservesMonths: 0,
      interestOnlyAvailable: false,
      citizenshipEligible: ["us_citizen", "permanent_resident"],
      vestingEligible: ["individual", "joint_tenants", "trust"],
      notes:
        "Any CPA, EA, or CTEC may prepare the P&L — even one who did not prepare the borrower's taxes (no bank statements required). Minimum loan amount not explicitly published; $100,000 assumed. Occupancy not explicitly stated; primary/second home assumed as typical for this doc type.",
    },
    {
      name: "ITIN – Bank Statement",
      incomeDocTypes: ["bank_statement"],
      loanPurposes: ["purchase", "rate_term_refinance", "cash_out_refinance"],
      occupancies: ["primary", "second_home"],
      propertyTypes: ["single_family", "condo", "townhome", "pud"],
      minFico: 0,
      baseMaxLtv: 85,
      minLoanAmount: 100000,
      maxLoanAmount: 1500000,
      minReservesMonths: 0,
      interestOnlyAvailable: false,
      citizenshipEligible: ["itin"],
      vestingEligible: ["individual"],
      notes:
        "Self-employed ITIN borrowers qualifying with bank-statement income; GreenBox publishes no minimum FICO requirement for this program. Doc Type: 12/24-Mo bank statements. Minimum loan amount not explicitly published; $100,000 assumed.",
    },
    {
      name: "ITIN – DSCR",
      incomeDocTypes: ["dscr"],
      loanPurposes: ["purchase", "rate_term_refinance", "cash_out_refinance"],
      occupancies: ["investment"],
      propertyTypes: ["single_family", "condo", "townhome", "pud", "2_4_unit"],
      minFico: 680,
      baseMaxLtv: 70,
      minDscr: 0.75,
      minLoanAmount: 100000,
      maxLoanAmount: 750000,
      minReservesMonths: 0,
      interestOnlyAvailable: true,
      citizenshipEligible: ["itin"],
      vestingEligible: ["individual", "llc"],
      notes: "Investment-property DSCR financing for ITIN borrowers. Minimum loan amount not explicitly published; $100,000 assumed.",
    },
    {
      name: "ITIN – Full Doc",
      incomeDocTypes: ["full_doc"],
      loanPurposes: ["purchase", "rate_term_refinance", "cash_out_refinance"],
      occupancies: ["primary", "second_home"],
      propertyTypes: ["single_family", "condo", "townhome", "pud"],
      minFico: 700,
      baseMaxLtv: 75,
      minLoanAmount: 100000,
      maxLoanAmount: 1500000,
      minReservesMonths: 0,
      interestOnlyAvailable: false,
      citizenshipEligible: ["itin"],
      vestingEligible: ["individual"],
      notes:
        "Named 'ITIN – Full Doc' on GreenBox's own published matrix, though the tile's Doc Type field is labeled 'P&L' — likely a display duplication with the adjacent ITIN P&L Only tile on GreenBox's own page (both tiles show identical FICO/LTV/loan-amount figures). Recorded here as full_doc to match the program's own name; verify directly with GreenBox before relying on this doc-type classification. Minimum loan amount not explicitly published; $100,000 assumed.",
    },
    {
      name: "ITIN – P&L Only",
      incomeDocTypes: ["pnl_only"],
      loanPurposes: ["purchase", "rate_term_refinance", "cash_out_refinance"],
      occupancies: ["primary", "second_home"],
      propertyTypes: ["single_family", "condo", "townhome", "pud"],
      minFico: 700,
      baseMaxLtv: 75,
      minLoanAmount: 100000,
      maxLoanAmount: 1500000,
      minReservesMonths: 0,
      interestOnlyAvailable: false,
      citizenshipEligible: ["itin"],
      vestingEligible: ["individual"],
      notes:
        "Any CPA, EA, or CTEC may prepare the P&L — even one who did not prepare the borrower's taxes. Minimum loan amount not explicitly published; $100,000 assumed.",
    },
    {
      name: "Foreign National – DSCR",
      incomeDocTypes: ["dscr"],
      loanPurposes: ["purchase", "rate_term_refinance", "cash_out_refinance"],
      occupancies: ["investment"],
      propertyTypes: ["single_family", "condo", "townhome", "pud", "2_4_unit"],
      minFico: 0,
      baseMaxLtv: 75,
      minDscr: 0.75,
      minLoanAmount: 100000,
      maxLoanAmount: 2500000,
      minReservesMonths: 0,
      interestOnlyAvailable: true,
      citizenshipEligible: ["foreign_national"],
      vestingEligible: ["individual", "llc"],
      notes: "US investment property for non-US-citizen foreign nationals; GreenBox publishes no minimum FICO requirement. Minimum loan amount not explicitly published; $100,000 assumed.",
    },
  ];

  for (const p of newPrograms) {
    const config = {
      active: true,
      minFico: p.minFico,
      lenderId: greenboxId,
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
      sourceCitation: GBL_SOURCE,
      vestingEligible: p.vestingEligible,
      lastVerifiedDate: TODAY,
      minReservesMonths: p.minReservesMonths,
      citizenshipEligible: p.citizenshipEligible,
      guidelineVersionLabel: "GBL Programs matrix — verified 2026-07-27",
      interestOnlyAvailable: p.interestOnlyAvailable,
      prepaymentPenaltyOptions: ["none"],
      notes: p.notes,
      ...(p.minDscr !== undefined ? { minDscr: p.minDscr } : {}),
    };
    const { error } = await admin.from("programs").insert({
      organization_id: PLATFORM_ORG,
      lender_id: greenboxId,
      name: p.name,
      is_sample_data: false,
      active: true,
      config,
      created_by: createdBy,
    });
    if (error) console.error(`Failed to insert ${p.name}:`, error.message);
    else console.log(`Inserted GreenBox Loans program: ${p.name}`);
  }
}

main().catch((err) => {
  console.error("FATAL", err.message);
  process.exit(1);
});
