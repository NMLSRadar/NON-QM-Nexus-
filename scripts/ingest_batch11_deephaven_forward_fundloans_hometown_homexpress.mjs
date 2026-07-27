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
  const deephavenId = "bdf1f7c1-5ec8-49c5-94c3-31da709110dc";
  const forwardId = "46815131-c36d-4477-95e1-c75e504074f3";
  const fundloansId = "3e810e11-a482-4107-b49b-a677ee6db404";
  const hometownId = "c2a50893-3f95-4e1c-ad1a-46af67db19ea";
  const homexpressId = "32789806-93a6-4929-ad6c-786064b2494a";

  // --- Deephaven Mortgage ---
  await insertProgram(createdBy, deephavenId, "Expanded Prime — Bank Statement / 1099 / Asset Utilization", "Deephaven Mortgage — Expanded Prime Wholesale Matrix — https://deephavenmortgage.com/wp-content/uploads/DHM-WHSL-Matrices_3.17.2385.pdf", "Deephaven Expanded Prime Wholesale Matrix (3.17.2385) — verified 2026-07-27", {
    incomeDocTypes: ["bank_statement", "1099", "asset_depletion"],
    loanPurposes: ["purchase", "rate_term_refinance"],
    occupancies: ["investment"],
    propertyTypes: ["single_family", "condo", "non_warrantable_condo", "townhome", "2_4_unit"],
    minFico: 0,
    baseMaxLtv: 80,
    minLoanAmount: 100000,
    maxLoanAmount: 2000000,
    minReservesMonths: 6,
    interestOnlyAvailable: true,
    citizenshipEligible: ["us_citizen", "permanent_resident", "non_permanent_resident", "foreign_national"],
    vestingEligible: ["individual", "llc"],
    notes: "Business-purpose investment-property matrix covering 12-month personal or business bank statements, 12-month 1099 income, and Asset Utilization under one shared LTV grid — up to 80% LTV on purchase/rate-term only (not cash-out under this specific matrix). Non-warrantable condos capped at 75%. Standard reserves 6 months PITI; Foreign Nationals require 12 months reserves and must hold assets in a U.S. FDIC-insured bank for a minimum of 30 days. Cash-out capped at $500,000 and may be used toward reserves. Interest-only available up to 75% LTV with minimum 1.00x DSCR. Foreign Nationals eligible at reduced LTV (65% purchase / 60% cash-out per Deephaven's DSCR-adjacent grid) with minimum DSCR 1.00x.",
  });

  // --- Forward Lending ---
  await insertProgram(createdBy, forwardId, "Non-QM Select — Bank Statement / Alt Doc", "Forward Lending — Forward Non-QM Loan Programs Matrix — https://forwardlendingmtg.com/wp-content/uploads/2024/02/FL-NQM-Matrix-dtd.-2.29.24.pdf", "Forward Non-QM Matrix (2.29.24) — verified 2026-07-27", {
    incomeDocTypes: ["bank_statement", "1099", "wvoe_only", "pnl_only", "asset_depletion"],
    loanPurposes: ["purchase", "rate_term_refinance", "cash_out_refinance"],
    occupancies: ["primary", "second_home", "investment"],
    propertyTypes: ["single_family", "condo", "townhome"],
    minFico: 660,
    baseMaxLtv: 80,
    minLoanAmount: 250000,
    maxLoanAmount: 1500000,
    interestOnlyAvailable: true,
    citizenshipEligible: ["us_citizen", "permanent_resident"],
    vestingEligible: ["individual", "trust"],
    notes:
      "Forward's 'NonQM Select' grade system offers Full Doc (12/24-month) or Alt Doc income types: 1099, WVOE, Asset Utilization, Bank Statements, P&L (with 3 months bank statements), one-year self-employment, or assets as blended income. Top grade tier: max 80% LTV purchase/rate-term, 75% LTV cash-out, minimum 660 FICO (bank-statement-only sub-tier). Lower grade tiers step down to 75%/65% LTV and $250,000-$1,500,000 loan amounts with Foreign Nationals and ITIN explicitly ineligible on those tiers per Forward's own matrix. 30-year and 40-year fixed interest-only options available (120 months IO + 240/360 months amortization); 5/6 and 7/6 SOFR ARMs. Forward separately advertises a DSCR Foreign National product (per their own webinar listing, 01/2026) not yet added here as its own program row — specific LTV/FICO figures for that product were not captured in this pass and are a flagged follow-up.",
  });

  // --- FundLoans ---
  await insertProgram(createdBy, fundloansId, "Bank Statement / P&L", "FundLoans — Loan Products — https://www.fundloans.com/loan-products", "FundLoans Loan Products page — verified 2026-07-27", {
    incomeDocTypes: ["bank_statement", "pnl_only"],
    loanPurposes: ["purchase", "rate_term_refinance", "cash_out_refinance"],
    occupancies: ["primary", "second_home", "investment"],
    propertyTypes: ["single_family", "condo", "townhome"],
    minFico: 0,
    baseMaxLtv: 90,
    minLoanAmount: 100000,
    maxLoanAmount: 6000000,
    interestOnlyAvailable: true,
    citizenshipEligible: ["us_citizen", "permanent_resident"],
    vestingEligible: ["individual", "trust"],
    notes: "12- or 24-month personal or business bank statements, or P&L only (no bank statements provided) — 7 published options for calculating qualifying income. Up to 90% LTV per a third-party guideline summary (ezfundings.com/fundloans-guidelines); FundLoans' own site states loan amounts up to $6,000,000 for this product without restating the LTV cap explicitly on the same page — both figures are disclosed here since they were not confirmed on a single page. Departing residence can be excluded from DTI. 30-year interest-only option available.",
  });
  await insertProgram(createdBy, fundloansId, "Assets Only", "FundLoans — Loan Products — https://www.fundloans.com/loan-products", "FundLoans Loan Products page — verified 2026-07-27", {
    incomeDocTypes: ["asset_depletion"],
    loanPurposes: ["purchase", "rate_term_refinance", "cash_out_refinance"],
    occupancies: ["primary", "second_home", "investment"],
    propertyTypes: ["single_family", "condo", "townhome"],
    minFico: 0,
    baseMaxLtv: 90,
    minLoanAmount: 100000,
    maxLoanAmount: 6000000,
    citizenshipEligible: ["us_citizen", "permanent_resident"],
    vestingEligible: ["individual", "trust"],
    notes: "Qualifying income based on assets only, using a 60-month asset allowance. Loan amounts up to $6,000,000 per FundLoans' own product page; a separate third-party summary describes a related '90% LTV up to $2M, 1-2 Year Full Doc' tier that appears to combine full-doc and assets-only features — not fully reconciled with this program row and disclosed here rather than merged. Can exclude departing residence from DTI.",
  });

  // --- Hometown Equity Mortgage (dba theLender) ---
  await insertProgram(createdBy, hometownId, "NONI — Non Owner No Income (Foreign National)", "Hometown Equity Mortgage — NONI — https://htem.com/thenoni/", "Hometown Equity Mortgage NONI Foreign National Matrix — verified 2026-07-27", {
    incomeDocTypes: ["dscr"],
    loanPurposes: ["purchase", "rate_term_refinance", "cash_out_refinance"],
    occupancies: ["investment"],
    propertyTypes: ["single_family", "condo", "townhome"],
    minFico: 0,
    baseMaxLtv: 75,
    minLoanAmount: 100000,
    maxLoanAmount: 1500000,
    citizenshipEligible: ["foreign_national"],
    vestingEligible: ["individual"],
    notes: "Investment properties only. No income, no job, and no U.S. credit required — only one credit/bank reference required. Up to 75% LTV purchase, up to 65% LTV rate-term refi or cash-out refi. First-time homebuyers and first-time investors both allowed. Assets held in a foreign account allowed toward reserves. A separate, older Hometown Equity flyer ('Getting to Know NONI') cites a stricter 65% LTV and individual-only vesting (no LLC) for foreign nationals — both figures disclosed here since the two Hometown Equity sources do not fully agree; the current live program page's figures (75%/65%/65%) are used as the primary figures above.",
  });
  await insertProgram(createdBy, hometownId, "Non-QM Bank Statement Qualifier", "Hometown Equity Mortgage / theLender — Non-QM Bank Statement Qualifier — https://www.thelender.com/wp-content/uploads/2021/03/theLender-Non-QM-Bank-Statement-Qualifier.pdf", "theLender Non-QM Bank Statement Qualifier guideline — verified 2026-07-27", {
    incomeDocTypes: ["bank_statement"],
    loanPurposes: ["purchase", "rate_term_refinance", "cash_out_refinance"],
    occupancies: ["primary", "second_home", "investment"],
    propertyTypes: ["single_family", "condo", "townhome"],
    minFico: 0,
    baseMaxLtv: 85,
    minLoanAmount: 100000,
    maxLoanAmount: 1500000,
    minReservesMonths: 6,
    citizenshipEligible: ["us_citizen", "permanent_resident", "non_permanent_resident"],
    vestingEligible: ["individual", "trust"],
    notes: "Personal or business bank statements. Max LTV is geographically tiered per Hometown Equity's own guideline: 85% in a defined 'Area 1' (e.g. Connecticut); 75% for rate-term refis / 70% for cash-out refis in a defined 'Area 2' (e.g. Essex NJ, San Francisco CA) — 85% recorded here as the best/headline tier; confirm the applicable area tier for a specific property before quoting. Reserves scale by loan amount: 6 months PITIA up to $1M, 9 months $1-1.5M, 12 months above $1.5M (reserve waivers available for certain rate-term refis). Non-Permanent Resident Aliens eligible with E, G, H, L, O, P, or TN visas.",
  });

  // --- HomeXpress Mortgage ---
  await insertProgram(createdBy, homexpressId, "Bank Statement Mortgage", "HomeXpress — Bank Statement Mortgage — https://homexpressdirect.com/homexpress-direct-mortgage-programs/bank-statement-mortgage/", "HomeXpress program page — verified 2026-07-27", {
    incomeDocTypes: ["bank_statement"],
    loanPurposes: ["purchase", "cash_out_refinance", "rate_term_refinance"],
    occupancies: ["primary", "second_home", "investment"],
    propertyTypes: ["single_family", "condo", "townhome"],
    minFico: 600,
    baseMaxLtv: 90,
    minLoanAmount: 100000,
    maxLoanAmount: 3000000,
    citizenshipEligible: ["us_citizen", "permanent_resident"],
    vestingEligible: ["individual", "trust"],
    notes: "12 or 24 months of personal or business bank statement deposits; no W-2s, paystubs, or tax returns required. Loans and cash-out refinances both up to $3,000,000. Minimum 600 FICO. Maximum 90% LTV. HomeXpress publishes materials under both homexpressdirect.com and homexmortgage.com; a related page on the second domain describes a similar bank-statement product with slightly different phrasing (up to 90% CLTV purchase / 80% CLTV cash-out, $1M max cash-in-hand) — both are disclosed as the same underlying product line rather than two separate ones.",
  });
  await insertProgram(createdBy, homexpressId, "Foreign National Mortgage", "HomeXpress — Foreign National Mortgage — https://homexpressdirect.com/homexpress-direct-mortgage-programs/foreign-national-mortgage/", "HomeXpress program page — verified 2026-07-27", {
    incomeDocTypes: ["dscr", "bank_statement", "1099", "asset_depletion", "full_doc"],
    loanPurposes: ["purchase", "cash_out_refinance"],
    occupancies: ["investment"],
    propertyTypes: ["single_family", "condo", "non_warrantable_condo", "condotel", "townhome"],
    minFico: 0,
    baseMaxLtv: 75,
    minLoanAmount: 100000,
    maxLoanAmount: 2500000,
    interestOnlyAvailable: true,
    citizenshipEligible: ["foreign_national"],
    vestingEligible: ["individual", "llc"],
    notes: "For non-U.S. citizens who neither reside nor work in the United States, investing in U.S. investment properties. Loans up to $2,500,000; cash-out refinance up to $2,000,000. No Social Security number or green card required. Non-warrantable condo and condotel properties both explicitly eligible. Qualifies via rental income from the subject property (DSCR) or bank statements/1099/liquid assets/full doc per HomeXpress's published documentation-type menu. Maximum 75% LTV. 30-year fixed and interest-only options available. HomeXpress also separately publishes a distinct 'Foreign National and ITIN Loans' product (via homexmortgage.com) for ITIN borrowers specifically — condos, 2-4 unit townhomes, and PUDs, loan amount up to $1.5M, DTI up to 50% — not added as its own program row here since a headline LTV/FICO figure was not published on that page; flagged as a follow-up.",
  });

  console.log("Batch 11 complete.");
}

main().catch((err) => {
  console.error("FATAL", err.message);
  process.exit(1);
});
