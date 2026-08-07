// American Heritage Lending (NMLS 93735) — real numeric Credit/AHL Matrix
// ingestion, per 4 unique lender-supplied guideline-matrix PDFs uploaded by
// the platform owner 2026-08-07 (2 of the 6 uploaded files were exact
// byte-for-byte duplicates of two others; only the 4 unique documents are
// cited below). This is the "AHL Matrices" / "Credit Matrix" that AHL's own
// narrative Client Guide (ingested 2026-07-28, see
// deep_guideline_intelligence_4lenders.mjs) explicitly deferred every
// numeric FICO/LTV ceiling to — those three existing programs are now
// upgraded from unconfirmed/narrative-only to human_verified numeric data.
//
// SOURCES (CloudFront-hosted originals, uploaded 2026-08-07):
//   STANDARD   = https://d2ol7oe51mr4n9.cloudfront.net/user_3Cfrs4UEzyBfibhWL8hkQ0WuLXI/6053f90d-b95c-486c-8f6c-851f25851fea.pdf
//                (duplicate upload: .../1e53edb2-2105-4312-855f-23f0497a36c1.pdf)
//   PREMIER    = https://d2ol7oe51mr4n9.cloudfront.net/user_3Cfrs4UEzyBfibhWL8hkQ0WuLXI/fcd825cb-955b-49ce-a591-4ea747e5e9ec.pdf
//                (duplicate upload: .../8178ae85-0f32-4113-9bb8-0ff82b137c79.pdf)
//   DSCR       = https://d2ol7oe51mr4n9.cloudfront.net/user_3Cfrs4UEzyBfibhWL8hkQ0WuLXI/a18c5149-81c3-431b-b390-cd9f5d762e37.pdf
//   INVESTMENT = https://d2ol7oe51mr4n9.cloudfront.net/user_3Cfrs4UEzyBfibhWL8hkQ0WuLXI/a1e9efd8-1d05-4e69-a0b7-42cb1a9dd385.pdf
//
// DISCLOSED SCOPE DECISION: STANDARD and PREMIER are two DIFFERENT AHL
// matrices covering an overlapping doc-type set (Full Doc/Alt Doc/Bank
// Statement) — STANDARD tops out at 85% LTV, spans Primary+Second+
// Investment, and floors at 640 FICO; PREMIER tops out at 90% LTV, covers
// ONLY Primary+Second Home, floors at 660 FICO, and separately documents a
// numeric "1 Year Profit & Loss" row that STANDARD does not have at all.
// Nothing here decides PREMIER "supersedes" STANDARD — both are real,
// distinct uploaded documents with no effective-date printed on either
// page set, so per this platform's never-fabricate-a-merge rule: STANDARD's
// numbers are applied to the existing "Bank Statement Loans" program
// (already in the catalog, matches its Primary/Second/Investment scope),
// PREMIER's numbers are applied to a NEW distinct "1-Year Profit & Loss
// Only" program (a well-defined, self-contained product row in the source),
// and PREMIER's own general Full/Alt Doc grid is preserved only in notes,
// not silently merged into Bank Statement Loans' numbers.
import { createClient } from "@supabase/supabase-js";
import fs from "fs";

const RUN_ID = "ahl-credit-matrix-2026-08-07-v1";
const enabled = process.env.RUN_AHL_CREDIT_MATRIX_INGEST_20260807 === "true";
if (!enabled) {
  console.log(`[${RUN_ID}] skipped (one-time deployment flag is off)`);
  process.exit(0);
}

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!url || !key) throw new Error("Supabase production credentials are unavailable to the migration.");
const admin = createClient(url, key, { auth: { persistSession: false } });

const TODAY = "2026-08-07";
const LENDER_NAME = "American Heritage Lending";
// Known lender_id from prior ingestion (scripts/ingest_batch9_userflagged_and_next5.mjs,
// scripts/batch4-data.mjs) — used as a fast path; falls back to a by-name
// lookup if this ever stops matching.
const KNOWN_LENDER_ID = "43c1732a-1f8d-4451-adb3-affc70c7be3f";

