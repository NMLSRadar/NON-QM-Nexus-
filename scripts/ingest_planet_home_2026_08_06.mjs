import { createClient } from "@supabase/supabase-js";
import fs from "fs";
import assert from "node:assert/strict";
import { pathToFileURL } from "node:url";

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
const EFFECTIVE = "2025-10-13";
const ADMIN_EMAIL = "nonqmnexusadmin@gmail.com";
const STATUS = "human_verified";

const DOC = {
  guide: "https://d2ol7oe51mr4n9.cloudfront.net/user_3Cfrs4UEzyBfibhWL8hkQ0WuLXI/e9402387-15ba-41c2-ad33-b52c79625c40.pdf",
  gold: "https://d2ol7oe51mr4n9.cloudfront.net/user_3Cfrs4UEzyBfibhWL8hkQ0WuLXI/8e3ee88c-9845-41cc-86d4-94179d28c5c5.pdf",
  silver: "https://d2ol7oe51mr4n9.cloudfront.net/user_3Cfrs4UEzyBfibhWL8hkQ0WuLXI/1b4145f3-4913-438e-8100-f2568e1306f9.pdf",
  bronze: "https://d2ol7oe51mr4n9.cloudfront.net/user_3Cfrs4UEzyBfibhWL8hkQ0WuLXI/a36e6bf9-b8dd-4f6f-8305-d8526b1d19dd.pdf",
  dscr: "https://d2ol7oe51mr4n9.cloudfront.net/user_3Cfrs4UEzyBfibhWL8hkQ0WuLXI/60f5729f-5cd9-4902-bb77-94e2e209047b.pdf",
  fnDscr: "https://d2ol7oe51mr4n9.cloudfront.net/user_3Cfrs4UEzyBfibhWL8hkQ0WuLXI/514f3399-5c0c-46e6-8a52-c445eb990c68.pdf",
  itinDscr: "https://d2ol7oe51mr4n9.cloudfront.net/user_3Cfrs4UEzyBfibhWL8hkQ0WuLXI/3c864ac5-a915-4962-a9a8-ea94f5b95d00.pdf",
  heloanMatrix: "https://d2ol7oe51mr4n9.cloudfront.net/user_3Cfrs4UEzyBfibhWL8hkQ0WuLXI/409de8b2-224d-4c30-aa78-2d908840f23f.pdf",
  heloanGuide: "https://d2ol7oe51mr4n9.cloudfront.net/user_3Cfrs4UEzyBfibhWL8hkQ0WuLXI/6b3af5be-570d-41bb-9865-03ae325b5844.pdf",
};
const PURPOSES = ["purchase", "rate_term_refinance", "cash_out_refinance"];
const CITIZENSHIP = ["us_citizen", "permanent_resident", "non_permanent_resident", "daca", "asylee"];
const COMMON_PROPERTIES = ["single_family", "pud", "townhome", "condo", "2_4_unit", "rural"];
const COMMON_VESTING = ["individual", "joint_tenants", "trust"];
const US_STATES_AND_DC = [
  "AL", "AK", "AZ", "AR", "CA", "CO", "CT", "DE", "DC", "FL", "GA", "HI", "ID", "IL", "IN", "IA", "KS",
  "KY", "LA", "ME", "MD", "MA", "MI", "MN", "MS", "MO", "MT", "NE", "NV", "NH", "NJ", "NM", "NY", "NC",
  "ND", "OH", "OK", "OR", "PA", "RI", "SC", "SD", "TN", "TX", "UT", "VT", "VA", "WA", "WV", "WI", "WY",
];
const PLANET_FIRST_LIEN_STATES = US_STATES_AND_DC.filter((state) => state !== "MA");
const PLANET_HELOAN_STATES = US_STATES_AND_DC.filter((state) => !["DC", "IA", "MA", "NY", "RI", "TN"].includes(state));
const conflictNote = "Activated for customer visibility and matching at the catalog owner's direction on 2026-08-06. Matrix/guide conflicts still require lender clarification: income-document lookback by Gold/Silver tier and Asset Depletion tier eligibility. Conservative caps and document-specific notes control until clarified.";

