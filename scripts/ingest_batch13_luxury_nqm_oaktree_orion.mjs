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
  const luxuryId = "adf21fd8-4738-428b-8fa9-413a3cce3f0a";
  const nqmId = "294929ca-b14a-412e-b7df-28d7efc0d2b4";
  const oaktreeId = "4b786db0-f85d-4384-928e-b4211ab0509b";
  const orionId = "63f35b61-0518-4b48-b486-43e88c536a10";

  // --- Luxury Mortgage Corp ---
  await insertProgram(createdBy, luxuryId, "Simple Access — Asset Qualifier", "Luxury Mortgage Corp — Simple Access Asset Qualifier — https://luxurymortgagewholesale.com/admin/rates/pdfs/SA_AssetQualifier-WSE.pdf", "Luxury Mortgage Simple Access Asset Qualifier guideline — verified 2026-07-27", {
    incomeDocTypes: ["asset_depletion"],
    loanPurposes: ["purchase", "rate_term_refinance", "cash_out_refinance"],
    occupancies: ["primary", "second_home", "investment"],
    propertyTypes: ["single_family", "condo", "non_warrantable_condo", "condotel", "townhome"],
    minFico: 700,
    baseMaxLtv: 80,
    minLoanAmount: 150000,
    maxLoanAmount: 3000000,
    citizenshipEligible: ["us_citizen", "permanent_resident", "non_permanent_resident", "foreign_national"],
    vestingEligible: ["individual", "trust"],
    notes:
      "Qualification based solely on liquid assets — no DTI is developed; residual income calculated as qualifying assets divided over 84 months less monthly obligations. Luxury Mortgage publishes 4 distinct qualification methods with different post-closing asset thresholds and max loan amounts (Method 1 'Mortgage Only' 125% of mortgage debt; Method 2 'Simplified' 110%/125%; Method 3 'Traditional' with a 36-month debt-service test; Method 4 'Subject Mortgage Only' 125% of loan amount, min 700 FICO, primary residence only, max $3MM, max 80% LTV/CLTV) — figures above reflect Method 4 as the cleanest single headline figure; other methods have different thresholds, confirm the applicable method before quoting. Foreign Nationals eligible under Method 1 only, max loan $2MM. Non-Permanent Resident Aliens eligible with A05/E/G/H/L/O/P/R1/TN visas, max loan $3MM. Gift funds not eligible on Foreign National loans.",
  });
  await insertProgram(createdBy, luxuryId, "Simple Access — Foreign National", "Luxury Mortgage Corp — Foreign Nationals — https://luxurymortgagewholesale.com/foreign-nationals/", "Luxury Mortgage Simple Access Foreign National program — verified 2026-07-27", {
    incomeDocTypes: ["dscr", "asset_depletion"],
    loanPurposes: ["purchase", "rate_term_refinance", "cash_out_refinance"],
    occupancies: ["investment", "second_home"],
    propertyTypes: ["single_family", "condo", "non_warrantable_condo", "condotel", "townhome", "pud"],
    minFico: 0,
    baseMaxLtv: 70,
    minDscr: 0.9,
    minLoanAmount: 100000,
    maxLoanAmount: 2000000,
    citizenshipEligible: ["foreign_national"],
    vestingEligible: ["individual", "llc"],
    notes:
      "Qualifies using either rental income (DSCR, investment properties only, minimum 1.0x or down to 0.90x with 6 additional months of reserves) or liquid assets (Asset Qualifier Method 1, eligible for second homes, max 70% LTV). No US credit score or history required — if no US FICO, 680 is assumed for guideline purposes with no LTV/FICO pricing adjustment. Valid visa and defined length of stay required (diplomatic immunity and sanctioned-country citizenship ineligible). Non-warrantable condos and condotels on Luxury's Approved Flag List eligible at max 70% LTV. Per Luxury's own matrix, max loan amount steps down by LTV/FICO tier ($2,000,000 at 65% LTV/680 FICO down to $1,500,000 at 70% LTV) — $2,000,000 recorded above as the top-line figure.",
  });
  await insertProgram(createdBy, luxuryId, "Simple Access — Bank Statement", "Luxury Mortgage Corp — Prime Non-QM Bank Statements — https://luxurymortgagewholesale.com/admin/rates/pdfs/CORRPrimeBankStatement.pdf", "Luxury Mortgage Prime Non-QM Bank Statement guideline — verified 2026-07-27", {
    incomeDocTypes: ["bank_statement"],
    loanPurposes: ["purchase", "rate_term_refinance", "cash_out_refinance"],
    occupancies: ["primary", "second_home"],
    propertyTypes: ["single_family", "condo", "townhome"],
    minFico: 0,
    baseMaxLtv: 0,
    minLoanAmount: 150000,
    maxLoanAmount: 2000000,
    citizenshipEligible: ["us_citizen", "permanent_resident"],
    vestingEligible: ["individual", "trust"],
    notes: "12 or 24 months personal or business bank statements; self-employed 2+ years required (1-2 years eligible with 6 additional months of reserves and a positive income trend). Combined ownership of 25%+ required to use business statements. Luxury's own detailed underwriting-requirements PDF for this product did not expose a single headline min-FICO/max-LTV figure to extraction in this pass (the matrix is in a separate exhibit not captured here) — minFico/baseMaxLtv intentionally left at 0/unset; confirm current figures directly with Luxury Mortgage. Per the guideline, this product is not available for investment properties.",
  });

  // --- Maverick Lending Solutions: no new program rows added. Their own
  // web presence (mavericklends.com / mavericklendingsolutions.com) is
  // minimal marketing content with no published matrix, guideline PDF, or
  // specific figures for any product beyond the DSCR program already in
  // this catalog. Search results returned only third-party/unrelated
  // pages (other lenders' foreign-national bank-statement explainers) —
  // nothing attributable to Maverick itself. No addition made rather than
  // guessing from unrelated sources.
  console.log("Maverick Lending Solutions: no new program rows added (no attributable published figures found beyond existing DSCR program).");

  // --- NQM Funding ---
  await insertProgram(createdBy, nqmId, "Flex Supreme / Select Prime — Bank Statement / 1099 / P&L", "NQM Funding — Non-QM Flex Guidelines (effective 11.01.2024) — https://bdsljvrfimvsopxhtpzq.supabase.co/storage/v1/object/public/guidelines/NQM%20Funding%20-%20Non-QM%20Flex%20Guidelines%20(effectie%2011.01.2024)_1738205626144.pdf", "NQM Funding Non-QM Flex Guidelines (effective 11.01.2024) — verified 2026-07-27", {
    incomeDocTypes: ["bank_statement", "1099", "pnl_only"],
    loanPurposes: ["purchase", "rate_term_refinance", "cash_out_refinance"],
    occupancies: ["primary", "second_home", "investment"],
    propertyTypes: ["single_family", "condo", "townhome"],
    minFico: 0,
    baseMaxLtv: 0,
    minLoanAmount: 100000,
    maxLoanAmount: 3000000,
    citizenshipEligible: ["us_citizen", "permanent_resident"],
    vestingEligible: ["individual", "llc"],
    notes: "Confirmed real across NQM Funding's Flex Supreme, Select Prime, Select Prime Express, and Select Prime Super Jumbo product lines: 12- or 24-month personal or business bank statements, 24-month CPA/EA-prepared P&L with 2 months of business bank statements, or 2 years of 1099 income. A single headline min-FICO/max-LTV figure was not captured cleanly from the 100+ page guideline in this pass (figures vary by specific product tier) — minFico/baseMaxLtv intentionally left at 0/unset; confirm current figures for the specific product tier with an NQM Funding AE.",
  });
  await insertProgram(createdBy, nqmId, "Flex Supreme — Asset Utilization", "NQM Funding — Non-QM Flex Guidelines (effective 11.01.2024) — https://bdsljvrfimvsopxhtpzq.supabase.co/storage/v1/object/public/guidelines/NQM%20Funding%20-%20Non-QM%20Flex%20Guidelines%20(effectie%2011.01.2024)_1738205626144.pdf", "NQM Funding Non-QM Flex Guidelines (effective 11.01.2024) — verified 2026-07-27", {
    incomeDocTypes: ["asset_depletion"],
    loanPurposes: ["purchase", "rate_term_refinance"],
    occupancies: ["primary", "second_home", "investment"],
    propertyTypes: ["single_family", "condo", "townhome"],
    minFico: 0,
    baseMaxLtv: 0,
    minLoanAmount: 100000,
    maxLoanAmount: 3000000,
    citizenshipEligible: ["us_citizen", "permanent_resident"],
    vestingEligible: ["individual", "trust"],
    notes: "Net Qualified Assets divided by 84 months = monthly income. Cash-out transactions are ineligible under this program; max LTV must be reduced by 10% from the standard matrix. Qualified assets must be seasoned a minimum of 3 months with 3 months of most recent asset/bank statements. Ineligible asset sources: business assets, unseasoned foreign assets, unseasoned real-estate sale proceeds, privately traded/restricted/non-vested stock, and assets already producing income counted elsewhere. Asset Utilization may not be used as supplemental income to another primary income source. A headline max-LTV figure (before the 10% reduction) was not captured in this pass — baseMaxLtv intentionally left at 0/unset; confirm with an NQM Funding AE.",
  });
  await insertProgram(createdBy, nqmId, "Foreign National Program", "NQM Funding — Foreign National — https://www.nqmf.com/products/foreign-national/", "NQM Funding Foreign National program page — verified 2026-07-27", {
    incomeDocTypes: ["full_doc", "dscr"],
    loanPurposes: ["purchase", "rate_term_refinance", "cash_out_refinance"],
    occupancies: ["investment", "second_home"],
    propertyTypes: ["single_family", "condo", "townhome"],
    minFico: 0,
    baseMaxLtv: 0,
    minLoanAmount: 100000,
    maxLoanAmount: 2000000,
    citizenshipEligible: ["foreign_national"],
    vestingEligible: ["individual", "llc"],
    notes: "For borrowers who live and work outside the U.S. and are legal residents of another country. Qualifies via Full Doc (2 years of self-employment + CPA documentation, or WVOE/employer letter with 2 years + YTD income) or DSCR/Asset Utilization (per NQM's submission requirements checklist). NQM's marketing page describes the program qualitatively without publishing a specific LTV/FICO/loan-amount matrix accessible in this pass — minFico/baseMaxLtv intentionally left at 0/unset; confirm current figures with an NQM Funding AE.",
  });
  await insertProgram(createdBy, nqmId, "ITIN Programs", "NQM Funding — Non-QM Loan Submission Requirements — https://www.nqmf.com/Resources/Website%20Links/NonQMLoanSubmissionRequirements.pdf", "NQM Funding Submission Requirements checklist — verified 2026-07-27", {
    incomeDocTypes: ["full_doc", "bank_statement", "1099", "asset_depletion"],
    loanPurposes: ["purchase", "rate_term_refinance"],
    occupancies: ["primary", "second_home", "investment"],
    propertyTypes: ["single_family", "condo", "townhome"],
    minFico: 0,
    baseMaxLtv: 0,
    minLoanAmount: 100000,
    maxLoanAmount: 1500000,
    citizenshipEligible: ["itin"],
    vestingEligible: ["individual"],
    notes: "Confirmed real per NQM's own submission requirements checklist, which lists distinct ITIN doc-type paths: ITIN Full Doc (wage-earner or self-employed), and ITIN Bank Statement / 1099 / Asset Utilization. Cash-out and second liens are ineligible for ITIN borrowers per the same checklist. A specific LTV/FICO matrix for the ITIN products was not captured in this pass — minFico/baseMaxLtv intentionally left at 0/unset; confirm with an NQM Funding AE. Cash-out refinance intentionally excluded from loanPurposes above per the checklist's restriction.",
  });

  // --- Oaktree Funding Corporation ---
  await insertProgram(createdBy, oaktreeId, "Bank Statement Program", "Oaktree Funding — Bank Statement Program (via LinkedIn) — https://www.linkedin.com/posts/oaktree-funding_5-things-to-know-about-our-bank-statement-activity-7481133053277392896-lY-v", "Oaktree Funding Bank Statement Program overview — verified 2026-07-27", {
    incomeDocTypes: ["bank_statement"],
    loanPurposes: ["purchase", "rate_term_refinance", "cash_out_refinance"],
    occupancies: ["primary", "second_home", "investment"],
    propertyTypes: ["single_family", "condo", "non_warrantable_condo", "townhome"],
    minFico: 660,
    baseMaxLtv: 90,
    minLoanAmount: 100000,
    maxLoanAmount: 4000000,
    citizenshipEligible: ["us_citizen", "permanent_resident"],
    vestingEligible: ["individual", "llc"],
    notes: "Loans up to $4,000,000, up to 90% LTV. Only 12-24 months of bank statements required. Minimum 660 FICO. Income from up to 3 businesses can be combined. Covers primary residences, second homes, investment properties, condos, and non-warrantable condos. Oaktree's broader Non-Agency Advantage guideline additionally publishes personal bank statements, business bank statements (with expense-factor calculation), business statements with P&L or expense letter, CPA-prepared 12-month P&L with 2 months bank statements, 12-month 1099, Asset Depletion/Asset Utilization, and WVOE as accepted alt-doc income types under the same broader program family.",
  });
  await insertProgram(createdBy, oaktreeId, "Investor Advantage — Alt-Doc / Foreign National", "Oaktree Funding — Investor Advantage — https://www.nonqmexpert.com/products/investor-advantage/", "Oaktree Funding Investor Advantage program page — verified 2026-07-27", {
    incomeDocTypes: ["dscr", "bank_statement", "1099", "asset_depletion", "pnl_only"],
    loanPurposes: ["purchase", "rate_term_refinance", "cash_out_refinance"],
    occupancies: ["investment"],
    propertyTypes: ["single_family", "condo", "non_warrantable_condo", "townhome"],
    minFico: 0,
    baseMaxLtv: 0,
    minLoanAmount: 100000,
    maxLoanAmount: 2000000,
    citizenshipEligible: ["us_citizen", "permanent_resident", "foreign_national"],
    vestingEligible: ["individual", "llc"],
    notes: "Investment-property business-purpose product allowing qualification via property cash flow (DSCR), bank statements, 1099s, P&L, or asset utilization — broader than a pure DSCR product, and explicitly described by Oaktree as 'Foreign National Friendly' for global clients. Welcomes short-term rentals, vacation properties, and mixed-use portfolios. Oaktree's marketing page describes this qualitatively without a published LTV/FICO/loan-amount matrix accessible in this pass — minFico/baseMaxLtv intentionally left at 0/unset; confirm current figures with an Oaktree AE. Distinct from Oaktree's existing standard DSCR program already in this catalog.",
  });

  // --- Orion Lending ---
  await insertProgram(createdBy, orionId, "Titan Flex — Alt-Doc", "Orion Lending — Titan Flex Quick Reference Guide — https://star.orionlending.com/Download/DownloadFileWithSaveName?fileName=Titan_Flex_QRG_2026_05_18.pdf&path=programDocs&saveName=Titan+Flex+Quick+Reference+Guide", "Orion Lending Titan Flex QRG (2026-05-18) — verified 2026-07-27", {
    incomeDocTypes: ["bank_statement", "pnl_only", "1099", "asset_depletion", "full_doc"],
    loanPurposes: ["purchase", "rate_term_refinance", "cash_out_refinance"],
    occupancies: ["primary", "second_home", "investment"],
    propertyTypes: ["single_family", "condo", "townhome"],
    minFico: 0,
    baseMaxLtv: 0,
    minLoanAmount: 100000,
    maxLoanAmount: 3000000,
    citizenshipEligible: ["us_citizen", "permanent_resident"],
    vestingEligible: ["individual", "trust"],
    notes: "Orion's premier alternate-income-documentation Non-QM program. Doc types: 12 months personal or business bank statements (deposits, business option uses a 50%/30%/20% expense factor by business type, or a 15% minimum via CPA/tax-attorney/EA/CTEC letter); 12- or 24-month CPA-prepared P&L (for 100% commission/low-overhead professions); 1 or 2 years of 1099 income (12/24-month average with a 10% business expense factor); Express Doc; Full Doc; Asset Utilization (qualified assets divided by 60 months, minimum of the lesser of $1MM in qualified assets or 1.25x the loan balance, with a minimum $250,000 in liquid assets). This is distinct from Orion's existing COIN/COIN X DSCR programs already in this catalog (which already include condotel and foreign-national coverage from an earlier update). A headline max-LTV figure specific to Titan Flex was not captured in this pass (Orion's separate 'Titan' agency-adjacent product line publishes up to 90% LTV primary purchase / 80% investment, but that figure was not confirmed as applying to Titan Flex specifically) — minFico/baseMaxLtv intentionally left at 0/unset; confirm current figures directly with Orion's Titan Flex program matrix.",
  });

  console.log("Batch 13 complete.");
}

main().catch((err) => {
  console.error("FATAL", err.message);
  process.exit(1);
});
