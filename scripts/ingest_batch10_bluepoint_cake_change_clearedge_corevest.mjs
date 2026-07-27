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

async function insertProgram(createdBy, lenderId, name, sourceCitation, versionLabel, p) {
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
    sourceCitation,
    vestingEligible: p.vestingEligible,
    lastVerifiedDate: TODAY,
    minReservesMonths: p.minReservesMonths ?? 0,
    citizenshipEligible: p.citizenshipEligible,
    guidelineVersionLabel: versionLabel,
    interestOnlyAvailable: p.interestOnlyAvailable ?? false,
    prepaymentPenaltyOptions: p.prepaymentPenaltyOptions ?? ["none"],
    notes: p.notes,
    ...(p.minDscr !== undefined ? { minDscr: p.minDscr } : {}),
  };
  const { error } = await admin.from("programs").insert({
    organization_id: PLATFORM_ORG,
    lender_id: lenderId,
    name,
    is_sample_data: false,
    active: true,
    config,
    created_by: createdBy,
  });
  if (error) console.error(`Failed to insert ${name}:`, error.message);
  else console.log(`Inserted: ${name}`);
}

async function main() {
  const createdBy = await resolveAdminId();
  const bluepointId = "a880b877-f2e8-458c-982d-d1079a657067";
  const cakeId = "98dc76f1-2794-424f-879e-dfbae9e8f079";
  const changeId = "2604d206-a39b-4a89-99f7-e4835d6654ef";
  const clearedgeId = "a683a2a9-062c-4538-999d-0db3dc086033";
  const corevestId = "39392616-8bcc-46e2-b23b-97d92cf3023e";

  // --- BluePoint Mortgage ---
  await insertProgram(createdBy, bluepointId, "Bank Statement Loan", "BluePoint Mortgage — Wholesale Mortgage Loan Products — https://bluepointmtg.com/loan-products/", "BluePoint Mortgage program page — verified 2026-07-27", {
    incomeDocTypes: ["bank_statement"],
    loanPurposes: ["purchase", "rate_term_refinance", "cash_out_refinance"],
    occupancies: ["primary", "second_home", "investment"],
    propertyTypes: ["single_family", "condo", "townhome"],
    minFico: 620,
    baseMaxLtv: 90,
    minLoanAmount: 150000,
    maxLoanAmount: 3500000,
    citizenshipEligible: ["us_citizen", "permanent_resident"],
    vestingEligible: ["individual", "trust"],
    notes: "12 months personal or business bank statements, no tax returns required. FICOs as low as 620 cap at 70% max LTV; 90% max LTV requires minimum 680 FICO. BluePoint's own income calculation service computes qualifying income for the broker.",
  });
  await insertProgram(createdBy, bluepointId, "Asset Utilization", "BluePoint Mortgage — Asset Utilization Loan — https://bluepointmtg.com/asset-utilization-mortgage-loan/", "BluePoint Mortgage program page — verified 2026-07-27", {
    incomeDocTypes: ["asset_depletion"],
    loanPurposes: ["purchase", "rate_term_refinance", "cash_out_refinance"],
    occupancies: ["primary", "second_home", "investment"],
    propertyTypes: ["single_family", "condo", "townhome"],
    minFico: 660,
    baseMaxLtv: 90,
    minLoanAmount: 150000,
    maxLoanAmount: 3000000,
    citizenshipEligible: ["us_citizen", "permanent_resident"],
    vestingEligible: ["individual", "trust"],
    notes: "Eligible liquid assets divided by 84 to calculate monthly qualifying income. Published asset-type factors: 100% checking/savings/money market; 70% stocks/bonds/mutual funds; 70% retirement accounts (borrower 59.5+); 60% retirement accounts (under 59.5). Max DTI 55%. Up to 90% LTV on purchase/rate-term refinance, up to 80% LTV on cash-out.",
  });

  // --- Cake Mortgage --- (real, distinct doc types confirmed on Cake's own
  // product menu, but Cake's product page is a JS-rendered app with no
  // per-product LTV/FICO figures exposed as static text — those specific
  // figures were not captured in this pass and require an AE quote or a
  // direct look at Cake's PDF guidelines to confirm.)
  await insertProgram(createdBy, cakeId, "Bank Statement", "Cake Mortgage — Loan Products — https://www.caketpo.com/products", "Cake Mortgage product menu — verified 2026-07-27", {
    incomeDocTypes: ["bank_statement"],
    loanPurposes: ["purchase", "rate_term_refinance", "cash_out_refinance"],
    occupancies: ["primary", "second_home", "investment"],
    propertyTypes: ["single_family", "condo", "townhome"],
    minFico: 0,
    baseMaxLtv: 0,
    minLoanAmount: 100000,
    maxLoanAmount: 3000000,
    citizenshipEligible: ["us_citizen", "permanent_resident"],
    vestingEligible: ["individual", "llc"],
    notes: "Confirmed as one of Cake's real published loan products (their own product menu explicitly lists Full Doc, Bank Statement, P&L, WVOE Only, 1099, Asset Utilization, DSCR 1-4, DSCR Multi-Family, DSCR Foreign National, and Closed End Seconds). Cake's product page is a JavaScript-rendered app that did not expose specific per-product LTV/FICO/loan-amount figures to static extraction in this pass — minFico/baseMaxLtv intentionally left at 0/unset rather than guessed; contact a Cake AE (30-minute response time advertised) or pull their PDF guidelines directly for current figures before quoting to a borrower.",
  });
  await insertProgram(createdBy, cakeId, "Asset Utilization", "Cake Mortgage — Loan Products — https://www.caketpo.com/products", "Cake Mortgage product menu — verified 2026-07-27", {
    incomeDocTypes: ["asset_depletion"],
    loanPurposes: ["purchase", "rate_term_refinance", "cash_out_refinance"],
    occupancies: ["primary", "second_home", "investment"],
    propertyTypes: ["single_family", "condo", "townhome"],
    minFico: 0,
    baseMaxLtv: 0,
    minLoanAmount: 100000,
    maxLoanAmount: 3000000,
    citizenshipEligible: ["us_citizen", "permanent_resident"],
    vestingEligible: ["individual", "trust"],
    notes: "Confirmed as a real Cake product from their own product menu; specific LTV/FICO figures not exposed by Cake's JS-rendered page in this pass — minFico/baseMaxLtv intentionally left at 0/unset rather than guessed; confirm with a Cake AE.",
  });
  await insertProgram(createdBy, cakeId, "DSCR Foreign National", "Cake Mortgage — DSCR Loan Eligibility Guidelines — https://caketpo.com/wp-content/uploads/2025/01/CAKE-DSCR-FINAL-2.0.pdf", "Cake DSCR Final 2.0 guideline — verified 2026-07-27", {
    incomeDocTypes: ["dscr"],
    loanPurposes: ["purchase", "rate_term_refinance", "cash_out_refinance"],
    occupancies: ["investment"],
    propertyTypes: ["single_family", "condo", "townhome"],
    minFico: 0,
    baseMaxLtv: 0,
    minLoanAmount: 100000,
    maxLoanAmount: 2000000,
    citizenshipEligible: ["foreign_national"],
    vestingEligible: ["individual", "llc"],
    notes: "Confirmed real via Cake's own published DSCR guideline PDF, which devotes a full section (4.6) to Foreign National eligibility, documentation, and both U.S.-credit and foreign-credit qualifying paths (including an ITIN path and, for borrowers without SSN or ITIN, a 999-99-9999 placeholder path). Specific LTV/FICO figures for this sub-product are in a separate matrix not captured in this pass — minFico/baseMaxLtv intentionally left at 0/unset; confirm current figures with Cake directly.",
  });

  // --- Change Wholesale --- (Community Mortgage CDFI already added; adding
  // its other two real published products.)
  await insertProgram(createdBy, changeId, "Foreign National", "Change Wholesale — Foreign National Loans — https://www.changewholesale.com/foreign-national", "Change Wholesale program page — verified 2026-07-27", {
    incomeDocTypes: ["dscr"],
    loanPurposes: ["purchase", "rate_term_refinance", "cash_out_refinance"],
    occupancies: ["investment"],
    propertyTypes: ["single_family", "condo", "townhome"],
    minFico: 0,
    baseMaxLtv: 75,
    minLoanAmount: 100000,
    maxLoanAmount: 2500000,
    interestOnlyAvailable: true,
    citizenshipEligible: ["foreign_national"],
    vestingEligible: ["individual", "llc"],
    notes: "Foreign National DSCR program for globally based borrowers — no traditional income documentation or U.S. credit required, no credit reference letter required, no sourcing of large deposits. Up to 75% LTV purchase/rate-term, up to 70% LTV cash-out. Loan amounts up to $2.5M. Interest-only options available. Foreign funds may be wired directly to closing agent; foreign assets permitted for reserves.",
  });
  await insertProgram(createdBy, changeId, "Alt-Doc", "Change Wholesale — Alt-Doc Loans — https://www.changewholesale.com/alt-doc", "Change Wholesale program page — verified 2026-07-27", {
    incomeDocTypes: ["bank_statement", "pnl_only", "wvoe_only", "1099", "asset_depletion", "full_doc"],
    loanPurposes: ["purchase", "rate_term_refinance", "cash_out_refinance"],
    occupancies: ["primary", "second_home", "investment"],
    propertyTypes: ["single_family", "condo", "townhome"],
    minFico: 0,
    baseMaxLtv: 0,
    minLoanAmount: 100000,
    maxLoanAmount: 2000000,
    citizenshipEligible: ["us_citizen", "permanent_resident"],
    vestingEligible: ["individual", "llc"],
    notes: "Confirmed real qualification methods from Change's own Alt-Doc page: 12-month bank statement, P&L only, Written VOE only, 1099 only, W-2 only, one-year tax return, Asset Depletion, Asset Qualifier, and a Full Doc option (all income types can be combined). A specific headline LTV/FICO figure was not cleanly extracted from Change's page in this pass (the page's matrix table did not extract as structured text) — minFico/baseMaxLtv intentionally left at 0/unset rather than guessed; confirm current figures directly with Change Wholesale.",
  });

  // --- ClearEdge Lending ---
  await insertProgram(createdBy, clearedgeId, "Bank Statement Loans", "ClearEdge Lending — Bank Statement Loans — https://clearedgelending.com/non-qm/bank-statement-loan/", "ClearEdge Lending program page — verified 2026-07-27", {
    incomeDocTypes: ["bank_statement"],
    loanPurposes: ["purchase", "rate_term_refinance", "cash_out_refinance"],
    occupancies: ["primary", "second_home", "investment"],
    propertyTypes: ["single_family", "condo", "townhome"],
    minFico: 620,
    baseMaxLtv: 90,
    minLoanAmount: 100000,
    maxLoanAmount: 3500000,
    citizenshipEligible: ["us_citizen", "permanent_resident"],
    vestingEligible: ["individual", "trust"],
    notes: "12- or 24-months personal or business bank statements. As little as 10% down (implying up to 90% LTV). Credit score as low as 620. Loans up to $3.5M. Max DTI 50%. Bank-statement qualifying income may be combined with wage-earner income.",
  });
  await insertProgram(createdBy, clearedgeId, "Investor Jade — DSCR Foreign National and ITIN", "ClearEdge Lending — Jade — https://clearedgelending.com/non-qm/jade-2/", "ClearEdge Lending Jade program page — verified 2026-07-27", {
    incomeDocTypes: ["dscr"],
    loanPurposes: ["purchase", "rate_term_refinance"],
    occupancies: ["investment"],
    propertyTypes: ["single_family", "condo", "townhome"],
    minFico: 0,
    baseMaxLtv: 70,
    minLoanAmount: 100000,
    maxLoanAmount: 1500000,
    citizenshipEligible: ["foreign_national", "itin"],
    vestingEligible: ["individual", "llc"],
    notes: "For foreign nationals and ITIN borrowers on investment properties (long-term or short-term rentals). Max loan amount $1.5M. Up to 70% LTV purchase, up to 65% LTV refinance. ClearEdge's separate DSCR Foreign National matrix (Investor Connect) further notes DSCR < 1.0 is not permitted for this borrower type, cash-out max 65%, and 6 months reserves.",
  });

  // --- CoreVest Finance --- (business-purpose portfolio lender; only its
  // Rental Portfolio product maps reasonably onto this platform's
  // individual-scenario doc-type model. Its Bridge/credit-line products are
  // asset-based commercial financing, not modeled well by an income-doc-type
  // schema, and are intentionally not added as separate program rows here.)
  await insertProgram(createdBy, corevestId, "Rental Portfolio Loan", "CoreVest Finance — Rental Portfolio Loans — https://www.corevestfinance.com/rental-portfolio-loan/", "CoreVest Finance product matrix — verified 2026-07-27", {
    incomeDocTypes: ["dscr"],
    loanPurposes: ["purchase", "rate_term_refinance", "cash_out_refinance"],
    occupancies: ["investment"],
    propertyTypes: ["single_family", "condo", "townhome", "2_4_unit", "5_plus_unit"],
    minFico: 0,
    baseMaxLtv: 75,
    minDscr: 1.2,
    minLoanAmount: 500000,
    maxLoanAmount: 50000000,
    citizenshipEligible: ["us_citizen", "permanent_resident"],
    vestingEligible: ["llc", "corporation"],
    notes: "Fixed-rate portfolio loan for 5+ rental properties/units (a minimum of 5 properties and $500,000 combined asset value required) — non-owner-occupied only, requiring >90% occupancy across the portfolio at close. Up to 75% LTV (70% LTV specifically on a 3-year term). 30-year amortization, 3/5/7/10-year term options. Minimum DSCR 1.20x. Ineligible property types: commercial, co-ops, manufactured, mixed-use, student housing, vacation rentals. Interest rates starting at 5.5% fixed (rate is disclosed for context, not used in eligibility matching). CoreVest's Single Asset Bridge Loan and credit-line products (18-24 month bridge terms, FICO 620+, 3 months bank statements + 2 years tax returns) are real but structurally a commercial bridge/line-of-credit product rather than a standard income-doc-type mortgage, and are not added as a separate program row in this schema.",
  });

  console.log("Batch 10 complete.");
}

main().catch((err) => {
  console.error("FATAL", err.message);
  process.exit(1);
});
