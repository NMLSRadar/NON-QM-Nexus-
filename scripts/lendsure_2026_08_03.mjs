// LendSure Mortgage Corp. — Super-Prime / Expanded / Investor / DSCR /
// Foreign National / Bridge / Fix-and-Flip guideline ingestion, per the
// user-supplied "LendSure Non-QM Eligibility Matrix" workbook (ingested
// 2026-08-03).
//
// LENDER-NAME CORRECTION (never-fabricate rule): the accompanying prompt
// text referred to this lender as "Lensher Mortgage Corporation" / "LMC" —
// but the workbook itself is branded throughout as "LendSure Non-QM Rate
// Sheet" / "LendSure Non-QM Eligibility Matrix" (LendSure Mortgage Corp,
// 12230 World Trade Center Drive, Suite 250, San Diego, CA 92128, NMLS
// 1326437). The "LMC" tab-name prefix is LendSure's own internal shorthand,
// not a distinct company. Confirmed with the platform owner before
// ingesting: all data below is filed under the EXISTING "LendSure Mortgage
// Corp." lender record, never a fabricated "Lensher" entity.
//
// SOURCE: user-supplied "LendSure Non-QM Eligibility Matrix" workbook,
// tabs "LMC Super-Prime Full Doc" (eff. 8/15/25), "LMC Super-Prime Bank
// Statement" (eff. 8/15/25), "LMC Super-Prime Asset Depletion" (eff.
// 8/15/25), "LMC Expanded Approval" (eff. 5/1/25), "LMC Investor Income
// Qualified" (eff. 10/24/25), "LMC DCSR" [sic] (eff. 9/12/25), "LMC DSCR
// 5-10 Unit" (eff. 9/12/25), "LMC Foreign National" (eff. 5/1/25), "LMC
// Bridge" (eff. 4/27/26), "LMC Fix and Flip" (eff. 1/1/26). Ingested
// 2026-08-03, no OCR ambiguity (native spreadsheet extraction) — every
// guideline_versions row below is marked human_verified.
//
// SCOPE NOTE: this workbook also contains pure RATE/PRICING adjustment
// grids (basis-point rebates by rate/FICO/LTV) for the same programs —
// those are pricing data, not eligibility/matching criteria, deliberately
// NOT ingested into the matching engine.
//
// ENGINE LIMITATION DISCLOSED (pre-existing platform-wide, not introduced
// here): Program.ltvMatrix has no transaction-type or loan-amount
// dimension (see deriveMaxLtv in baseChecks.ts — it filters only by
// minFico + occupancy). Every ltvMatrix entry below transcribes the
// PURCHASE-transaction LTV grid (the convention already used by other
// catalog entries, e.g. "Titan Flex"); each program's real Rate/Term and
// Cash-Out LTV ceilings are LOWER per the source and are documented in
// notes/sourceCitation for manual reference, not silently applied by the
// engine.
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
const TODAY = "2026-08-03";
const LENDER_ID = "7a3d77a4-ca7e-4909-b5c6-f46002e3222d"; // LendSure Mortgage Corp.
const WORKBOOK = "LendSure Mortgage Corp. — user-supplied \"LendSure Non-QM Eligibility Matrix\" workbook, ingested 2026-08-03";
// "States: All states except NY." — explicitly stated on multiple tabs.
const ELIGIBLE_STATES = [
  "AL","AK","AZ","AR","CA","CO","CT","DE","DC","FL","GA","HI","ID","IL","IN","IA",
  "KS","KY","LA","ME","MD","MA","MI","MN","MS","MO","MT","NE","NV","NH","NJ","NM",
  "NC","ND","OH","OK","OR","PA","RI","SC","SD","TN","TX","UT","VT","VA","WA","WV","WI","WY",
];
const STANDARD_ARM_NOTE =
  "ARM: 5yr/6mo SOFR ARM, margin 3.5%, index 30-day average SOFR, floor = start rate, 2.0% initial cap / 2.0% annual cap / 5.0% life cap. Fixed: 15 & 30yr fixed, or 40yr fixed w/ 10yr interest-only. IO term 120 months, qualifies off 30yr amortization.";
const STACKING_NOTE = "Stacking (broker/lender points + compensation + buydowns) cannot exceed 2% over the program's max LTV/eligibility limits. Deviations case-by-case with compensating factors.";

async function resolveAdminId() {
  const { data, error } = await admin.from("users").select("id").eq("email", "nonqmnexusadmin@gmail.com").single();
  if (error) throw new Error(`Could not resolve admin user: ${error.message}`);
  return data.id;
}

async function upsertGuidelineVersion(programId, label, sourceUrl, adminId, status = "human_verified") {
  const { error } = await admin.from("guideline_versions").insert({
    organization_id: PLATFORM_ORG,
    program_id: programId,
    label,
    effective_date: TODAY,
    last_verified_date: TODAY,
    verification_status: status,
    reviewed_by: adminId,
    published_at: new Date().toISOString(),
    source_url: sourceUrl,
  });
  if (error) throw new Error(`guideline_versions insert failed for ${programId}: ${error.message}`);
}

async function createProgram(name, config, adminId) {
  const { data: existing } = await admin.from("programs").select("id").eq("lender_id", LENDER_ID).eq("name", name);
  if (existing && existing.length > 0) {
    console.log(`Skip create (already exists): ${name} -> ${existing[0].id}`);
    return existing[0].id;
  }
  const { data, error } = await admin
    .from("programs")
    .insert({ organization_id: PLATFORM_ORG, lender_id: LENDER_ID, name, is_sample_data: false, active: true, config, created_by: adminId })
    .select("id")
    .single();
  if (error) throw new Error(`Insert failed for ${name}: ${error.message}`);
  console.log(`Created program: ${name} -> ${data.id}`);
  return data.id;
}

async function updateProgram(id, name, configPatch, adminId) {
  const { data: row, error: readErr } = await admin.from("programs").select("config").eq("id", id).single();
  if (readErr) throw new Error(`Read failed for ${name}: ${readErr.message}`);
  const config = { ...row.config, ...configPatch };
  const { error } = await admin.from("programs").update({ config, updated_at: new Date().toISOString() }).eq("id", id);
  if (error) throw new Error(`Update failed for ${name}: ${error.message}`);
  console.log(`Updated program: ${name} (${id})`);
}

