// First National Bank of America (FNBA) — real Non-QM program matrix +
// income-documentation option ingestion (2026-08-07). Every figure below
// traces to FNBA's own real, current pages, fetched 2026-08-07:
//   - https://www.fnba.com/wholesale/non-qm-loans/ (4 loan programs)
//   - https://www.fnba.com/wholesale/income-documentation/ (6 income doc flyers)
//   - https://www.fnba.com/wp-content/uploads/2025/10/Wholesale-Alt-A-Premier.pdf
//   - https://www.fnba.com/wp-content/uploads/2026/02/near-miss-loan-program-wholesale.pdf
//   - https://www.fnba.com/wp-content/uploads/2026/03/Correspondent-HELOC-Daily-sweep.pdf
//   - https://www.fnba.com/wp-content/uploads/2025/10/Wholesale-1099-Income.pdf
//   - https://www.fnba.com/wp-content/uploads/2025/10/Wholesale-Asset-Depletion.pdf
//   - https://www.fnba.com/wp-content/uploads/2025/10/Wholesale-Bank-Statement.pdf
//   - https://www.fnba.com/wp-content/uploads/2025/10/Wholesale-Full-Doc.pdf
//   - https://www.fnba.com/wp-content/uploads/2025/10/Wholesale-Profit-Loss.pdf
//   - https://www.fnba.com/wp-content/uploads/2025/10/Wholesale-Ready-Asset.pdf
//   - https://www.fnba.com/correspondent/pricing/ (general-requirements table)
//   - https://www.fnba.com/correspondent/ , https://www.fnba.com/mortgage/ (Dual Core)
// This corrects/replaces the earlier draft rows added by
// fundloans_fnba_itin_dscr_update.mjs (2026-07-29), which intentionally
// left Near Miss / FlexFirst HELOC / Dual Core at 0/unset pending a real
// numeric matrix. Alt-A Premier did not exist yet as its own program row —
// it is inserted here for the first time. Dual Core still has no published
// numeric LTV/FICO/loan-amount matrix anywhere on FNBA's site, so it stays
// unverified/draft with only the real qualitative facts that are documented.
import { createClient } from "@supabase/supabase-js";
import fs from "fs";

