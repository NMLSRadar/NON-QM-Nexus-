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
  const jmacId = "9914bb23-f690-4910-9aaa-9015aba4750c";
  const kindId = "ec6aea43-6a99-4365-9a45-62ab32529bb0";
  const lendsureId = "7a3d77a4-ca7e-4909-b5c6-f46002e3222d";
  const loganId = "48f0838c-5f5d-41a1-b964-bb55325c40a4";

  // --- JMAC Lending ---
  await insertProgram(createdBy, jmacId, "Asset Utilization", "JMAC Lending — Asset Utilization — https://www.jmaclending.com/asset-utilization", "JMAC Lending program page — verified 2026-07-27", {
    incomeDocTypes: ["asset_depletion"],
    loanPurposes: ["purchase", "rate_term_refinance", "cash_out_refinance"],
    occupancies: ["primary", "second_home", "investment"],
    propertyTypes: ["single_family", "condo", "townhome"],
    minFico: 0,
    baseMaxLtv: 80,
    minLoanAmount: 125000,
    maxLoanAmount: 3000000,
    interestOnlyAvailable: true,
    citizenshipEligible: ["us_citizen", "permanent_resident"],
    vestingEligible: ["individual", "trust"],
    notes: "Available on JMAC's Zuma Prime Non-QM. Eligible liquid assets divided by 84 months to calculate qualifying income; borrowers do not have to be of retirement age to use retirement assets. Up to 80% LTV/CLTV. Can combine full-doc income with assets for qualification. 30- and 40-year interest-only options. Unlimited cash-out up to max LTV. JMAC's own product page did not publish a headline minimum FICO for this specific program.",
  });
  await insertProgram(createdBy, jmacId, "Zuma / Limited Docs — Alt-Doc", "JMAC Lending — Zuma Non-QM / Limited Docs — https://www.jmaclending.com/zuma", "JMAC Lending Zuma + Limited Docs program pages — verified 2026-07-27", {
    incomeDocTypes: ["bank_statement", "1099", "pnl_only", "wvoe_only"],
    loanPurposes: ["purchase", "rate_term_refinance", "cash_out_refinance"],
    occupancies: ["primary", "second_home", "investment"],
    propertyTypes: ["single_family", "condo", "townhome"],
    minFico: 660,
    baseMaxLtv: 0,
    minLoanAmount: 150000,
    maxLoanAmount: 3000000,
    citizenshipEligible: ["us_citizen", "permanent_resident"],
    vestingEligible: ["individual", "trust"],
    notes: "Combines JMAC's 'Zuma Prime Alt Doc' (12/24-month bank statements, 12/24-month P&L, 1099, WVOE, asset depletion — credit events seasoned 4 years) and 'Zuma Credit Flex' (same doc types, credit events seasoned only 1 year) tiers, plus the overlapping 'Limited Docs Non-QM' product (WVOE, 1099, or 60-month asset utilization, FICOs from 660, no AUS/no 4506-C). JMAC explicitly states 'No Foreign Nationals' on this product line. A single headline max-LTV figure was not published cleanly across these overlapping product pages in this pass — baseMaxLtv intentionally left at 0/unset; confirm the applicable tier and LTV with a JMAC AE before quoting to a borrower.",
  });

  // --- Kind Lending ---
  await insertProgram(createdBy, kindId, "Alt-Doc Suite (Bank Statement / 1099 / P&L / WVOE / Asset Utilization)", "Kind Lending — Products & Features — https://www.kindlending.com/tpo/products-and-features", "Kind Lending TPO Products & Features page — verified 2026-07-27", {
    incomeDocTypes: ["bank_statement", "1099", "pnl_only", "wvoe_only", "asset_depletion"],
    loanPurposes: ["purchase", "rate_term_refinance", "cash_out_refinance"],
    occupancies: ["primary", "second_home", "investment"],
    propertyTypes: ["single_family", "condo", "townhome"],
    minFico: 0,
    baseMaxLtv: 0,
    minLoanAmount: 100000,
    maxLoanAmount: 3000000,
    citizenshipEligible: ["us_citizen", "permanent_resident"],
    vestingEligible: ["individual", "trust"],
    notes: "Confirmed as real, distinct products on Kind Lending's own Non-QM Suite: 1-Year Self Employed, Alt Doc 60-Month Asset Utilization, Alt Doc 1099 Only, Alt Doc Bank Statement (12-24 month personal or business, available for primary/investment/second home), Alt Doc P&L Only, Alt Doc Written VOE Only, plus a 'No DTI Asset Utilization' variant. Kind Lending's marketing pages describe these products qualitatively but did not publish specific LTV/FICO/loan-amount matrix figures accessible in this pass — minFico/baseMaxLtv intentionally left at 0/unset rather than guessed; confirm current figures with a Kind Lending Ambassador/AE.",
  });
  await insertProgram(createdBy, kindId, "DSCR — Foreign National", "Kind Lending — Understanding Alt-Doc vs DSCR — https://www.kindlending.com/kind-tpo-blog-posts/kind-non-qm-understanding-alt-doc-vs-dscr-loan-options-for-brokers", "Kind Lending blog/product overview — verified 2026-07-27", {
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
    notes: "Confirmed as a real, distinct DSCR sub-product in Kind Lending's Non-QM Suite ('DSCR - Foreign National'), separate from their standard DSCR and Short Term Rental DSCR products (already in this catalog) and their No-Prepay DSCR variant. Kind Lending's public pages describe this product qualitatively (tailored for non-U.S. citizens investing in U.S. real estate) without publishing specific LTV/FICO/loan-amount figures accessible in this pass — minFico/baseMaxLtv intentionally left at 0/unset; confirm current figures with a Kind Lending AE.",
  });

  // --- LendingOne: intentionally NOT adding new program rows. LendingOne's
  // remaining real published products (Fix and Flip, Bridge Loans, Fix-to-Rent)
  // are business-purpose, asset/project-based commercial financing for
  // non-owner-occupied investment properties, qualified on after-repair
  // value and rehab scope rather than any income-documentation type. This
  // does not map onto this platform's income-doc-type Non-QM matching
  // schema, matching the same reasoning already applied to CoreVest
  // Finance's Bridge/credit-line products in batch 10. LendingOne's real
  // DSCR Rental Loan (already in this catalog) remains its one product
  // that fits this schema.
  console.log("LendingOne: no new program rows added (remaining products are commercial bridge/fix-flip financing, out of schema scope — see code comment).");

  // --- LendSure Mortgage Corp. ---
  await insertProgram(createdBy, lendsureId, "Foreign National Loans", "LendSure — Foreign National Loans — https://www.lendsurehomeloans.com/loan-options/foreign-national-loans/ ; LendSure Foreign National Guideline Sheet — https://lendsure.com/wp-content/uploads/2021/04/Foreign-National-Guideline-Sheet.pdf", "LendSure Foreign National Guideline Sheet — verified 2026-07-27", {
    incomeDocTypes: ["bank_statement", "full_doc", "dscr"],
    loanPurposes: ["purchase", "rate_term_refinance", "cash_out_refinance"],
    occupancies: ["second_home", "investment"],
    propertyTypes: ["single_family", "condo", "townhome"],
    minFico: 0,
    baseMaxLtv: 75,
    minLoanAmount: 100000,
    maxLoanAmount: 2000000,
    minReservesMonths: 3,
    citizenshipEligible: ["foreign_national"],
    vestingEligible: ["individual", "llc"],
    notes:
      "No U.S. tax returns, SSN, or domestic credit history required — qualifies via 12/24-month foreign or domestic bank statements, employer/CPA income-verification letters, foreign credit reports, or Investor Cash Flow (DSCR) on investment properties. Up to 75% LTV purchase/rate-term, up to 70% LTV cash-out refinance, cash-out up to $500,000. LendSure's own published sources do not fully agree on two figures: max loan amount is stated as up to $2,000,000 on one LendSure wholesale blog post but only up to $1,000,000 on the separate lendsurehomeloans.com consumer-facing page (the $2M wholesale figure is used above); cash-out-refinance LTV is stated as 70% in one place and 65% in another LendSure guideline sheet (70% used above) — both are disclosed here since the sources disagree. Reserves: 3 months PITI (waived below 65% LTV on purchase). Foreign assets usable with 60-day seasoning; cash-out may count toward reserves. Wide visa eligibility (B1, B2, F1, H2, H3, I, J1, O2, P1, P2, TN NAFTA, Laser Visa); a no-visa program is available for investor transactions only.",
  });

  // --- Logan Finance Corporation ---
  await insertProgram(createdBy, loganId, "Bank Statement Loans", "Logan Finance Correspondent — Join Logan — https://logancorrespondent.com/join-logan/", "Logan Finance Correspondent program page — verified 2026-07-27", {
    incomeDocTypes: ["bank_statement", "1099"],
    loanPurposes: ["purchase", "rate_term_refinance", "cash_out_refinance"],
    occupancies: ["primary", "second_home", "investment"],
    propertyTypes: ["single_family", "condo", "non_warrantable_condo", "townhome"],
    minFico: 660,
    baseMaxLtv: 0,
    minLoanAmount: 100000,
    maxLoanAmount: 3000000,
    citizenshipEligible: ["us_citizen", "permanent_resident"],
    vestingEligible: ["individual", "trust"],
    notes: "12 or 24 months business and/or personal bank statements; 1099 plus YTD earnings also accepted. Max loan $3,000,000, minimum 660 credit score, unlimited cash-in-hand. No LTV restrictions specifically for condos; non-warrantable condos allowed. Gift of equity allowed on primary homes; income sources other than self-employment also permitted. A specific headline max-LTV figure was not published on Logan's summary page — baseMaxLtv intentionally left at 0/unset; confirm current LTV tiers with a Logan AE.",
  });
  await insertProgram(createdBy, loganId, "Foreign National", "Logan Wholesale — Foreign National — https://loganwholesale.com/experience-foreign-national/ ; Logan Finance Experience Flyer — https://loganfinance.com/wp-content/uploads/2024/05/ExperienceFlyer-foreign-national.pdf", "Logan Finance Foreign National Experience Flyer — verified 2026-07-27", {
    incomeDocTypes: ["full_doc", "dscr"],
    loanPurposes: ["purchase", "rate_term_refinance", "cash_out_refinance"],
    occupancies: ["second_home", "investment"],
    propertyTypes: ["single_family", "condo", "non_warrantable_condo", "townhome", "2_4_unit"],
    minFico: 0,
    baseMaxLtv: 75,
    minDscr: 1.0,
    minLoanAmount: 100000,
    maxLoanAmount: 3000000,
    citizenshipEligible: ["foreign_national"],
    vestingEligible: ["individual", "llc"],
    notes:
      "For non-U.S.-citizen clients purchasing second homes, vacation homes, or business-purpose investment properties. No credit score required; non-warrantable condos allowed; up to 4 units; no minimum tradeline required; no credit reference letters required; gift funds and interest-only options available. Logan's own Experience Flyer publishes two distinct sub-tables under this one Foreign National product: a general/Full-Doc tier at up to 75% LTV purchase/rate-term (70% cash-out) with a $3,000,000 max loan; and a DSCR-specific tier at up to 75% LTV purchase/rate-term (70% cash-out), minimum 1.0x DSCR, with a lower $2,000,000 max loan — both figures disclosed here since Logan's own flyer separates them into two tables under the same product name; maxLoanAmount above (\\$3M) reflects the more permissive Full-Doc tier.",
  });

  console.log("Batch 12 complete.");
}

main().catch((err) => {
  console.error("FATAL", err.message);
  process.exit(1);
});