const SRC = {
  standard: "American Heritage Lending, LLC (NMLS 93735) Full Doc / Alt Doc / Bank Statement / Asset Qualifier credit matrix, uploaded by platform owner 2026-08-07 — https://d2ol7oe51mr4n9.cloudfront.net/user_3Cfrs4UEzyBfibhWL8hkQ0WuLXI/6053f90d-b95c-486c-8f6c-851f25851fea.pdf",
  premier: "American Heritage Lending, LLC (NMLS 93735) Full Doc / Alt Doc / Bank Statement / 1-Year P&L credit matrix, uploaded by platform owner 2026-08-07 — https://d2ol7oe51mr4n9.cloudfront.net/user_3Cfrs4UEzyBfibhWL8hkQ0WuLXI/fcd825cb-955b-49ce-a591-4ea747e5e9ec.pdf",
  dscr: "American Heritage Lending, LLC (NMLS 93735) DSCR credit matrix, uploaded by platform owner 2026-08-07 — https://d2ol7oe51mr4n9.cloudfront.net/user_3Cfrs4UEzyBfibhWL8hkQ0WuLXI/a18c5149-81c3-431b-b390-cd9f5d762e37.pdf",
  investment: "American Heritage Lending, LLC (NMLS 93735) Investment Property (non-DSCR) credit matrix, uploaded by platform owner 2026-08-07 — https://d2ol7oe51mr4n9.cloudfront.net/user_3Cfrs4UEzyBfibhWL8hkQ0WuLXI/a1e9efd8-1d05-4e69-a0b7-42cb1a9dd385.pdf",
};

const BANDS_5 = [1_000_000, 1_500_000, 2_000_000, 2_500_000, 3_000_000];
const BANDS_4 = [1_000_000, 1_500_000, 2_000_000, 3_000_000];
const BANDS_3 = [1_000_000, 1_500_000, 2_000_000];

/** Expand a [minFico, ltv@band1, ltv@band2, ...] row table into
 * EligibilityLtvMatrixEntry objects (null cell = not eligible, skipped). */
function expand(rows, bands, loanPurpose, occupancy, extra = {}) {
  const out = [];
  for (const [minFico, ...ltvs] of rows) {
    ltvs.forEach((maxLtv, i) => {
      if (maxLtv == null) return;
      out.push({ minFico, maxLtv, maxLoanAmount: bands[i], loanPurpose, occupancy, ...extra });
    });
  }
  return out;
}

