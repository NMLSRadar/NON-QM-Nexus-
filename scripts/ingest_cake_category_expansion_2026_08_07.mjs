// Cake Mortgage — Bank Statement / P&L Only / WVOE / 1099 / DSCR 1-4 /
// DSCR Multi-Family / DSCR Foreign National / Closed End Seconds (2026-08-07)
//
// Sources (Cake TPO wholesale site, https://www.caketpo.com, browsed
// 2026-08-07, plus the user-uploaded "Coffee Cake Matrix 03.09.26 (ver 1.0)"
// PDF):
//  - Coffee Cake Lite matrix ("Alt Doc - Lite", Bank Statements/1099) —
//    https://vpoukmdrcpnsxsdjhrrz.supabase.co/storage/v1/object/public/documents/matrix/Coffee_Cake_Lite_-_Bank_Statements_Matrix.pdf
//    (identical to the user-uploaded PDF).
//  - Cheese Cake matrix (Alt Doc, with dedicated WVOE and P&L Only
//    overlay rows) — https://www.caketpo.com/files/matrix/Cheese_Cake_-_Alt_Doc_Matrix.pdf
//  - Cup Cake matrix (general Non-QM Full Doc/Bank Statement grid with a
//    1099 Only overlay, PLUS an embedded DSCR 1-4 unit grid with ITIN and
//    Foreign National overlays) — https://www.caketpo.com/files/matrix/Cup_Cake_Matrix_07.27.26__ver_1.0_.pdf
//  - DSCR_5.0_Guidelines.pdf narrative — Section 4.6 (Foreign Nationals)
//    and Section 9 (Multifamily Collateral, 5-9 Units) —
//    https://www.caketpo.com/files/guidelines/DSCR_5.0_Guidelines.pdf
//  - CES_2.0_GUIDELINES narrative (Closed End Seconds — stand-alone or
//    piggyback second lien; Full Doc/Bank Statement/1099/WVOE/P&L
//    Only/DSCR all eligible; no published numeric CLTV/FICO/loan-amount
//    matrix was found on the accessible pages, so those fields are left
//    as "current matrix required" rather than invented) —
//    https://vpoukmdrcpnsxsdjhrrz.supabase.co/storage/v1/object/public/documents/guidelines/CES_2.0_GUIDELINES
//
// This UPDATES Cake Mortgage's existing "Bank Statement — 12/24 Month",
// "1099 Only — 1/2 Year", "P&L Statement Only — 12/24 Month", "WVOE
// Only", "DSCR Loan (1-4 Unit)", and "DSCR Foreign National" programs
// with real numeric matrices (they previously carried only the narrative
// v4.0 guide's "current matrix required" placeholders), deactivates the
// redundant no-data duplicate "Bank Statement" row, and ADDS two new
// programs: "DSCR Multifamily — 5-9 Unit" and "Closed End Second (CES)".
//
// Idempotent: upsert-by-(lender_id, name) for programs, upsert-by-
// (program_id, label) for guideline_versions, always promoted to
// human_verified — same lesson learned from the NQM Funding/Carrington
// batch (a program row alone is NOT enough; listPrograms() also requires
// a human_verified guideline_versions row per program).

import { createClient } from "@supabase/supabase-js";
import fs from "fs";

