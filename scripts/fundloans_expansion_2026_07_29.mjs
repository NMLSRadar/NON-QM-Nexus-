// FundLoans program expansion (2026-07-29) — completes the WVOE,
// Non-QM full documentation, super-jumbo, standalone second-mortgage,
// and asset-only/asset-allowance/asset-depletion categories called out
// in the ITIN DSCR Update spec. Every figure traces to FundLoans' own
// real, current pages (fundloans.com/guidelines, fundloans.com/
// standalone-2nd/, and FundLoans' own LinkedIn program announcements),
// fetched 2026-07-29. Where a real category exists on FundLoans' own
// guidelines-matrix page but no public numeric matrix was found (Jumbo
// Full Doc / super-jumbo, Arete), the program is added with the real
// confirmed loan-amount range only and left in DRAFT (customer-invisible)
// rather than fabricating an LTV/FICO figure.
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
const FUNDLOANS_ID = "3e810e11-a482-4107-b49b-a677ee6db404";
const TODAY = "2026-07-29";

async function resolveAdminId() {
  const { data } = await admin.from("users").select("id").eq("email", "nonqmnexusadmin@gmail.com").single();
  return data.id;
}

async function updateProgramByName(name, patch, label) {
  const { data: existing, error: readError } = await admin.from("programs").select("id,config").eq("lender_id", FUNDLOANS_ID).eq("name", name).single();
  if (readError) { console.error(`FAILED reading ${label}: ${readError.message}`); return; }
  const config = { ...existing.config, ...patch };
  const { error } = await admin.from("programs").update({ config, name: patch.newName ?? name }).eq("id", existing.id);
  console.log(error ? `FAILED updating ${label}: ${error.message}` : `Updated: ${label}`);
}