// ============ STANDARD (6053f90d) -> existing "Bank Statement Loans" ============
const standardMatrix = [
  ...expand([[760,85,85,80,70,70],[740,85,85,80,70,70],[720,85,85,80,70,70],[700,85,85,80,70,70],[680,80,80,75,70,65],[660,80,80,75,70,65],[640,80,80,70,null,null]], BANDS_5, "purchase", "primary"),
  ...expand([[760,80,80,80,70,70],[740,80,80,80,70,70],[720,80,80,80,70,70],[700,80,80,80,70,70],[680,80,80,75,70,65],[660,80,80,75,70,65],[640,80,75,65,null,null]], BANDS_5, "rate_term_refinance", "primary"),
  ...expand([[760,80,80,80,60,60],[740,80,80,80,60,60],[720,80,80,80,60,60],[700,80,80,80,60,60],[680,75,75,75,60,60],[660,70,70,70,60,60],[640,70,70,60,null,null]], BANDS_5, "cash_out_refinance", "primary"),
  ...expand([[760,80,80,80,70,65],[740,80,80,80,70,65],[720,80,80,80,70,65],[700,80,80,80,70,60],[680,80,80,75,70,60],[660,80,80,75,70,60],[640,75,75,null,null,null]], BANDS_5, "purchase", "second_home"),
  ...expand([[760,75,75,75,65,65],[740,75,75,75,65,65],[720,75,75,75,65,65],[700,75,75,75,65,60],[680,75,75,75,65,60],[660,75,75,75,65,60],[640,70,70,null,null,null]], BANDS_5, "rate_term_refinance", "second_home"),
  ...expand([[760,75,75,75,null,null],[740,75,75,75,null,null],[720,75,75,75,null,null],[700,75,75,75,null,null],[680,75,75,75,null,null],[660,70,70,70,null,null]], BANDS_5, "cash_out_refinance", "second_home"),
  ...expand([[760,80,80,80,null,null],[740,80,80,80,null,null],[720,80,80,80,null,null],[700,80,80,80,null,null],[680,80,80,75,null,null],[660,80,80,75,null,null],[640,75,75,null,null,null]], BANDS_5, "purchase", "investment"),
  ...expand([[760,80,80,80,null,null],[740,80,80,80,null,null],[720,80,80,80,null,null],[700,80,80,80,null,null],[680,80,80,75,null,null],[660,80,80,75,null,null],[640,70,70,null,null,null]], BANDS_5, "rate_term_refinance", "investment"),
  ...expand([[760,75,75,75,null,null],[740,75,75,75,null,null],[720,75,75,75,null,null],[700,75,75,75,null,null],[680,75,75,75,null,null],[660,70,70,70,null,null],[640,65,65,null,null,null]], BANDS_5, "cash_out_refinance", "investment"),
];
const standardConfig = {
  active: true, isSampleData: false,
  incomeDocTypes: ["full_doc", "1099", "bank_statement", "asset_depletion"],
  loanPurposes: ["purchase", "rate_term_refinance", "cash_out_refinance"],
  occupancies: ["primary", "second_home", "investment"],
  propertyTypes: ["single_family", "pud", "condo", "non_warrantable_condo", "condotel", "2_4_unit"],
  eligibleStates: "ALL",
  citizenshipEligible: ["us_citizen", "permanent_resident", "non_permanent_resident", "foreign_national"],
  vestingEligible: ["individual", "trust"],
  minLoanAmount: 100_000,
  maxLoanAmount: 3_000_000,
  minFico: 640,
  maxDti: 45, // 50% when LTV <= 80% per source (see notes)
  baseMaxLtv: 85,
  minReservesMonths: 6,
  interestOnlyAvailable: true,
  prepaymentPenaltyOptions: ["business_purpose_only"],
  eligibilityLtvMatrix: standardMatrix,
  citizenshipLtvCaps: { foreign_national: 75, non_permanent_resident: 75 },
  propertyTypeLtvCaps: { non_warrantable_condo: 75, condotel: 75, condo: 85 },
  matrixConfirmationRequired: false,
  notes: `CONFIRMED 2026-08-07 from AHL's own real credit matrix (previously unconfirmed/deferred to "see AHL Matrices"). Full Doc/Alt Doc/Bank Statement grid: Purchase Primary tops out 85% LTV (760+ FICO, <=$1.5M) stepping down to 70% at $3.0M; Second Home tops 80%; Investment tops 80%. Rate/Term runs ~5pt below Purchase at the same tier; Cash-Out runs further below (60% ceiling above $2.0M on Primary). FICO floor is 640 (Primary Purchase/RT only; Second Home and Investment floor at 660). Product-type overlay caps from the same matrix (Purchase/RT/CO): Credit Grade A 85/80/80, Credit Grade B 80/70/70, Credit Grade C 80/70/NA, Asset Qualifier 80/75/70 (see separate "Asset Qualifier Loans" program), Interest Only 80/80/75, Foreign National 75/70/65, Non-Permanent Resident 75/70/70, Non-Warrantable Condo 75/75/70, Condotel 75/70/65. Reserves: 0mo PITIA at LTV<=65%, else 6mo; Purchase w/ 720+ FICO needs only 3mo; 12mo if loan >$1.5M or Foreign National. Max DTI 45% (50% at LTV<=80%). Min sq ft: SFR/PUD 600, condo 500, 2-4 unit 400. Rural/manufactured/5+ unit NOT eligible on this product. Unavailable states: AK, HI, MO, ND, NY, SD. AHL also has a SEPARATE, distinct "Premier" matrix (uploaded same day) reaching 90% LTV on Primary/Second Home only, floored at 660 FICO, with its own numeric 1-Year P&L row — see the new "1-Year Profit & Loss Only" program; that matrix's general Full/Alt Doc numbers are NOT merged into this program since neither uploaded document states an effective date establishing which supersedes the other. Source: ${SRC.standard}.`,
};