async function main() {
  const adminId = await resolveAdminId();

  // ---------------------------------------------------------------------
  // 1. Super-Prime Full Doc — NEW program (no existing LendSure Full Doc
  //    product in the catalog).
  // ---------------------------------------------------------------------
  const fullDocConfig = {
    active: true,
    isSampleData: false,
    lenderId: LENDER_ID,
    incomeDocTypes: ["full_doc", "1099"],
    loanPurposes: ["purchase", "rate_term_refinance", "cash_out_refinance"],
    occupancies: ["primary", "second_home"],
    propertyTypes: ["single_family", "condo", "non_warrantable_condo", "pud", "2_4_unit", "rural"],
    minFico: 660,
    baseMaxLtv: 90, // Purchase, Primary, 760+/<$1.0M-$1.5M — best-case ceiling
    minLoanAmount: 100_000,
    maxLoanAmount: 3_500_000,
    maxDti: 45, // 50% when LTV <= 80%
    minReservesMonths: 6, // see notes for the full tiered rule
    interestOnlyAvailable: true,
    prepaymentPenaltyOptions: [],
    citizenshipEligible: ["us_citizen", "permanent_resident"],
    vestingEligible: ["individual", "llc", "corporation", "trust"],
    eligibleStates: ELIGIBLE_STATES,
    propertyTypeLtvCaps: { non_warrantable_condo: 75, "2_4_unit": 85, condo: 85 },
    // Purchase-transaction LTV grid (see engine-limitation note at top of file).
    ltvMatrix: [
      { minFico: 760, maxLtv: 90, occupancy: "primary", maxLoanAmount: 1_500_000 },
      { minFico: 760, maxLtv: 80, occupancy: "primary", maxLoanAmount: 2_500_000 },
      { minFico: 760, maxLtv: 75, occupancy: "primary", maxLoanAmount: 3_000_000 },
      { minFico: 760, maxLtv: 70, occupancy: "primary", maxLoanAmount: 3_500_000 },
      { minFico: 700, maxLtv: 90, occupancy: "primary", maxLoanAmount: 1_000_000 },
      { minFico: 700, maxLtv: 85, occupancy: "primary", maxLoanAmount: 1_500_000 },
      { minFico: 680, maxLtv: 85, occupancy: "primary", maxLoanAmount: 1_500_000 },
      { minFico: 660, maxLtv: 80, occupancy: "primary", maxLoanAmount: 2_000_000 },
      { minFico: 760, maxLtv: 85, occupancy: "second_home", maxLoanAmount: 1_500_000 },
      { minFico: 700, maxLtv: 80, occupancy: "second_home", maxLoanAmount: 1_000_000 },
      { minFico: 680, maxLtv: 75, occupancy: "second_home", maxLoanAmount: 1_000_000 },
      { minFico: 660, maxLtv: 75, occupancy: "second_home", maxLoanAmount: 1_000_000 },
    ],
    effectiveDate: "2025-08-15",
    lastVerifiedDate: TODAY,
    guidelineVersionLabel: "LendSure Super-Prime Full Doc Eligibility Matrix (eff. 8/15/25)",
    sourceCitation: `${WORKBOOK}, tab "LMC Super-Prime Full Doc".`,
    notes:
      "Real LendSure Super-Prime Full Doc eligibility matrix (1 & 2yr Full Doc, 1 & 2yr 1099). Full transaction-type grid (Purchase/Rate-Term/Cash-Out x Primary/Second Home x FICO x loan-amount band) transcribed from the source; this program's config models the Purchase grid (see engine-limitation note in the ingestion script) — real Rate/Term ceiling is ~5pts lower and Cash-Out ~10-15pts lower than Purchase at the same FICO/loan-amount, e.g. 760+/<$1.0M: Purchase 90%, Rate/Term 85%, Cash-Out 80%. " +
      "Reserves (tiered, not a flat figure): 0mo PITIA when LTV<=65%; 6mo PITIA when LTV>65%; 3mo PITIA for purchase loans with FICO>720 and LTV>65 & <=80; 12mo PITIA for loan amounts >$1,500,000 regardless of LTV; cash-out proceeds may be used for reserves. Mortgage rating 0x30x12 all mortgages. Credit event seasoning 48 months (BK/FC/SS/forbearance/mod). Non-Warrantable Condo: 680 min FICO, Condotel ineligible. Cash-out max proceeds $1,000,000. Rural properties capped at 80% LTV, 10 acres max. " +
      STANDARD_ARM_NOTE + " " + STACKING_NOTE + " States: all except NY; HI/NV require AE consumer-purpose licensing; non-US citizens may be limited in FL/OK (legal review required) — this program's own eligible borrowers are US Citizen/Permanent Resident only, so FL/OK limitation is not applicable here. " +
      `Source: ${WORKBOOK}, tab "LMC Super-Prime Full Doc" (effective 8/15/25).`,
  };
  const fullDocId = await createProgram("Super-Prime Full Doc", fullDocConfig, adminId);
  await upsertGuidelineVersion(fullDocId, fullDocConfig.guidelineVersionLabel, fullDocConfig.sourceCitation, adminId);

  // ---------------------------------------------------------------------
  // 2. Super-Prime Bank Statement — UPDATE existing "Bank Statement
  //    (12/24-Month)" program with the real, dated eligibility matrix
  //    (supersedes the prior public-marketing-page-sourced figures).
  // ---------------------------------------------------------------------
  const BANK_STMT_ID = "2266a7b5-0901-4bfc-be6b-9257a0df81f8";
  const bankStmtPatch = {
    minFico: 660, // real matrix floor (660-679 tier is the lowest documented row)
    baseMaxLtv: 90,
    maxLoanAmount: 3_500_000,
    minLoanAmount: 100_000,
    maxDti: 45,
    minReservesMonths: 6,
    propertyTypes: ["single_family", "condo", "non_warrantable_condo", "pud", "2_4_unit", "rural"],
    propertyTypeLtvCaps: { non_warrantable_condo: 75, "2_4_unit": 85, condo: 85 },
    ltvMatrix: [
      { minFico: 760, maxLtv: 90, occupancy: "primary", maxLoanAmount: 1_500_000 },
      { minFico: 760, maxLtv: 80, occupancy: "primary", maxLoanAmount: 2_500_000 },
      { minFico: 760, maxLtv: 75, occupancy: "primary", maxLoanAmount: 3_000_000 },
      { minFico: 760, maxLtv: 70, occupancy: "primary", maxLoanAmount: 3_500_000 },
      { minFico: 700, maxLtv: 90, occupancy: "primary", maxLoanAmount: 1_000_000 },
      { minFico: 700, maxLtv: 85, occupancy: "primary", maxLoanAmount: 1_500_000 },
      { minFico: 680, maxLtv: 85, occupancy: "primary", maxLoanAmount: 1_500_000 },
      { minFico: 660, maxLtv: 80, occupancy: "primary", maxLoanAmount: 2_000_000 },
      { minFico: 760, maxLtv: 85, occupancy: "second_home", maxLoanAmount: 1_500_000 },
      { minFico: 700, maxLtv: 80, occupancy: "second_home", maxLoanAmount: 1_000_000 },
      { minFico: 680, maxLtv: 75, occupancy: "second_home", maxLoanAmount: 1_000_000 },
    ],
    effectiveDate: "2025-08-15",
    lastVerifiedDate: TODAY,
    guidelineVersionLabel: "LendSure Super-Prime Bank Statement Eligibility Matrix (eff. 8/15/25)",
    sourceCitation: `${WORKBOOK}, tab "LMC Super-Prime Bank Statement".`,
    notes:
      "SUPERSEDES prior public-marketing-page-sourced figures with LendSure's own dated internal Super-Prime Bank Statement Eligibility Matrix (12 & 24-month bank statement, personal and/or business). Eligibility grid IDENTICAL to Super-Prime Full Doc's Purchase/Rate-Term/Cash-Out x FICO x loan-amount matrix (same LTV ceilings, same reserves/mortgage-rating/credit-event-seasoning/ARM/property-type rules) — see the Super-Prime Full Doc program's notes for the full tiered detail (this ingestion script's comment header explains the Purchase-grid-only engine limitation). Non-Warrantable Condo 680 min FICO; Condotel ineligible. DTI 45% max (50% when LTV<=80%). " +
      STANDARD_ARM_NOTE + " " + STACKING_NOTE + " " +
      `Source: ${WORKBOOK}, tab "LMC Super-Prime Bank Statement" (effective 8/15/25).`,
  };
  await updateProgram(BANK_STMT_ID, "Bank Statement (12/24-Month)", bankStmtPatch, adminId);
  await upsertGuidelineVersion(BANK_STMT_ID, bankStmtPatch.guidelineVersionLabel, bankStmtPatch.sourceCitation, adminId);

  // ---------------------------------------------------------------------
  // 3. Super-Prime Asset Depletion — UPDATE existing "Asset Qualifier".
  // ---------------------------------------------------------------------
  const ASSET_QUAL_ID = "5717c3ee-5110-405d-bfc1-90bf08b3e4c8";
  const assetPatch = {
    minFico: 660,
    baseMaxLtv: 80,
    maxLoanAmount: 3_500_000, // real figure is higher than the prior $2M
    minLoanAmount: 100_000,
    maxDti: 45,
    minReservesMonths: 6,
    occupancies: ["primary"], // "Occupancy: Owner Occupied" only, per this specific matrix
    propertyTypes: ["single_family", "condo", "non_warrantable_condo", "pud", "rural"],
    propertyTypeLtvCaps: { non_warrantable_condo: 75, condo: 80 },
    ltvMatrix: [
      { minFico: 660, maxLtv: 80, occupancy: "primary", maxLoanAmount: 2_000_000 },
      { minFico: 660, maxLtv: 75, occupancy: "primary", maxLoanAmount: 2_500_000 },
      { minFico: 660, maxLtv: 70, occupancy: "primary", maxLoanAmount: 3_000_000 },
    ],
    effectiveDate: "2025-08-15",
    lastVerifiedDate: TODAY,
    guidelineVersionLabel: "LendSure Super-Prime Asset Depletion/Asset Qualifier Eligibility Matrix (eff. 8/15/25)",
    sourceCitation: `${WORKBOOK}, tab "LMC Super-Prime Asset Depletion".`,
    notes:
      "SUPERSEDES prior public-page-sourced figures (which understated the real maximum loan amount at $2M; the actual dated matrix supports up to $3.5M at lower LTV tiers). Owner-occupied (primary) only. Purchase LTV up to 80% (760+, <$1.0M-$2.0M); Rate/Term up to 75%; Cash-Out up to 75%. DTI 45% max (50% when LTV<=80%). Mortgage rating 0x30x12. Credit event seasoning 48 months. Reserves tiered: 0mo PITIA LTV<=65%, 6mo LTV>65%, 3mo for purchase >720 FICO & 65-80% LTV, 12mo for loans >$1.5M. Non-Warrantable Condo 680 min FICO, Condotel ineligible. " +
      STANDARD_ARM_NOTE + " " + STACKING_NOTE + " " +
      `Source: ${WORKBOOK}, tab "LMC Super-Prime Asset Depletion" (effective 8/15/25).`,
  };
  await updateProgram(ASSET_QUAL_ID, "Asset Qualifier", assetPatch, adminId);
  await upsertGuidelineVersion(ASSET_QUAL_ID, assetPatch.guidelineVersionLabel, assetPatch.sourceCitation, adminId);

  // ---------------------------------------------------------------------
  // 4. DSCR — UPDATE existing "Investor Cash Flow (DSCR) — 1-4 Unit".
  // ---------------------------------------------------------------------
  const DSCR_ID = "612f9c47-fddf-4a83-91d7-a5dcf986b386";
  const dscrPatch = {
    minFico: 660,
    baseMaxLtv: 80, // safe unconditional Purchase ceiling at 760+/<$1.0M; 85% requires footnote (4) conditions — see notes
    minDscr: 1.0, // the >1.00 DSCR tier; a >.75<1.00 DSCR sub-tier also exists with its own lower LTVs (see notes)
    maxLoanAmount: 3_000_000,
    minLoanAmount: 75_000,
    minReservesMonths: 6, // tiered — see notes
    occupancies: ["investment"],
    propertyTypes: ["single_family", "condo", "non_warrantable_condo", "condotel"],
    propertyTypeLtvCaps: { non_warrantable_condo: 75, condotel: 75 },
    interestOnlyAvailable: true,
    experiencedInvestorRequired: false, // program-wide; first-time investors excluded ONLY within the DSCR .75-1.00 sub-tier and the >80% LTV footnote (4) tier (both documented in notes)
    ltvMatrix: [
      { minFico: 760, maxLtv: 80, occupancy: "investment", maxLoanAmount: 1_500_000 }, // unconditional; 85% available only under footnote (4)
      { minFico: 760, maxLtv: 75, occupancy: "investment", maxLoanAmount: 2_000_000 },
      { minFico: 760, maxLtv: 70, occupancy: "investment", maxLoanAmount: 3_000_000 },
      { minFico: 720, maxLtv: 80, occupancy: "investment", maxLoanAmount: 1_000_000 },
      { minFico: 700, maxLtv: 75, occupancy: "investment", maxLoanAmount: 1_000_000 },
      { minFico: 680, maxLtv: 75, occupancy: "investment", maxLoanAmount: 1_000_000 },
      { minFico: 660, maxLtv: 70, occupancy: "investment", maxLoanAmount: 1_000_000 },
    ],
    effectiveDate: "2025-09-12",
    lastVerifiedDate: TODAY,
    guidelineVersionLabel: "LendSure DSCR Eligibility Matrix (eff. 9/12/25)",
    sourceCitation: `${WORKBOOK}, tab "LMC DCSR".`,
    notes:
      "SUPERSEDES prior public-page-sourced figures with LendSure's own dated internal DSCR matrix. DSCR > 1.00 tier: Purchase 760+/<$1.0M-$1.5M = 85% LTV, BUT ONLY under footnote (4): min FICO 740, min DSCR 1.00, 12mo PITIA reserves, 0x30x12 mortgage rating, first-time investors NOT allowed — the unconditional/default ceiling at that tier is modeled here as 80% (never overstating). A separate DSCR >.75-<1.00 sub-tier exists with materially lower LTVs (e.g. Purchase 760+/<$1.0M = 75%), 2-4 Units/Condos capped lower still, no Non-Warrantable Condo/Condotel, first-time investors NOT allowed, 12mo reserves required, vacant properties ineligible for refinance, a 5% LTV reduction applies in declining markets. Short Term Rental sub-program: max 75% LTV purchase requiring 700 FICO, 0x30x12, 1.00 min STR DSCR, max $1,500,000 loan amount. Reserves (general DSCR>1.00 tier): 6mo PITIA unless 3mo (purchase, FICO>720, LTV<=80), 12mo (loan>$1.5M, OR DSCR<1.00, OR LTV>80%). Mortgage rating 1x30x12. Credit event seasoning 36 months. Max 4 borrowers. Cash-out max proceeds $500,000. ACH auto-pay required on cash-out with FICO<700 or LTV>70%, and on all DSCR<1.00 loans. Non-Warrantable Condo 680 min FICO. Rural properties ineligible for this DSCR product (unlike the Full Doc/Bank Statement/Asset Depletion Super-Prime products). Eligible borrowers: US Citizen, Permanent Resident, Non-Permanent Resident — no ITIN/DACA/Asylee/deferred-deportation-order borrowers on this program. " +
      STANDARD_ARM_NOTE + " " + STACKING_NOTE + " " +
      `Source: ${WORKBOOK}, tab "LMC DCSR" (effective 9/12/25).`,
  };
  await updateProgram(DSCR_ID, "Investor Cash Flow (DSCR) — 1-4 Unit", dscrPatch, adminId);
  await upsertGuidelineVersion(DSCR_ID, dscrPatch.guidelineVersionLabel, dscrPatch.sourceCitation, adminId);

  // ---------------------------------------------------------------------
  // 5. Foreign National — UPDATE existing "Foreign National Loans".
  // ---------------------------------------------------------------------
  const FN_ID = "6a35bf44-94db-4f3b-a2fc-adb529accea7";
  const fnPatch = {
    baseMaxLtv: 75, // Second Home/Investor Inc Qual/DSCR>=1.00, <$1.0M
    maxLoanAmount: 2_000_000,
    minLoanAmount: 100_000,
    maxDti: 50,
    minReservesMonths: 12,
    occupancies: ["second_home", "investment"],
    propertyTypes: ["single_family", "condo", "non_warrantable_condo", "condotel", "2_4_unit", "rural", "pud"],
    propertyTypeLtvCaps: { non_warrantable_condo: 70, condotel: 65, "2_4_unit": 70 },
    citizenshipEligible: ["foreign_national"],
    citizenshipLtvCaps: { foreign_national: 75 },
    minDscr: 0.75, // DSCR >=0.75, <1.0 tier eligible at reduced LTV (65% <$1.0M); DSCR >=1.00 tier at 75%
    effectiveDate: "2025-05-01",
    lastVerifiedDate: TODAY,
    guidelineVersionLabel: "LendSure Foreign National Eligibility Matrix (eff. 5/1/25)",
    sourceCitation: `${WORKBOOK}, tab "LMC Foreign National".`,
    notes:
      "SUPERSEDES prior public-page-sourced figures with LendSure's own dated internal Foreign National matrix. LTV varies by occupancy/qualification path AND DSCR tier at <$1.0M loan amount: Second Home Purchase 75%, Investor Income-Qualified Purchase 75%, DSCR>=1.00 Purchase 75%, DSCR>=0.75-<1.00 Purchase 65% (Rate/Term and Cash-Out ceilings are lower still per the source — not modeled by the engine's occupancy/FICO-only matrix; see the ingestion script's engine-limitation note). No FICO-tiered grid exists for this program — eligibility is driven by occupancy/qualification path and loan amount, consistent with the previously-recorded undisclosed minFico. Doc Type: 1&2yr Full Doc, 12&24mo Bank Statement, DSCR. Debt ratio 50% max. Mortgage rating 0x30x24 all mortgages. Credit event seasoning 36 months (BK/FC/SS/forbearance/mod). Reserves 12 months. ACH auto-pay required. Cash-out max proceeds $500,000. Property types: SFR 1-4 units, PUD, Condo, Non-Warrantable Condo, Condotel, Rural. " +
      STANDARD_ARM_NOTE + " " + STACKING_NOTE + " " +
      `Source: ${WORKBOOK}, tab "LMC Foreign National" (effective 5/1/25).`,
  };
  await updateProgram(FN_ID, "Foreign National Loans", fnPatch, adminId);
  await upsertGuidelineVersion(FN_ID, fnPatch.guidelineVersionLabel, fnPatch.sourceCitation, adminId);

  // ---------------------------------------------------------------------
  // 6. Expanded Approval — NEW program. Credit-grade (A/B/C) tiered, and
  //    the ONLY LendSure program in this workbook that admits ITIN
  //    borrowers (credit grade A only, size/FICO-restricted, "review
  //    scenario with Secondary").
  // ---------------------------------------------------------------------
  const expandedConfig = {
    active: true,
    isSampleData: false,
    lenderId: LENDER_ID,
    incomeDocTypes: ["full_doc", "bank_statement", "1099", "asset_depletion"],
    loanPurposes: ["purchase", "rate_term_refinance", "cash_out_refinance"],
    occupancies: ["primary", "second_home"],
    propertyTypes: ["single_family", "condo", "non_warrantable_condo", "condotel", "pud", "2_4_unit", "rural"],
    minFico: 640, // Credit Grade C floor
    baseMaxLtv: 85, // Credit Grade A, Purchase, Primary, best tier
    minLoanAmount: 100_000,
    maxLoanAmount: 3_000_000,
    maxDti: 45,
    minReservesMonths: 6,
    interestOnlyAvailable: true,
    citizenshipEligible: ["us_citizen", "permanent_resident", "non_permanent_resident", "itin"],
    vestingEligible: ["individual", "llc", "corporation", "trust"],
    prepaymentPenaltyOptions: [],
    eligibleStates: ELIGIBLE_STATES,
    propertyTypeLtvCaps: { non_warrantable_condo: 75, condotel: 75, "2_4_unit": 80 },
    ltvMatrix: [
      { minFico: 760, maxLtv: 85, occupancy: "primary", maxLoanAmount: 1_500_000 },
      { minFico: 760, maxLtv: 80, occupancy: "primary", maxLoanAmount: 2_000_000 },
      { minFico: 760, maxLtv: 70, occupancy: "primary", maxLoanAmount: 3_000_000 },
      { minFico: 680, maxLtv: 80, occupancy: "primary", maxLoanAmount: 1_500_000 },
      { minFico: 660, maxLtv: 75, occupancy: "primary", maxLoanAmount: 2_000_000 },
      { minFico: 640, maxLtv: 70, occupancy: "primary", maxLoanAmount: 2_000_000 },
      { minFico: 760, maxLtv: 80, occupancy: "second_home", maxLoanAmount: 1_500_000 },
      { minFico: 680, maxLtv: 75, occupancy: "second_home", maxLoanAmount: 1_500_000 },
      { minFico: 640, maxLtv: 70, occupancy: "second_home", maxLoanAmount: 1_000_000 },
    ],
    effectiveDate: "2025-05-01",
    lastVerifiedDate: TODAY,
    guidelineVersionLabel: "LendSure Expanded Approval Eligibility Matrix (eff. 5/1/25)",
    sourceCitation: `${WORKBOOK}, tab "LMC Expanded Approval".`,
    notes:
      "Credit-grade-tiered program (Grade A/B/C), the ONLY LendSure product in this workbook admitting ITIN borrowers: ITIN must be Credit Grade A and meet standard FICO/size criteria, and LendSure requires the scenario be reviewed with Secondary before proceeding — flagged here as a manual-confirmation-required condition, not a silent auto-pass. No DACA, Asylees, or borrowers under deferred deportation orders. Credit Grade Matrix: Grade A = 0x30x12 mortgage history, 36mo FC/BK/SS/DIL/Mod seasoning, max loan $3,000,000, all occupancies; Grade B = 1x30x12, 24mo seasoning, max loan $2,000,000, all occupancies; Grade C = 1x60x12, 12mo seasoning, max loan $1,000,000, PRIMARY ONLY. Doc types: 1&2yr Full Doc, 12&24mo Bank Statement, 1&2yr 1099, Asset Depletion/Qualifier (primary only). DTI 45% max (50% when LTV<=80%). Reserves tiered as in the Super-Prime programs. Non-Warrantable Condo 680 min FICO; Condotel IS eligible on this program (unlike Super-Prime Full Doc/Bank Statement). IO qualifies A-credit only, Full/Bank Statement doc only. Cash-out max proceeds $1,000,000. Property type: SFR 1-4 units, PUD, Condo, Non-Warrantable Condo, Condotel, Rural (10 acre max, 80% max LTV). " +
      STANDARD_ARM_NOTE + " " + STACKING_NOTE + " " +
      `Source: ${WORKBOOK}, tab "LMC Expanded Approval" (effective 5/1/25).`,
  };
  const expandedId = await createProgram("Expanded Approval", expandedConfig, adminId);
  await upsertGuidelineVersion(expandedId, expandedConfig.guidelineVersionLabel, expandedConfig.sourceCitation, adminId);

  // ---------------------------------------------------------------------
  // 7. Investor Income Qualified — NEW program. Non-owner-occupied only,
  //    credit-grade tiered, NO ITIN/DACA/Asylee (distinct from Expanded
  //    Approval and from the DSCR program above).
  // ---------------------------------------------------------------------
  const investorIncomeConfig = {
    active: true,
    isSampleData: false,
    lenderId: LENDER_ID,
    incomeDocTypes: ["full_doc", "bank_statement", "1099"],
    loanPurposes: ["purchase", "rate_term_refinance", "cash_out_refinance"],
    occupancies: ["investment"],
    propertyTypes: ["single_family", "condo", "non_warrantable_condo", "condotel", "2_4_unit"],
    minFico: 640,
    baseMaxLtv: 85, // Credit Grade A, Purchase, 760+, <$1.0M
    minLoanAmount: 100_000,
    maxLoanAmount: 2_000_000,
    maxDti: 45,
    minReservesMonths: 6,
    interestOnlyAvailable: true,
    citizenshipEligible: ["us_citizen", "permanent_resident", "non_permanent_resident"],
    vestingEligible: ["individual", "llc", "corporation", "trust"],
    prepaymentPenaltyOptions: [],
    eligibleStates: ELIGIBLE_STATES,
    propertyTypeLtvCaps: { non_warrantable_condo: 75, condotel: 75, "2_4_unit": 80 },
    ltvMatrix: [
      { minFico: 760, maxLtv: 85, occupancy: "investment", maxLoanAmount: 1_000_000 },
      { minFico: 760, maxLtv: 80, occupancy: "investment", maxLoanAmount: 1_500_000 },
      { minFico: 720, maxLtv: 80, occupancy: "investment", maxLoanAmount: 1_000_000 },
      { minFico: 680, maxLtv: 80, occupancy: "investment", maxLoanAmount: 1_000_000 },
      { minFico: 660, maxLtv: 80, occupancy: "investment", maxLoanAmount: 1_000_000 },
      { minFico: 640, maxLtv: 75, occupancy: "investment", maxLoanAmount: 1_000_000 },
    ],
    effectiveDate: "2025-10-24",
    lastVerifiedDate: TODAY,
    guidelineVersionLabel: "LendSure Investor Income Qualified Eligibility Matrix (eff. 10/24/25)",
    sourceCitation: `${WORKBOOK}, tab "LMC Investor Income Qualified".`,
    notes:
      "Non-owner-occupied only, credit-grade-tiered (A/B; Grade C is NA on this product — unlike Expanded Approval). Eligible Borrowers: US Citizen, Permanent Resident, Non-Permanent Resident — NO ITIN, DACA, Asylees, or deferred-deportation-order borrowers (distinct from Expanded Approval's limited ITIN allowance, and from the DSCR program's Non-Permanent Resident-inclusive but ITIN-excluded borrower set). Asset Depletion/Qualifier and Credit Grade C are NOT eligible on this product. Short Term Rental eligible at 75% max Purchase LTV. Doc types: 1&2yr Full Doc, 12&24mo Bank Statement, 1&2yr 1099. Same Credit Grade Matrix (mortgage rating/seasoning) as Expanded Approval. Reserves tiered per Super-Prime rule. Cash-out max proceeds $500,000. Non-Warrantable Condo 680 min FICO. " +
      STANDARD_ARM_NOTE + " " + STACKING_NOTE + " " +
      `Source: ${WORKBOOK}, tab "LMC Investor Income Qualified" (effective 10/24/25).`,
  };
  const investorIncomeId = await createProgram("Investor Income Qualified", investorIncomeConfig, adminId);
  await upsertGuidelineVersion(investorIncomeId, investorIncomeConfig.guidelineVersionLabel, investorIncomeConfig.sourceCitation, adminId);

  // ---------------------------------------------------------------------
  // 8. DSCR 5-10 Unit — NEW program. Spans this platform's 5_8_unit AND
  //    9_plus_unit PropertyType split; only the 5-8-unit portion can be
  //    modeled via fiveToEightUnitLtvMatrix (the platform's only
  //    multi-unit-matrix mechanism) — the 9-10 unit portion of this real
  //    product is a genuine, disclosed platform gap (never fabricated as
  //    silently covered).
  // ---------------------------------------------------------------------
  const FIVE_TO_EIGHT_MATRIX = [
    { maxLoanAmount: 1_000_000, minFico: 760, maxLtvPurchase: 75, maxLtvRateTerm: 70, maxLtvCashOut: 65 },
    { maxLoanAmount: 1_000_000, minFico: 700, maxLtvPurchase: 75, maxLtvRateTerm: 70, maxLtvCashOut: 65 },
    { maxLoanAmount: 1_000_000, minFico: 680, maxLtvPurchase: 75, maxLtvRateTerm: 70, maxLtvCashOut: 65 },
    { maxLoanAmount: 1_500_000, minFico: 760, maxLtvPurchase: 75, maxLtvRateTerm: 70, maxLtvCashOut: 65 },
    { maxLoanAmount: 1_500_000, minFico: 700, maxLtvPurchase: 70, maxLtvRateTerm: 70, maxLtvCashOut: 65 },
    { maxLoanAmount: 1_500_000, minFico: 680, maxLtvPurchase: 70, maxLtvRateTerm: 70, maxLtvCashOut: 65 },
    { maxLoanAmount: 2_000_000, minFico: 760, maxLtvPurchase: 75, maxLtvRateTerm: 70, maxLtvCashOut: 65 },
    { maxLoanAmount: 2_000_000, minFico: 720, maxLtvPurchase: 70, maxLtvRateTerm: 70, maxLtvCashOut: 65 },
    { maxLoanAmount: 2_000_000, minFico: 700, maxLtvPurchase: 65, maxLtvRateTerm: 65, maxLtvCashOut: 65 },
    { maxLoanAmount: 2_000_000, minFico: 680, maxLtvPurchase: 65, maxLtvRateTerm: 65, maxLtvCashOut: 65 },
    { maxLoanAmount: 3_000_000, minFico: 760, maxLtvPurchase: 70, maxLtvRateTerm: 65, maxLtvCashOut: 60 },
    { maxLoanAmount: 3_000_000, minFico: 720, maxLtvPurchase: 65, maxLtvRateTerm: 65, maxLtvCashOut: 60 },
    { maxLoanAmount: 3_000_000, minFico: 700, maxLtvPurchase: 60, maxLtvRateTerm: 60, maxLtvCashOut: 60 },
    { maxLoanAmount: 3_000_000, minFico: 680, maxLtvPurchase: 60, maxLtvRateTerm: 60, maxLtvCashOut: 60 },
  ];
  const dscr5to10Config = {
    active: true,
    isSampleData: false,
    lenderId: LENDER_ID,
    incomeDocTypes: ["dscr"],
    loanPurposes: ["purchase", "rate_term_refinance", "cash_out_refinance"],
    occupancies: ["investment"],
    propertyTypes: ["5_8_unit", "9_plus_unit"],
    minFico: 680,
    baseMaxLtv: 75, // grid ceiling (760+, <$1.0M-$1.5M, Purchase)
    minLoanAmount: 250_000,
    maxLoanAmount: 3_000_000,
    minDscr: 1.10,
    minReservesMonths: 6, // 12mo for OPB > $1.5M
    interestOnlyAvailable: true,
    citizenshipEligible: ["us_citizen", "permanent_resident"],
    vestingEligible: ["individual", "llc"],
    eligibleStates: ELIGIBLE_STATES,
    prepaymentPenaltyOptions: [],
    experiencedInvestorRequired: true,
    fiveToEightUnitLtvMatrix: FIVE_TO_EIGHT_MATRIX,
    fiveToEightUnitMinDscr: 1.10,
    fiveToEightUnitExperiencedInvestorRequired: true,
    fiveToEightUnitCitizenshipEligible: ["us_citizen", "permanent_resident"],
    fiveToEightUnitStrIncomeEligible: false,
    effectiveDate: "2025-09-12",
    lastVerifiedDate: TODAY,
    guidelineVersionLabel: "LendSure DSCR 5-10 Unit Eligibility Matrix (eff. 9/12/25) — imported, 9-10 unit portion pending platform support",
    sourceCitation: `${WORKBOOK}, tab "LMC DSCR 5 -10 Unit".`,
    notes:
      "DISCLOSED PLATFORM GAP: this real LendSure product covers 5-10 unit properties as ONE eligibility grid, but the platform's matching engine only has a dedicated multi-unit LTV-matrix mechanism for the 5_8_unit PropertyType (added 2026-08-01) — there is no 9_plus_unit-specific matrix mechanism yet. This program lists BOTH 5_8_unit and 9_plus_unit in propertyTypes (both are genuinely eligible per the source), but fiveToEightUnitLtvMatrix only enforces the grid for 5-8 unit scenarios; a 9 or 10 unit scenario against this program will surface as 'guideline confirmation required' rather than a fabricated pass, per the platform's standing anti-fabrication rule for multi-unit matrix gaps. " +
      "Real terms: min unit size 500 sq ft each; Non-Warrantable Condo NOT allowed; Short Term Rental NOT allowed; max 4 borrowers; max cash-out proceeds $500,000; mortgage rating 0x30x24; credit event seasoning 36 months; ACH auto-pay required on all loans; max OPB $3MM with a 5% LTV reduction above $2MM (5+ Multi-Family overlay); all units must be occupied for Rate-Term/Cash-Out refinances; no mixed use. Eligible borrowers: US Citizen, Permanent Resident only (no Non-Permanent Resident, ITIN, Foreign National, DACA). " +
      STANDARD_ARM_NOTE + " " + STACKING_NOTE + " " +
      `Source: ${WORKBOOK}, tab "LMC DSCR 5 -10 Unit" (effective 9/12/25).`,
  };
  const dscr5to10Id = await createProgram("DSCR 5-10 Unit", dscr5to10Config, adminId);
  // Marked imported_pending_review (not human_verified) — the 9-10 unit
  // portion is genuinely not enforceable by the current matching engine,
  // so this program cannot be presented as fully verified/customer-
  // visible-as-confirmed until 9+ unit matrix support exists.
  await upsertGuidelineVersion(dscr5to10Id, dscr5to10Config.guidelineVersionLabel, dscr5to10Config.sourceCitation, adminId, "imported_pending_review");

  // ---------------------------------------------------------------------
  // 9. Bridge — NEW program. Non-standard bridge/gap-financing product,
  //    disclosed as only partially modelable by the standard purchase/
  //    refi matching schema (no LTC/ARV/exit-strategy dimensions exist).
  // ---------------------------------------------------------------------
  const bridgeConfig = {
    active: true,
    isSampleData: false,
    lenderId: LENDER_ID,
    incomeDocTypes: ["full_doc", "bank_statement", "asset_depletion"],
    loanPurposes: ["purchase", "cash_out_refinance"],
    occupancies: ["primary", "second_home", "investment"],
    propertyTypes: ["single_family", "condo", "pud", "townhome", "2_4_unit"],
    minFico: 680, // 720 for standalone bridge / bridge >70% LTV assoc. w/ purchase; 680 for bridge <=70% LTV assoc. w/ purchase
    baseMaxLtv: 70, // safe floor per "Max 65% LTV for loan amounts >$1.5M-$2.0M"; see notes for the 680-vs-720-FICO LTV split
    minLoanAmount: 250_000,
    maxLoanAmount: 2_000_000, // $1,000,000 for Second Home/Non-Owner Occupied; $2,000,000 for Primary Departing Residence — see notes
    minReservesMonths: 0, // "Reserves required for purchase loan only" — conditional, not modeled as a flat requirement
    citizenshipEligible: ["us_citizen", "permanent_resident"],
    vestingEligible: ["individual", "llc"],
    eligibleStates: ELIGIBLE_STATES,
    interestOnlyAvailable: true,
    prepaymentPenaltyOptions: [],
    effectiveDate: "2026-04-27",
    lastVerifiedDate: TODAY,
    guidelineVersionLabel: "LendSure Bridge Program Guidelines (eff. 4/27/26) — non-standard product, partial schema fit",
    sourceCitation: `${WORKBOOK}, tab "LMC Bridge".`,
    notes:
      "DISCLOSED SCHEMA-FIT GAP: this is a short-term (6-12 month) bridge/gap-financing product, not an ordinary purchase/refinance mortgage — the platform's standard Program schema (LTV/FICO/DTI matching) only partially captures its real underwriting logic (MLS-listing requirement, cross-default to a permanent loan, non-renewable term, Senior Management approval gates). Treat any match against this program as INFORMATIONAL ONLY pending dedicated bridge-loan schema support; do not present it to a borrower as a standard eligible mortgage program. " +
      "Real terms: bridge loan associated with a purchase requires qualifying under the LendSure purchase-loan program itself; standalone bridge does not require an accompanying LendSure purchase loan. Income doc: Full Doc W2 (1-2yr + paystubs) or Self-Employed (2yr 1040s + business return or 1099s), Bank Statement Self-Employed (24mo/2yr, or 12mo/3yr with min 720 FICO), or Asset Depletion/Qualifier. DTI <50% (purchase-associated and standalone). Reserves required for purchase-loan-associated bridge only (not standalone). Credit: BK/FC/SS/DIL 48mo seasoning; 720 min FICO for standalone bridge or bridge >70% LTV associated with a purchase; 680 min FICO for bridge <=70% LTV associated with a purchase (5 trades, 2 active). Mortgage history: 0x30x24 (isolated 30-day late may be approved by UW with compensating factors). Loan size: min $250,000; max $2,000,000 (Primary Departing Residence), $1,000,000 (Second Home/Non-Owner Occupied); max 65% LTV for loan amounts $1.5M-$2.0M. Property types: SFR/2-4 units (investment only)/Condo/PUD/Townhome — NO rural properties. First lien only, on both bridge and permanent loan. Term: 12 months (Primary/Second Home), 6 months (Non-Owner Occupied); not renewable; property must be MLS-listed with an evidenced listing agreement (delisting = default). Executed purchase contract + Senior Management approval required for all bridge loans. Non-owner-occupied bridge requires Senior Management approval. If the permanent loan is NOO DSCR, DSCR must be > 1. " +
      STACKING_NOTE + " " +
      `Source: ${WORKBOOK}, tab "LMC Bridge" (effective 4/27/26).`,
  };
  const bridgeId = await createProgram("Bridge", bridgeConfig, adminId);
  await upsertGuidelineVersion(bridgeId, bridgeConfig.guidelineVersionLabel, bridgeConfig.sourceCitation, adminId, "imported_pending_review");

  // ---------------------------------------------------------------------
  // 10. Fix and Flip — NEW program. Construction/rehab/ground-up product;
  //     same schema-fit disclosure as Bridge (LTC/ARV-based, not a
  //     standard LTV/FICO purchase-refi mortgage).
  // ---------------------------------------------------------------------
  const fixFlipConfig = {
    active: true,
    isSampleData: false,
    lenderId: LENDER_ID,
    incomeDocTypes: ["full_doc"],
    loanPurposes: ["purchase", "rate_term_refinance"],
    occupancies: ["investment"],
    propertyTypes: ["single_family", "condo", "townhome", "pud", "2_4_unit"],
    minFico: 660,
    baseMaxLtv: 70, // "Up to 70% of After Repair Value (ARV)" — the closest real analog to an LTV ceiling for this product
    minLoanAmount: 200_000,
    maxLoanAmount: 3_000_000, // higher amounts at Senior Management discretion; ground-up construction capped separately at $2,000,000
    minReservesMonths: 6,
    citizenshipEligible: ["us_citizen", "permanent_resident", "foreign_national"],
    citizenshipLtvCaps: { foreign_national: 65 }, // "5% LTC reduction (Experienced Only)" applied against the 70% ARV/95% LTC ceiling
    vestingEligible: ["llc"], // "Eligible Borrowers, included as members of LLC"
    eligibleStates: ELIGIBLE_STATES,
    interestOnlyAvailable: true,
    prepaymentPenaltyOptions: [],
    effectiveDate: "2026-01-01",
    lastVerifiedDate: TODAY,
    guidelineVersionLabel: "LendSure Fix and Flip Program Guidelines (eff. 1/01/26) — non-standard construction product, partial schema fit",
    sourceCitation: `${WORKBOOK}, tab "LMC Fix and Flip".`,
    notes:
      "DISCLOSED SCHEMA-FIT GAP: this is a purchase/construction, refinance/construction, and ground-up-construction rehab product priced off After-Repair Value (ARV) and Loan-to-Cost (LTC), not a standard purchase/refinance LTV mortgage — the platform's standard Program schema only partially captures this. Treat any match as INFORMATIONAL ONLY pending dedicated construction-loan schema support. " +
      "Real terms: Purchase Loan up to 95% of purchase price (experience-based); Construction Loan up to 100% of construction cost; Total Loan up to 70% ARV and up to 95% Total LTC; ground-up construction up to 95% of construction cost, capped at $2,000,000. Min loan $200,000, max $3,000,000 (higher at Senior Management discretion); max exposure per borrower/guarantor $5,000,000 or 20 properties. Property types: non-owner investment only — SFR, 2-4 units, Condo, Townhomes, PUDs. Credit: BK/FC/SS/DIL/Mod 24mo seasoning; 660 min FICO; 5 trades with 2 active. Term: 12 months (purchase/construction or refinance/construction), 18 months (ground-up). Interest-only monthly payments on disbursed amount (Dutch interest on case-by-case basis). Max cash-out $200,000. Asset verification: sourced and seasoned 30 days. Reserves: 6 months of full-loan-amount payment; funds to begin project = 3 months of construction carrying cost. First lien only; no secondary financing. Eligible borrowers (as LLC members): US Citizen, Permanent Resident Aliens, and Foreign Nationals with a 5% LTC reduction (experienced only). Borrower-funded rehab not available for complex projects, ground-up construction, limited-experience borrowers, or budgets >$25,000. Ground-up construction: up to 65% of land value (must be zoned residential, build-ready, survey/permits received, public utility/ROW access); builder's risk policy with workman's comp clause required. " +
      `Source: ${WORKBOOK}, tab "LMC Fix and Flip" (effective 1/01/26).`,
  };
  const fixFlipId = await createProgram("Fix and Flip", fixFlipConfig, adminId);
  await upsertGuidelineVersion(fixFlipId, fixFlipConfig.guidelineVersionLabel, fixFlipConfig.sourceCitation, adminId, "imported_pending_review");

  console.log("\nLendSure ingestion complete.");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
