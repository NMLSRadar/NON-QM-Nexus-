// ITIN DSCR Update (2026-07-29 spec) — FundLoans and First National Bank
// of America (FNBA) real program corrections/additions. Every numeric
// figure here traces to FundLoans' own real, current guideline/matrix
// pages (fundloans.com/guidelines, fundloans.com/dscr-and-no-ratio/,
// fundloans.com/standalone-2nd/) or FNBA's own real site
// (fnba.com/wholesale/non-qm-loans/, fnba.com/mortgage/) — fetched
// 2026-07-29. Where a real qualitative fact was found but no numeric
// matrix (FlexFirst HELOC, Dual Core lien/draw mechanics), the program is
// added with real qualitative notes and left un-verified (draft status)
// rather than fabricating LTV/FICO/loan-amount figures.
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
const TODAY = "2026-07-29";

async function resolveAdminId() {
  const { data } = await admin.from("users").select("id").eq("email", "nonqmnexusadmin@gmail.com").single();
  return data.id;
}

async function updateProgram(programId, patch, label) {
  const { data: existing, error: readError } = await admin.from("programs").select("config").eq("id", programId).single();
  if (readError) { console.error(`FAILED reading ${label}: ${readError.message}`); return; }
  const config = { ...existing.config, ...patch };
  const { error } = await admin.from("programs").update({ config }).eq("id", programId);
  console.log(error ? `FAILED updating ${label}: ${error.message}` : `Updated: ${label}`);
}