// ============ PREMIER (fcd825cb) 1-Year P&L row -> NEW program ============
const plConfig = {
  active: true, isSampleData: false,
  incomeDocTypes: ["pnl_only"],
  loanPurposes: ["purchase", "rate_term_refinance", "cash_out_refinance"],
  occupancies: ["primary"],
  propertyTypes: ["single_family", "pud", "condo", "non_warrantable_condo", "condotel"],
  eligibleStates: "ALL",
  citizenshipEligible: ["us_citizen", "permanent_resident", "non_permanent_resident"],
  vestingEligible: ["individual", "trust"],
  minLoanAmount: 150_000,
  maxLoanAmount: 2_000_000,
  minFico: 700,
  maxDti: 45,
  baseMaxLtv: 80,
  minReservesMonths: 12,
  interestOnlyAvailable: false,
  prepaymentPenaltyOptions: ["not_allowed"],
  eligibilityLtvMatrix: [
    { minFico: 700, maxLtv: 80, loanPurpose: "purchase", occupancy: "primary", incomeDocType: "pnl_only" },
    { minFico: 700, maxLtv: 75, loanPurpose: "rate_term_refinance", occupancy: "primary", incomeDocType: "pnl_only" },
    { minFico: 700, maxLtv: 70, loanPurpose: "cash_out_refinance", occupancy: "primary", incomeDocType: "pnl_only" },
  ],
  matrixConfirmationRequired: false,
  notes: `NEW program added 2026-08-07 from AHL's real "Premier" credit matrix — the first numeric 1-Year Profit & Loss row seen from this lender (previously narrative-only, deferring to "see AHL Matrices"). Min FICO 700, min loan $150,000, max loan $2,000,000, 12 months PITIA reserves, max 45% DTI. Requires the CPA/EA/CTEC/Tax-Attorney preparer to attest they completed or filed the borrower's most recent business tax return, plus 2 months' recent bank statements to support the P&L income. Primary Residence ONLY. Stacking LTVs or fees is explicitly NOT allowed on P&L-only. No prepayment penalty on this product per the source's general Product table. The same "Premier" document's broader Full/Alt Doc/Bank Statement grid (up to 90% LTV, Primary+Second Home, 660 FICO floor) is a separate, real matrix from this lender not merged into the existing "Bank Statement Loans" program — see that program's notes for why. Source: ${SRC.premier}.`,
};

