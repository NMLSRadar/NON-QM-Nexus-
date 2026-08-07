// Secondary Voice Vitals Expansion — Category Data Ingest (2026-08-07)
//
// Adds/updates real, guideline-sourced Program rows for NQM Funding and
// Carrington Mortgage Services so the catalog carries a distinct row per
// requested category: Bank Statements, P&L, Foreign National, ITIN, DSCR,
// DSCR 5-8 Units, and 2nd Lien — wherever the lender's own uploaded
// guideline documents establish that category as a real, separate product.
//
// Sources (uploaded 2026-08-07, all one-page "Key FEATURES" program
// summaries or full underwriting matrices):
//  - NQM Funding — Non-QM 2nd Lien (Full Doc/Bank Statement/1099/P&L+2mo
//    BS/Asset Utilization/DSCR), 700 min FICO, max 85% CLTV.
//  - NQM Funding — DSCR Multi, Residential 5-8 Units, effective 05.15.26.
//  - NQM Funding — Flex Select ITIN, Max 85% LTV/660 min FICO.
//  - NQM Funding — Flex Foreign National, Min DSCR >=1.00, max 75% LTV.
//  - NQM Funding — Flex Select (general Bank Statement/1099/Asset
//    Utilization/WVOE/P&L), max 90% LTV/660 min FICO.
//  - Carrington Prime Advantage Program Matrix (Full Doc/Alt Doc LTV grid
//    + ITIN Maximum LTVs table + program requirements).
//  - Carrington Non-Agency Advantage Program Matrix (Full/Alt Doc LTV
//    grid + CPA P&L + 2 Mo Bank Statements grid + Foreign National -
//    Second Home grid).
//
// Oaktree Funding: no new guideline document was supplied in this batch.
// Existing Oaktree programs (Investor Advantage DSCR, Bank Statement
// Program, Investor Advantage Alt-Doc/Foreign National) are left
// untouched rather than guessing at ITIN/DSCR-5-8/2nd-Lien figures that
// have no source citation — see docs/guideline-imports/2026-08-07-*.md.
//
// Every numeric field below traces to the cited document. Where a
// document does not state a figure (e.g. no minimum loan amount on a
// one-page summary), matrixConfirmationRequired is set and the gap is
// called out in notes rather than invented.

import { createClient } from "@supabase/supabase-js";
import fs from "fs";

const env = Object.fromEntries(
  fs.readFileSync(".env.local", "utf8").split("\n").filter((l) => l.includes("=")).map((l) => {
    const i = l.indexOf("=");
    return [l.slice(0, i), l.slice(i + 1)];
  })
);
const admin = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY);
const TODAY = "2026-08-07";

const NQM_ID = "294929ca-b14a-412e-b7df-28d7efc0d2b4";
const CARRINGTON_ID = "837bee3f-e3bc-472c-8e75-1f768f4fbef9";

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

function purposeRow(maxLoanAmount, minFico, p, rt, co, extra = {}) {
  return { maxLoanAmount, minFico, maxLtvPurchase: p, maxLtvRateTerm: rt, maxLtvCashOut: co, ...extra };
}

async function insertProgram(createdBy, orgId, lenderId, name, sourceCitation, versionLabel, p) {
  const config = {
    active: true,
    lenderId,
    isSampleData: false,
    effectiveDate: TODAY,
    lastVerifiedDate: TODAY,
    eligibleStates: "ALL",
    sourceCitation,
    guidelineVersionLabel: versionLabel,
    interestOnlyAvailable: p.interestOnlyAvailable ?? false,
    prepaymentPenaltyOptions: p.prepaymentPenaltyOptions ?? ["none"],
    minReservesMonths: p.minReservesMonths ?? 0,
    ...p,
  };
  delete config.__id;
  // Idempotent by (lenderId, name) — this script runs again on every build
  // (see package.json postbuild), so re-running must never create a
  // duplicate row; find-or-insert, then always refresh the config.
  const { data: found, error: findErr } = await admin.from("programs").select("id").eq("lender_id", lenderId).eq("name", name).limit(1);
  if (findErr) { console.error(`FAILED lookup ${name}:`, findErr.message); return; }
  if (found?.[0]) {
    const { error } = await admin.from("programs").update({ config, active: true }).eq("id", found[0].id);
    if (error) console.error(`FAILED update ${name}:`, error.message);
    else console.log(`Updated (already existed): ${name}`);
    return;
  }
  const { error } = await admin.from("programs").insert({
    organization_id: orgId,
    lender_id: lenderId,
    name,
    is_sample_data: false,
    active: true,
    config,
    created_by: createdBy,
  });
  if (error) console.error(`FAILED insert ${name}:`, error.message);
  else console.log(`Inserted: ${name}`);
}