const verified = (lenderId, p) => ({
  active: true,
  isSampleData: false,
  lenderId,
  eligibleStates: PLANET_FIRST_LIEN_STATES,
  lastVerifiedDate: REVIEWED,
  currentVersionPending: false,
  excludedFromVerifiedMatching: false,
  clarificationPending: true,
  prepaymentPenaltyOptions: ["none"],
  ...p,
});

async function adminId() {
  const { data, error } = await admin.from("users").select("id").eq("email", ADMIN_EMAIL).single();
  if (error) throw error;
  return data.id;
}

async function upsertLender(createdBy) {
  const { data: found, error } = await admin.from("lenders").select("id").eq("organization_id", PLATFORM_ORG).ilike("name", "Planet Home Lending").limit(1);
  if (error) throw error;
  if (found?.[0]) {
    const { error: updateError } = await admin.from("lenders").update({ active: true, is_sample_data: false, tier_level: 1, updated_at: new Date().toISOString() }).eq("id", found[0].id);
    if (updateError) throw updateError;
    return found[0].id;
  }
  const { data, error: insertError } = await admin.from("lenders").insert({
    organization_id: PLATFORM_ORG, name: "Planet Home Lending", active: true, is_sample_data: false, tier_level: 1, created_by: createdBy,
  }).select("id").single();
  if (insertError) throw insertError;
  return data.id;
}

async function upsertProgram(lenderId, name, config, label, sourceUrl, createdBy) {
  const { data: found, error: findError } = await admin.from("programs").select("id,config").eq("lender_id", lenderId).eq("name", name).limit(1);
  if (findError) throw findError;
  let id;
  if (found?.[0]) {
    id = found[0].id;
    const { error } = await admin.from("programs").update({
      active: true, is_sample_data: false,
      config: { ...found[0].config, ...config, active: true, guidelineVersionLabel: label, effectiveDate: EFFECTIVE },
      updated_at: new Date().toISOString(),
    }).eq("id", id);
    if (error) throw error;
  } else {
    const { data, error } = await admin.from("programs").insert({
      organization_id: PLATFORM_ORG, lender_id: lenderId, name, active: true, is_sample_data: false,
      config: { ...config, active: true, guidelineVersionLabel: label, effectiveDate: EFFECTIVE }, created_by: createdBy,
    }).select("id").single();
    if (error) throw error;
    id = data.id;
  }
  const { data: gv, error: gvFindError } = await admin.from("guideline_versions").select("id").eq("program_id", id).limit(1);
  if (gvFindError) throw gvFindError;
  const version = {
    label, effective_date: EFFECTIVE, last_verified_date: REVIEWED, verification_status: STATUS,
    reviewed_by: createdBy, published_at: new Date().toISOString(), source_url: sourceUrl,
  };
  if (gv?.[0]) {
    const { error } = await admin.from("guideline_versions").update(version).eq("id", gv[0].id);
    if (error) throw error;
  } else {
    const { error } = await admin.from("guideline_versions").insert({ organization_id: PLATFORM_ORG, program_id: id, ...version });
    if (error) throw error;
  }
  console.log(`Verified: ${name}`);
  return id;
}