// ============ DSCR (a18c5149) -> existing "DSCR (Debt Service Coverage Ratio)" ============
const dscrMatrix = [
  ...expand([[760,85,80,75,70],[740,85,80,75,70],[720,80,75,70,65],[700,80,75,70,60],[680,75,70,65,60],[660,70,65,60,55]], BANDS_4, "purchase", "investment", { minDscr: 1.0 }),
  ...expand([[760,80,75,70,65],[740,80,75,70,65],[720,80,75,70,65],[700,75,70,65,60],[680,75,70,65,60],[660,70,65,60,55]], BANDS_4, "rate_term_refinance", "investment", { minDscr: 1.0 }),
  ...expand([[760,75,70,70,65],[740,75,70,70,65],[720,75,70,70,65],[700,75,65,65,60],[680,70,65,65,60],[660,65,60,60,55]], BANDS_4, "cash_out_refinance", "investment", { minDscr: 1.0 }),
  ...expand([[760,75,70,65],[740,75,70,65],[720,75,70,65],[700,75,70,65],[680,70,70,65],[660,70,65,60]], BANDS_3, "purchase", "investment", { minDscr: 0.75, maxDscrExclusive: 1.0 }),
  ...expand([[760,70,65,60],[740,70,65,60],[720,70,65,60],[700,70,65,60],[680,65,65,60],[660,65,65,60]], BANDS_3, "rate_term_refinance", "investment", { minDscr: 0.75, maxDscrExclusive: 1.0 }),
  ...expand([[760,70,65,60],[740,70,65,60],[720,70,65,60],[700,70,65,60],[680,65,65,60],[660,65,60,60]], BANDS_3, "cash_out_refinance", "investment", { minDscr: 0.75, maxDscrExclusive: 1.0 }),
  ...expand([[760,75,70,65],[740,75,70,65],[720,70,65,null],[700,65,65,null],[680,65,null,null],[660,60,null,null]], BANDS_3, "purchase", "investment", { maxDscrExclusive: 0.75 }),
  ...expand([[760,70,70,65],[740,70,70,65],[720,70,65,null],[700,65,65,null],[680,60,null,null],[660,60,null,null]], BANDS_3, "rate_term_refinance", "investment", { maxDscrExclusive: 0.75 }),
  ...expand([[760,65,60,60],[740,65,60,60],[720,60,60,null],[700,60,60,null],[680,60,null,null],[660,60,null,null]], BANDS_3, "cash_out_refinance", "investment", { maxDscrExclusive: 0.75 }),
];
const dscrPatch = {
  minFico: 660,
  minLoanAmount: 75_000,
  maxLoanAmount: 3_000_000,
  baseMaxLtv: 85,
  minDscr: 0.75, // guideline supports sub-.75 tiers at a reduced LTV; see eligibilityLtvMatrix maxDscrExclusive bands
  minReservesMonths: 6,
  interestOnlyAvailable: true,
  propertyTypes: ["single_family", "pud", "condo", "non_warrantable_condo", "condotel", "2_4_unit"],
  propertyTypeLtvCaps: { non_warrantable_condo: 75, condotel: 75, "2_4_unit": 80 },
  eligibilityLtvMatrix: dscrMatrix,
  matrixConfirmationRequired: false,
  notesAppend: `NUMERIC MATRIX CONFIRMED 2026-08-07 (previously deferred to "see credit matrix"). Purchase >=1.00 DSCR tops 85% at 760+ FICO/<=$1.0M (footnote: >80% LTV additionally requires 740+ FICO, 1.0 min DSCR, 12mo PITIA, 0x30x12, no first-time investors, delegated correspondent ineligible) stepping to 70% at $3.0M. .75-1.00 DSCR tier caps 5-10pts lower and excludes 2-4 units/condos above 75%/70%, excludes non-warrantable condo/condotel entirely, requires 0x30x12 and 12mo reserves, first-time investors ineligible. <.75 DSCR tier caps further (65-75% Purchase) with the same 2-4-unit/condo/non-warrantable exclusions. Short-term-rental income: 100% of a 12-month deposit history (purchase+refi) or 75% via 1007/property-mgmt report (purchase only); 75% max LTV purchase requires 700 FICO/0x30x12/1.00 STR DSCR/max $1.5M loan. Min loan $75,000 (business-purpose), max $3,000,000. First-time investor allowed only up to 75% LTV; first-time homebuyer ineligible. Source: ${SRC.dscr}.`,
};

// ============ Asset Qualifier overlay -> existing "Asset Qualifier Loans" ============
const assetQualifierPatch = {
  baseMaxLtv: 80,
  notesAppend: `NUMERIC LTV CONFIRMED 2026-08-07 from AHL's real credit matrix (previously unconfirmed): Asset Qualifier caps at 80% LTV Purchase / 75% Rate-Term / 70% Cash-Out platform-wide, regardless of FICO tier — this is a flat overlay cap on top of the general Bank Statement Loans matrix, not its own FICO-tiered grid. Source: ${SRC.standard}.`,
};

