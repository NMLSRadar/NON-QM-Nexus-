import { createClient } from "@supabase/supabase-js";
import fs from "node:fs";
import { pathToFileURL } from "node:url";

export const PLATFORM_ORG = "bfe87b1c-86e7-4186-b1c4-ecc25d0e4420";
export const VERIFIED_ON = "2026-09-07";
export const SOURCES = {
  productPage: "https://risetpo.com/non-qm-non-conforming-loans/",
  nonQmMatrix: "https://risetpo.com/wp-content/uploads/2026/06/RISETPO-Non-QM-Matrix-260608.pdf",
  dscrMatrix: "https://risetpo.com/wp-content/uploads/2026/06/RISETPO-Full-Doc-Alt-Doc-DSCR-CES-Matrix-eff-260608.pdf",
  dscr75: "https://risetpo.com/wp-content/uploads/2026/02/RISETPO-RT-DSCR75-021226.pdf",
};

const MATRIX_VERSION = "RISE TPO Non-QM Matrix 06.08.26";
const DSCR_VERSION = "RISE TPO DSCR sources verified 09.07.26";
const firstLien = ["purchase", "rate_term_refinance", "cash_out_refinance"];
const domestic = ["us_citizen", "permanent_resident", "non_permanent_resident"];
const standardProperties = ["single_family", "townhome", "pud", "condo", "non_warrantable_condo", "2_4_unit"];

const coreRows = [
  [1_000_000, 700, 90, 85, 80], [1_000_000, 680, 85, 85, 80], [1_000_000, 600, 80, 80, 75],
  [1_500_000, 720, 90, 85, 80], [1_500_000, 700, 90, 85, 80], [1_500_000, 680, 85, 85, 80], [1_500_000, 640, 80, 80, 75], [1_500_000, 600, 75, 75, 70],
  [2_000_000, 740, 90, 85, 80], [2_000_000, 720, 85, 85, 80], [2_000_000, 700, 85, 85, 80], [2_000_000, 680, 80, 80, 75], [2_000_000, 640, 75, 75, 70],
  [2_500_000, 740, 85, 80, 75], [2_500_000, 720, 80, 80, 75], [2_500_000, 700, 80, 80, 75], [2_500_000, 680, 75, 75, 70], [2_500_000, 660, 70, 70, 65],
  [3_000_000, 720, 80, 80, 75], [3_000_000, 700, 75, 75, 70], [3_000_000, 680, 70, 70, 65], [3_000_000, 660, 60, 60, 55],
  [3_500_000, 740, 75, 75, 65], [3_500_000, 720, 70, 70, 65], [3_500_000, 680, 60, 60, 55], [3_500_000, 660, 50, 50, 45],
];

function expandCoreMatrix() {
  const purposes = ["purchase", "rate_term_refinance", "cash_out_refinance"];
  return coreRows.flatMap(([maxLoanAmount, minFico, purchase, rateTerm, cashOut]) =>
    [purchase, rateTerm, cashOut].flatMap((maxLtv, index) => ["primary", "second_home", "investment"].map((occupancy) => ({
      minFico,
      maxLoanAmount,
      maxLtv,
      occupancy,
      loanPurpose: purposes[index],
      sourcePage: 1,
      sourceSection: "Core Non-QM FICO to Maximum LTV/CLTV",
    }))),
  );
}

export const CORE_LTV_MATRIX = expandCoreMatrix();

const sourceRuleIndex = [
  { field: "eligibilityLtvMatrix", sourceUrl: SOURCES.nonQmMatrix, documentTitle: "RISE TPO Non-QM Matrix", effectiveDate: "2026-06-08", page: 1, section: "Core Non-QM FICO to Max LTV/CLTV", status: "verified" },
  { field: "incomeDocTypes", sourceUrl: SOURCES.nonQmMatrix, documentTitle: "RISE TPO Non-QM Matrix", effectiveDate: "2026-06-08", page: 1, section: "Income Types", status: "verified" },
  { field: "propertyTypeLtvCaps", sourceUrl: SOURCES.nonQmMatrix, documentTitle: "RISE TPO Non-QM Matrix", effectiveDate: "2026-06-08", page: 1, section: "Additional Criteria", status: "verified" },
  { field: "businessPurposeEligible", sourceUrl: SOURCES.nonQmMatrix, documentTitle: "RISE TPO Non-QM Matrix", effectiveDate: "2026-06-08", page: 2, section: "Non-TRID Business Purpose", status: "verified" },
];