function tierBase(lenderId, tier) {
  const bases = {
    Gold: {
      minLoanAmount: 150000, maxLoanAmount: 3500000, minFico: 660, maxDti: 50, baseMaxLtv: 90, minReservesMonths: 6,
      occupancies: ["primary", "second_home", "investment"], propertyTypes: [...COMMON_PROPERTIES, "non_warrantable_condo", "condotel"],
      maxMortgageLates30x12: 1, maxMortgageLatesCategory: "late_30", creditEventSeasoningMonths: 48,
      propertyTypeLtvCaps: { condo: 85, non_warrantable_condo: 80, "2_4_unit": 85, condotel: 85 },
      reserveRules: [{ months: 6, maxLoanAmount: 1000000 }, { months: 9, minLoanAmount: 1000001, maxLoanAmount: 2500000 }, { months: 12, minLoanAmount: 2500001 }],
      eligibilityLtvMatrix: [{ minFico: 740, maxLoanAmount: 1500000, maxLtv: 90, occupancy: "primary", loanPurpose: "purchase" }, { minFico: 740, maxLoanAmount: 1500000, maxLtv: 90, occupancy: "primary", loanPurpose: "rate_term_refinance" }, { minFico: 680, maxLoanAmount: 1000000, maxLtv: 90, occupancy: "primary", loanPurpose: "purchase" }, { minFico: 660, maxLoanAmount: 1000000, maxLtv: 80, loanPurpose: "purchase" }],
      sourceDocuments: [DOC.gold, DOC.guide], sourceCitation: `${DOC.gold} pp.1–5; ${DOC.guide} Income Documentation, Credit, Assets and Property sections`,
    },
    Silver: {
      minLoanAmount: 150000, maxLoanAmount: 3000000, minFico: 620, maxDti: 50, baseMaxLtv: 85, minReservesMonths: 3,
      occupancies: ["primary", "second_home"], propertyTypes: COMMON_PROPERTIES,
      maxMortgageLates30x12: 0, maxMortgageLatesCategory: "none", creditEventSeasoningMonths: 36,
      propertyTypeLtvCaps: { condo: 85, "2_4_unit": 85, modular: 80 },
      reserveRules: [{ months: 3, maxLoanAmount: 1000000 }, { months: 9, minLoanAmount: 1000001, maxLoanAmount: 2000000 }, { months: 12, minLoanAmount: 2000001 }],
      eligibilityLtvMatrix: [{ minFico: 740, maxLoanAmount: 2000000, maxLtv: 85, occupancy: "primary", loanPurpose: "purchase" }, { minFico: 740, maxLoanAmount: 2000000, maxLtv: 85, occupancy: "primary", loanPurpose: "rate_term_refinance" }, { minFico: 720, maxLoanAmount: 1500000, maxLtv: 85, occupancy: "primary", loanPurpose: "purchase" }, { minFico: 620, maxLoanAmount: 1500000, maxLtv: 75, occupancy: "primary", loanPurpose: "purchase" }],
      noFicoPolicy: "limited_primary_purchase_or_rate_term_with_12_month_housing_history", noFicoMaxLtv: 75,
      sourceDocuments: [DOC.silver, DOC.guide], sourceCitation: `${DOC.silver} pp.1–4; ${DOC.guide} Income Documentation, Credit, Assets and Property sections`,
    },
    Bronze: {
      minLoanAmount: 150000, maxLoanAmount: 1500000, minFico: 620, maxDti: 50, baseMaxLtv: 85, minReservesMonths: 3,
      occupancies: ["primary", "second_home", "investment"], propertyTypes: [...COMMON_PROPERTIES, "condotel"],
      maxMortgageLates30x12: 1, maxMortgageLatesCategory: "late_30", creditEventSeasoningMonths: 24,
      propertyTypeLtvCaps: { condo: 85, "2_4_unit": 85, condotel: 80 },
      reserveRules: [{ months: 3, maxLoanAmount: 1000000 }, { months: 6, minLoanAmount: 1000001 }],
      eligibilityLtvMatrix: [{ minFico: 700, maxLoanAmount: 1000000, maxLtv: 85, occupancy: "primary", loanPurpose: "purchase" }, { minFico: 700, maxLoanAmount: 1000000, maxLtv: 80, occupancy: "primary", loanPurpose: "rate_term_refinance" }, { minFico: 680, maxLoanAmount: 1000000, maxLtv: 80, loanPurpose: "purchase" }, { minFico: 620, maxLoanAmount: 1500000, maxLtv: 65, occupancy: "primary", loanPurpose: "purchase" }],
      sourceDocuments: [DOC.bronze, DOC.guide], sourceCitation: `${DOC.bronze} pp.1–5; ${DOC.guide} Income Documentation, Credit, Assets and Property sections`,
    },
  };
  return verified(lenderId, {
    loanPurposes: PURPOSES, citizenshipEligible: CITIZENSHIP, vestingEligible: COMMON_VESTING,
    interestOnlyAvailable: true, giftFundsAllowed: true, interestedPartyContributionMaxPercent: 6,
    ...bases[tier],
  });
}