// ============ Investment Property (non-DSCR) (a1e9efd8) -> NEW program ============
const investmentMatrix = [
  ...expand([[760,85,80,80],[740,85,80,80],[720,80,80,80],[700,80,80,80],[680,80,80,75],[660,80,80,75]], BANDS_3, "purchase", "investment"),
  ...expand([[760,80,80,80],[740,80,80,80],[720,80,80,80],[700,80,80,80],[680,80,80,75],[660,80,80,75]], BANDS_3, "rate_term_refinance", "investment"),
  ...expand([[760,80,80,80],[740,80,80,80],[720,75,75,75],[700,75,75,75],[680,75,75,75],[660,75,75,75]], BANDS_3, "cash_out_refinance", "investment"),
];
const investmentConfig = {
  active: true, isSampleData: false,
  incomeDocTypes: ["full_doc", "1099", "bank_statement"],
  loanPurposes: ["purchase", "rate_term_refinance", "cash_out_refinance"],
  occupancies: ["investment"],
  propertyTypes: ["single_family", "pud", "condo", "non_warrantable_condo", "condotel", "rural", "2_4_unit"],
  eligibleStates: "ALL",
  citizenshipEligible: ["us_citizen", "permanent_resident", "non_permanent_resident"],
  vestingEligible: ["individual", "trust"],
  minLoanAmount: 100_000,
  maxLoanAmount: 2_000_000,
  minFico: 660,
  maxDti: 45,
  baseMaxLtv: 85,
  minReservesMonths: 6,
  interestOnlyAvailable: true,
  prepaymentPenaltyOptions: ["business_purpose_only"],
  firstTimeInvestorAllowed: true,
  firstTimeInvestorLtvAdjustment: 5, // "First Time Investor: Must own primary residence 12mo of last 3yrs (Max 75% LTV)" — 75% vs the 80% general Purchase ceiling
  eligibilityLtvMatrix: investmentMatrix,
  propertyTypeLtvCaps: { non_warrantable_condo: 75, condotel: 75, "2_4_unit": 80 },
  citizenshipLtvCaps: { non_permanent_resident: 75 },
  matrixConfirmationRequired: false,
  notes: `NEW program added 2026-08-07 — AHL's Investment-only Full/Alt Doc/Bank Statement product with NO DSCR requirement (qualifies on borrower DTI instead), distinct from both the DSCR program and the occupancy-blended Bank Statement Loans program. Purchase tops 85% at 760+/<=$1.0M stepping to 80% at $2.0M; Rate/Term mirrors Purchase; Cash-Out is 5pt lower at the top tier. Min FICO 660, min loan $100,000, max loan $2,000,000, business-purpose only (investment occupancy only, no first-time homebuyer). First-time investor eligible up to 75% LTV (must have owned a primary residence 12 of the last 3 years); experienced-investor exposure cap $5,000,000 / 15 financed properties. Non-Permanent Resident capped 75/70/70. No Foreign National eligibility documented on this specific product (unlike the DSCR and Bank Statement Loans programs). Reserves: 0mo PITIA at LTV<=65%, else 6mo; 12mo if loan >$1,500,000. Source: ${SRC.investment}.`,
};

async function resolveAdminId() {
  const { data, error } = await admin.from("users").select("id").eq("email", "nonqmnexusadmin@gmail.com").single();
  if (error) throw new Error(`Could not resolve admin user: ${error.message}`);
  return data.id;
}

async function resolveLenderId(name) {
  const { data: byId } = await admin.from("lenders").select("id,organization_id").eq("id", KNOWN_LENDER_ID).maybeSingle();
  if (byId) return byId;
  const { data, error } = await admin.from("lenders").select("id,organization_id").eq("name", name).single();
  if (error) throw new Error(`Could not resolve lender "${name}": ${error.message}`);
  return data;
}