function common(overrides = {}) {
  return {
    active: true,
    incomeDocTypes: ["full_doc"],
    loanPurposes: firstLien,
    occupancies: ["primary", "second_home", "investment"],
    propertyTypes: standardProperties,
    eligibleStates: "ALL",
    citizenshipEligible: domestic,
    vestingEligible: ["individual", "joint_tenants", "trust", "llc", "corporation"],
    minLoanAmount: 125_000,
    maxLoanAmount: 3_500_000,
    minFico: 600,
    maxDti: 50,
    baseMaxLtv: 90,
    eligibilityLtvMatrix: CORE_LTV_MATRIX,
    propertyTypeLtvCaps: { condo: 90, non_warrantable_condo: 75 },
    statePropertyTypeLtvCaps: { FL: { condo: 75, non_warrantable_condo: 65 } },
    minReservesMonths: 0,
    interestOnlyAvailable: true,
    businessPurposeEligible: true,
    sourceDocuments: [SOURCES.nonQmMatrix, SOURCES.productPage],
    sourceRuleIndex,
    effectiveDate: "2026-06-08",
    lastVerifiedDate: VERIFIED_ON,
    majorRestrictions: [
      "Programs and rates are subject to change; confirm the current RISE TPO matrix before locking",
      "All Non-TRID business-purpose subject properties in Baltimore City, Maryland are temporarily ineligible",
      "Non-warrantable condos are capped at 75% LTV; Florida non-warrantable condos are capped at 65% LTV",
    ],
    ...overrides,
  };
}