export function programs(lenderId) {
  const rows = [];
  for (const tier of ["Gold", "Silver", "Bronze"]) {
    const matrix = DOC[tier.toLowerCase()];
    const label = `Planet Non-QM ${tier} Matrix v1.0 dated 2025-10-13 — owner activated 2026-08-06`;
    const make = (name, extra) => rows.push([`Planet Non-QM ${tier} — ${name}`, { ...tierBase(lenderId, tier), ...extra }, label, matrix]);
    make("Full Documentation", { incomeDocTypes: ["full_doc"], notes: `${conflictNote} Wage earners and self-employed borrowers; manual underwriting. Exact 12/24-month availability is not enabled for matching pending clarification.` });
    make("Personal Bank Statement", { incomeDocTypes: ["bank_statement"], notes: `${conflictNote} Self-employed; personal method uses eligible deposit average with no expense factor and requires two months business statements supporting transfers.` });
    make("Business Bank Statement", { incomeDocTypes: ["bank_statement"], notes: `${conflictNote} Self-employed; business/co-mingled method applies ownership percentage and an expense-ratio, third-party P&L, or third-party expense-ratio method.` });
    make("1099", { incomeDocTypes: ["1099"], notes: `${conflictNote} At least two years self-employment/1099 history; 1- or 2-year 1099 documentation per guide, YTD receipts, Planet Business Narrative, and standard 10% expense factor. Tax returns and 4506-C transcripts are not required.` });
    make("P&L Only", { incomeDocTypes: ["pnl_only"], baseMaxLtv: Math.min(tierBase(lenderId, tier).baseMaxLtv, 80), incomeDocTypeLtvCaps: { pnl_only: { purchase: 80, rate_term_refinance: 70, cash_out_refinance: 70 } }, notes: `${conflictNote} Self-employed at least two years with at least 25% ownership. Third-party-prepared 12- or 24-month P&L plus two recent bank statements; tax returns are not the income document. Maximum 80% purchase and 70% refinance per matrices.` });
  }

  rows.push(["Planet Non-QM — Asset Depletion (tier pending clarification)", verified(lenderId, {
    incomeDocTypes: ["asset_depletion"], loanPurposes: PURPOSES, occupancies: ["primary", "second_home", "investment"], propertyTypes: COMMON_PROPERTIES,
    citizenshipEligible: CITIZENSHIP, vestingEligible: COMMON_VESTING, minLoanAmount: 150000, maxLoanAmount: 3500000, minFico: 660, maxDti: 50, baseMaxLtv: 80,
    sourceDocuments: [DOC.gold, DOC.silver, DOC.guide], sourceCitation: `${DOC.gold} p.2; ${DOC.silver} p.2; ${DOC.guide} Asset Depletion section`,
    notes: `${conflictNote} Gold matrix lists Asset Depletion, Silver matrix does not, while the guide states it is available on Silver only. Formula: eligible assets less down payment, closing costs and reserves divided by 84 months. The Assistant may identify Planet Asset Depletion using the conservative 80% cap, but must disclose that final Gold/Silver tier placement requires guideline confirmation.`,
  }), "Planet Non-QM v1.0 matrices dated 2025-10-13 — owner activated 2026-08-06; Asset Depletion tier clarification pending", DOC.guide]);

  rows.push(["Planet Non-QM — DSCR", verified(lenderId, {
    incomeDocTypes: ["dscr"], loanPurposes: PURPOSES, occupancies: ["investment"], propertyTypes: ["single_family", "pud", "townhome", "condo", "non_warrantable_condo", "2_4_unit", "condotel"],
    citizenshipEligible: ["us_citizen", "permanent_resident", "non_permanent_resident", "daca"], vestingEligible: ["individual", "llc", "corporation", "partnership"],
    minLoanAmount: 125000, maxLoanAmount: 3500000, minFico: 640, minDscr: 0, baseMaxLtv: 80, minReservesMonths: 3, interestOnlyAvailable: true,
    firstTimeHomebuyerAllowed: false, firstTimeInvestorAllowed: true, strIncomeEligible: true, strIncomeLtvAdjustment: 5,
    propertyTypeLtvCaps: { non_warrantable_condo: 75, condotel: 75, "2_4_unit": 80 }, maxMortgageLates30x12: 1, maxMortgageLatesCategory: "late_30",
    reserveRules: [{ months: 3, maxLoanAmount: 500000 }, { months: 6, minLoanAmount: 500001, maxLoanAmount: 1000000 }, { months: 9, minLoanAmount: 1000001, maxLoanAmount: 2000000 }, { months: 12, minLoanAmount: 2000001 }],
    eligibilityLtvMatrix: [{ minFico: 700, minDscr: 1, maxLoanAmount: 1000000, maxLtv: 80, loanPurpose: "purchase" }, { minFico: 700, minDscr: 1, maxLoanAmount: 1000000, maxLtv: 80, loanPurpose: "rate_term_refinance" }, { minFico: 700, minDscr: 1, maxLoanAmount: 1000000, maxLtv: 75, loanPurpose: "cash_out_refinance" }, { minFico: 700, minDscr: 0.75, maxDscrExclusive: 1, maxLoanAmount: 1000000, maxLtv: 75, loanPurpose: "purchase" }, { minFico: 700, maxDscrExclusive: 0.75, maxLoanAmount: 1000000, maxLtv: 75, loanPurpose: "purchase" }, { minFico: 640, minDscr: 1, maxLoanAmount: 1000000, maxLtv: 75, loanPurpose: "purchase" }],
    sourceDocuments: [DOC.dscr, DOC.guide], sourceCitation: `${DOC.dscr} pp.1–4; ${DOC.guide} DSCR section`, notes: `${conflictNote} Business-purpose investment loan. DSCR tiers are >=1.00, 0.75–0.99, and <0.75; matrix includes sub-0.75 eligibility. Professional-investor and alternative-experience overlays apply.`,
  }), "Planet DSCR Matrix v1.0 dated 2025-10-13 — owner activated 2026-08-06", DOC.dscr]);

  rows.push(["Planet Non-QM — DSCR Foreign National", verified(lenderId, {
    incomeDocTypes: ["dscr"], loanPurposes: PURPOSES, occupancies: ["investment"], propertyTypes: ["single_family", "pud", "townhome", "condo", "non_warrantable_condo", "2_4_unit", "condotel"],
    citizenshipEligible: ["foreign_national"], vestingEligible: ["individual"], minLoanAmount: 125000, maxLoanAmount: 3000000, minFico: 0, minDscr: 0, baseMaxLtv: 75, minReservesMonths: 3,
    noFicoPolicy: "eligible_with_foreign_credit; 680_if_us_credit_established", foreignNationalDscrEligible: true, giftFundsAllowed: false, firstTimeInvestorAllowed: false,
    cashOutLimits: [{ maxLtv: 100, maxCashOutAmount: 500000 }], propertyTypeLtvCaps: { non_warrantable_condo: 70, condotel: 70 },
    reserveRules: [{ months: 3, maxLoanAmount: 500000 }, { months: 6, minLoanAmount: 500001, maxLoanAmount: 1000000 }, { months: 9, minLoanAmount: 1000001, maxLoanAmount: 2000000 }, { months: 12, minLoanAmount: 2000001 }],
    sourceDocuments: [DOC.fnDscr, DOC.guide], sourceCitation: `${DOC.fnDscr} pp.1–3; ${DOC.guide} Foreign National and DSCR sections`, notes: `${conflictNote} No standard FICO unless established U.S. credit, then 680. Up to 75% purchase at <=$1MM; lower by loan size and transaction. Gifts and entity vesting ineligible; personal guarantee required.`,
  }), "Planet DSCR Foreign National Matrix v1.0 dated 2025-10-13 — owner activated 2026-08-06", DOC.fnDscr]);

  rows.push(["Planet Non-QM — DSCR ITIN", verified(lenderId, {
    incomeDocTypes: ["dscr"], loanPurposes: PURPOSES, occupancies: ["investment"], propertyTypes: ["single_family", "pud", "townhome", "condo", "non_warrantable_condo", "2_4_unit", "condotel"],
    citizenshipEligible: ["itin", "asylee"], vestingEligible: ["individual", "partnership", "corporation"], minLoanAmount: 125000, maxLoanAmount: 1000000, minFico: 700, minDscr: 1, baseMaxLtv: 75, minReservesMonths: 6,
    itinDscrEligible: true, firstTimeHomebuyerAllowed: false, firstTimeInvestorAllowed: false, interestOnlyAvailable: true,
    eligibilityLtvMatrix: [{ minFico: 700, minDscr: 1, maxLoanAmount: 1000000, maxLtv: 75, loanPurpose: "purchase" }, { minFico: 700, minDscr: 1, maxLoanAmount: 1000000, maxLtv: 65, loanPurpose: "rate_term_refinance" }, { minFico: 700, minDscr: 1, maxLoanAmount: 1000000, maxLtv: 65, loanPurpose: "cash_out_refinance" }],
    cashOutLimits: [{ minLtvExclusive: 50, maxCashOutAmount: 300000 }, { maxLtv: 50, maxCashOutAmount: 500000 }], propertyTypeLtvCaps: { non_warrantable_condo: 70, condotel: 70 },
    sourceDocuments: [DOC.itinDscr, DOC.guide], sourceCitation: `${DOC.itinDscr} pp.1–3; ${DOC.guide} ITIN and DSCR sections`, notes: `${conflictNote} 700 FICO and DSCR >=1.00. Maximum $1MM; 75% purchase, 65% rate-term/cash-out. Six months reserves; first-time investors ineligible.`,
  }), "Planet ITIN DSCR Matrix v1.0 dated 2025-10-13 — owner activated 2026-08-06", DOC.itinDscr]);

  const heloanBase = verified(lenderId, {
    eligibleStates: PLANET_HELOAN_STATES,
    loanPurposes: ["rate_term_refinance", "cash_out_refinance", "second_lien"], occupancies: ["primary", "second_home", "investment"],
    propertyTypes: ["single_family", "pud", "condo", "2_4_unit", "manufactured_home"], citizenshipEligible: ["us_citizen", "permanent_resident", "non_permanent_resident", "daca", "foreign_national"],
    vestingEligible: ["individual"], minLoanAmount: 25000, maxLoanAmount: 750000, minFico: 660, maxDti: 50, baseMaxLtv: 90, minReservesMonths: 0,
    lienPosition: "standalone_second", ltvMetric: "cltv", interestOnlyAvailable: false, maxMortgageLates30x12: 0, maxMortgageLatesCategory: "none", creditEventSeasoningMonths: 48,
    propertyTypeLtvCaps: { condo: 75, "2_4_unit": 75, manufactured_home: 90 },
    eligibilityLtvMatrix: [{ minFico: 720, maxLtv: 90, occupancy: "primary", lienPosition: "standalone_second", loanPurpose: "second_lien" }, { minFico: 720, maxLtv: 90, occupancy: "second_home", lienPosition: "standalone_second", loanPurpose: "second_lien" }, { minFico: 680, maxLtv: 85, occupancy: "primary", lienPosition: "standalone_second", loanPurpose: "second_lien" }, { minFico: 720, maxLtv: 80, occupancy: "investment", lienPosition: "standalone_second", loanPurpose: "second_lien" }, { minFico: 660, maxLoanAmount: 350000, maxLtv: 70, occupancy: "investment", lienPosition: "standalone_second", loanPurpose: "second_lien" }],
    sourceDocuments: [DOC.heloanMatrix, DOC.heloanGuide], sourceCitation: `${DOC.heloanMatrix} pp.1–4; ${DOC.heloanGuide} pp.1–12`,
  });
  const heloanLabel = "Planet Non-QM HELOAN Matrix v1.0 / guide approval history Version 2, effective 2025-10-13 — owner activated 2026-08-06";
  rows.push(["Planet Non-QM HELOAN — Full Documentation", { ...heloanBase, incomeDocTypes: ["full_doc"], notes: `${conflictNote} Fixed-rate closed-end standalone second. Two-year employment history; paystub plus two years W-2s/transcripts and closing-date VVOE/paystub, or two years tax returns for self-employed. Matrix and guide also conflict on entity eligibility; entity matching is disabled.` }, heloanLabel, DOC.heloanGuide]);
  rows.push(["Planet Non-QM HELOAN — WVOE", { ...heloanBase, incomeDocTypes: ["wvoe"], notes: `${conflictNote} Fixed-rate closed-end standalone second. WVOE covering the most recent two-year period; manual underwrite. Matrix and guide conflict on entity eligibility; entity matching is disabled.` }, heloanLabel, DOC.heloanGuide]);
  return rows;
}