async function upsertGuidelineVersion(organizationId, programId, label, sourceUrl, reviewedBy) {
  const { data: existing } = await admin.from("guideline_versions").select("id").eq("program_id", programId).maybeSingle();
  const payload = {
    organization_id: organizationId, program_id: programId, label,
    effective_date: TODAY, last_verified_date: TODAY, verification_status: "human_verified",
    reviewed_by: reviewedBy, published_at: new Date().toISOString(), source_url: sourceUrl,
  };
  if (existing) {
    const { error } = await admin.from("guideline_versions").update(payload).eq("id", existing.id);
    if (error) throw new Error(`guideline_versions update failed for ${programId}: ${error.message}`);
  } else {
    const { error } = await admin.from("guideline_versions").insert(payload);
    if (error) throw new Error(`guideline_versions insert failed for ${programId}: ${error.message}`);
  }
}

async function updateProgramByName(lenderId, organizationId, name, patch, reviewedBy, label, sourceUrl) {
  const { data: rows, error } = await admin.from("programs").select("id,config").eq("lender_id", lenderId).eq("name", name).limit(1);
  if (error) throw new Error(`Lookup failed for "${name}": ${error.message}`);
  if (!rows?.length) {
    console.log(`SKIP (not found, expected pre-existing): ${name}`);
    return;
  }
  const id = rows[0].id;
  const { notesAppend, ...rest } = patch;
  const config = { ...rows[0].config, ...rest };
  if (notesAppend) config.notes = config.notes ? `${config.notes}\n\n${notesAppend}` : notesAppend;
  const { error: updateError } = await admin.from("programs").update({ config, updated_at: new Date().toISOString() }).eq("id", id);
  if (updateError) throw new Error(`Update failed for "${name}": ${updateError.message}`);
  await upsertGuidelineVersion(organizationId, id, label, sourceUrl, reviewedBy);
  console.log(`Updated (verified): ${name} -> ${id}`);
}

async function createProgramIfMissing(lenderId, organizationId, name, config, reviewedBy, label, sourceUrl, createdBy) {
  const { data: existing, error } = await admin.from("programs").select("id").eq("lender_id", lenderId).eq("name", name).limit(1);
  if (error) throw new Error(`Lookup failed for "${name}": ${error.message}`);
  if (existing?.length) {
    console.log(`SKIP create (already exists): ${name} -> ${existing[0].id}`);
    return;
  }
  const { data, error: insertError } = await admin
    .from("programs")
    .insert({ organization_id: organizationId, lender_id: lenderId, name, is_sample_data: false, active: true, config, created_by: createdBy })
    .select("id").single();
  if (insertError) throw new Error(`Insert failed for "${name}": ${insertError.message}`);
  await upsertGuidelineVersion(organizationId, data.id, label, sourceUrl, reviewedBy);
  console.log(`Created (verified): ${name} -> ${data.id}`);
}

async function main() {
  const adminId = await resolveAdminId();
  const { id: lenderId, organization_id: organizationId } = await resolveLenderId(LENDER_NAME);

  await updateProgramByName(lenderId, organizationId, "Bank Statement Loans", standardConfig, adminId, "AHL Standard credit matrix (real, uploaded 2026-08-07)", SRC.standard);
  await updateProgramByName(lenderId, organizationId, "DSCR (Debt Service Coverage Ratio)", dscrPatch, adminId, "AHL DSCR credit matrix (real, uploaded 2026-08-07)", SRC.dscr);
  await updateProgramByName(lenderId, organizationId, "Asset Qualifier Loans", assetQualifierPatch, adminId, "AHL Standard credit matrix (real, uploaded 2026-08-07)", SRC.standard);
  await createProgramIfMissing(lenderId, organizationId, "1-Year Profit & Loss Only", plConfig, adminId, "AHL Premier credit matrix (real, uploaded 2026-08-07)", SRC.premier, adminId);
  await createProgramIfMissing(lenderId, organizationId, "Investment Property Loans (Non-DSCR)", investmentConfig, adminId, "AHL Investment Property credit matrix (real, uploaded 2026-08-07)", SRC.investment, adminId);

  console.log(`[${RUN_ID}] done.`);
}

main().catch((err) => {
  console.error(`[${RUN_ID}] failed:`, err);
  process.exit(1);
});