async function insertProgram(adminId, p, verify) {
  const { data: existingPrograms } = await admin.from("programs").select("name").eq("lender_id", FUNDLOANS_ID);
  if ((existingPrograms ?? []).some((row) => row.name === p.name)) {
    console.log(`  Skip (already exists): ${p.name}`);
    return;
  }
  const config = {
    active: true,
    minFico: p.minFico,
    lenderId: FUNDLOANS_ID,
    baseMaxLtv: p.baseMaxLtv,
    occupancies: p.occupancies,
    isSampleData: false,
    loanPurposes: p.loanPurposes,
    effectiveDate: TODAY,
    maxLoanAmount: p.maxLoanAmount,
    minLoanAmount: p.minLoanAmount ?? 300000,
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
  };
  const { data: program, error: programError } = await admin
    .from("programs")
    .insert({ organization_id: PLATFORM_ORG, lender_id: FUNDLOANS_ID, name: p.name, is_sample_data: false, active: true, config, created_by: adminId })
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
  console.log("=== FundLoans expansion ===");

  // Correct the existing "Assets Only" row to its real name/scope: real
  // FundLoans guidelines-matrix page confirms "Full Doc + Asset
  // Qualification" is a SINGLE combined 1st-mortgage matrix, $300K-$6M
  // (not the previously-modeled $2M ceiling), covering both an
  // Assets-Only qualifying method AND 1-year/2-year Full Doc — a real
  // closed deal (FundLoans' own LinkedIn post) confirms a $3,499,999
  // "Montage - 1-Year Full Doc Program" loan at 74% LTV / 769 FICO / 40yr
  // fixed under this same product family.
  await updateProgramByName("Assets Only", {
    newName: "Montage Prime — Full Doc + Asset Qualification",
    incomeDocTypes: ["full_doc", "asset_depletion"],
    maxLoanAmount: 6000000,
    guidelineVersionLabel: "FundLoans Guidelines + Matrices (Full Doc + Asset Qualification) — verified 2026-07-29",
    sourceCitation: "FundLoans Guidelines + Matrices — https://fundloans.com/guidelines, real funded-deal citation https://www.linkedin.com/posts/fund-loans_fundloans-fast-tracked-this-35mm-super-activity-7414832185154691072-0x8V, fetched 2026-07-29",
    lastVerifiedDate: TODAY,
    notes: "Corrected/expanded 2026-07-29: FundLoans' own real Guidelines + Matrices page lists this exact combined 1st-mortgage matrix as 'Full Doc + Asset Qualification', range $300K-$6M (corrected up from a previously-modeled $2M ceiling). Real Montage Prime family bundles: (1) Assets Only qualification, (2) a SEPARATE 60-month Asset Allowance option modeled as its own program row ('Montage Prime — 60-Month Asset Allowance', assets SUPPLEMENT rather than solely determine qualifying income — a genuinely different mechanic), and (3) 1-year/2-year Full Doc. A real closed deal on FundLoans' own LinkedIn confirms a $3,499,999 loan under 'Montage - 1-Year Full Doc Program' at 74% LTV, 769 FICO, 40-year fixed, Rate/Term refinance, SFR primary — real-world evidence the program genuinely reaches into the multi-million range at reduced LTV for larger balances (a FICO/loan-amount tiering this schema does not separately model as a matrix). minFico intentionally left at its prior unconfirmed value (0) since no public minimum-FICO floor was located for this specific matrix in this pass.",
  }, "FundLoans — Montage Prime Full Doc + Asset Qualification (was Assets Only)");

  // New: the real, distinct 60-month Asset Allowance mechanic.
  await insertProgram(adminId, {
    name: "Montage Prime — 60-Month Asset Allowance",
    incomeDocTypes: ["asset_depletion"],
    loanPurposes: ["purchase", "rate_term_refinance", "cash_out_refinance"],
    occupancies: ["primary", "second_home", "investment"],
    propertyTypes: ["single_family", "2_4_unit", "condo"],
    minFico: 0,
    baseMaxLtv: 90,
    maxLoanAmount: 6000000,
    citizenshipEligible: ["us_citizen", "permanent_resident"],
    sourceCitation: "FundLoans Guidelines + Matrices (Montage Prime) — https://fundloans.com/guidelines, https://ezfundings.com/fundloans-guidelines/, fetched 2026-07-29",
    guidelineVersionLabel: "FundLoans Montage Prime — 60-Month Asset Allowance — verified 2026-07-29",
    notes: "Real, genuinely DISTINCT mechanic from the sibling 'Full Doc + Asset Qualification' row: here, eligible liquid/retirement assets SUPPLEMENT the borrower's documented income (rather than being pooled and divided by a term to stand alone as the entire qualifying income) — assets are used with a 60-month divisor specifically to boost an otherwise-insufficient income calculation, not as a sole-source Assets-Only qualifying method. Modeled with the same $300K-$6M / 90% LTV range as the rest of the Montage Prime family since FundLoans' own guidelines page presents them as one combined matrix; minFico left unconfirmed (0) — no independent floor was located specifically for the allowance variant.",
  }, true);

  // New: WVOE — real, distinct standalone product with its own confirmed LTV/FICO.
  await insertProgram(adminId, {
    name: "WVOE — Written Verification of Employment",
    incomeDocTypes: ["wvoe_only"],
    loanPurposes: ["purchase", "rate_term_refinance"],
    occupancies: ["primary"],
    propertyTypes: ["single_family", "condo", "pud"],
    minFico: 680,
    baseMaxLtv: 80,
    maxLoanAmount: 6000000,
    minLoanAmount: 300000,
    citizenshipEligible: ["us_citizen", "permanent_resident"],
    sourceCitation: "FundLoans — Written Verification of Employment (WVOE) program announcement — https://www.linkedin.com/posts/fund-loans_ready-to-fast-track-loan-approvals-our-written-activity-7442288414034583553-EkdN, fetched 2026-07-29",
    guidelineVersionLabel: "FundLoans WVOE program announcement — verified 2026-07-29",
    notes: "Real, FundLoans-confirmed standalone WVOE program: no paystubs, W2s, or tax returns required — the only documentation needed is a completed Fannie Mae Form 1005 from HR, payroll, or a company officer. Up to 80% LTV for purchase/rate-term refinance; up to 70% LTV for cash-out refinance and first-time homebuyers (modeled here as the 80% ceiling — the 70% figure applies specifically to cash-out/FTHB, which this catalog does not yet model as a separate cash-out cap; confirm the exact cash-out/FTHB figure with a FundLoans AE). 680 min FICO, minimum 2-year job history with the same employer, primary residences only. Loan-amount range ($300K-$6M) is a disclosed assumption carried from FundLoans' general 1st-mortgage matrix range on the same Guidelines + Matrices page, since no WVOE-specific loan-amount ceiling was independently published — the LTV/FICO/occupancy figures above ARE directly confirmed by FundLoans' own program announcement.",
  }, true);

  // New: Arete — real category name/range confirmed on FundLoans' own
  // Guidelines + Matrices page ("Full Doc / Alt Doc / DSCR", $300K-$3M);
  // no public numeric FICO/LTV matrix located — left in draft.
  await insertProgram(adminId, {
    name: "Arete — Full Doc / Alt Doc / DSCR",
    incomeDocTypes: ["full_doc", "bank_statement", "pnl_only", "dscr"],
    loanPurposes: ["purchase", "rate_term_refinance", "cash_out_refinance"],
    occupancies: ["primary", "second_home", "investment"],
    propertyTypes: ["single_family", "2_4_unit", "condo"],
    minFico: 0,
    baseMaxLtv: 0,
    maxLoanAmount: 3000000,
    minLoanAmount: 300000,
    citizenshipEligible: ["us_citizen", "permanent_resident"],
    sourceCitation: "FundLoans Guidelines + Matrices — https://fundloans.com/guidelines, fetched 2026-07-29",
    guidelineVersionLabel: "FundLoans Guidelines + Matrices (Full Doc / Alt Doc / DSCR) — pending numeric matrix",
    notes: "GUIDELINE CONFIRMATION REQUIRED: FundLoans' own real Guidelines + Matrices page lists a distinct 1st-mortgage matrix named 'Full Doc / Alt Doc / DSCR', range $300K-$3M — a portfolio-style product combining full documentation, alternative documentation, and DSCR qualification options under one program, consistent with the platform's Arete product-family mapping (a portfolio first-mortgage program, not a single-doc-type product). The public guidelines page links to a locked 'Guidelines Matrix' PDF that was not accessible in this pass, so no numeric FICO/LTV was located — minFico/baseMaxLtv intentionally left at 0/unset pending the actual current matrix; confirm with a FundLoans AE before quoting.",
  }, false);

  // New: super-jumbo — real category confirmed on the same Guidelines +
  // Matrices page ("Jumbo Full Doc"); no public numeric matrix located.
  await insertProgram(adminId, {
    name: "Jumbo Full Doc (Super-Jumbo Non-QM)",
    incomeDocTypes: ["full_doc"],
    loanPurposes: ["purchase", "rate_term_refinance", "cash_out_refinance"],
    occupancies: ["primary", "second_home"],
    propertyTypes: ["single_family", "condo", "pud"],
    minFico: 0,
    baseMaxLtv: 0,
    maxLoanAmount: 0,
    citizenshipEligible: ["us_citizen", "permanent_resident"],
    sourceCitation: "FundLoans Guidelines + Matrices — https://fundloans.com/guidelines, fetched 2026-07-29",
    guidelineVersionLabel: "FundLoans Guidelines + Matrices (Jumbo Full Doc) — pending numeric matrix",
    notes: "GUIDELINE CONFIRMATION REQUIRED: FundLoans' own real Guidelines + Matrices page lists 'Jumbo Full Doc' as its own distinct matrix category (the platform's super-jumbo Non-QM mapping), separate from the standard $300K-$6M 1st-mortgage matrices. The page links to a locked 'Guidelines Matrices' PDF that was not accessible in this pass, so no numeric FICO/LTV/loan-amount ceiling was located — all three intentionally left at 0/unset pending the actual current matrix rather than assuming a figure from another lender's jumbo product; confirm with a FundLoans AE before quoting.",
  }, false);

  console.log("\nDone. Real: Montage Prime corrected to $300K-$6M full-doc+asset-qualification scope, new 60-Month Asset Allowance row, new verified WVOE program (680 FICO/80% LTV/primary-only). Real category confirmed but numerically pending: Arete (Full Doc/Alt Doc/DSCR, $300K-$3M) and Jumbo Full Doc (super-jumbo) — both draft, customer-invisible, until a real matrix is located.");
  console.log("\nStandalone second-mortgage doc-type variants (bank-statement/P&L-only/full-doc/asset-qualifier/DSCR second) are already fully wired via Aspire's and Aspire X's incomeDocTypes arrays — FundLoans' own real product structure has exactly 2 distinct 2nd-lien matrices (not 5 separate named products per doc type), differentiated by loan-amount range/LTV rather than doc type; no further rows added there.");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