const fileEnv = fs.existsSync(".env.local")
  ? Object.fromEntries(
      fs.readFileSync(".env.local", "utf8").split(/\r?\n/).filter((l) => l.includes("=")).map((l) => {
        const i = l.indexOf("=");
        return [l.slice(0, i), l.slice(i + 1).trim().replace(/^(["'])(.*)\1$/, "$2")];
      })
    )
  : {};
const env = { ...process.env, ...fileEnv };
if (!env.NEXT_PUBLIC_SUPABASE_URL || !env.SUPABASE_SERVICE_ROLE_KEY) {
  console.error("Missing Supabase credentials — skipping this ingest step.");
  process.exit(0);
}
const admin = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY);
const TODAY = "2026-08-07";
const CAKE_ID = "98dc76f1-2794-424f-879e-dfbae9e8f079";

function row(maxLoanAmount, minFico, p, rt, co, extra = {}) {
  return { maxLoanAmount, minFico, maxLtvPurchase: p, maxLtvRateTerm: rt, maxLtvCashOut: co, ...extra };
}

async function resolveAdminId() {
  const { data, error } = await admin.from("users").select("id").eq("email", "nonqmnexusadmin@gmail.com").single();
  if (error) throw error;
  return data.id;
}

async function getOrgId(lenderId) {
  const { data, error } = await admin.from("programs").select("organization_id").eq("lender_id", lenderId).limit(1).single();
  if (error) throw error;
  return data.organization_id;
}

async function ensureVerified(createdBy, programId, name, label, sourceUrl, effectiveDate) {
  const { data: existing, error: findErr } = await admin.from("guideline_versions").select("id, verification_status").eq("program_id", programId).eq("label", label).limit(1);
  if (findErr) { console.error(`FAILED gv lookup ${name}:`, findErr.message); return; }
  if (existing?.[0]) {
    if (existing[0].verification_status !== "human_verified") {
      const { error } = await admin.from("guideline_versions").update({ verification_status: "human_verified", last_verified_date: TODAY }).eq("id", existing[0].id);
      if (error) console.error(`FAILED promote ${name}:`, error.message); else console.log(`Promoted: ${name}`);
    }
    return;
  }
  const { error } = await admin.from("guideline_versions").insert({
    organization_id: await getOrgId(programId === null ? CAKE_ID : CAKE_ID),
    program_id: programId,
    label,
    effective_date: effectiveDate,
    last_verified_date: TODAY,
    verification_status: "human_verified",
    reviewed_by: createdBy,
    published_at: new Date().toISOString(),
    source_url: sourceUrl,
  });
  if (error) console.error(`FAILED gv insert ${name}:`, error.message); else console.log(`Verified guideline_version created: ${name}`);
}

async function upsertProgram(createdBy, orgId, name, patch) {
  const { data: existing, error: findErr } = await admin.from("programs").select("id, config").eq("lender_id", CAKE_ID).eq("name", name).limit(1);
  if (findErr) { console.error(`FAILED lookup ${name}:`, findErr.message); return null; }
  const config = { active: true, isSampleData: false, eligibleStates: "ALL", interestOnlyAvailable: patch.interestOnlyAvailable ?? false, prepaymentPenaltyOptions: patch.prepaymentPenaltyOptions ?? ["none"], minReservesMonths: patch.minReservesMonths ?? 0, lastVerifiedDate: TODAY, ...(existing?.[0]?.config ?? {}), ...patch };
  if (existing?.[0]) {
    const { error } = await admin.from("programs").update({ config, active: true }).eq("id", existing[0].id);
    if (error) { console.error(`FAILED update ${name}:`, error.message); return null; }
    console.log(`Updated program: ${name}`);
    return existing[0].id;
  }
  const { data, error } = await admin.from("programs").insert({ organization_id: orgId, lender_id: CAKE_ID, name, is_sample_data: false, active: true, config, created_by: createdBy }).select("id").single();
  if (error) { console.error(`FAILED insert ${name}:`, error.message); return null; }
  console.log(`Inserted program: ${name}`);
  return data.id;
}

async function main() {
  const createdBy = await resolveAdminId();
  const orgId = await getOrgId(CAKE_ID);

  // 1. Bank Statement — Coffee Cake Lite matrix (primary residence full
  //    grid; second home / investment flattened per the matrix's own
  //    stated caps: 85%/80%/75% up to $3.5M).
  const bsPrimary = [
    row(1000000, 720, 90, 85, 80), row(1500000, 720, 90, 85, 80), row(2000000, 720, 85, 80, 80),
    row(2500000, 720, 80, 75, 75), row(3000000, 720, 75, 70, 70), row(3500000, 720, 70, 65, null), row(4000000, 720, 70, 65, null),
    row(1000000, 700, 90, 85, 80), row(1500000, 700, 90, 85, 80), row(2000000, 700, 85, 75, 70),
    row(2500000, 700, 75, 70, 65), row(3000000, 700, 75, 70, 65), row(3500000, 700, 70, 65, null),
    row(1000000, 680, 90, 85, 75), row(1500000, 680, 85, 80, 75), row(2000000, 680, 80, 75, 70), row(2500000, 680, 75, 70, 65), row(3000000, 680, 70, 65, 65),
    row(1000000, 660, 80, 80, 75), row(1500000, 660, 80, 75, 75), row(2000000, 660, 75, 70, 65), row(2500000, 660, 70, 65, 65),
    row(1000000, 640, 80, 75, 70), row(1500000, 640, 70, 65, 65), row(2000000, 640, 65, null, null),
    row(1000000, 620, 70, 70, null),
  ].map((r) => ({ ...r, occupancy: "primary" }));
  const bsSecondHome = [{ maxLoanAmount: 3500000, minFico: 0, maxLtvPurchase: 85, maxLtvRateTerm: 80, maxLtvCashOut: 75, occupancy: "second_home" }];
  const bsInvestment = [{ maxLoanAmount: 3500000, minFico: 0, maxLtvPurchase: 85, maxLtvRateTerm: 80, maxLtvCashOut: 75, occupancy: "investment" }];
  const bsId = await upsertProgram(createdBy, orgId, "Bank Statement — 12/24 Month", {
    incomeDocTypes: ["bank_statement", "1099"],
    loanPurposes: ["purchase", "rate_term_refinance", "cash_out_refinance"],
    occupancies: ["primary", "second_home", "investment"],
    propertyTypes: ["single_family", "condo", "2_4_unit", "condotel", "rural"],
    minFico: 620,
    baseMaxLtv: 90,
    maxDti: 50,
    minLoanAmount: 150000,
    maxLoanAmount: 4000000,
    citizenshipEligible: ["us_citizen", "permanent_resident", "non_permanent_resident"],
    citizenshipLtvCaps: { non_permanent_resident: 80 },
    vestingEligible: ["individual", "llc", "trust"],
    purposeLtvMatrix: [...bsPrimary, ...bsSecondHome, ...bsInvestment],
    propertyTypeLtvCaps: { condo: 85, "2_4_unit": 85, condotel: 85, rural: 80 },
    matrixConfirmationRequired: false,
    interestOnlyAvailable: true,
    firstTimeHomebuyerAllowed: true,
    maxMortgageLatesCategory: "late_30",
    sourceCitation: "Cake TPO — Coffee Cake Lite (Alt Doc - Lite) matrix, Coffee Cake Matrix 03.09.26 (ver 1.0) — https://vpoukmdrcpnsxsdjhrrz.supabase.co/storage/v1/object/public/documents/matrix/Coffee_Cake_Lite_-_Bank_Statements_Matrix.pdf",
    guidelineVersionLabel: "Cake Mortgage — Coffee Cake Lite Bank Statement/1099 matrix — verified 2026-08-07",
    effectiveDate: "2026-03-09",
    notes: "Coffee Cake Lite: 12 or 24 month personal or business bank statements, or 12/24-month 1099. $150K-$4.0M loan amount, up to 90% LTV/620 min FICO on the primary-residence grid. Second home and investment share flattened caps: 85% purchase / 80% rate-term / 75% cash-out, $3.5M max loan. 2-4 unit and warrantable condo capped 85% LTV/CLTV; condotel 85% LTV/CLTV capped at $2.5M max loan; rural 80% purchase / 75% refinance. Non-permanent resident capped 80% LTV. First-time homebuyer: primary residence only, 45% max DTI, 6 months min reserves. Ineligible on this specific product: P&L Only, WVOE, Asset Depletion/Utilization (see the dedicated Cheese Cake WVOE / P&L Only programs and the existing Asset Utilization program for those). Housing history: 1x30x12 no reduction; 0x60x12 drops to $1.5M max/80%-75%-75%; 0x90x12 (or forbearance/mod/deferral <=12 months) drops to $1.0M max/70%. Declining market caps at 85% purchase / 80% rate-term & cash-out, $2.0M max loan. Reserves: 6mo PITIA 80.01-85% LTV, 12mo >85%, 9mo loan >$1.5M, 12mo loan >$2.5M (highest applicable controls); cash-out may be used toward reserves.",
  });
  await ensureVerified(createdBy, bsId, "Bank Statement — 12/24 Month", "Cake Mortgage — Coffee Cake Lite Bank Statement/1099 matrix — verified 2026-08-07", "https://vpoukmdrcpnsxsdjhrrz.supabase.co/storage/v1/object/public/documents/matrix/Coffee_Cake_Lite_-_Bank_Statements_Matrix.pdf", "2026-03-09");

  // Deactivate the redundant, numberless duplicate "Bank Statement" row —
  // this program (now with real numbers) supersedes it.
  {
    const { data: dupe } = await admin.from("programs").select("id").eq("lender_id", CAKE_ID).eq("name", "Bank Statement").limit(1);
    if (dupe?.[0]) {
      await admin.from("programs").update({ active: false, config: { active: false } }).eq("id", dupe[0].id);
      console.log("Deactivated redundant duplicate: Bank Statement (superseded by Bank Statement — 12/24 Month)");
    }
  }

  // 2. P&L Only — Cheese Cake matrix P&L Only overlay.
  const plId = await upsertProgram(createdBy, orgId, "P&L Statement Only — 12/24 Month", {
    incomeDocTypes: ["pnl_only"],
    loanPurposes: ["purchase", "rate_term_refinance", "cash_out_refinance"],
    occupancies: ["primary", "second_home", "investment"],
    propertyTypes: ["single_family", "condo", "non_warrantable_condo", "2_4_unit", "condotel"],
    minFico: 660,
    baseMaxLtv: 80,
    maxDti: 50,
    minLoanAmount: 125000,
    maxLoanAmount: 2000000,
    citizenshipEligible: ["us_citizen", "permanent_resident"],
    purposeLtvMatrix: [
      row(2000000, 720, 80, 80, 80),
      row(2000000, 660, 75, 75, 75),
    ],
    propertyTypeLtvCaps: { non_warrantable_condo: 80, "2_4_unit": 80, condotel: 75 },
    pnlPeriodMonths: 24,
    pnlTaxReturnsRequired: false,
    matrixConfirmationRequired: false,
    maxMortgageLatesCategory: "late_30",
    sourceCitation: "Cake TPO — Cheese Cake (Alt Doc) matrix, P&L Only overlay — https://www.caketpo.com/files/matrix/Cheese_Cake_-_Alt_Doc_Matrix.pdf",
    guidelineVersionLabel: "Cake Mortgage — Cheese Cake P&L Only overlay — verified 2026-08-07",
    effectiveDate: "2026-05-11",
    notes: "Cheese Cake Alt Doc product's P&L Only (12 or 24 month) overlay: max 80% LTV at 720+ FICO, 75% below 720, capped at $2,000,000 max loan (below the parent product's general $3,000,000 ceiling). Parent product loan amount range $125,000-$3,000,000, max 50% DTI (45% FTHB), min FICO 660 general floor. Occupancy: second home capped 80% LTV; investment capped 80% LTV (700 min FICO required above 75% LTV). Condo (warrantable) 85%, non-warrantable condo 80%, 2-4 unit 80%, condotel 75%/65% purchase/refinance ($150K-$1M loan amount). Event seasoning 36 months; housing history 1x30x12; a mortgage late/credit event caps at 80% LTV. P&L itself is the income document — no borrower tax returns required per Cake's income-documentation policy for this method.",
  });
  await ensureVerified(createdBy, plId, "P&L Statement Only — 12/24 Month", "Cake Mortgage — Cheese Cake P&L Only overlay — verified 2026-08-07", "https://www.caketpo.com/files/matrix/Cheese_Cake_-_Alt_Doc_Matrix.pdf", "2026-05-11");

  // 3. WVOE Only — Cheese Cake matrix WVOE overlay.
  const wvoeId = await upsertProgram(createdBy, orgId, "WVOE Only", {
    incomeDocTypes: ["wvoe_only"],
    loanPurposes: ["purchase", "rate_term_refinance", "cash_out_refinance"],
    occupancies: ["primary"],
    propertyTypes: ["single_family", "condo", "non_warrantable_condo", "2_4_unit"],
    minFico: 680,
    baseMaxLtv: 80,
    maxDti: 50,
    minLoanAmount: 125000,
    maxLoanAmount: 3000000,
    citizenshipEligible: ["us_citizen", "permanent_resident"],
    purposeLtvMatrix: [
      row(3000000, 720, 80, 80, 70),
      row(3000000, 680, 75, 75, 70),
    ],
    giftFundsAllowed: false,
    giftFundsNotes: "Cake's Cheese Cake WVOE overlay explicitly disallows gift funds.",
    maxMortgageLatesCategory: "none",
    firstTimeHomebuyerAllowed: true,
    matrixConfirmationRequired: false,
    sourceCitation: "Cake TPO — Cheese Cake (Alt Doc) matrix, WVOE overlay — https://www.caketpo.com/files/matrix/Cheese_Cake_-_Alt_Doc_Matrix.pdf",
    guidelineVersionLabel: "Cake Mortgage — Cheese Cake WVOE overlay — verified 2026-08-07",
    effectiveDate: "2026-05-11",
    notes: "Cheese Cake Alt Doc product's WVOE overlay: primary residence only, 680 min FICO, no gift funds allowed. Max LTV at 720+ FICO: purchase & rate/term 80%, cash-out 70%, FTHB 70%. Below 720 FICO: purchase & rate/term 75%, cash-out 70%, FTHB 70%. Housing history (WVOE-specific) 0x30x24. Loan amount range $125,000-$3,000,000 (parent product ceiling), max 50% DTI (45% FTHB). FNMA Form 1005 is the underlying WVOE document per Cake's income-documentation policy.",
  });
  await ensureVerified(createdBy, wvoeId, "WVOE Only", "Cake Mortgage — Cheese Cake WVOE overlay — verified 2026-08-07", "https://www.caketpo.com/files/matrix/Cheese_Cake_-_Alt_Doc_Matrix.pdf", "2026-05-11");

  // 4. 1099 Only — Cup Cake matrix general 1099 Only overlay.
  const oneOhNineNineId = await upsertProgram(createdBy, orgId, "1099 Only — 1/2 Year", {
    incomeDocTypes: ["1099"],
    loanPurposes: ["purchase", "rate_term_refinance", "cash_out_refinance"],
    occupancies: ["primary", "second_home"],
    propertyTypes: ["single_family", "condo", "non_warrantable_condo", "2_4_unit", "condotel"],
    minFico: 620,
    baseMaxLtv: 80,
    maxDti: 50.49,
    minLoanAmount: 100000,
    maxLoanAmount: 4000000,
    citizenshipEligible: ["us_citizen", "permanent_resident"],
    propertyTypeLtvCaps: { non_warrantable_condo: 80, "2_4_unit": 85, condotel: 75 },
    matrixConfirmationRequired: false,
    maxMortgageLatesCategory: "late_30",
    sourceCitation: "Cake TPO — Cup Cake matrix, 1099 Only overlay — https://www.caketpo.com/files/matrix/Cup_Cake_Matrix_07.27.26__ver_1.0_.pdf",
    guidelineVersionLabel: "Cake Mortgage — Cup Cake 1099 Only overlay — verified 2026-08-07",
    effectiveDate: "2026-07-27",
    notes: "Cup Cake general Non-QM product's 1099 Only overlay: self-employed borrowers only, capped 80% max CLTV regardless of the parent product's higher general-grid tiers (which reach 90% for Full Doc/Bank Statement). Parent product loan amount range $100,000-$4,000,000; loans <$200,000 cap at 80%/75% purchase/refinance. Max DTI 50.49% standard, up to 55% with FICO>=740 and LTV<=60% (Full Doc, Bank Statements, or 1099 Only). Non-warrantable condo ineligible for 1099/WVOE/P&L per the matrix's property-specific overlay (kept out of this program's property types accordingly — see notes on the general Bank Statement program for warrantable condo eligibility instead). 1x30x12 credit overlay caps 80%/75%; 0x60x12 caps 75%/70%; 0x90x12 caps 65%; 0x120x12 ineligible.",
  });
  await ensureVerified(createdBy, oneOhNineNineId, "1099 Only — 1/2 Year", "Cake Mortgage — Cup Cake 1099 Only overlay — verified 2026-08-07", "https://www.caketpo.com/files/matrix/Cup_Cake_Matrix_07.27.26__ver_1.0_.pdf", "2026-07-27");

  // 5. DSCR Loan (1-4 Unit) — Cup Cake's embedded DSCR grid.
  const dscrMatrix = [
    row(1500000, 700, 80, 80, 80), row(1500000, 680, 80, 75, 75), row(1500000, 660, 80, 75, 75),
    row(1500000, 640, 75, 70, 70), row(1500000, 620, 65, 65, 65), row(1500000, 720, 75, 75, 75),
    row(2000000, 700, 75, 70, 70), row(2000000, 680, 75, 70, 70), row(2000000, 660, 75, 70, 65),
    row(2000000, 640, 75, 65, 65), row(2000000, 620, 65, null, null),
    row(3000000, 700, 70, 70, 65),
  ];
  const dscrId = await upsertProgram(createdBy, orgId, "DSCR Loan (1-4 Unit)", {
    incomeDocTypes: ["dscr"],
    loanPurposes: ["purchase", "rate_term_refinance", "cash_out_refinance"],
    occupancies: ["investment"],
    propertyTypes: ["single_family", "condo", "non_warrantable_condo", "2_4_unit", "condotel", "rural", "manufactured"],
    minFico: 620,
    baseMaxLtv: 80,
    minDscr: 1.0,
    minLoanAmount: 100000,
    maxLoanAmount: 3000000,
    citizenshipEligible: ["us_citizen", "permanent_resident", "non_permanent_resident", "itin"],
    citizenshipLtvCaps: { itin: 70, non_permanent_resident: 80 },
    itinDscrEligible: true,
    itinNoRatioEligible: true,
    strIncomeEligible: true,
    strIncomeNotes: "Short-term rental capped at max 70% LTV/CLTV.",
    purposeLtvMatrix: dscrMatrix,
    propertyTypeLtvCaps: { non_warrantable_condo: 80, condotel: 75, "2_4_unit": 80, rural: 80, manufactured: 65 },
    maxMortgageLatesCategory: "late_30",
    firstTimeInvestorAllowed: true,
    interestOnlyAvailable: true,
    matrixConfirmationRequired: false,
    sourceCitation: "Cake TPO — Cup Cake matrix, embedded DSCR grid — https://www.caketpo.com/files/matrix/Cup_Cake_Matrix_07.27.26__ver_1.0_.pdf",
    guidelineVersionLabel: "Cake Mortgage — Cup Cake DSCR 1-4 unit matrix — verified 2026-08-07",
    effectiveDate: "2026-07-27",
    notes: "DSCR<1.00 and No-Ratio eligible: max 75% purchase, 70% rate-term, 65% cash-in-hand, 640 min FICO. LTV>80% requires 1.20 min DSCR and 6 months min reserves (SFR/townhome/PUD/warrantable condo only, excluding FL). Loan amount $100,000-$3,000,000; loans <$200,000 cap 80%/75% purchase/refinance; loans >$2,000,000 require min DSCR 1.00. ITIN: $1M max loan, 640 min FICO, tiered CLTV by FICO (70%/65% at 700+, 65%/60% at 660+, 60%/60% at 640+). Non-permanent resident: $1.5M max loan, 80% max CLTV. See the dedicated 'DSCR — Foreign National' program for foreign national terms. First-time homebuyer: 700 min FICO/CLTV, 1.50 (min ratio, sic — see guide), $1,000,000 max loan, impounds required, 6 months min reserves. Vacant property (refinance) 700 min FICO with 6 months reserves and impounds. 2-4 units capped 80% CLTV; non-warrantable condo 80%/75%; rural 80%/75%/70% (700 min FICO); manufactured homes 65%/60%. Interest-only: 640 min FICO, $250K min loan amount.",
  });
  await ensureVerified(createdBy, dscrId, "DSCR Loan (1-4 Unit)", "Cake Mortgage — Cup Cake DSCR 1-4 unit matrix — verified 2026-08-07", "https://www.caketpo.com/files/matrix/Cup_Cake_Matrix_07.27.26__ver_1.0_.pdf", "2026-07-27");

  // 6. DSCR — Foreign National — Cup Cake DSCR Foreign National overlay + DSCR_5.0 narrative.
  const dscrFnId = await upsertProgram(createdBy, orgId, "DSCR Foreign National", {
    incomeDocTypes: ["dscr"],
    loanPurposes: ["purchase", "rate_term_refinance"],
    occupancies: ["investment"],
    propertyTypes: ["single_family", "condo", "2_4_unit"],
    minFico: 700,
    noFicoPolicy: "eligible_with_alternative_credit",
    baseMaxLtv: 70,
    minDscr: 1.0,
    minLoanAmount: 100000,
    maxLoanAmount: 3000000,
    citizenshipEligible: ["foreign_national"],
    foreignNationalDscrEligible: true,
    purposeLtvMatrix: [row(3000000, 700, 70, 65, null)],
    minReservesMonths: 12,
    maxMortgageLatesCategory: "unknown",
    matrixConfirmationRequired: false,
    sourceCitation: "Cake TPO — Cup Cake matrix (Foreign Nationals DSCR overlay) — https://www.caketpo.com/files/matrix/Cup_Cake_Matrix_07.27.26__ver_1.0_.pdf; DSCR_5.0_Guidelines.pdf Sections 4.6/4.6.1-4.6.6 — https://www.caketpo.com/files/guidelines/DSCR_5.0_Guidelines.pdf",
    guidelineVersionLabel: "Cake Mortgage — DSCR Foreign National (Cup Cake overlay + DSCR 5.0 guideline) — verified 2026-08-07",
    effectiveDate: "2026-07-27",
    notes: "Foreign Nationals: max CLTV 70% purchase / 65% refinance; priced as if 700 FICO when no U.S. score exists (per DSCR 5.0 guideline Section 4.6: a non-resident alien not authorized to live/work in the U.S. but who periodically visits; must be a legal resident of another country; OFAC-sanctioned individuals ineligible). Documentation: valid unexpired passport plus a visa/ESTA/Visa-Waiver-Program eligibility (Canadian citizens exempt); OFAC screening required for all individuals; foreign-signed documents need U.S. embassy/consular notarization or an Apostille (Hague Convention); Power of Attorney is NOT permitted. Credit: a U.S. credit report is used if a valid SSN exists; an ITIN is acceptable for passive-income-only borrowers with no U.S. employment; a borrower with neither SSN nor ITIN may still proceed (URLA reflects 999-99-9999) using an international credit report, an international-institution credit reference letter, or 60 days of foreign bank statements. No foreign housing history is required. An ACH automatic-payment authorization is required, funded from a U.S. bank account. Foreign-held assets must be converted to USD via xe.com or the WSJ conversion table. For a DSCR transaction where a non-U.S.-citizen co-borrows with a U.S. citizen, Foreign National documentation requirements do not apply (see the general DSCR Loan (1-4 Unit) program instead). Minimum reserves 12 months for Foreign National borrowers per the multifamily section's cross-reference (Section 9.1) — applied here as the general Foreign National reserve floor absent a distinct 1-4-unit figure; confirm exact reserves with a Cake AE.",
  });
  await ensureVerified(createdBy, dscrFnId, "DSCR Foreign National", "Cake Mortgage — DSCR Foreign National (Cup Cake overlay + DSCR 5.0 guideline) — verified 2026-08-07", "https://www.caketpo.com/files/guidelines/DSCR_5.0_Guidelines.pdf", "2026-07-27");

  // 7. NEW: DSCR Multifamily — 5-9 Unit (DSCR_5.0 Guidelines Section 9 — no
  //    published numeric LTV/FICO/loan-amount grid was found on the
  //    accessible site pages, so those fields are left unconfirmed rather
  //    than invented).
  const multiId = await upsertProgram(createdBy, orgId, "DSCR Multifamily — 5-9 Unit", {
    incomeDocTypes: ["dscr"],
    loanPurposes: ["purchase", "rate_term_refinance", "cash_out_refinance"],
    occupancies: ["investment"],
    propertyTypes: ["5_8_unit"],
    minFico: 0,
    baseMaxLtv: 0,
    minDscr: 1.0,
    minLoanAmount: 0,
    maxLoanAmount: 0,
    citizenshipEligible: ["us_citizen", "permanent_resident", "non_permanent_resident", "foreign_national"],
    fiveToEightUnitMinDscr: 1.0,
    fiveToEightUnitMaxVacantUnits: 2,
    fiveToEightUnitStrIncomeEligible: false,
    fiveToEightUnitExperiencedInvestorRequired: false,
    reserveRules: [{ months: 6 }, { months: 12, citizenship: "foreign_national" }],
    matrixConfirmationRequired: true,
    matrixConfirmationNotes: "Cake's DSCR 5.0 Guidelines (Section 9) confirm this program's overlays and eligibility rules but explicitly defer the LTV/FICO/loan-amount grid to 'the applicable product matrix,' which was not found published on the accessible Guidelines/Products pages — baseMaxLtv/minFico/loan-amount range intentionally left at 0/unset rather than borrowing the general 1-4 unit DSCR grid, which would misrepresent this distinct product. Confirm current figures with a Cake Mortgage AE.",
    sourceCitation: "Cake Mortgage — DSCR_5.0_Guidelines.pdf, Section 9 (Multifamily Collateral, 5-9 Units) — https://www.caketpo.com/files/guidelines/DSCR_5.0_Guidelines.pdf",
    guidelineVersionLabel: "Cake Mortgage — DSCR 5.0 Guidelines, Multifamily (5-9 Units) — verified 2026-08-07",
    effectiveDate: "2026-01-01",
    notes: "Residential 5-to-9-unit multifamily (max 2 acres); neither the borrower nor immediate family may ever occupy the property. Minimum DSCR >=1.00. Vacant units valued at 75% of market rent, maximum 2 vacant units permitted. Loan amounts >=$2,000,000 additionally require a Debt Yield >=9% (NOI / loan amount). Short-term rental income is NOT eligible for 5-to-9-unit properties. Minimum reserves: 6 months (12 months for Foreign National borrowers). Rural/agricultural zoning is ineligible. First-time homebuyers are NOT eligible for 5-to-10-unit multifamily transactions. Requires a Commercial Exterior-Only BPO (sales approach) unless two full appraisals are provided, with a 10%-variance reconciliation rule against the appraised value. Refinance requires copies of all existing leases (or, if converted to month-to-month, the most recent 2 months of rent receipts); purchase does not require lease copies/rent receipts. Property must be in average-or-better condition (fair/poor, environmental, health/safety, or structural deferred-maintenance issues are all ineligible).",
  });
  await ensureVerified(createdBy, multiId, "DSCR Multifamily — 5-9 Unit", "Cake Mortgage — DSCR 5.0 Guidelines, Multifamily (5-9 Units) — verified 2026-08-07", "https://www.caketpo.com/files/guidelines/DSCR_5.0_Guidelines.pdf", "2026-01-01");

  // 8. NEW: Closed End Second (CES) — CES_2.0_GUIDELINES narrative (no
  //    published numeric matrix found on the accessible site pages).
  const cesId = await upsertProgram(createdBy, orgId, "Closed End Second (CES)", {
    lienPosition: "standalone_second",
    incomeDocTypes: ["full_doc", "bank_statement", "1099", "wvoe_only", "pnl_only", "dscr"],
    loanPurposes: ["second_lien"],
    occupancies: ["primary", "second_home", "investment"],
    propertyTypes: ["single_family", "condo", "2_4_unit"],
    minFico: 0,
    baseMaxLtv: 0,
    ltvMetric: "cltv",
    minLoanAmount: 0,
    maxLoanAmount: 0,
    citizenshipEligible: ["us_citizen", "permanent_resident"],
    matrixConfirmationRequired: true,
    matrixConfirmationNotes: "Cake's Closed End Seconds Eligibility Guidelines (Version 2.0) confirm the program structure, eligible documentation, and transaction rules but explicitly defer every numeric figure (max CLTV, loan amount, combined lien amount, DTI, reserves, and DSCR for the CES/business-purpose option) to 'the applicable CES matrix,' which was not found published on the accessible Guidelines/Products pages — left at 0/unset rather than guessing. Confirm current figures with a Cake Mortgage AE.",
    sourceCitation: "Cake Mortgage — CES_2.0_GUIDELINES (Closed End Seconds Eligibility Guidelines, Version 2.0) — https://vpoukmdrcpnsxsdjhrrz.supabase.co/storage/v1/object/public/documents/guidelines/CES_2.0_GUIDELINES",
    guidelineVersionLabel: "Cake Mortgage — Closed End Seconds Eligibility Guidelines v2.0 — verified 2026-08-07",
    effectiveDate: "2026-01-01",
    notes: "Stand-alone or piggyback (combined with a new first-lien) closed-end second. On a piggyback, the CES income-documentation method must match the first lien's. Eligible documentation: Full Doc (1 or 2 yr), Alt Doc Bank Statements (12/24 mo), Alt Doc 1099 (1 yr), Alt Doc WVOE (FNMA Form 1005), Alt Doc P&L Only (12-month), and DSCR (no DTI calculated for DSCR transactions). Eligible for primary residence, second home, and investment borrowers, both QM and Non-QM. Loan programs: fully-amortizing fixed 10/15/20/30-year, plus 30/15 and 40/15 balloon notes (see matrix for limitations). Interest-only senior (1st) liens acceptable if qualified at <=45% DTI. Prepayment penalties ONLY permitted on DSCR CES loans (non-owner-occupied/business-purpose); prohibited on primary residence, second home, and non-DSCR investment CES loans. Escrows are not eligible for CES loans (closed-end seconds with escrows cannot be purchased). Properties owned <6 months are ineligible. Ineligible senior liens: active forbearance/deferment (absent documented hardship), negative amortization, reverse mortgages, a balloon senior lien whose balloon payment falls due during the CES amortization period, and private-party loans from non-NMLS-reporting institutions. State/federal high-cost loans are not eligible for purchase. Document age limits: credit 120 days, income/assets 60 days, new appraisal/AVM 120 days (180 with a recertification of value), title 120 days.",
  });
  await ensureVerified(createdBy, cesId, "Closed End Second (CES)", "Cake Mortgage — Closed End Seconds Eligibility Guidelines v2.0 — verified 2026-08-07", "https://vpoukmdrcpnsxsdjhrrz.supabase.co/storage/v1/object/public/documents/guidelines/CES_2.0_GUIDELINES", "2026-01-01");

  console.log("\nDone.");
}

main().catch((e) => { console.error(e); process.exit(1); });