const fileEnv = fs.existsSync(".env.local")
  ? Object.fromEntries(fs.readFileSync(".env.local", "utf8").split("\n").filter((l) => l.includes("=")).map((l) => {
      const i = l.indexOf("=");
      return [l.slice(0, i), l.slice(i + 1).trim().replace(/^(["'])(.*)\1$/, "$2")];
    }))
  : {};
const env = { ...process.env, ...fileEnv };
if (!env.NEXT_PUBLIC_SUPABASE_URL || !env.SUPABASE_SERVICE_ROLE_KEY) {
  throw new Error("Missing Supabase credentials.");
}
const admin = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY);
const PLATFORM_ORG = "bfe87b1c-86e7-4186-b1c4-ecc25d0e4420";
const FNBA_ID = "e7f0aa3b-866d-474e-b8cd-9d17c6e6f569";
const TODAY = "2026-08-07";

async function resolveAdminId() {
  const { data } = await admin.from("users").select("id").eq("email", "nonqmnexusadmin@gmail.com").single();
  return data.id;
}

async function upsertProgram(lenderId, adminId, p, verify) {
  const { data: existingPrograms } = await admin.from("programs").select("id,name,config").eq("lender_id", lenderId);
  const existing = (existingPrograms ?? []).find((row) => row.name === p.name);

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
    minLoanAmount: p.minLoanAmount ?? 50000,
    propertyTypes: p.propertyTypes,
    eligibleStates: p.eligibleStates ?? "ALL",
    incomeDocTypes: p.incomeDocTypes,
    sourceCitation: p.sourceCitation,
    vestingEligible: p.vestingEligible ?? ["individual", "llc"],
    lastVerifiedDate: TODAY,
    minReservesMonths: p.minReservesMonths ?? 0,
    citizenshipEligible: p.citizenshipEligible,
    guidelineVersionLabel: p.guidelineVersionLabel,
    interestOnlyAvailable: p.interestOnlyAvailable ?? false,
    prepaymentPenaltyOptions: p.prepaymentPenaltyOptions ?? [],
    notes: p.notes,
    ...(p.maxDti !== undefined ? { maxDti: p.maxDti } : {}),
    ...(p.propertyTypeLtvCaps ? { propertyTypeLtvCaps: p.propertyTypeLtvCaps } : {}),
    ...(p.giftFundsAllowed !== undefined ? { giftFundsAllowed: p.giftFundsAllowed } : {}),
    ...(p.giftFundsNotes ? { giftFundsNotes: p.giftFundsNotes } : {}),
    ...(p.lienPosition ? { lienPosition: p.lienPosition } : {}),
    ...(p.noFicoPolicy ? { noFicoPolicy: p.noFicoPolicy } : {}),
    ...(p.minSelfEmploymentMonths !== undefined ? { minSelfEmploymentMonths: p.minSelfEmploymentMonths } : {}),
    ...(p.pnlPeriodMonths !== undefined ? { pnlPeriodMonths: p.pnlPeriodMonths } : {}),
    ...(p.pnlTaxReturnsRequired !== undefined ? { pnlTaxReturnsRequired: p.pnlTaxReturnsRequired } : {}),
    ...(p.pnlPreparerAttestationPurpose ? { pnlPreparerAttestationPurpose: p.pnlPreparerAttestationPurpose } : {}),
    ...(p.pnlSupportingBankStatementsMonths !== undefined ? { pnlSupportingBankStatementsMonths: p.pnlSupportingBankStatementsMonths } : {}),
    ...(p.standardExpenseFactor !== undefined ? { standardExpenseFactor: p.standardExpenseFactor } : {}),
    ...(p.expenseFactorType ? { expenseFactorType: p.expenseFactorType } : {}),
    ...(p.expenseFactorNotes ? { expenseFactorNotes: p.expenseFactorNotes } : {}),
    ...(p.matrixConfirmationRequired !== undefined ? { matrixConfirmationRequired: p.matrixConfirmationRequired } : {}),
    ...(p.matrixConfirmationNotes ? { matrixConfirmationNotes: p.matrixConfirmationNotes } : {}),
  };

  if (existing) {
    const { error } = await admin.from("programs").update({ config: { ...existing.config, ...config } }).eq("id", existing.id);
    if (error) { console.error(`  FAILED updating ${p.name}: ${error.message}`); return; }
    const { data: gv } = await admin.from("guideline_versions").select("id").eq("program_id", existing.id).order("effective_date", { ascending: false }).limit(1).maybeSingle();
    if (gv) {
      await admin.from("guideline_versions").update({
        label: p.guidelineVersionLabel,
        effective_date: TODAY,
        last_verified_date: verify ? TODAY : null,
        verification_status: verify ? "human_verified" : "draft",
        reviewed_by: adminId,
        published_at: verify ? new Date().toISOString() : null,
        source_url: p.sourceCitation,
      }).eq("id", gv.id);
    } else {
      await admin.from("guideline_versions").insert({
        organization_id: PLATFORM_ORG,
        program_id: existing.id,
        label: p.guidelineVersionLabel,
        effective_date: TODAY,
        last_verified_date: verify ? TODAY : null,
        verification_status: verify ? "human_verified" : "draft",
        reviewed_by: adminId,
        published_at: verify ? new Date().toISOString() : null,
        source_url: p.sourceCitation,
      });
    }
    console.log(`  Updated (${verify ? "verified" : "draft"}): ${p.name}`);
    return;
  }

  const { data: program, error: programError } = await admin
    .from("programs")
    .insert({ organization_id: PLATFORM_ORG, lender_id: lenderId, name: p.name, is_sample_data: false, active: true, config, created_by: adminId })
    .select("id")
    .single();
  if (programError) { console.error(`  FAILED inserting ${p.name}: ${programError.message}`); return; }
  const { error: gvError } = await admin.from("guideline_versions").insert({
    organization_id: PLATFORM_ORG,
    program_id: program.id,
    label: p.guidelineVersionLabel,
    effective_date: TODAY,
    last_verified_date: verify ? TODAY : null,
    verification_status: verify ? "human_verified" : "draft",
    reviewed_by: adminId,
    published_at: verify ? new Date().toISOString() : null,
    source_url: p.sourceCitation,
  });
  console.log(gvError ? `  FAILED guideline_version for ${p.name}: ${gvError.message}` : `  Inserted (${verify ? "verified" : "draft"}): ${p.name}`);
}

async function main() {
  const adminId = await resolveAdminId();
  console.log("=== First National Bank of America — real Non-QM matrix (2026-08-07) ===");

  const ALL_DOC_TYPES = ["full_doc", "bank_statement", "pnl_only", "1099", "asset_depletion"];
  const FNBA_INCOME_DOC_CITATION =
    "First National Bank of America — Non-QM Income Documentation flyers — " +
    "https://www.fnba.com/wholesale/income-documentation/, " +
    "https://www.fnba.com/wp-content/uploads/2025/10/Wholesale-1099-Income.pdf, " +
    "https://www.fnba.com/wp-content/uploads/2025/10/Wholesale-Asset-Depletion.pdf, " +
    "https://www.fnba.com/wp-content/uploads/2025/10/Wholesale-Bank-Statement.pdf, " +
    "https://www.fnba.com/wp-content/uploads/2025/10/Wholesale-Full-Doc.pdf, " +
    "https://www.fnba.com/wp-content/uploads/2025/10/Wholesale-Profit-Loss.pdf, " +
    "https://www.fnba.com/wp-content/uploads/2025/10/Wholesale-Ready-Asset.pdf — fetched 2026-08-07";

  const INCOME_DOC_NOTE =
    "Six FNBA Non-QM income documentation options apply across all FNBA Non-QM loan programs: " +
    "1099 Income (1099s covering the last calendar year + 3rd-party expense-ratio questionnaire naming the NAICS code; " +
    "income = 1099 income x expense ratio / 12; LTV up to 85%, DTI up to 60%, 12 months income history, no tax returns needed); " +
    "Asset Depletion (asset account statements dated within 90 days of close; income = balance of assets / 84 + monthly earned income; " +
    "used to SUPPLEMENT another income source, not stand alone; gift funds not eligible assets; large/unusual deposits must be sourced); " +
    "Bank Statements (12 consecutive months business and/or personal statements + completed BSI questionnaire; FNBA calculates and " +
    "provides the approved income upon submission of the 3.4 file; borrower must be self-employed 12+ months); " +
    "Full Documentation (prior-year W2 + 2 most recent paystubs, or tax returns, SSN award letter, VOE; only 12 months income history " +
    "required; DTI up to 60%, 600 min FICO or no score, gift funds allowed); " +
    "Profit & Loss (P&L covering the previous 12 months, most recent month within 90 days of close, reviewed/attested by a licensed or " +
    "certified 3rd party; income = approved net income / 12; only 2 months bank statements needed for asset verification; no tax " +
    "returns or W2s needed; business must be 12+ months old); and " +
    "Ready Asset / NIVA (No-Income Verified-Asset — modeled on this platform's asset_depletion doc type since there is no dedicated " +
    "NIVA enum value; borrower is qualified purely on liquid/retirement assets exceeding the sum of all debt obligations, seasoned 60 " +
    "days prior to close, with NO income required at all — a distinct, stronger qualification than ordinary Asset Depletion, which " +
    "only supplements income). Source: " + FNBA_INCOME_DOC_CITATION;

  // ── Alt-A Premier (new — first real numeric row for this program) ──
  await upsertProgram(FNBA_ID, adminId, {
    name: "Alt-A Premier",
    incomeDocTypes: ALL_DOC_TYPES,
    loanPurposes: ["purchase", "rate_term_refinance", "cash_out_refinance"],
    occupancies: ["primary", "second_home"],
    propertyTypes: ["single_family", "condo", "non_warrantable_condo"],
    minFico: 680,
    baseMaxLtv: 85,
    maxDti: 60,
    minLoanAmount: 75000,
    maxLoanAmount: 3000000,
    propertyTypeLtvCaps: { condo: 80, non_warrantable_condo: 80 },
    citizenshipEligible: ["us_citizen", "permanent_resident", "itin"],
    giftFundsAllowed: true,
    giftFundsNotes: "100% gift funds allowed up to 80% LTV.",
    sourceCitation:
      "First National Bank of America — Alt-A Premier — https://www.fnba.com/wholesale/non-qm-loans/, " +
      "https://www.fnba.com/wp-content/uploads/2025/10/Wholesale-Alt-A-Premier.pdf, https://www.fnba.com/correspondent/pricing/ — fetched 2026-08-07",
    guidelineVersionLabel: "FNBA Alt-A Premier flyer + correspondent pricing general requirements — verified 2026-08-07",
    notes:
      "The perfect Non-QM solution for the agency-fallout borrower. 680 min TransUnion credit score, up to 85% LTV (700+ score; " +
      "80% LTV for 2nd home/condo), up to 55-60% DTI (60% per the wholesale flyer highlight; the correspondent pricing page states " +
      "'up to 55% with compensating factors' — cite whichever your channel/AE confirms), no reserves required, ITIN & SSN eligible. " +
      "Loan amounts $75K-$3M, 15-30 year fixed terms. Cash-out refinance capped at 75% LTV and not available in TX. No bankruptcy, " +
      "foreclosure, or short sale within 4 years. Trade-line requirement for the wholesale channel: 80% LTV needs 3 tradelines with " +
      "12+ months history (or 2 tradelines with 18+ months); 85% LTV needs 5 tradelines with 12+ months history, at least one 24+ " +
      "months and one with a $3,000+ credit limit; authorized-user accounts never qualify. Full or Alternative Income Documentation " +
      "accepted (see the platform's FNBA income-documentation note on file: 1099, Bank Statements, Full Doc, P&L Only, Asset " +
      "Depletion, or Ready Asset/NIVA). " + INCOME_DOC_NOTE,
  }, true);

  // ── Near Miss (correcting the 2026-07-29 0/unset draft with real figures) ──
  await upsertProgram(FNBA_ID, adminId, {
    name: "Near Miss",
    incomeDocTypes: ALL_DOC_TYPES,
    loanPurposes: ["purchase", "rate_term_refinance", "cash_out_refinance"],
    occupancies: ["primary", "second_home", "investment"],
    propertyTypes: ["single_family", "2_4_unit", "condo", "non_warrantable_condo", "manufactured", "rural"],
    minFico: 600,
    baseMaxLtv: 85,
    maxDti: 60,
    minLoanAmount: 50000,
    maxLoanAmount: 1200000,
    propertyTypeLtvCaps: { condo: 75, non_warrantable_condo: 75, "2_4_unit": 70, manufactured: 70, rural: 65 },
    citizenshipEligible: ["us_citizen", "permanent_resident", "itin"],
    giftFundsAllowed: true,
    noFicoPolicy: "eligible",
    sourceCitation:
      "First National Bank of America — Near Miss — https://www.fnba.com/wholesale/non-qm-loans/, " +
      "https://www.fnba.com/wp-content/uploads/2026/02/near-miss-loan-program-wholesale.pdf, https://www.fnba.com/correspondent/pricing/ — fetched 2026-08-07",
    guidelineVersionLabel: "FNBA Near Miss flyer + correspondent pricing general requirements — verified 2026-08-07",
    notes:
      "Corrects the 2026-07-29 draft row (previously 0/unset pending a real matrix). A great alternative for unique properties, a " +
      "recent credit event, or even no credit at all ('No credit needed' is a real flyer highlight — modeled as noFicoPolicy: " +
      "eligible). No seasoning required on a prior bankruptcy, foreclosure, or short sale. Up to 85% LTV on SFOO/2nd home; the " +
      "correspondent pricing page's own general-requirements table caps condos at 75%, investment/multi-unit/mobile-home-with-land " +
      "at 70%, and vacant acreage/land at 65% (2nd home above 75% LTV requires a 680+ TransUnion score). 600 minimum TransUnion " +
      "score when a score exists, up to 60% DTI (the correspondent pricing page states 'up to 55% with compensating factors'), no " +
      "reserves required, gift funds allowed, fixed 15-30 year terms. Loan amounts $50K-$1.2M. Cash-out refinance capped at 75% LTV, " +
      "requires a 640+ TransUnion score, and is not available in TX. Property types: SFOO/2nd home, 1-4 units, mobile/manufactured " +
      "with land, vacant land, barndominium, non-warrantable condo, and most other property types (excluding commercial/agricultural). " +
      "ITIN & SSN eligible. Full or Alternative Income Documentation accepted. " + INCOME_DOC_NOTE,
  }, true);

  // ── FlexFirst HELOC (correcting the 2026-07-29 0/unset draft with real figures) ──
  await upsertProgram(FNBA_ID, adminId, {
    name: "FlexFirst HELOC",
    incomeDocTypes: ALL_DOC_TYPES,
    loanPurposes: ["purchase", "rate_term_refinance", "heloc"],
    occupancies: ["primary", "second_home", "investment"],
    propertyTypes: ["single_family", "2_4_unit", "condo", "non_warrantable_condo", "rural"],
    minFico: 660,
    baseMaxLtv: 80,
    maxDti: 60,
    minLoanAmount: 50000,
    maxLoanAmount: 3000000,
    lienPosition: "first_lien",
    citizenshipEligible: ["us_citizen", "permanent_resident", "itin"],
    eligibleStates: [
      "AL", "AK", "AZ", "AR", "CA", "CO", "CT", "DE", "FL", "GA", "HI", "ID", "IL", "IN", "IA", "KS", "KY",
      "LA", "ME", "MD", "MA", "MI", "MN", "MS", "MO", "MT", "NE", "NV", "NH", "NJ", "NM", "NY", "NC", "ND",
      "OH", "OK", "OR", "PA", "RI", "SC", "SD", "TN", "UT", "VT", "VA", "WA", "WV", "WI", "WY", "DC",
    ],
    sourceCitation:
      "First National Bank of America — FlexFirst HELOC — https://www.fnba.com/mortgage/flexfirst-heloc/, " +
      "https://www.fnba.com/wp-content/uploads/2026/03/Correspondent-HELOC-Daily-sweep.pdf — fetched 2026-08-07",
    guidelineVersionLabel: "FNBA FlexFirst HELOC flyer — verified 2026-08-07",
    notes:
      "Corrects the 2026-07-29 draft row (previously 0/unset pending a real matrix). This is a FIRST-LIEN home equity line of " +
      "credit that REPLACES a primary mortgage (not a subordinate second behind an existing first) — an alternative to a " +
      "traditional cash-out refinance, integrated with an FNBA checking account and a daily 'sweep' feature that automatically " +
      "applies leftover checking funds to the loan balance each day. Variable rate based on the 30-day average SOFR. Up to 80% " +
      "LTV, up to 60% DTI, 660 minimum TransUnion score, no tradeline requirement. Loan amounts $50K-$3M. Purchase or refinance. " +
      "Two structures by occupancy: Owner-Occupied gets a 10-year draw period (interest + escrow only) then a 20-year fully " +
      "amortizing repayment period; Non-Owner-Occupied (investment, 1-2 units) gets a 5-year draw period then the same 20-year " +
      "repayment period. Owner-occupied property types: single family, 2nd/additional home, non-warrantable condo/townhome, " +
      "multi-family, barndominium. Not available in Texas. Full or Alternative Income Documentation accepted. " + INCOME_DOC_NOTE,
  }, true);

  // ── Dual Core (still no published numeric matrix — keep qualitative, draft) ──
  await upsertProgram(FNBA_ID, adminId, {
    name: "Dual Core",
    incomeDocTypes: ALL_DOC_TYPES,
    loanPurposes: ["purchase", "rate_term_refinance"],
    occupancies: ["primary", "second_home", "investment"],
    propertyTypes: ["single_family", "2_4_unit", "condo"],
    minFico: 0,
    baseMaxLtv: 0,
    maxLoanAmount: 0,
    citizenshipEligible: ["us_citizen", "permanent_resident", "itin"],
    matrixConfirmationRequired: true,
    matrixConfirmationNotes:
      "FNBA has not published a numeric LTV/FICO/loan-amount matrix for Dual Core anywhere on fnba.com as of 2026-08-07 " +
      "(checked /wholesale/non-qm-loans/, /correspondent/, /correspondent/loan-programs/, /mortgage/, and /correspondent/pricing/, " +
      "which only runs its quick-quote tool for Alt-A Premier and Near Miss). Confirm exact LTV/FICO/DTI/loan-amount limits with an " +
      "FNBA account executive before quoting Dual Core to a borrower.",
    sourceCitation:
      "First National Bank of America — Dual Core Loan Program — https://www.fnba.com/mortgage/, https://www.fnba.com/correspondent/, " +
      "https://www.fnba.com/correspondent/loan-programs/, https://www.fnba.com/wholesale/non-qm-loans/ — fetched 2026-08-07",
    guidelineVersionLabel: "FNBA Dual Core qualitative description — pending numeric matrix (2026-08-07)",
    notes:
      "Real, distinct cross-collateralized DUAL-PROPERTY loan — NOT a bridge loan and not a standard HELOC. FNBA's own description: " +
      "'One Non-QM loan. Two properties. Maximum capital efficiency.' It lets a borrower tap equity in an EXISTING property to " +
      "finance the ACQUISITION of a SECOND property, reducing or eliminating a traditional down payment on the new purchase — 'a " +
      "great alternative to a standard HELOC or bridge loan... designed for people who need to tap into equity in an existing " +
      "property in order to finance a second while reducing or eliminating traditional down payment requirements.' Both SSN and " +
      "ITIN borrowers accommodated. No numeric LTV/FICO/loan-amount matrix has been published — left at 0/unset pending the actual " +
      "current matrix (unchanged from the 2026-07-29 draft). " + INCOME_DOC_NOTE,
  }, false);

  console.log("\nDone. FNBA: Alt-A Premier inserted with real numbers; Near Miss and FlexFirst HELOC corrected from 0/unset drafts " +
    "to real, verified matrices; Dual Core left qualitative/draft (no published numeric matrix exists). All 4 programs now carry " +
    "the shared, real 6-option income-documentation note (1099, Asset Depletion, Bank Statements, Full Doc, P&L, Ready Asset/NIVA).");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