export const PROGRAMS = [
  {
    lender: "RISE TPO",
    name: "RISE TPO — 12-Month Bank Statement",
    aliases: ["RISE 12 Month Bank Statement", "RISE Bank Statement"],
    version: MATRIX_VERSION,
    effectiveDate: "2026-06-08",
    source: SOURCES.nonQmMatrix,
    config: common({
      incomeDocTypes: ["bank_statement"],
      bankStatementMonthsEligible: [12],
      bankStatementAccountTypes: ["personal", "business"],
      minSelfEmploymentMonths: 24,
      citizenshipEligible: [...domestic, "itin"],
      citizenshipDocTypeRestrictions: { itin: ["bank_statement"] },
      citizenshipLtvCaps: { itin: 85 },
      citizenshipMaxLoanAmounts: { itin: 1_500_000 },
      businessPurposeNotes: "Available for investment/non-TRID business-purpose transactions subject to state and property restrictions.",
    }),
  },
  {
    lender: "RISE TPO",
    name: "RISE TPO — P&L",
    aliases: ["RISE P&L", "RISE Profit and Loss"],
    version: MATRIX_VERSION,
    effectiveDate: "2026-06-08",
    source: SOURCES.nonQmMatrix,
    config: common({
      incomeDocTypes: ["pnl_only"],
      minFico: 660,
      baseMaxLtv: 80,
      maxLoanAmount: 2_500_000,
      minSelfEmploymentMonths: 24,
      pnlOnlyAvailable: true,
      pnlTaxReturnsRequired: false,
      pnlBankStatementSupportRequired: true,
      pnlSupportingStatementMonths: 3,
      pnlSupportingBankStatementsMonths: 3,
      pnlMaxLtv: 80,
      pnlMinFico: 660,
      pnlMaxLoanAmount: 2_500_000,
      pnlRequiredMonthsSelfEmployed: 24,
      pnlNotes: "Current RISE matrix requires a P&L supported by three months of business bank statements; the business must generally have existed for at least two years and hold any required active license.",
    }),
  },
  {
    lender: "RISE TPO",
    name: "RISE TPO — 90% LTV Alt Doc Options",
    aliases: ["RISE Alt Doc", "RISE 90 Alt Doc"],
    version: MATRIX_VERSION,
    effectiveDate: "2026-06-08",
    source: SOURCES.nonQmMatrix,
    config: common({
      incomeDocTypes: ["bank_statement", "pnl_only", "asset_depletion", "1099", "wvoe_only"],
      baseMaxLtv: 90,
      bankStatementMonthsEligible: [12],
      bankStatementAccountTypes: ["personal", "business"],
      matrixConfirmationRequired: true,
      matrixConfirmationNotes: "The 90% headline is the highest Core Non-QM tier. Actual eligibility depends on FICO, loan amount, transaction type, occupancy, property type, and the selected alternative-documentation method.",
    }),
  },
  {
    lender: "RISE TPO",
    name: "RISE TPO — Asset Depletion",
    aliases: ["RISE Asset Utilization", "RISE Asset Depletion"],
    version: MATRIX_VERSION,
    effectiveDate: "2026-06-08",
    source: SOURCES.nonQmMatrix,
    config: common({
      incomeDocTypes: ["asset_depletion"],
      minFico: 600,
      baseMaxLtv: 80,
      maxLoanAmount: 2_000_000,
      assetUtilizationAvailable: true,
      assetQualifierMethods: ["assets_as_income", "blended_with_other_income"],
      majorRestrictions: ["Asset utilization is capped at 80% LTV, 75% for cash-out, with a $2,000,000 maximum loan amount", "Confirm eligible asset classes and depletion calculation in the current full guidelines"],
    }),
  },
  {
    lender: "RISE TPO",
    name: "RISE TPO — 85% LTV DSCR",
    aliases: ["RISE DSCR", "RISE TPO DSCR"],
    version: DSCR_VERSION,
    effectiveDate: "2026-06-08",
    source: SOURCES.dscrMatrix,
    config: common({
      incomeDocTypes: ["dscr"],
      occupancies: ["investment"],
      citizenshipEligible: domestic,
      minFico: 640,
      minDscr: 1,
      maxDti: undefined,
      baseMaxLtv: 85,
      maxLoanAmount: 3_000_000,
      minReservesMonths: 3,
      businessPurposeEligible: true,
      businessPurposeNotes: "Investment-property business-purpose DSCR. Experienced and inexperienced investors are eligible; inexperienced investors are subject to additional restrictions.",
      shortTermRentalEligible: true,
      shortTermRentalNotes: "Experienced investors only; purchase only; at least 12 months of STR rental history in the last three years; 5% LTV/CLTV reduction.",
      sourceDocuments: [SOURCES.productPage, SOURCES.dscrMatrix, SOURCES.dscr75],
      sourceRuleIndex: [
        { field: "baseMaxLtv", sourceUrl: SOURCES.productPage, documentTitle: "RISE TPO Non-QM Programs", effectiveDate: "2026-09-07", section: "85% LTV DSCR", status: "verified" },
        { field: "minDscr", sourceUrl: SOURCES.dscrMatrix, documentTitle: "RISE TPO Full Doc, Alt Doc & DSCR CES Matrix", effectiveDate: "2026-06-08", section: "DSCR", status: "verified" },
        { field: "minFico", sourceUrl: SOURCES.dscr75, documentTitle: "RISE TPO DSCR .75 Ratio", effectiveDate: "2026-02-12", section: "Program Highlights", status: "verified" },
      ],
      matrixConfirmationRequired: true,
      matrixConfirmationNotes: "RISE's official program page advertises up to 85% LTV DSCR. The linked supporting documents carry transaction- and product-specific overlays; confirm the current first-lien DSCR matrix for the exact scenario.",
    }),
  },
  {
    lender: "RISE TPO",
    name: "RISE TPO — Full Doc Non-QM",
    aliases: ["RISE Full Doc", "RISE Core Full Doc"],
    version: MATRIX_VERSION,
    effectiveDate: "2026-06-08",
    source: SOURCES.nonQmMatrix,
    config: common({
      incomeDocTypes: ["full_doc"],
      citizenshipEligible: [...domestic, "itin"],
      citizenshipDocTypeRestrictions: { itin: ["full_doc"] },
      citizenshipLtvCaps: { itin: 85 },
      citizenshipMaxLoanAmounts: { itin: 1_500_000 },
    }),
  },
  {
    lender: "RISE TPO",
    name: "RISE TPO — True Business Purpose Options",
    aliases: ["RISE Business Purpose", "RISE Non-TRID"],
    version: MATRIX_VERSION,
    effectiveDate: "2026-06-08",
    source: SOURCES.nonQmMatrix,
    config: common({
      incomeDocTypes: ["full_doc", "bank_statement", "pnl_only", "asset_depletion", "1099", "wvoe_only", "dscr"],
      occupancies: ["investment"],
      citizenshipEligible: domestic,
      businessPurposeEligible: true,
      businessPurposeOnly: true,
      businessPurposeNotes: "True non-owner-occupied/non-TRID business-purpose options. Confirm state licensing, prepayment-penalty, vesting, and property overlays in the current matrix.",
      baseMaxLtv: 85,
    }),
  },
  {
    lender: "RISE TPO",
    name: "RISE TPO — WVOE",
    aliases: ["RISE WVOE Only", "RISE Written Verification of Employment"],
    version: MATRIX_VERSION,
    effectiveDate: "2026-06-08",
    source: SOURCES.nonQmMatrix,
    config: common({
      incomeDocTypes: ["wvoe_only"],
      minFico: 620,
      baseMaxLtv: 80,
      maxLoanAmount: 3_000_000,
      wvoeOnlyAvailable: true,
      wvoeMaxLtv: 80,
      majorRestrictions: ["WVOE-only requires a 620 minimum FICO and is capped at 80% LTV", "Cash-out and first-time-homebuyer scenarios are capped at 70% LTV", "0x30x12 housing history required"],
    }),
  },
];

