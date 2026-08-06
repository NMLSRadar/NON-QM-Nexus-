import { createClient } from "@supabase/supabase-js";
import fs from "fs";
import assert from "node:assert/strict";

const DRY_RUN = process.argv.includes("--dry-run");
const fileEnv = fs.existsSync(".env.local")
  ? Object.fromEntries(fs.readFileSync(".env.local", "utf8").split("\n").filter((l) => l.includes("=")).map((l) => {
      const i = l.indexOf("=");
      return [l.slice(0, i), l.slice(i + 1).trim().replace(/^(["'])(.*)\1$/, "$2")];
    }))
  : {};
const env = { ...process.env, ...fileEnv };
if (!DRY_RUN && (!env.NEXT_PUBLIC_SUPABASE_URL || !env.SUPABASE_SERVICE_ROLE_KEY)) {
  throw new Error("Missing Supabase credentials. Use --dry-run to validate without database access.");
}
const admin = DRY_RUN ? null : createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY);
const PLATFORM_ORG = "bfe87b1c-86e7-4186-b1c4-ecc25d0e4420";
const REVIEWED = "2026-08-06";
const ADMIN_EMAIL = "nonqmnexusadmin@gmail.com";

const DOC = {
  coreGuide: "https://d2ol7oe51mr4n9.cloudfront.net/user_3Cfrs4UEzyBfibhWL8hkQ0WuLXI/7bb26151-6930-47d2-a82a-d99a474b0b85.pdf",
  coreMatrix: "https://d2ol7oe51mr4n9.cloudfront.net/user_3Cfrs4UEzyBfibhWL8hkQ0WuLXI/80d9b26b-f6f4-40ec-8e7f-459772bb164f.pdf",
  jumboGuide: "https://d2ol7oe51mr4n9.cloudfront.net/user_3Cfrs4UEzyBfibhWL8hkQ0WuLXI/91d0882c-20cd-4d78-ac2a-a8b93810b77c.pdf",
  jumboMatrix: "https://d2ol7oe51mr4n9.cloudfront.net/user_3Cfrs4UEzyBfibhWL8hkQ0WuLXI/b257b034-de0e-48eb-a53c-0b753a2ed7bb.pdf",
  secondGuide: "https://d2ol7oe51mr4n9.cloudfront.net/user_3Cfrs4UEzyBfibhWL8hkQ0WuLXI/ec641ea3-4861-468b-8e5c-234b9bd79b13.pdf",
};
const PURPOSES = ["purchase", "rate_term_refinance", "cash_out_refinance"];
const CORE_PROPERTIES = ["single_family", "pud", "townhome", "condo", "non_warrantable_condo", "2_4_unit", "rural"];
const CORE_CITIZENSHIP = ["us_citizen", "permanent_resident", "non_permanent_resident"];
const CORE_VESTING = ["individual", "joint_tenants", "trust", "llc", "corporation"];
const coreFicoRows = () => [
  [760,85,80],[740,85,80],[720,85,80],[700,80,80],[680,80,75],[660,70,70],
].flatMap(([minFico,prt,co]) => [
  { minFico, maxLtv: prt, loanPurpose: "purchase" },
  { minFico, maxLtv: prt, loanPurpose: "rate_term_refinance" },
  { minFico, maxLtv: co, loanPurpose: "cash_out_refinance" },
]);
const common = (lenderId, p) => ({
  active: true,
  isSampleData: false,
  lenderId,
  eligibleStates: "ALL",
  lastVerifiedDate: REVIEWED,
  interestOnlyAvailable: false,
  prepaymentPenaltyOptions: ["none"],
  maxMortgageLates30x12: 1,
  maxMortgageLatesCategory: "late_30",
  propertyTypeLtvCaps: { condo: 85, non_warrantable_condo: 80, "2_4_unit": 80 },
  ...p,
});

async function adminId() {
  const { data, error } = await admin.from("users").select("id").eq("email", ADMIN_EMAIL).single();
  if (error) throw error;
  return data.id;
}
async function upsertLender(createdBy) {
  const { data: found, error } = await admin.from("lenders").select("id,name,active").eq("organization_id", PLATFORM_ORG).ilike("name", "eRESI Capital").limit(1);
  if (error) throw error;
  if (found?.[0]) {
    const { error: updateError } = await admin.from("lenders").update({ active: true, is_sample_data: false, tier_level: 1, updated_at: new Date().toISOString() }).eq("id", found[0].id);
    if (updateError) throw updateError;
    return found[0].id;
  }
  const { data, error: insertError } = await admin.from("lenders").insert({
    organization_id: PLATFORM_ORG, name: "eRESI Capital", active: true, is_sample_data: false, tier_level: 1, created_by: createdBy,
  }).select("id").single();
  if (insertError) throw insertError;
  return data.id;
}
async function upsertProgram(lenderId, name, config, label, effectiveDate, sourceUrl, status, createdBy) {
  const { data: found, error: findError } = await admin.from("programs").select("id,config").eq("lender_id", lenderId).eq("name", name).limit(1);
  if (findError) throw findError;
  let id;
  if (found?.[0]) {
    id = found[0].id;
    const { error } = await admin.from("programs").update({
      active: true, is_sample_data: false,
      config: { ...found[0].config, ...config, active: true, guidelineVersionLabel: label, effectiveDate },
      updated_at: new Date().toISOString(),
    }).eq("id", id);
    if (error) throw error;
  } else {
    const { data, error } = await admin.from("programs").insert({
      organization_id: PLATFORM_ORG, lender_id: lenderId, name, active: true, is_sample_data: false,
      config: { ...config, active: true, guidelineVersionLabel: label, effectiveDate }, created_by: createdBy,
    }).select("id").single();
    if (error) throw error;
    id = data.id;
  }
  const { data: gv, error: gvFindError } = await admin.from("guideline_versions").select("id,verification_status").eq("program_id", id).limit(1);
  if (gvFindError) throw gvFindError;
  if (gv?.[0]) {
    const { error } = await admin.from("guideline_versions").update({
      label, effective_date: effectiveDate, last_verified_date: REVIEWED, verification_status: status,
      reviewed_by: createdBy, published_at: new Date().toISOString(), source_url: sourceUrl,
    }).eq("id", gv[0].id);
    if (error) throw error;
  } else {
    const { error } = await admin.from("guideline_versions").insert({
      organization_id: PLATFORM_ORG, program_id: id, label, effective_date: effectiveDate,
      last_verified_date: REVIEWED, verification_status: status, reviewed_by: createdBy,
      published_at: new Date().toISOString(), source_url: sourceUrl,
    });
    if (error) throw error;
  }
  console.log(`${status === "human_verified" ? "Verified" : "Quarantined"}: ${name}`);
  return id;
}

function programs(lenderId) {
  const coreBase = {
    loanPurposes: PURPOSES, occupancies: ["primary", "second_home", "investment"], propertyTypes: CORE_PROPERTIES,
    citizenshipEligible: CORE_CITIZENSHIP, vestingEligible: CORE_VESTING, minLoanAmount: 125000, maxLoanAmount: 3000000,
    minFico: 660, maxDti: 50, baseMaxLtv: 85, minReservesMonths: 3, eligibilityLtvMatrix: coreFicoRows(),
    reserveRules: [{ months: 3, maxLoanAmount: 999999 }, { months: 6, minLoanAmount: 1000000, maxLoanAmount: 1500000 }, { months: 9, minLoanAmountExclusive: 1500000 }],
    sourceCitation: `${DOC.coreMatrix} pp.1–2; ${DOC.coreGuide} §§3–6`, sourceDocuments: [DOC.coreMatrix, DOC.coreGuide],
  };
  const core = (extra) => common(lenderId, { ...coreBase, ...extra });
  return [
    ["Core eXpress — Full Documentation", core({ incomeDocTypes: ["full_doc"], interestOnlyAvailable: true, notes: "Full Doc. Up to 85% purchase/rate-term and 80% cash-out subject to FICO, loan-size, occupancy, I/O, property-type and credit-event overlays. Max 50% DTI; FTHB max 45%. Reserves 3/6/9 months by loan amount; rate/term at 65% LTV or below has no minimum." }), "eRESI Core Version 5.0 / matrix effective 2026-03-16", "2026-03-16", DOC.coreGuide, "human_verified"],
    ["Core eXpert — Personal Bank Statement", core({ incomeDocTypes: ["bank_statement"], notes: "12 or 24 consecutive personal bank statements; most recent within 30 days. Separate business-account support or 10% expense factor where permitted. Up to five NSFs in the prior 12 months with satisfactory explanation." }), "eRESI Core Version 5.0 / matrix effective 2026-03-16", "2026-03-16", DOC.coreGuide, "human_verified"],
    ["Core eXpert — Business Bank Statement", core({ incomeDocTypes: ["bank_statement"], notes: "12 or 24 consecutive business bank statements; minimum 25% ownership. Default 50% expense factor, supported third-party expense factor, or third-party P&L method. Borrower-prepared P&L is not acceptable." }), "eRESI Core Version 5.0 / matrix effective 2026-03-16", "2026-03-16", DOC.coreGuide, "human_verified"],
    ["Core eXpert — P&L Only", core({ incomeDocTypes: ["pnl_only"], baseMaxLtv: 80, propertyTypeLtvCaps: { condo: 80, non_warrantable_condo: 80, "2_4_unit": 80 }, incomeDocTypeLtvCaps: { pnl_only: { purchase: 80, rate_term_refinance: 80, cash_out_refinance: 80 } }, notes: "12- or 24-month third-party-prepared P&L, current within 90 days. Tax returns are not required; Form 4506-C/8821 is not required unless an unrelated co-borrower uses Full Doc. CPA/EA/CTEC/Chartered Tax Adviser/Tax Attorney preparer. FICO below 720 caps LTV at 75%." }), "eRESI Core Version 5.0 / matrix effective 2026-03-16", "2026-03-16", DOC.coreGuide, "human_verified"],
    ["Core eXpert — 1099", core({ incomeDocTypes: ["1099"], notes: "Two-year 1099-only history, or one year following W-2 work in the same line. Prior-year 1099 payable to the individual, employer VOE, YTD income and two months receipt verification. Apply 10% expense ratio if expenses are not addressed." }), "eRESI Core Version 5.0 / matrix effective 2026-03-16", "2026-03-16", DOC.coreGuide, "human_verified"],
    ["Core eXpert — WVOE Only", core({ incomeDocTypes: ["wvoe"], loanPurposes: PURPOSES, occupancies: ["primary"], propertyTypes: ["single_family", "pud", "townhome", "condo", "2_4_unit"], citizenshipEligible: CORE_CITIZENSHIP, vestingEligible: ["individual", "joint_tenants", "trust"], minFico: 680, baseMaxLtv: 80, giftFundsAllowed: false, maxMortgageLates30x12: 0, eligibilityLtvMatrix: [{ minFico: 680, maxLtv: 80, loanPurpose: "purchase" }, { minFico: 680, maxLtv: 80, loanPurpose: "rate_term_refinance" }, { minFico: 680, maxLtv: 70, loanPurpose: "cash_out_refinance" }], notes: "Primary residence only; two years same employer; Form 1005 plus VVOE. Salary/base pay only. 0x30x24 housing history; no gift funds." }), "eRESI Core Version 5.0 / matrix effective 2026-03-16", "2026-03-16", DOC.coreGuide, "human_verified"],
    ["Core eXpert — Asset Depletion", core({ incomeDocTypes: ["asset_depletion"], occupancies: ["primary", "second_home"], minFico: 660, baseMaxLtv: 80, eligibilityLtvMatrix: [], notes: "Primary/second home only. Six months seasoning/statements; trust assets and gifts ineligible. Net qualified assets after funds-to-close/reserves must equal at least 1.5x loan balance; qualifying income is net assets divided by 84." }), "eRESI Core Version 5.0 / matrix effective 2026-03-16", "2026-03-16", DOC.coreGuide, "human_verified"],
    ["Core eXpert — Asset Utilization", core({ incomeDocTypes: ["asset_depletion"], minFico: 660, baseMaxLtv: 80, maxDti: undefined, eligibilityLtvMatrix: [], notes: "Any occupancy. No traditional DTI. Post-closing qualified assets must exceed the loan amount plus 60 months of real-estate and consumer obligations plus reserves. Residual income uses assets/60 less obligations and must be at least $1,500." }), "eRESI Core Version 5.0 / matrix effective 2026-03-16", "2026-03-16", DOC.coreGuide, "human_verified"],
    ["Core eXperienced Investor — DSCR", common(lenderId, { incomeDocTypes: ["dscr"], loanPurposes: PURPOSES, occupancies: ["investment"], propertyTypes: CORE_PROPERTIES, citizenshipEligible: [...CORE_CITIZENSHIP, "foreign_national"], vestingEligible: CORE_VESTING, minLoanAmount: 100000, maxLoanAmount: 3000000, minFico: 700, minDscr: 0.8, baseMaxLtv: 80, minReservesMonths: 3, reserveRules: [{ months: 12, firstTimeInvestor: true }], interestOnlyAvailable: true, prepaymentPenaltyOptions: ["none", "1-year", "2-year", "3-year", "4-year", "5-year"], firstTimeHomebuyerAllowed: false, firstTimeInvestorAllowed: true, firstTimeInvestorLtvAdjustment: 5, maxMortgageLates30x12: 1, maxMortgageLatesCategory: "late_30", propertyTypeLtvCaps: { condo: 80, non_warrantable_condo: 80, "2_4_unit": 80 }, strIncomeEligible: true, strIncomeLtvAdjustment: 5, strIncomeNotes: "12-month platform history and active listing; 5-point LTV reduction, with specified new-construction/conversion exceptions.", eligibilityLtvMatrix: [{ minFico: 700, minDscr: 1, maxLtv: 80, loanPurpose: "purchase" }, { minFico: 700, minDscr: 1, maxLtv: 80, loanPurpose: "rate_term_refinance" }, { minFico: 700, minDscr: 1, maxLtv: 75, loanPurpose: "cash_out_refinance" }, { minFico: 720, minDscr: 0.8, maxDscrExclusive: 1, maxLtv: 75, loanPurpose: "purchase" }, { minFico: 720, minDscr: 0.8, maxDscrExclusive: 1, maxLtv: 75, loanPurpose: "rate_term_refinance" }, { minFico: 720, minDscr: 0.8, maxDscrExclusive: 1, maxLtv: 70, loanPurpose: "cash_out_refinance" }], sourceCitation: `${DOC.coreMatrix} p.3; ${DOC.coreGuide} §5.5`, sourceDocuments: [DOC.coreMatrix, DOC.coreGuide], notes: "Investment/business purpose only. Minimum DSCR 0.80. Below 1.00 requires 720 FICO, max $1.5MM and no I/O. First-time investor requires DSCR >=1.00, max 75% LTV, 12 months reserves and verified 12-month housing history." }), "eRESI Core Version 5.0 / DSCR matrix effective 2026-03-16", "2026-03-16", DOC.coreGuide, "human_verified"],
    ["Core Foreign National — DSCR", common(lenderId, { incomeDocTypes: ["dscr"], loanPurposes: PURPOSES, occupancies: ["investment"], propertyTypes: ["single_family", "pud", "townhome", "condo", "2_4_unit"], citizenshipEligible: ["foreign_national"], vestingEligible: ["individual"], minLoanAmount: 100000, maxLoanAmount: 2000000, minFico: 0, minDscr: 1, baseMaxLtv: 70, minReservesMonths: 12, interestOnlyAvailable: false, prepaymentPenaltyOptions: ["none", "1-year", "2-year", "3-year", "4-year", "5-year"], foreignNationalDscrEligible: true, noFicoPolicy: "eligible_with_alternative_credit", noFicoMaxLtv: 70, giftFundsAllowed: false, citizenshipLtvCaps: { foreign_national: 70 }, eligibilityLtvMatrix: [{ citizenship: "foreign_national", minDscr: 1, maxLtv: 70, loanPurpose: "purchase" }, { citizenship: "foreign_national", minDscr: 1, maxLtv: 70, loanPurpose: "rate_term_refinance" }, { citizenship: "foreign_national", minDscr: 1, maxLtv: 65, loanPurpose: "cash_out_refinance" }], cashOutLimits: [{ maxLtv: 100, maxCashOutAmount: 250000 }], sourceCitation: `${DOC.coreMatrix} p.3; ${DOC.coreGuide} §5.5.7`, sourceDocuments: [DOC.coreMatrix, DOC.coreGuide], notes: "Foreign National is DSCR-only. Maximum $2MM; 70% purchase/rate-term, 65% cash-out; minimum 1.00 DSCR; no I/O. Twelve months reserves plus two months per additional property. No entity/trust vesting or gifts." }), "eRESI Core Version 5.0 / Foreign National DSCR effective 2026-03-16", "2026-03-16", DOC.coreGuide, "human_verified"],
    ["ITIN Core", common(lenderId, { incomeDocTypes: ["full_doc", "bank_statement"], loanPurposes: ["purchase", "rate_term_refinance"], occupancies: ["primary"], propertyTypes: ["single_family", "pud", "townhome", "condo", "2_4_unit"], citizenshipEligible: ["itin"], vestingEligible: ["individual", "joint_tenants"], minLoanAmount: 125000, maxLoanAmount: 1500000, minFico: 680, maxDti: 50, baseMaxLtv: 80, minReservesMonths: 3, interestOnlyAvailable: false, ownerOccupiedItinEligible: true, investmentItinEligible: false, itinDscrEligible: false, noFicoPolicy: "requires_us_fico", maxMortgageLates30x12: 1, maxMortgageLatesCategory: "late_30", propertyTypeLtvCaps: { condo: 80, "2_4_unit": 80 }, eligibilityLtvMatrix: [[760,80],[740,80],[720,75],[700,70],[680,65]].flatMap(([minFico,maxLtv]) => [{ minFico, maxLtv, loanPurpose: "purchase" }, { minFico, maxLtv, loanPurpose: "rate_term_refinance" }]), sourceCitation: `${DOC.coreMatrix} p.5; ${DOC.coreGuide} §3.2`, sourceDocuments: [DOC.coreMatrix, DOC.coreGuide], notes: "Primary purchase/rate-term only; no cash-out. Full Doc or bank statements only. P&L, Asset Depletion, Asset Utilization and non-warrantable condos are ineligible. Loans above $1MM max 75%; credit-event seasoning 48 months." }), "eRESI ITIN Core matrix effective 2026-03-16", "2026-03-16", DOC.coreMatrix, "human_verified"],
    ["Core Closed-End Second Lien", common(lenderId, { incomeDocTypes: ["full_doc", "bank_statement"], loanPurposes: ["rate_term_refinance", "cash_out_refinance", "second_lien"], occupancies: ["primary", "second_home", "investment"], propertyTypes: ["single_family", "pud", "condo"], citizenshipEligible: CORE_CITIZENSHIP, vestingEligible: ["individual", "joint_tenants", "trust"], minLoanAmount: 75000, maxLoanAmount: 500000, minFico: 680, maxDti: 50, baseMaxLtv: 85, minReservesMonths: 0, interestOnlyAvailable: false, lienPosition: "standalone_second", ltvMetric: "cltv", maxMortgageLates30x12: 0, maxMortgageLatesCategory: "none", propertyTypeLtvCaps: { condo: 85 }, eligibilityLtvMatrix: [{ minFico: 760, maxLoanAmount: 350000, maxLtv: 85, occupancy: "primary", lienPosition: "standalone_second", loanPurpose: "second_lien" }, { minFico: 760, maxLoanAmount: 500000, maxLtv: 80, occupancy: "primary", lienPosition: "standalone_second", loanPurpose: "second_lien" }, { minFico: 740, maxLtv: 80, occupancy: "primary", lienPosition: "standalone_second", loanPurpose: "second_lien" }, { minFico: 720, maxLtv: 75, occupancy: "second_home", lienPosition: "standalone_second", loanPurpose: "second_lien" }, { minFico: 720, maxLtv: 75, occupancy: "investment", lienPosition: "standalone_second", loanPurpose: "second_lien" }], sourceCitation: `${DOC.coreMatrix} p.4; ${DOC.secondGuide}`, sourceDocuments: [DOC.coreMatrix, DOC.secondGuide], notes: "No purchase. Fixed fully amortizing 10/15/20/30 year. Bank Statement requires 700 FICO and max 80% CLTV; below 720 max 70%. SFR/PUD/warrantable condo only. Combined first plus second max $2.5MM." }), "eRESI Closed-End Second matrix effective 2026-03-16 / guide Version 4.0", "2026-03-16", DOC.coreMatrix, "human_verified"],
    ["Core Jumbo Express AUS", common(lenderId, { incomeDocTypes: ["full_doc"], loanPurposes: PURPOSES, occupancies: ["primary", "second_home", "investment"], propertyTypes: ["single_family", "pud", "townhome", "condo", "non_warrantable_condo", "2_4_unit", "rural"], citizenshipEligible: CORE_CITIZENSHIP, vestingEligible: ["individual", "joint_tenants", "trust"], minLoanAmount: 400000, maxLoanAmount: 3000000, minFico: 660, maxDti: 49.99, baseMaxLtv: 80, minReservesMonths: 6, interestOnlyAvailable: false, prepaymentPenaltyOptions: ["none"], propertyTypeLtvCaps: { condo: 80, non_warrantable_condo: 70, "2_4_unit": 80 }, sourceCitation: `${DOC.jumboMatrix} p.1; ${DOC.jumboGuide} Version 1.0; current-version confirmation recorded 2026-08-06`, sourceDocuments: [DOC.jumboMatrix, DOC.jumboGuide], currentVersionPending: false, excludedFromVerifiedMatching: false, notes: "Current-version confirmation received August 6, 2026 for the June 25, 2025 Version 1.0 guide/matrix. DU only; manual underwriting prohibited. $400,000–$3,000,000, up to 80% LTV, 6–12 months reserves, maximum 49.99% DTI, subject to all matrix and guideline overlays." }), "eRESI Jumbo Express AUS Version 1.0 effective 2025-06-25 — current confirmed 2026-08-06", "2025-06-25", DOC.jumboGuide, "human_verified"],
  ];
}

async function main() {
  if (DRY_RUN) {
    const payload = programs("dry-run-eresi").map(([name, config, label, effectiveDate, sourceUrl, status]) => ({ name, config, label, effectiveDate, sourceUrl, status }));
    assert.equal(payload.length, 13);
    assert.equal(payload.filter((p) => p.status === "human_verified").length, 13);
    assert.equal(payload.filter((p) => p.status === "imported_pending_review").length, 0);
    console.log(JSON.stringify({ lender: "eRESI Capital", programCount: payload.length, programs: payload }, null, 2));
    return;
  }
  const createdBy = await adminId();
  const lenderId = await upsertLender(createdBy);
  for (const p of programs(lenderId)) await upsertProgram(lenderId, ...p, createdBy);

  const { data: lenderRows, error: lenderError } = await admin.from("lenders").select("id,name,active,is_sample_data").eq("id", lenderId);
  if (lenderError) throw lenderError;
  assert.equal(lenderRows?.[0]?.name, "eRESI Capital");
  assert.equal(lenderRows?.[0]?.active, true);
  const { data: programRows, error: programError } = await admin.from("programs").select("id,name,active,config").eq("lender_id", lenderId).eq("active", true).is("deleted_at", null);
  if (programError) throw programError;
  assert.equal(programRows?.length, 13);
  const ids = programRows.map((p) => p.id);
  const { data: versions, error: versionError } = await admin.from("guideline_versions").select("program_id,verification_status,label").in("program_id", ids);
  if (versionError) throw versionError;
  const latestByProgram = new Map(versions.map((v) => [v.program_id, v]));
  const visibleVerified = programRows.filter((p) => latestByProgram.get(p.id)?.verification_status === "human_verified");
  const jumbo = programRows.find((p) => p.name === "Core Jumbo Express AUS");
  assert.equal(visibleVerified.length, 13);
  assert.equal(latestByProgram.get(jumbo.id)?.verification_status, "human_verified");
  assert.equal(jumbo.config.currentVersionPending, false);
  assert.equal(jumbo.config.excludedFromVerifiedMatching, false);
  console.log(`Production validation passed: eRESI Capital active with ${visibleVerified.length} verified programs, including confirmed Jumbo Express AUS.`);
}

main().catch((error) => {
  console.error("FATAL", error.message);
  process.exit(1);
});