async function updateProgram(id, name, patch) {
  const { data: row, error: readErr } = await admin.from("programs").select("config").eq("id", id).single();
  if (readErr) { console.error(`FAILED read ${name}:`, readErr.message); return; }
  const config = { ...row.config, ...patch, lastVerifiedDate: TODAY };
  const { error } = await admin.from("programs").update({ config }).eq("id", id);
  if (error) console.error(`FAILED update ${name}:`, error.message);
  else console.log(`Updated: ${name}`);
}

async function main() {
  const createdBy = await resolveAdminId();
  const nqmOrg = await getOrgId(NQM_ID);
  const carringtonOrg = await getOrgId(CARRINGTON_ID);

  // ─────────────────────────────── NQM FUNDING ───────────────────────────────

  // 1. UPDATE existing "Flex Supreme / Select Prime — Bank Statement / 1099 /
  //    P&L" with real headline figures from the new Flex Select one-pager
  //    (Bank Statement, P&L Only, P&L + 2 Mo Bank Statements, 1099, Asset
  //    Utilization, WVOE all bundled under one program, per the guideline).
  await updateProgram("3a4792d2-c7d1-48cd-a7dc-86198635eca5", "Flex Supreme / Select Prime — Bank Statement / 1099 / P&L", {
    incomeDocTypes: ["bank_statement", "pnl_only", "1099", "asset_depletion", "wvoe_only"],
    loanPurposes: ["purchase", "rate_term_refinance", "cash_out_refinance"],
    occupancies: ["primary", "second_home", "investment"],
    propertyTypes: ["single_family", "pud", "condo", "non_warrantable_condo", "condotel", "townhome", "2_4_unit"],
    minFico: 660,
    baseMaxLtv: 90,
    maxDti: 55,
    minLoanAmount: 100000,
    maxLoanAmount: 3500000,
    citizenshipEligible: ["us_citizen", "permanent_resident", "non_permanent_resident"],
    vestingEligible: ["individual", "llc", "trust"],
    propertyTypeLtvCaps: { condo: 85, non_warrantable_condo: 80 },
    giftFundsAllowed: true,
    giftFundsNotes: "Gift Funds and Interested Party Contributions options available (Flex Select, effective per current guideline).",
    maxMortgageLatesCategory: "multiple",
    interestOnlyAvailable: true,
    prepaymentPenaltyOptions: ["none", "3_year", "5_year"],
    sourceCitation: "NQM Funding — Flex Select program summary (uploaded 2026-08-07)",
    guidelineVersionLabel: "NQM Funding Flex Select — verified 2026-08-07",
    notes: "Flex Select: $100K-$3.5M, max 90% LTV / 660 min FICO / max 55% DTI. Full Doc 1 or 2 years; Alt Doc = 12 or 24 months bank statements, 1 or 2 years 1099, Asset Utilization (60 or 36 months), WVOE, P&L Only with 2 months bank statements, or P&L Only. 15-, 30- and 40-year fixed, 30- and 40-year I/O, 5/6 SOFR ARM and ARM I/O. 2/1 temporary buydown available. Unlimited cash-out at <=70% LTV, or $1M/unlimited with 18 months reserves above 70% LTV (exclusive of cash back). Housing history: 1x30x12 per matrix LTVs; 3x30x12 considered with limitations (hence category set to 'multiple' as the outer tolerated tier, not a clean-history guarantee) — Credit Event Seasoning >=2 years. Co-ops and manufactured housing available for delegated correspondents only. DU Express Underwriting option available.",
  });

  // 2. UPDATE "Foreign National Program" with the Flex Foreign National
  //    one-pager's real figures.
  await updateProgram("4a024d75-1558-4a85-a3e7-09b9b87e9b51", "Foreign National Program", {
    incomeDocTypes: ["full_doc", "dscr", "asset_depletion"],
    loanPurposes: ["purchase", "rate_term_refinance", "cash_out_refinance"],
    occupancies: ["second_home", "investment"],
    propertyTypes: ["single_family", "pud", "condo", "non_warrantable_condo", "condotel", "2_4_unit"],
    minFico: 700,
    noFicoPolicy: "eligible_with_alternative_credit",
    baseMaxLtv: 75,
    minLoanAmount: 150000,
    maxLoanAmount: 3000000,
    citizenshipEligible: ["foreign_national"],
    vestingEligible: ["individual", "llc"],
    minDscr: 1.0,
    strIncomeEligible: true,
    strIncomeNotes: "Short-term rentals require >=1.15 DSCR (vs >=1.00 for long-term leases).",
    incomeDocTypeLtvCaps: { dscr: { purchase: 70, rate_term_refinance: 70, cash_out_refinance: 70 } },
    cashOutLimits: [{ maxLtv: 55, maxCashOutAmount: null }, { maxLtv: 100, maxCashOutAmount: 1000000 }],
    giftFundsAllowed: true,
    giftFundsNotes: "Gift Funds and Interested Party Contributions options available.",
    maxMortgageLatesCategory: "none",
    foreignNationalDscrEligible: true,
    sourceCitation: "NQM Funding — Flex Foreign National program summary (uploaded 2026-08-07)",
    guidelineVersionLabel: "NQM Funding Flex Foreign National — verified 2026-08-07",
    notes: "$150K-$3M. 700 min score (U.S. credit) or foreign credit with no score. Full/Alt Doc max 75% LTV; DSCR max 70% LTV. 15- and 30-year fixed, 30-year fixed I/O. Second home and investment property only (no primary residence). Full Doc: 2 years; Alt Doc: self-employed CPA letter, Asset Utilization. Housing history 0x30x12. ACH payment setup required. Also eligible for the DSCR Multi & Mixed (5-8 unit) program — see the dedicated 5-8 unit program for that grid.",
  });

  // 3. UPDATE "ITIN Programs" with the Select ITIN one-pager's real figures.
  await updateProgram("f78931d1-e08a-4dd7-86b9-c53a4a9d6bdb", "ITIN Programs", {
    incomeDocTypes: ["full_doc", "bank_statement", "1099", "asset_depletion"],
    loanPurposes: ["purchase", "rate_term_refinance", "cash_out_refinance"],
    occupancies: ["primary", "second_home", "investment"],
    propertyTypes: ["single_family", "pud", "condo", "non_warrantable_condo", "2_4_unit"],
    minFico: 660,
    baseMaxLtv: 85,
    maxDti: 50,
    minLoanAmount: 125000,
    maxLoanAmount: 2500000,
    citizenshipEligible: ["itin"],
    vestingEligible: ["individual"],
    propertyTypeLtvCaps: { condo: 85, non_warrantable_condo: 80 },
    giftFundsAllowed: true,
    giftFundsNotes: "Gift Funds and Interested Party Contributions options available.",
    maxMortgageLatesCategory: "none",
    cashOutLimits: [{ maxLtv: 60, maxCashOutAmount: null }],
    interestOnlyAvailable: true,
    firstTimeHomebuyerAllowed: true,
    itinSpecialist: true,
    sourceCitation: "NQM Funding — Select ITIN program summary (uploaded 2026-08-07)",
    guidelineVersionLabel: "NQM Funding Select ITIN — verified 2026-08-07",
    notes: "$125K-$2.5M. Max 85% LTV / 660 min FICO / max 50% DTI. First-time homebuyers eligible with restrictions. 2/1 temporary buydowns available. 15- and 30-year fixed, 30-year I/O, 5/6 SOFR ARM and ARM I/O. Primary, second home and investment property. Purchase, rate/term and cash-out; unlimited cash-out at <=60% LTV. SFR, PUD, Condo (warrantable and non-warrantable), 2-4 units. Full Doc 1 or 2 years; Alt Doc: VVOE, 12 or 24 months bank statements, 1 or 2 years 1099, rental income, Asset Utilization (supplemental or standalone, seasoned 3 months, divided by 60 months). Housing history 0x30x12.",
  });

  // 4. ADD new "DSCR Multi — 5-8 Unit Residential" program.
  await insertProgram(createdBy, nqmOrg, NQM_ID, "DSCR Multi — 5-8 Unit Residential", "NQM Funding — DSCR Multi, Residential 5-8 Units, effective 05.15.26 (uploaded 2026-08-07)", "NQM Funding DSCR Multi 5-8 Units — verified 2026-08-07", {
    incomeDocTypes: ["dscr"],
    loanPurposes: ["purchase", "rate_term_refinance", "cash_out_refinance"],
    occupancies: ["investment"],
    propertyTypes: ["5_8_unit"],
    minFico: 720,
    noFicoPolicy: "eligible_with_alternative_credit",
    baseMaxLtv: 75,
    minDscr: 1.0,
    minLoanAmount: 100000,
    maxLoanAmount: 3000000,
    citizenshipEligible: ["us_citizen", "permanent_resident", "non_permanent_resident", "foreign_national"],
    vestingEligible: ["individual", "llc"],
    cashOutLimits: [{ maxLtv: 100, maxCashOutAmount: 1000000 }],
    firstTimeInvestorAllowed: true,
    fiveToEightUnitMinDscr: 1.0,
    fiveToEightUnitCitizenshipEligible: ["us_citizen", "permanent_resident", "non_permanent_resident", "foreign_national"],
    matrixConfirmationRequired: true,
    matrixConfirmationNotes: "Minimum loan amount is not published on this one-page product summary (a distinct loan-amount/FICO-banded 5-8 unit LTV grid was not provided) — the $100,000 floor above mirrors NQM Funding's other Flex products pending the dedicated 5-8 unit matrix; confirm with an NQM Funding AE before quoting a small loan amount.",
    sourceCitation: "NQM Funding — DSCR Multi, Residential 5-8 Units, effective 05.15.26",
    guidelineVersionLabel: "NQM Funding DSCR Multi 5-8 Units — effective 05.15.26 — verified 2026-08-07",
    notes: "Residential 5-8 units. Max loan amount $3M. Min DSCR >=1.00. Max 75% LTV. 720 min FICO. Max cash-out $1M. First-time investors allowed. Minimum 400 sq. ft. per unit. Eligible for U.S. citizens, permanent and non-permanent resident aliens, and foreign nationals. Foreign nationals: U.S. credit with 700 min FICO, or foreign credit (no score) — LTV limits apply.",
  });

  // 5. ADD new "2nd Lien — Multi-Doc" standalone second program.
  await insertProgram(createdBy, nqmOrg, NQM_ID, "2nd Lien — Multi-Doc (Full Doc / Bank Statement / 1099 / P&L / Asset Utilization / DSCR)", "NQM Funding — Non-QM 2nd Lien program summary (uploaded 2026-08-07)", "NQM Funding 2nd Lien — verified 2026-08-07", {
    lienPosition: "standalone_second",
    incomeDocTypes: ["full_doc", "bank_statement", "1099", "pnl_only", "asset_depletion", "dscr"],
    loanPurposes: ["second_lien"],
    occupancies: ["primary", "second_home", "investment"],
    propertyTypes: ["single_family", "pud", "condo", "2_4_unit"],
    minFico: 700,
    baseMaxLtv: 85,
    ltvMetric: "cltv",
    maxDti: 50,
    minDscr: 1.0,
    minLoanAmount: 50000,
    maxLoanAmount: 1000000,
    citizenshipEligible: ["us_citizen", "permanent_resident", "non_permanent_resident"],
    vestingEligible: ["individual", "trust"],
    maxMortgageLatesCategory: "none",
    matrixConfirmationRequired: false,
    sourceCitation: "NQM Funding — Non-QM 2nd Lien program summary (uploaded 2026-08-07)",
    guidelineVersionLabel: "NQM Funding 2nd Lien — verified 2026-08-07",
    notes: "Standalone/piggyback second lien behind an existing first mortgage. Full Doc, Bank Statements, 1099, P&L + 2 Months Bank Statements, Asset Utilization, and DSCR. SFR, PUD, warrantable condos, 2-4 units (non-warrantable condos not eligible). Max 85% CLTV. 700 min FICO. Max 50% DTI. Min DSCR ratio 1.00 (DSCR doc type only). Min loan $50K, max loan $1M, max COMBINED loan amount $4M. Purchase, rate/term, refinance; stand-alone or piggyback. Housing history 0x30x12. Terms: 15-, 20-, 25- and 30-year fixed. Eligible borrowers: U.S. citizens, permanent resident aliens, non-permanent resident aliens (with restrictions). AVM only for loans up to $400K.",
  });

  // ────────────────────────── CARRINGTON MORTGAGE SERVICES ──────────────────────────

  // 6. ADD "Prime Advantage — Full Doc / Alt Doc" (Bank Statement, 1099,
  //    WVOE, P&L, Asset Conversion bundled under one matrix). Full Doc and
  //    Alt Doc columns are numerically identical in the source matrix
  //    except for a couple of cash-out cells at 680 FICO, where the more
  //    conservative (lower) Alt Doc figure is used below so the platform
  //    never overstates eligibility.
  const primeAdvantagePrimary = [
    purposeRow(1500000, 720, 90, 90, 80),
    purposeRow(1500000, 700, 85, 85, 75),
    purposeRow(1500000, 680, 85, 85, 70),
    purposeRow(1500000, 660, 80, 80, 70),
    purposeRow(2000000, 720, 85, 85, 75),
    purposeRow(2000000, 700, 80, 80, 70),
    purposeRow(2000000, 680, 75, 75, 65),
    purposeRow(2000000, 660, 70, 70, 65),
    purposeRow(3000000, 720, 80, 80, 70),
    purposeRow(3000000, 700, 75, 75, 65),
    purposeRow(3000000, 680, 70, 70, 60),
    purposeRow(3500000, 720, 75, 75, 65),
    purposeRow(3500000, 700, 70, 70, 60),
    purposeRow(4000000, 720, 70, 70, 60),
  ].map((r) => ({ ...r, occupancy: "primary" }));
  const primeAdvantageInvestment = [
    purposeRow(1500000, 720, 80, 80, 65),
    purposeRow(1500000, 700, 80, 80, 65),
    purposeRow(1500000, 680, 80, 80, 65),
    purposeRow(1500000, 660, 75, 75, 65),
    purposeRow(2000000, 720, 80, 80, 65),
    purposeRow(2000000, 700, 75, 75, 65),
    purposeRow(2000000, 680, 75, 75, 60),
    purposeRow(2000000, 660, 70, 70, 60),
    purposeRow(3000000, 720, 75, 75, 65),
    purposeRow(3000000, 700, 75, 75, 65),
    purposeRow(3000000, 680, 70, 70, 60),
  ].map((r) => ({ ...r, occupancy: "investment" }));
  const primeAdvantageSecondHome = [
    // Footnote: "Second Homes are subject to LTV caps of 80% (Purchase &
    // Rate/Term) and 70% (Cash-Out)" regardless of loan-amount/FICO tier.
    { maxLoanAmount: 4000000, minFico: 0, maxLtvPurchase: 80, maxLtvRateTerm: 80, maxLtvCashOut: 70, occupancy: "second_home" },
  ];
  await insertProgram(createdBy, carringtonOrg, CARRINGTON_ID, "Prime Advantage — Full Doc / Alt Doc (Bank Statement, 1099, WVOE, P&L, Asset Conversion)", "Carrington Prime Advantage Program Matrix (uploaded 2026-08-07)", "Carrington Prime Advantage — verified 2026-08-07", {
    incomeDocTypes: ["full_doc", "bank_statement", "1099", "pnl_only", "wvoe_only", "asset_depletion"],
    loanPurposes: ["purchase", "rate_term_refinance", "cash_out_refinance"],
    occupancies: ["primary", "second_home", "investment"],
    propertyTypes: ["single_family", "pud", "condo", "non_warrantable_condo", "condotel", "2_4_unit"],
    minFico: 660,
    baseMaxLtv: 90,
    maxDti: 43,
    minLoanAmount: 100000,
    maxLoanAmount: 4000000,
    citizenshipEligible: ["us_citizen", "permanent_resident", "non_permanent_resident"],
    vestingEligible: ["individual", "trust"],
    purposeLtvMatrix: [...primeAdvantagePrimary, ...primeAdvantageInvestment, ...primeAdvantageSecondHome],
    propertyTypeLtvCaps: { condo: 85, non_warrantable_condo: 80 },
    cashOutLimits: [{ maxLtv: 60, maxCashOutAmount: 1000000 }, { maxLtv: 100, maxCashOutAmount: 750000 }],
    giftFundsAllowed: true,
    maxMortgageLatesCategory: "late_30",
    reserveRules: [
      { months: 6, maxLoanAmount: 1500000 },
      { months: 9, minLoanAmountExclusive: 1500000, maxLoanAmount: 2000000 },
      { months: 12, minLoanAmountExclusive: 2000000 },
    ],
    notes: "Full and Alt Doc share one LTV grid. Full Doc: 2 years W-2/tax returns. Alt Doc: 24 or 12 months business/personal bank statements, 1 year documentation, 1 or 2 years 1099/P&L, Asset Conversion, WVOE. Mortgage history 1x30x12 (soft/warning tier — a clean 0x30x12 history has no adjustment). Foreclosure/short-sale/DIL/BK seasoning 48 months; 1x120 mortgage late 48 months. Residual income $2,500 (not applicable to investment properties). Standard DTI 43%, expanded up to 50%. Max cash-out $1,000,000 at <=60% LTV or $750,000 at >60% LTV. Min loan $100,000, max loan $4,000,000. See the separate 'Prime Advantage — ITIN' program for ITIN-specific LTV limits.",
  });

  // 7. ADD "Prime Advantage — ITIN" using the ITIN Maximum LTVs table.
  await insertProgram(createdBy, carringtonOrg, CARRINGTON_ID, "Prime Advantage — ITIN", "Carrington Prime Advantage Program Matrix — ITIN Maximum LTVs (uploaded 2026-08-07)", "Carrington Prime Advantage ITIN — verified 2026-08-07", {
    incomeDocTypes: ["full_doc", "bank_statement", "1099", "asset_depletion"],
    loanPurposes: ["purchase", "rate_term_refinance"],
    occupancies: ["primary", "second_home", "investment"],
    propertyTypes: ["single_family", "pud", "condo", "non_warrantable_condo", "2_4_unit"],
    minFico: 660,
    baseMaxLtv: 80,
    minLoanAmount: 100000,
    maxLoanAmount: 2000000,
    citizenshipEligible: ["itin"],
    vestingEligible: ["individual"],
    itinSpecialist: true,
    ownerOccupiedItinEligible: true,
    investmentItinEligible: true,
    purposeLtvMatrix: [
      purposeRow(1500000, 760, 80, 80, null, { occupancy: "primary" }),
      purposeRow(1500000, 740, 80, 80, null, { occupancy: "primary" }),
      purposeRow(1500000, 720, 80, 80, null, { occupancy: "primary" }),
      purposeRow(1500000, 700, 80, 80, null, { occupancy: "primary" }),
      purposeRow(1500000, 660, 75, 75, null, { occupancy: "primary" }),
      purposeRow(2000000, 760, 75, 75, null, { occupancy: "primary" }),
      purposeRow(2000000, 740, 70, 70, null, { occupancy: "primary" }),
      purposeRow(2000000, 720, 65, 65, null, { occupancy: "primary" }),
      purposeRow(2000000, 700, 60, 60, null, { occupancy: "primary" }),
      purposeRow(1500000, 760, 70, 70, null, { occupancy: "investment" }),
      purposeRow(1500000, 740, 70, 70, null, { occupancy: "investment" }),
      purposeRow(1500000, 720, 70, 70, null, { occupancy: "investment" }),
      purposeRow(1500000, 700, 65, 65, null, { occupancy: "investment" }),
      purposeRow(2000000, 760, 65, 65, null, { occupancy: "investment" }),
      purposeRow(2000000, 740, 65, 65, null, { occupancy: "investment" }),
      purposeRow(2000000, 720, 65, 65, null, { occupancy: "investment" }),
      purposeRow(2000000, 700, 60, 60, null, { occupancy: "investment" }),
    ],
    matrixConfirmationRequired: true,
    matrixConfirmationNotes: "Cash-out is not published on the ITIN-specific table (Purchase & Rate/Term only) — a cash-out ITIN request requires direct AE confirmation rather than falling back to the general Prime Advantage cash-out figures.",
    sourceCitation: "Carrington Prime Advantage Program Matrix — ITIN Maximum LTVs table (uploaded 2026-08-07)",
    guidelineVersionLabel: "Carrington Prime Advantage ITIN — verified 2026-08-07",
    notes: "Applies when any borrower uses an ITIN instead of an SSN. Purchase & rate/term only per the published ITIN table (no cash-out figures given). Reserves/DTI/seasoning follow the general Prime Advantage program requirements.",
  });

  // 8. ADD "Non-Agency Advantage — Full Doc / Alt Doc".
  const nonAgencyBase = [
    purposeRow(1000000, 720, 90, 90, 80),
    purposeRow(1500000, 720, 90, 90, 80),
    purposeRow(2000000, 720, 85, 85, 80),
    purposeRow(3000000, 720, 80, 80, 70),
    purposeRow(3500000, 720, 70, 70, 65),
    purposeRow(4000000, 720, 70, null, null),
    purposeRow(1000000, 700, 85, 85, 80),
    purposeRow(1500000, 700, 85, 85, 80),
    purposeRow(2000000, 700, 85, 85, 80),
    purposeRow(3000000, 700, 75, 75, 70),
    purposeRow(3500000, 700, 70, 70, 60),
    purposeRow(1000000, 680, 85, 85, 80),
    purposeRow(1500000, 680, 85, 85, 75),
    purposeRow(2000000, 680, 80, 80, 70),
    purposeRow(3000000, 680, 75, 75, 65),
    purposeRow(1000000, 660, 80, 80, 75),
    purposeRow(1500000, 660, 80, 80, 75),
    purposeRow(2000000, 660, 75, 75, 70),
    purposeRow(1000000, 640, 75, 75, 70),
    purposeRow(1500000, 640, 75, 75, 65),
    purposeRow(2000000, 640, 70, 70, null),
    purposeRow(1000000, 620, 70, 70, 70),
    purposeRow(1500000, 620, 70, 70, 65),
    purposeRow(2000000, 620, 70, 70, null),
  ];
  await insertProgram(createdBy, carringtonOrg, CARRINGTON_ID, "Non-Agency Advantage — Full Doc / Alt Doc (Bank Statement, 1099, WVOE)", "Carrington Non-Agency Advantage Program Matrix (uploaded 2026-08-07)", "Carrington Non-Agency Advantage — verified 2026-08-07", {
    incomeDocTypes: ["full_doc", "bank_statement", "1099", "wvoe_only", "asset_depletion"],
    loanPurposes: ["purchase", "rate_term_refinance", "cash_out_refinance"],
    occupancies: ["primary", "second_home"],
    propertyTypes: ["single_family", "condo", "non_warrantable_condo", "condotel", "2_4_unit", "rural"],
    minFico: 620,
    baseMaxLtv: 90,
    maxDti: 50,
    minLoanAmount: 150000,
    maxLoanAmount: 4000000,
    citizenshipEligible: ["us_citizen", "permanent_resident", "non_permanent_resident"],
    vestingEligible: ["individual", "trust"],
    purposeLtvMatrix: nonAgencyBase,
    propertyTypeLtvCaps: { non_warrantable_condo: 75, condotel: 75, condo: 85, "2_4_unit": 85, rural: 80 },
    reserveRules: [
      { months: 3, maxLoanAmount: 1000000 },
      { months: 6, minLoanAmountExclusive: 1000000, maxLoanAmount: 1500000 },
      { months: 12, minLoanAmountExclusive: 1500000 },
    ],
    maxMortgageLatesCategory: "none",
    maxMortgageLates30x12: 0,
    interestOnlyAvailable: true,
    sourceCitation: "Carrington Non-Agency Advantage Program Matrix (uploaded 2026-08-07)",
    guidelineVersionLabel: "Carrington Non-Agency Advantage — verified 2026-08-07",
    notes: "Full Doc: 12 or 24 month full documentation income. Alt Doc (self-employed only): 12 or 24 months business or personal bank statements, 1099 only, WVOE, FNMA Form 1005 (max 80% LTV, min 660 FICO). Loan amount $150K-$4.0M. Second home: purchase & R/T $3M/75% max, cash-out $3M/70% max, 1x30x12, min FICO 680 (700 for loan amounts $2M+). Non-permanent resident: purchase & R/T 75% LTV max, cash-out 70% LTV max. DTI 50% standard (up to 55% with restrictions). 0x30x12 no adjustment; 1x30x12 on loans >$1.0M reduces max qualifying LTV 5%; 0x60x12 caps all loan amounts at max 70% LTV (both modeled here as a 'none' ceiling — a scenario with any real housing-history event should be routed to manual review against the exact seasoning table). See the separate 'Non-Agency Advantage — P&L + 2 Mo Bank Statements' and 'Non-Agency Advantage — Foreign National (Second Home)' programs for their own distinct grids.",
  });

  // 9. ADD "Non-Agency Advantage — P&L + 2 Mo Bank Statements".
  await insertProgram(createdBy, carringtonOrg, CARRINGTON_ID, "Non-Agency Advantage — P&L + 2 Mo Bank Statements", "Carrington Non-Agency Advantage Program Matrix — CPA P&L + 2 Mo. Bank Statements table (uploaded 2026-08-07)", "Carrington Non-Agency Advantage P&L — verified 2026-08-07", {
    incomeDocTypes: ["pnl_only"],
    loanPurposes: ["purchase", "rate_term_refinance", "cash_out_refinance"],
    occupancies: ["primary", "second_home"],
    propertyTypes: ["single_family", "condo", "2_4_unit"],
    minFico: 680,
    baseMaxLtv: 75,
    maxDti: 50,
    minLoanAmount: 150000,
    maxLoanAmount: 3000000,
    citizenshipEligible: ["us_citizen", "permanent_resident", "non_permanent_resident"],
    vestingEligible: ["individual", "trust"],
    purposeLtvMatrix: [
      purposeRow(2500000, 680, 70, 70, 60),
      purposeRow(3000000, 700, 70, 70, 60),
      purposeRow(3000000, 720, 75, 75, 65),
    ],
    pnlTaxReturnsRequired: false,
    pnlSupportingBankStatementsMonths: 2,
    sourceCitation: "Carrington Non-Agency Advantage Program Matrix — CPA P&L + 2 Mo. Bank Statements table (uploaded 2026-08-07)",
    guidelineVersionLabel: "Carrington Non-Agency Advantage P&L — verified 2026-08-07",
    notes: "CPA-prepared P&L supported by 2 months of bank statements. 680 FICO: max $2.5M, 70% purchase/R&T, 60% cash-out. 700 FICO: max $3M, 70%/60%. 720 FICO: max $3M, 75%/65%. Same DTI/reserves/seasoning as the parent Non-Agency Advantage program.",
  });

  // 10. ADD "Non-Agency Advantage — Foreign National (Second Home)".
  await insertProgram(createdBy, carringtonOrg, CARRINGTON_ID, "Non-Agency Advantage — Foreign National (Second Home)", "Carrington Non-Agency Advantage Program Matrix — Foreign National, Second Home table (uploaded 2026-08-07)", "Carrington Non-Agency Advantage Foreign National — verified 2026-08-07", {
    incomeDocTypes: ["full_doc", "bank_statement"],
    loanPurposes: ["purchase", "rate_term_refinance", "cash_out_refinance"],
    occupancies: ["second_home"],
    propertyTypes: ["single_family", "condo", "non_warrantable_condo", "condotel"],
    minFico: 680,
    noFicoPolicy: "eligible_with_alternative_credit",
    baseMaxLtv: 75,
    maxDti: 50,
    minLoanAmount: 150000,
    maxLoanAmount: 2000000,
    citizenshipEligible: ["foreign_national"],
    vestingEligible: ["individual"],
    purposeLtvMatrix: [
      purposeRow(1000000, 680, 75, 70, 65),
      purposeRow(1500000, 680, 75, 70, 65),
      purposeRow(2000000, 680, 70, 65, 60),
    ],
    propertyTypeLtvCaps: { condo: 70, non_warrantable_condo: 70, condotel: 60 },
    minReservesMonths: 12,
    maxMortgageLatesCategory: "none",
    foreignNationalSpecialist: false,
    sourceCitation: "Carrington Non-Agency Advantage Program Matrix — Foreign National, Second Home table (uploaded 2026-08-07)",
    guidelineVersionLabel: "Carrington Non-Agency Advantage Foreign National — verified 2026-08-07",
    notes: "Second home only (no primary residence, no investment property on this specific grid). 680 min FICO or foreign credit (no score). Full Doc or bank statements. DTI max 50%. Housing history 0x30x24. Reserves 12 months. Cash-in-hand maximum $500,000. Escrows required. Condo/non-warrantable condo capped at 70% LTV, condotel at 65%/60%/60% purchase/RT/cash-out (60% used above as the conservative single-figure cap).",
  });

  console.log("\nDone. Oaktree Funding Corporation: no new guideline document was supplied in this batch — existing programs left untouched. Provide Oaktree's current Bank Statement/P&L/Foreign National/ITIN/DSCR/DSCR-5-8/2nd-Lien matrices to extend its categories the same way.");
}

main().catch((e) => { console.error(e); process.exit(1); });