function assertCatalogCompatible(rows) {
  const requiredArrays = [
    "incomeDocTypes", "loanPurposes", "occupancies", "propertyTypes",
    "citizenshipEligible", "vestingEligible", "prepaymentPenaltyOptions",
  ];
  assert.equal(rows.length, 21, "Planet Home catalog must contain exactly 21 programs");
  for (const [name, config] of rows) {
    for (const field of requiredArrays) {
      assert.ok(Array.isArray(config[field]), `${name}: ${field} must be an array`);
    }
    assert.ok(config.eligibleStates === "ALL" || Array.isArray(config.eligibleStates), `${name}: eligibleStates must be ALL or an explicit state array`);
  }
}

async function main() {
  const catalogRows = programs(DRY_RUN ? "dry-run-planet" : "production-planet");
  assertCatalogCompatible(catalogRows);
  if (DRY_RUN) {
    const payload = catalogRows.map(([name, config, label, sourceUrl]) => ({ name, config, label, sourceUrl, status: STATUS }));
    assert.equal(payload.length, 21);
    assert.equal(payload.filter((p) => p.status === "human_verified").length, 21);
    assert.equal(payload.filter((p) => !p.config.currentVersionPending && !p.config.excludedFromVerifiedMatching).length, 21);
    console.log(JSON.stringify({ lender: "Planet Home Lending", programCount: payload.length, verifiedCount: 21, pendingCount: 0, programs: payload }, null, 2));
    return;
  }
  const createdBy = await adminId();
  const lenderId = await upsertLender(createdBy);
  for (const p of programs(lenderId)) await upsertProgram(lenderId, ...p, createdBy);

  const { data: programRows, error: programError } = await admin.from("programs").select("id,name,active,config").eq("lender_id", lenderId).eq("active", true).is("deleted_at", null);
  if (programError) throw programError;
  const expected = new Set(programs(lenderId).map(([name]) => name));
  const ingestedRows = programRows.filter((p) => expected.has(p.name));
  assert.equal(ingestedRows.length, 21);
  const ids = ingestedRows.map((p) => p.id);
  const { data: versions, error: versionError } = await admin.from("guideline_versions").select("program_id,verification_status").in("program_id", ids);
  if (versionError) throw versionError;
  const latestByProgram = new Map(versions.map((v) => [v.program_id, v]));
  assert.equal(ingestedRows.filter((p) => latestByProgram.get(p.id)?.verification_status === "human_verified").length, 21);
  assert.equal(ingestedRows.filter((p) => latestByProgram.get(p.id)?.verification_status === STATUS).length, 21);
  console.log("Production validation passed: Planet Home Lending loaded with 21 verified customer-visible programs for directory, AI Assistant, voice scenarios, and matching.");
}

const isDirectRun = process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href;
if (isDirectRun) {
  main().catch((error) => {
    console.error("FATAL", error.message);
    process.exit(1);
  });
}
