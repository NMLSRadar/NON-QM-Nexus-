import { createClient } from "@supabase/supabase-js";
import fs from "fs";

const DRY_RUN = process.argv.includes("--dry-run");
const fileEnv = fs.existsSync(".env.local") ? Object.fromEntries(fs.readFileSync(".env.local", "utf8").split(/\r?\n/).filter((l) => l.includes("=")).map((l) => { const i = l.indexOf("="); return [l.slice(0, i), l.slice(i + 1).trim().replace(/^(["'])(.*)\1$/, "$2")]; })) : {};
const env = { ...process.env, ...fileEnv };
if (!DRY_RUN && (!env.NEXT_PUBLIC_SUPABASE_URL || !env.SUPABASE_SERVICE_ROLE_KEY)) throw new Error("Missing Supabase credentials. Use --dry-run for payload validation.");
const admin = DRY_RUN ? null : createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY);
const ORG = "bfe87b1c-86e7-4186-b1c4-ecc25d0e4420";
const REVIEWED = "2026-08-06";
const EFFECTIVE = "2026-04-01";
const ADMIN = "nonqmnexusadmin@gmail.com";
const GUIDE = "https://d2ol7oe51mr4n9.cloudfront.net/user_3Cfrs4UEzyBfibhWL8hkQ0WuLXI/cf475931-d28d-427c-9c81-6db930a5c884.pdf";
const LABEL = "CAKE Non-QM Loan Eligibility Guidelines v4.0 — Effective 04/01/2026";
const purposes = ["purchase", "rate_term_refinance", "cash_out_refinance"];
const occupancies = ["primary", "second_home", "investment"];
const homes = ["single_family", "pud", "townhome", "2_4_unit", "condo", "non_warrantable_condo", "condotel", "manufactured"];
const citizens = ["us_citizen", "permanent_resident", "non_permanent_resident", "itin"];
const matrixNote = "Cake's Version 4.0 narrative guideline confirms the program and qualitative underwriting rules but repeatedly defers exact FICO, LTV/CLTV, loan-amount, mortgage-history, adverse-credit seasoning, and reserve tiers to the separate current program/credit matrix, which was not included. Confirm the current Cake matrix before final eligibility or quoting numeric terms.";
const visaNote = "U.S. citizens and permanent residents are eligible. Non-permanent residents require a current employment-authorized visa or EAD; expired documents require renewal/extension evidence. Cake's §2.2 matrix expressly includes broad visa/EAD classes such as H-1B/H-4, L-1, E-1/E-2/E-3, O, R-1, TN, G/NATO, DACA, TPS, asylee and refugee classifications. ITIN borrowers require a valid ITIN card/IRS letter, unexpired government photo ID and U.S. credit report; USCIS residency documents are not required for ITIN borrowers.";
const common = (id, p) => ({
  active: true, isSampleData: false, lenderId: id, eligibleStates: "ALL", lastVerifiedDate: REVIEWED,
  interestOnlyAvailable: false, prepaymentPenaltyOptions: ["none", "1-5 years on investment where legal"],
  minLoanAmount: 0, maxLoanAmount: 0, minFico: 0, baseMaxLtv: 0, minReservesMonths: 0,
  loanPurposes: purposes, occupancies, propertyTypes: homes, citizenshipEligible: citizens,
  vestingEligible: ["individual", "joint_tenants", "trust"], matrixConfirmationRequired: true,
  matrixConfirmationNotes: matrixNote, sourceDocuments: [GUIDE], guidelineVersionLabel: LABEL,
  effectiveDate: EFFECTIVE, sourceCitation: GUIDE, ...p,
});

function programs(id) { return [
  ["Full Documentation", common(id, {
    incomeDocTypes: ["full_doc"], maxDti: 50, minSelfEmploymentMonths: 24,
    sourceCitation: `${GUIDE} pp.20-24 §§5.1-5.9; pp.30-34 §§7.2,8.7`,
    notes: `Full Doc: wage earners provide 30 days paystubs plus 1 or 2 years W-2s/transcripts; self-employed borrowers provide 1 or 2 years personal/business returns with filing evidence. Form 4506-C is required for Full Doc. Two-year employment history; present employer 6 months after a >60-day gap. Maximum DTI 50% or current matrix. Consumer-purpose residual income minimum $1,500; business-purpose loans exempt. ${visaNote}`,
  })],
  ["Bank Statement — 12/24 Month", common(id, {
    incomeDocTypes: ["bank_statement"], minSelfEmploymentMonths: 12, maxDti: 50, bankStatementFlexible: true,
    standardExpenseFactor: 50, minimumExpenseFactor: 10, expenseFactorType: "documentation_driven", reducedExpenseFactorAvailable: true,
    reducedFactorDocumentation: "CPA, EA, CTEC preparer, PTIN holder or Tax Attorney business-expense letter or P&L", cpaLetterAllowed: true, eaLetterAllowed: true, pnlSupported: true,
    eligibleDepositPercentage: 100,
    personalBankStatementRules: "12 or 24 complete months; two recent business statements required unless no business account exists, in which case personal statements may be used with a 10% expense factor. Transfers count only from the documented business account.",
    businessBankStatementRules: "12 or 24 consecutive complete months from the same account; qualifying deposits × ownership percentage × (1 − applicable expense factor).",
    expenseFactorNotes: "50% standard; documented factor may be lower but never below 10%. At >=80% LTV, max 12 NSF occurrences in 12 months and max 3 in the latest 3 months; below 80% no NSF limit. Tax returns and 4506-C are not required.",
    sourceCitation: `${GUIDE} pp.25-26 §§6.1-6.1.3`,
    notes: `Personal or business statements; 12 or 24 months. Borrower must own at least 25%, be self-employed in the same business at least one year and have two years in the same line of business. Most recent statement within 60 days. Tax returns and 4506-C not required. STR rental income may supplement using 12 months platform statements and an active listing screenshot. ${visaNote}`,
  })],
  ["P&L Statement Only — 12/24 Month", common(id, {
    incomeDocTypes: ["pnl_only"], minSelfEmploymentMonths: 12, maxDti: 50, pnlPeriodMonths: 12, pnlTaxReturnsRequired: false,
    pnlPreparerAttestationPurpose: "confirms_tax_filing_only",
    sourceCitation: `${GUIDE} p.26 §6.3; p.29 §6.10.2`,
    notes: `P&L Only is available to self-employed borrowers with at least 25% ownership. The P&L itself is the income document; borrower tax returns and 4506-C are not required. It must cover the latest 12 or 24 consecutive months and be prepared by a CPA, EA, CTEC preparer, PTIN holder or Tax Attorney. Net income ÷ covered months × ownership percentage; depreciation, depletion and amortization may be added back. Preparer attestation confirms business existence/tax filing only. ${visaNote}`,
  })],
  ["P&L with Bank Statements — 12/24 Month", common(id, {
    incomeDocTypes: ["pnl_only"], minSelfEmploymentMonths: 12, maxDti: 50, pnlPeriodMonths: 12, pnlTaxReturnsRequired: false,
    pnlPreparerAttestationPurpose: "confirms_tax_filing_only", pnlSupportingBankStatementsMonths: 3,
    sourceCitation: `${GUIDE} pp.26-27 §6.4; p.29 §6.10.2`,
    notes: `A separately documented P&L option using a 12- or 24-month licensed-preparer P&L plus 3 months bank statements. Deposits must be no more than 25% below P&L revenue; additional statements may be added until tolerance is met. NSF events and overdrafts are not permitted under this support option. Tax returns and 4506-C are not required. ${visaNote}`,
  })],
  ["1099 Only — 1/2 Year", common(id, {
    incomeDocTypes: ["1099"], minSelfEmploymentMonths: 12, maxDti: 50, standardExpenseFactor: 10,
    sourceCitation: `${GUIDE} p.27 §6.5`,
    notes: `One or two years of 1099s/transcripts. Standard eligibility is a 2-year 1099 history; a borrower who converted from W-2 to 1099 may qualify with at least 1 year of 1099 income in the same line of work. A 90% net margin (10% expense factor) applies. Two recent bank statements must support deposits; YTD earnings must be within 10% of or above prior-year earnings. ${visaNote}`,
  })],
  ["WVOE Only", common(id, {
    incomeDocTypes: ["wvoe_only"], occupancies: ["primary"], maxDti: 50, firstTimeHomebuyerAllowed: true, giftFundsAllowed: true,
    giftFundsNotes: "General Cake gift rules permit gifts, but WVOE requires at least 10% borrower contribution.",
    sourceCitation: `${GUIDE} p.27 §6.6; p.34 §§8.4-8.7`,
    notes: `Primary residence only. Two years with the same employer; FNMA Form 1005 completed by HR/payroll/company officer. No paystubs, tax returns, 4506-C or W-2s required. Borrowers employed by family are ineligible. Minimum 10% borrower contribution. FTHB eligible subject to current matrix. VVOE within 3 days of closing. ${visaNote}`,
  })],
  ["ATR-in-Full (AiF)", common(id, {
    incomeDocTypes: ["asset_depletion"],
    sourceCitation: `${GUIDE} pp.27-28 §6.7`,
    notes: `Unique Cake AiF option: personally held liquid assets sufficient to pay the loan in full satisfy DTI and residual-income requirements. Two recent asset statements required; business accounts generally ineligible. Delayed-financing funds may qualify if sourced and seasoned 90 days before the initial cash purchase. This is distinct from monthly Asset Utilization. ${visaNote}`,
  })],
  ["Asset Utilization", common(id, {
    incomeDocTypes: ["asset_depletion"], maxDti: 50, giftFundsAllowed: true,
    giftFundsNotes: "Gift funds allowed except when LTV/CLTV exceeds 80%; current matrix confirmation is required.",
    sourceCitation: `${GUIDE} p.28 §§6.8-6.8.2`,
    notes: `Sole or supplemental income. Monthly income = net qualified assets ÷ 60; Bitcoin/Ethereum use 50% value ÷ 84. Haircuts: 100% checking/savings/money-market/CD and cash-value life insurance; 70% securities; retirement 70% at age 59.5+, 50% under; crypto 50% at approved exchanges only. Trust assets eligible. Business funds, real-estate equity, private/restricted stock and assets already producing counted income are ineligible. Three monthly/quarterly statements and 30-day seasoning. ${visaNote}`,
  })],
]; }

async function adminId() { const { data, error } = await admin.from("users").select("id").eq("email", ADMIN).single(); if (error) throw error; return data.id; }
async function lender(createdBy) {
  const { data, error } = await admin.from("lenders").select("id,name,notes").eq("organization_id", ORG).ilike("name", "%Cake Mortgage%");
  if (error) throw error;
  let row = data?.find((x) => /cake mortgage/i.test(x.name));
  if (!row) {
    const q = await admin.from("lenders").insert({ organization_id: ORG, name: "Cake Mortgage", tier_level: 3, active: true, is_sample_data: false, created_by: createdBy, notes: "Cake Mortgage Corp. Non-QM wholesale lender." }).select("id,name,notes").single();
    if (q.error) throw q.error; row = q.data;
  }
  await admin.from("lenders").update({ active: true, notes: `${row.notes ?? ""}\nAudited ${REVIEWED}: Version 4.0 general Non-QM guide effective 04/01/2026. Full Doc and seven Alt-Doc methods are active; exact numeric tiers require the separate current Cake matrix.`.trim() }).eq("id", row.id);
  return row.id;
}
async function upsert(lenderId, def, createdBy) {
  const [name, config] = def;
  const { data: found, error } = await admin.from("programs").select("id,config").eq("lender_id", lenderId).eq("name", name).limit(1); if (error) throw error;
  let id;
  if (found?.[0]) {
    id = found[0].id;
    const q = await admin.from("programs").update({ config: { ...found[0].config, ...config }, active: true, updated_at: new Date().toISOString() }).eq("id", id); if (q.error) throw q.error;
    console.log(`Updated: ${name}`);
  } else {
    const q = await admin.from("programs").insert({ organization_id: ORG, lender_id: lenderId, name, is_sample_data: false, active: true, config, created_by: createdBy }).select("id").single(); if (q.error) throw q.error;
    id = q.data.id; console.log(`Created: ${name}`);
  }
  const { data: gv } = await admin.from("guideline_versions").select("id").eq("program_id", id).eq("label", LABEL).limit(1);
  if (!gv?.length) {
    const q = await admin.from("guideline_versions").insert({ organization_id: ORG, program_id: id, label: LABEL, effective_date: EFFECTIVE, last_verified_date: REVIEWED, verification_status: "human_verified", reviewed_by: createdBy, published_at: new Date().toISOString(), source_url: GUIDE }); if (q.error) throw q.error;
  }
  return id;
}
async function main() {
  if (DRY_RUN) {
    const defs = programs("dry-run");
    console.log(JSON.stringify({ lender: "Cake Mortgage", document: LABEL, programCount: defs.length, programs: defs.map(([name, c]) => ({ name, incomeDocTypes: c.incomeDocTypes, occupancies: c.occupancies, minFico: c.minFico, baseMaxLtv: c.baseMaxLtv, maxLoanAmount: c.maxLoanAmount, matrixConfirmationRequired: c.matrixConfirmationRequired, pnlTaxReturnsRequired: c.pnlTaxReturnsRequired, pnlSupportingBankStatementsMonths: c.pnlSupportingBankStatementsMonths, standardExpenseFactor: c.standardExpenseFactor })) }, null, 2));
    return;
  }
  const createdBy = await adminId(); const lenderId = await lender(createdBy); const defs = programs(lenderId);
  const { data: dscrBefore, error: dscrBeforeError } = await admin.from("programs").select("id,name,config,active").eq("lender_id", lenderId).ilike("name", "%DSCR%");
  if (dscrBeforeError) throw dscrBeforeError;
  const dscrSnapshot = new Map((dscrBefore ?? []).map((r) => [r.id, JSON.stringify({ name: r.name, config: r.config, active: r.active })]));
  if (dscrSnapshot.size === 0) throw new Error("Cake production validation failed: expected existing DSCR records to preserve, found none");
  for (const d of defs) await upsert(lenderId, d, createdBy);
  const { data: dscrAfter, error: dscrAfterError } = await admin.from("programs").select("id,name,config,active").in("id", [...dscrSnapshot.keys()]);
  if (dscrAfterError) throw dscrAfterError;
  for (const row of dscrAfter ?? []) {
    if (dscrSnapshot.get(row.id) !== JSON.stringify({ name: row.name, config: row.config, active: row.active })) throw new Error(`Cake production validation failed: existing DSCR record changed: ${row.name}`);
  }
  if ((dscrAfter ?? []).length !== dscrSnapshot.size) throw new Error("Cake production validation failed: an existing DSCR record was removed");
  const names = defs.map(([n]) => n);
  const { data, error } = await admin.from("programs").select("name,active,config").eq("lender_id", lenderId).in("name", names); if (error) throw error;
  const map = new Map((data ?? []).map((r) => [r.name, r])); const check = (v, m) => { if (!v) throw new Error(`Cake production validation failed: ${m}`); };
  check(map.size === defs.length, `expected ${defs.length} reviewed programs, found ${map.size}`);
  for (const name of names) check(map.get(name)?.active && map.get(name)?.config?.active, `${name} inactive`);
  const bank = map.get("Bank Statement — 12/24 Month")?.config;
  check(bank?.standardExpenseFactor === 50 && bank?.minimumExpenseFactor === 10 && bank?.minSelfEmploymentMonths === 12, "Bank Statement mechanics");
  const pnl = map.get("P&L Statement Only — 12/24 Month")?.config;
  check(pnl?.pnlTaxReturnsRequired === false && pnl?.pnlPeriodMonths === 12, "P&L Only tax-return/period fields");
  const supported = map.get("P&L with Bank Statements — 12/24 Month")?.config;
  check(supported?.pnlSupportingBankStatementsMonths === 3, "P&L support period");
  const wvoe = map.get("WVOE Only")?.config;
  check(wvoe?.occupancies?.length === 1 && wvoe.occupancies[0] === "primary" && wvoe?.firstTimeHomebuyerAllowed === true, "WVOE fields");
  const asset = map.get("Asset Utilization")?.config;
  check(asset?.notes?.includes("÷ 60") && asset?.matrixConfirmationRequired === true, "Asset Utilization divisor/matrix gate");
  const { data: legacyBank, error: legacyBankError } = await admin.from("programs").select("id,config").eq("lender_id", lenderId).eq("name", "Bank Statement").eq("active", true);
  if (legacyBankError) throw legacyBankError;
  for (const row of legacyBank ?? []) {
    const q = await admin.from("programs").update({ active: false, config: { ...row.config, active: false, notes: `${row.config?.notes ?? ""}\nRetired ${REVIEWED}: superseded by Bank Statement — 12/24 Month from Cake Version 4.0.`.trim() } }).eq("id", row.id);
    if (q.error) throw q.error;
    console.log("Retired obsolete Cake row: Bank Statement");
  }
  console.log(`Cake production validation passed: ${map.size} active reviewed non-DSCR programs; existing DSCR records unchanged; Bank Statement, P&L, WVOE, 1099, AiF, Asset Utilization and Full Doc fields verified.`);
}
main().catch((e) => { console.error(e); process.exit(1); });