function normalize(value) {
  return String(value ?? "").toLowerCase().replace(/[^a-z0-9]/g, "");
}

function loadEnv() {
  const env = { ...process.env };
  for (const filename of [".env.local", ".env.production.local", "/home/.deploy-env.NONQMNEXUS"]) {
    if (!fs.existsSync(filename)) continue;
    for (const line of fs.readFileSync(filename, "utf8").split(/\r?\n/)) {
      const match = /^([A-Z0-9_]+)=(.*)$/.exec(line.trim());
      if (!match || env[match[1]]) continue;
      env[match[1]] = match[2].replace(/^['"]|['"]$/g, "");
    }
  }
  return env;
}

async function resolveAdmin(admin) {
  const { data, error } = await admin.from("users").select("id").eq("email", "nonqmnexusadmin@gmail.com").maybeSingle();
  if (error || !data) throw new Error(`Unable to resolve platform admin: ${error?.message ?? "not found"}`);
  return data.id;
}

async function resolveLender(admin, adminId) {
  const { data, error } = await admin.from("lenders").select("id,name").eq("organization_id", PLATFORM_ORG).is("deleted_at", null);
  if (error) throw new Error(error.message);
  const aliases = ["risetpo", "rise", "ocmbcrisetpo"];
  const matches = (data ?? []).filter((row) => aliases.includes(normalize(row.name)));
  let target = matches.find((row) => normalize(row.name) === "risetpo") ?? matches[0];
  if (!target) {
    const created = await admin.from("lenders").insert({
      organization_id: PLATFORM_ORG,
      name: "RISE TPO",
      is_sample_data: false,
      active: true,
      tier_level: 2,
      created_by: adminId,
      notes: "RISE TPO is a registered DBA of OCMBC, Inc. | NMLS 2125 | Official Non-QM catalog verified from RISE TPO program pages and matrices.",
    }).select("id,name").single();
    if (created.error) throw new Error(created.error.message);
    target = created.data;
  }
  const update = await admin.from("lenders").update({
    name: "RISE TPO",
    active: true,
    is_sample_data: false,
    tier_level: 2,
    notes: "RISE TPO is a registered DBA of OCMBC, Inc. | NMLS 2125 | Official Non-QM catalog verified from RISE TPO program pages and matrices.",
  }).eq("id", target.id);
  if (update.error) throw new Error(update.error.message);
  return target.id;
}

async function upsertProgram(admin, adminId, lenderId, item) {
  const { data: current, error } = await admin.from("programs").select("id,name,version").eq("lender_id", lenderId).is("deleted_at", null);
  if (error) throw new Error(error.message);
  const names = [item.name, ...item.aliases].map(normalize);
  const matches = (current ?? []).filter((row) => names.includes(normalize(row.name)));
  const config = {
    ...item.config,
    active: true,
    lenderId,
    isSampleData: false,
    guidelineVersionLabel: item.version,
    effectiveDate: item.effectiveDate,
    lastVerifiedDate: VERIFIED_ON,
    sourceCitation: `${item.version} — ${item.source}`,
  };
  let programId;
  if (matches.length) {
    programId = matches[0].id;
    const saved = await admin.from("programs").update({ name: item.name, active: true, is_sample_data: false, config, version: (matches[0].version ?? 0) + 1 }).eq("id", programId);
    if (saved.error) throw new Error(`Update ${item.name}: ${saved.error.message}`);
    for (const duplicate of matches.slice(1)) await admin.from("programs").update({ active: false, deleted_at: new Date().toISOString() }).eq("id", duplicate.id);
  } else {
    const created = await admin.from("programs").insert({ organization_id: PLATFORM_ORG, lender_id: lenderId, name: item.name, is_sample_data: false, active: true, config, created_by: adminId }).select("id").single();
    if (created.error) throw new Error(`Insert ${item.name}: ${created.error.message}`);
    programId = created.data.id;
  }
  await admin.from("guideline_versions").update({ verification_status: "superseded" }).eq("program_id", programId).neq("label", item.version).in("verification_status", ["human_verified", "imported_pending_review"]);
  const existing = await admin.from("guideline_versions").select("id").eq("program_id", programId).eq("label", item.version).maybeSingle();
  const row = {
    organization_id: PLATFORM_ORG,
    program_id: programId,
    label: item.version,
    effective_date: item.effectiveDate,
    last_verified_date: VERIFIED_ON,
    verification_status: "human_verified",
    reviewed_by: adminId,
    published_at: new Date().toISOString(),
    source_url: item.source,
    last_checked_at: new Date().toISOString(),
    change_detected: false,
  };
  const versionSave = existing.data ? await admin.from("guideline_versions").update(row).eq("id", existing.data.id) : await admin.from("guideline_versions").insert(row);
  if (versionSave.error) throw new Error(`Guideline ${item.name}: ${versionSave.error.message}`);
}

async function verifyProductionState(admin, lenderId) {
  const { data: programs, error } = await admin.from("programs").select("id,name,active").eq("lender_id", lenderId).eq("active", true).is("deleted_at", null);
  if (error) throw new Error(`Verify programs: ${error.message}`);
  const required = new Set(PROGRAMS.map((item) => item.name));
  const requiredRows = (programs ?? []).filter((item) => required.has(item.name));
  const missing = [...required].filter((name) => !requiredRows.some((row) => row.name === name));
  if (missing.length) throw new Error(`Production verification missing programs: ${missing.join(", ")}`);
  const { data: versions, error: versionError } = await admin.from("guideline_versions").select("program_id,verification_status").in("program_id", requiredRows.map((item) => item.id)).eq("verification_status", "human_verified");
  if (versionError) throw new Error(`Verify guideline versions: ${versionError.message}`);
  const verifiedIds = new Set((versions ?? []).map((row) => row.program_id));
  if (verifiedIds.size !== PROGRAMS.length) throw new Error(`Production verification expected ${PROGRAMS.length} verified programs; received ${verifiedIds.size}`);
  return { requiredPrograms: requiredRows.length, humanVerified: verifiedIds.size };
}

export async function runIngestion() {
  const env = loadEnv();
  if (!env.NEXT_PUBLIC_SUPABASE_URL || !env.SUPABASE_SERVICE_ROLE_KEY || env.NEXT_PUBLIC_SUPABASE_URL === "[SENSITIVE]") return { skipped: true, programs: 0 };
  const admin = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false, autoRefreshToken: false } });
  const adminId = await resolveAdmin(admin);
  const lenderId = await resolveLender(admin, adminId);
  for (const item of PROGRAMS) await upsertProgram(admin, adminId, lenderId, item);
  const verification = await verifyProductionState(admin, lenderId);
  console.log(`[rise-tpo-ingest] complete: ${PROGRAMS.length} human-verified programs`);
  console.log(`[rise-tpo-ingest] verified production: ${verification.requiredPrograms} required programs / ${verification.humanVerified} verified guideline records`);
  return { skipped: false, programs: PROGRAMS.length, verification };
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? "").href) {
  runIngestion().catch((error) => { console.error("[rise-tpo-ingest] fatal", error); process.exit(1); });
}