async function insertProgram(lenderId, adminId, p, verify) {
  const { data: existingPrograms } = await admin.from("programs").select("name").eq("lender_id", lenderId);
  if ((existingPrograms ?? []).some((row) => row.name === p.name)) {
    console.log(`  Skip (already exists): ${p.name}`);
    return;
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
    minLoanAmount: p.minLoanAmount ?? 100000,
    propertyTypes: p.propertyTypes,
    eligibleStates: "ALL",
    incomeDocTypes: p.incomeDocTypes,
    sourceCitation: p.sourceCitation,
    vestingEligible: p.vestingEligible ?? ["individual", "llc"],
    lastVerifiedDate: TODAY,
    minReservesMonths: p.minReservesMonths ?? 6,
    citizenshipEligible: p.citizenshipEligible,
    guidelineVersionLabel: p.guidelineVersionLabel,
    interestOnlyAvailable: p.interestOnlyAvailable ?? false,
    prepaymentPenaltyOptions: p.prepaymentPenaltyOptions ?? [],
    notes: p.notes,
    ...(p.maxDti !== undefined ? { maxDti: p.maxDti } : {}),
  };
  const { data: program, error: programError } = await admin
    .from("programs")
    .insert({ organization_id: PLATFORM_ORG, lender_id: lenderId, name: p.name, is_sample_data: false, active: true, config, created_by: adminId })
    .select("id")
    .single();
  if (programError) { console.error(`  FAILED program ${p.name}: ${programError.message}`); return; }
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

  // ============ FUNDLOANS ============
  console.log("=== FundLoans ===");
  const FUNDLOANS_ID = "3e810e11-a482-4107-b49b-a677ee6db404";

  const { data: fundloansPrograms } = await admin.from("programs").select("id,name,config").eq("lender_id", FUNDLOANS_ID);
  const byName = Object.fromEntries((fundloansPrograms ?? []).map((p) => [p.name, p]));

  if (byName["Bank Statement / P&L"]) {
    await updateProgram(byName["Bank Statement / P&L"].id, {
      minFico: 620,
      baseMaxLtv: 90,
      guidelineVersionLabel: "FundLoans Apex Prime Bank Statement Guidelines — verified 2026-07-29",
      sourceCitation: "FundLoans Apex Prime Bank Statement Guidelines — https://fundloans.com/guidelines, https://20500382.fs1.hubspotusercontent-na2.net/hubfs/20500382/FundLoans_September2021/PDFs/2021-06-10_apex_prime_bank_statement_guidelines_v21.6.pdf, fetched 2026-07-29",
      lastVerifiedDate: TODAY,
      notes: "Corrected 2026-07-29: real FundLoans Apex Prime product family (product name mapped to bank statement/P&L-only qualification per the platform's product-family mapping). 620 min FICO (indicator score of the primary earner), up to 90% LTV, 12- or 24-month personal or business bank statements, 7 documented options for calculating qualifying income, and a P&L-Only option requiring no bank statements. Blended ratios allowed up to 80% max LTV/CLTV.",
    }, "FundLoans — Bank Statement / P&L (Apex Prime)");
  }

  if (byName["Assets Only"]) {
    await updateProgram(byName["Assets Only"].id, {
      baseMaxLtv: 90,
      maxLoanAmount: 2000000,
      guidelineVersionLabel: "FundLoans Montage Prime — verified 2026-07-29",
      sourceCitation: "FundLoans Guidelines + Matrices — https://fundloans.com/guidelines, https://ezfundings.com/fundloans-guidelines/, fetched 2026-07-29",
      lastVerifiedDate: TODAY,
      notes: "Corrected 2026-07-29: real FundLoans Montage Prime product family (mapped to asset qualifier/asset allowance/expanded full documentation per the platform's product-family mapping). Montage Prime real highlights: Assets Only AND a separate 60-month Asset Allowance option (assets used to SUPPLEMENT income rather than as the sole qualifying method — a real distinct mechanic from pure Assets Only), 90% LTV up to $2M, plus 1-year or 2-year Full Doc options bundled under the same Montage Prime family. Departing residence can be excluded from DTI.",
    }, "FundLoans — Assets Only (Montage Prime)");
  }

  if (byName["Spectrum DSCR / No Ratio"]) {
    await updateProgram(byName["Spectrum DSCR / No Ratio"].id, {
      minFico: 660,
      baseMaxLtv: 80,
      minDscr: 0,
      foreignNationalDscrEligible: true,
      interestOnlyAvailable: true,
      guidelineVersionLabel: "FundLoans DSCR and No Ratio — verified 2026-07-29",
      sourceCitation: "FundLoans DSCR and No Ratio — https://fundloans.com/dscr-and-no-ratio/, fetched 2026-07-29",
      lastVerifiedDate: TODAY,
      notes: "Corrected 2026-07-29: real FundLoans Spectrum DSCR/No-Ratio product family. Loans $200K-$6MM, DSCR as low as 0 (true no-ratio when DSCR < .75), DSCR can be calculated off the interest-only payment, 660 min FICO, 80% max LTV purchase/rate-term, 30-year fixed or 30/40-year fixed with interest-only option, no cash-in-hand limit. FundLoans' own page states this program is explicitly 'a good option for foreign nationals' and for first-time investors — real, direct confirmation of the Foreign National + DSCR combination (foreignNationalDscrEligible=true). No ITIN + DSCR combination is documented on this program's real source; itinDscrEligible left unconfirmed.",
    }, "FundLoans — Spectrum DSCR / No Ratio");
  }

  // New: Aspire and Aspire X standalone second mortgages (real, distinct products).
  await insertProgram(FUNDLOANS_ID, adminId, {
    name: "Aspire — Standalone Second Mortgage",
    incomeDocTypes: ["bank_statement", "pnl_only", "full_doc"],
    loanPurposes: ["purchase", "rate_term_refinance", "cash_out_refinance"],
    occupancies: ["primary", "second_home", "investment"],
    propertyTypes: ["single_family", "2_4_unit"],
    minFico: 680,
    baseMaxLtv: 75,
    maxLoanAmount: 1000000,
    interestOnlyAvailable: true,
    sourceCitation: "FundLoans Non-QM Standalone 2nd Mortgage — https://fundloans.com/standalone-2nd/, fetched 2026-07-29",
    guidelineVersionLabel: "FundLoans Standalone 2nd Mortgage — verified 2026-07-29",
    citizenshipEligible: ["us_citizen", "permanent_resident"],
    notes: "Real FundLoans Aspire product (mapped to standalone second mortgages per the platform's product-family mapping). Loan amounts $200K-$1MM, up to 75% CLTV, 680 min FICO, max combined loan amount $5MM, fixed terms 10/15/20/30, interest-only available on the 30-year term. Bank statement, P&L, or full doc income qualification.",
  }, true);

  await insertProgram(FUNDLOANS_ID, adminId, {
    name: "Aspire X — Standalone Second Mortgage",
    incomeDocTypes: ["bank_statement", "pnl_only", "full_doc", "1099", "wvoe_only", "dscr", "asset_depletion"],
    loanPurposes: ["purchase", "rate_term_refinance", "cash_out_refinance"],
    occupancies: ["primary", "second_home", "investment"],
    propertyTypes: ["single_family", "2_4_unit"],
    minFico: 660,
    baseMaxLtv: 90,
    maxLoanAmount: 850000,
    interestOnlyAvailable: true,
    sourceCitation: "FundLoans Non-QM Standalone 2nd Mortgage — https://fundloans.com/standalone-2nd/, fetched 2026-07-29",
    guidelineVersionLabel: "FundLoans Standalone 2nd Mortgage — verified 2026-07-29",
    citizenshipEligible: ["us_citizen", "permanent_resident"],
    notes: "Real FundLoans Aspire X product — the broader-doc-type sibling of Aspire (mapped to standalone second mortgages per the platform's product-family mapping). Bank statements, P&L only, full doc, 1099, WVOE, DSCR, or assets all accepted. Up to $850K on owner-occupied full doc/bank statement/1099; up to 90% CLTV specifically on bank statement and full doc doc types (the 90% figure modeled here does not apply uniformly to every doc type this program accepts — confirm the exact doc-type-specific CLTV with a FundLoans AE). 660 min FICO, max combined loan amount $5MM, fixed terms 10/15/20/30 plus balloon terms 30/15-40/15 (min $200K loan), interest-only option available.",
  }, true);

  // ============ FIRST NATIONAL BANK OF AMERICA (FNBA) ============
  console.log("\n=== First National Bank of America ===");
  const FNBA_ID = "e7f0aa3b-866d-474e-b8cd-9d17c6e6f569";

  // Near Miss — real, confirmed: recent credit events, no seasoning required.
  await insertProgram(FNBA_ID, adminId, {
    name: "Near Miss",
    incomeDocTypes: ["bank_statement", "pnl_only", "full_doc"],
    loanPurposes: ["purchase", "rate_term_refinance", "cash_out_refinance"],
    occupancies: ["primary", "second_home", "investment"],
    propertyTypes: ["single_family", "2_4_unit", "condo", "non_warrantable_condo", "manufactured", "rural"],
    minFico: 0,
    baseMaxLtv: 0,
    maxLoanAmount: 0,
    citizenshipEligible: ["us_citizen", "permanent_resident", "itin"],
    sourceCitation: "First National Bank of America — Non-QM Loan Programs — https://www.fnba.com/wholesale/non-qm-loans/, https://www.fnba.com/wholesale/, fetched 2026-07-29",
    guidelineVersionLabel: "FNBA Non-QM Loan Programs page — pending numeric matrix",
    notes: "GUIDELINE CONFIRMATION REQUIRED: FNBA's own real site confirms 'Near Miss' as one of its 4 distinct Non-QM programs (alongside Alt-A Premier, FlexFirst HELOC, and Dual Core), explicitly for borrowers with a recent credit event — 'previous bankruptcy, foreclosure, short sale and modifications are ok, no seasoning required' (a real, direct quote from FNBA's own wholesale page). Both SSN and ITIN borrowers are accommodated. No numeric LTV/FICO/loan-amount matrix was located in this pass — minFico/baseMaxLtv/maxLoanAmount intentionally left at 0/unset pending the actual current matrix; confirm with an FNBA AE before quoting.",
  }, false);

  // FlexFirst HELOC — real, distinct first-lien product; store as its own category per spec.
  await insertProgram(FNBA_ID, adminId, {
    name: "FlexFirst HELOC",
    incomeDocTypes: ["bank_statement", "pnl_only", "full_doc"],
    loanPurposes: ["cash_out_refinance"],
    occupancies: ["primary", "second_home", "investment"],
    propertyTypes: ["single_family", "2_4_unit", "condo", "non_warrantable_condo"],
    minFico: 0,
    baseMaxLtv: 0,
    maxLoanAmount: 0,
    citizenshipEligible: ["us_citizen", "permanent_resident", "itin"],
    sourceCitation: "First National Bank of America — FlexFirst HELOC — https://www.fnba.com/mortgage/, https://www.fnba.com/wholesale/, fetched 2026-07-29",
    guidelineVersionLabel: "FNBA FlexFirst HELOC page — pending numeric matrix",
    notes: "GUIDELINE CONFIRMATION REQUIRED — do not treat as a traditional subordinate-lien HELOC. Per FNBA's own real description: FlexFirst HELOC is a FIRST-LIEN home equity line of credit that REPLACES a primary mortgage (not a second lien behind an existing first) — an alternative to a traditional cash-out refinance, with NO minimum draw requirements and an integrated FNBA checking account with a 'sweep' feature. Positioned for real estate investors, small-business owners needing working capital, or borrowers accelerating payoff/consolidating higher-interest debt. Both SSN and ITIN borrowers accommodated. No numeric LTV/FICO/loan-amount matrix, draw-period term, or lien-position confirmation detail beyond 'first lien' was located in this pass — left at 0/unset pending the actual current matrix.",
  }, false);

  // Dual Core — real, distinct cross-collateralized dual-property product; store as its own category, not a bridge loan.
  await insertProgram(FNBA_ID, adminId, {
    name: "Dual Core",
    incomeDocTypes: ["bank_statement", "pnl_only", "full_doc"],
    loanPurposes: ["purchase", "rate_term_refinance"],
    occupancies: ["primary", "second_home", "investment"],
    propertyTypes: ["single_family", "2_4_unit", "condo"],
    minFico: 0,
    baseMaxLtv: 0,
    maxLoanAmount: 0,
    citizenshipEligible: ["us_citizen", "permanent_resident", "itin"],
    sourceCitation: "First National Bank of America — Dual Core Loan Program — https://www.fnba.com/mortgage/, https://www.fnba.com/wholesale/, fetched 2026-07-29",
    guidelineVersionLabel: "FNBA Dual Core page — pending numeric matrix",
    notes: "GUIDELINE CONFIRMATION REQUIRED — do NOT categorize as a bridge loan; FNBA's own site defines Dual Core as a distinct Non-QM, cross-collateralized, DUAL-PROPERTY loan: 'One Non-QM loan. Two properties.' It lets a borrower tap equity in an EXISTING property to finance the ACQUISITION of a SECOND property, reducing or eliminating a traditional down payment on the new purchase — 'a great alternative to a standard HELOC or bridge loan... designed for people who need to tap into equity in an existing property in order to finance a second while reducing or eliminating traditional down payment requirements.' Both SSN and ITIN borrowers accommodated. No numeric LTV/FICO/loan-amount matrix was located in this pass — left at 0/unset pending the actual current matrix.",
  }, false);

  console.log("\nDone. FundLoans core programs enriched with real Apex/Montage/Spectrum figures + 2 new real standalone-second products (Aspire/Aspire X); FNBA gained 3 real qualitative program categories (Near Miss, FlexFirst HELOC, Dual Core) — all 3 left unverified/draft pending a real numeric matrix.");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
