import { createClient } from "@supabase/supabase-js";
import Papa from "papaparse";
import fs from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";

export const PLATFORM_ORG = "bfe87b1c-86e7-4186-b1c4-ecc25d0e4420";
export const IMPORTED_ON = "2026-08-22";
export const SOURCE_URL = "https://mtg.broker/app/lenders";
export const SOURCE_FILE = path.resolve("data/mtg-broker-new-nonqm-programs-2026-08-22.csv");
export const EXPECTED_LENDERS = 74;
export const EXPECTED_PROGRAMS = 385;

function loadEnv() {
  const env = { ...process.env };
  for (const filename of [".env.production.local", ".env.vercel-link.local", ".env.local", "/home/nexus/.env.local", ".env"]) {
    if (!fs.existsSync(filename)) continue;
    for (const line of fs.readFileSync(filename, "utf8").split(/\r?\n/)) {
      const match = /^([A-Z0-9_]+)=(.*)$/.exec(line.trim());
      if (!match || env[match[1]]) continue;
      env[match[1]] = match[2].replace(/^['"]|['"]$/g, "");
    }
    if (env.NEXT_PUBLIC_SUPABASE_URL && env.SUPABASE_SERVICE_ROLE_KEY) break;
  }
  return env;
}

const split = (value) => String(value ?? "").split(";").map((item) => item.trim()).filter(Boolean);
const normalize = (value) => String(value ?? "")
  .toLowerCase()
  .replace(/\+/g, "plus")
  .replace(/-/g, "minus")
  .replace(/[^a-z0-9]+/g, "");
const numberOrUndefined = (value) => {
  const parsed = Number(String(value ?? "").replace(/[$,%\s]/g, ""));
  return Number.isFinite(parsed) && String(value ?? "").trim() !== "" ? parsed : undefined;
};
const boolOrUndefined = (value) => {
  const normalized = String(value ?? "").trim().toLowerCase();
  if (["yes", "true", "y", "1", "allowed"].includes(normalized)) return true;
  if (["no", "false", "n", "0", "not allowed"].includes(normalized)) return false;
  return undefined;
};
const compact = (value) => Object.fromEntries(Object.entries(value).filter(([, item]) => item !== undefined && item !== ""));

function parseCsv() {
  const parsed = Papa.parse(fs.readFileSync(SOURCE_FILE, "utf8"), { header: true, skipEmptyLines: true });
  if (parsed.errors.length) throw new Error(`CSV parse failed: ${parsed.errors[0].message}`);
  const rows = parsed.data;
  const lenders = new Set(rows.map((row) => row.lender));
  const keys = new Set(rows.map((row) => `${normalize(row.lender)}:${normalize(row.program_name)}`));
  if (rows.length !== EXPECTED_PROGRAMS) throw new Error(`Expected ${EXPECTED_PROGRAMS} programs, found ${rows.length}`);
  if (lenders.size !== EXPECTED_LENDERS) throw new Error(`Expected ${EXPECTED_LENDERS} lenders, found ${lenders.size}`);
  if (keys.size !== rows.length) throw new Error(`Duplicate lender/program keys detected: ${rows.length - keys.size}`);
  return rows;
}

function incomeDocTypes(row) {
  const categories = new Set(split(row.categories));
  const result = [];
  // P&L-only is its own income-document method. Never merge it into a
  // bank-statement config even when the source record carries both tags.
  if (categories.has("pnl_only")) return ["pnl_only"];
  if (categories.has("bank_statement")) result.push("bank_statement");
  if (categories.has("dscr") || categories.has("5_8_unit_dscr") || categories.has("no_ratio")) result.push("dscr");
  if (categories.has("asset_depletion")) result.push("asset_depletion");
  if (!result.length) result.push("full_doc");
  return [...new Set(result)];
}

function loanPurposes(row) {
  const result = [];
  for (const label of split(row.loan_purposes)) {
    const value = label.toLowerCase();
    if (value === "purchase") result.push("purchase");
    else if (value.includes("rate term")) result.push("rate_term_refinance");
    else if (value.includes("cash out")) result.push("cash_out_refinance");
    else if (value.includes("equity loan")) result.push("second_lien");
  }
  const categories = split(row.categories);
  if (categories.includes("heloc")) result.push("heloc");
  if (categories.includes("second_lien") && !result.includes("heloc")) result.push("second_lien");
  return [...new Set(result)];
}

function occupancies(row) {
  const result = [];
  for (const label of split(row.occupancies)) {
    const value = label.toLowerCase();
    if (value === "primary") result.push("primary");
    else if (value.includes("2nd") || value.includes("second")) result.push("second_home");
    else if (value.includes("investment")) result.push("investment");
  }
  return [...new Set(result)];
}

function propertyTypes(row) {
  const result = [];
  for (const label of split(row.nexus_eligible_property_types || row.property_types)) {
    const value = label.toLowerCase();
    if (value.includes("1 unit") || value.includes("sfr") || value.includes("single family")) result.push("single_family");
    if (value.includes("non-warrantable")) result.push("non_warrantable_condo");
    else if (value.includes("condo") && !value.includes("condotel")) result.push("condo");
    if (value.includes("townhome")) result.push("townhome");
    if (value.includes("2 unit") || value.includes("3-4") || value.includes("2-4")) result.push("2_4_unit");
    if (value.includes("5-8")) result.push("5_8_unit");
    if (value.includes("pud")) result.push("pud");
    if (value.includes("manufactured")) result.push("manufactured");
    if (value.includes("rural")) result.push("rural");
    if (value.includes("condotel")) result.push("condotel");
  }
  if (split(row.categories).includes("5_8_unit_dscr")) result.push("5_8_unit");
  return [...new Set(result)];
}

function eligibleStates(row) {
  const states = split(row.states_available)
    .map((label) => /\(([A-Z]{2})\)/.exec(label)?.[1])
    .filter(Boolean);
  return [...new Set(states)];
}

function citizenshipEligible(row) {
  const result = ["us_citizen", "permanent_resident", "non_permanent_resident"];
  const categories = split(row.categories);
  if (categories.includes("itin") || boolOrUndefined(row.itin_allowed) === true) result.push("itin");
  if (boolOrUndefined(row.foreign_national_eligible) === true) result.push("foreign_national");
  return [...new Set(result)];
}

function buildConfig(row) {
  const ltvValues = [row.max_ltv_purchase, row.max_ltv_rate_term, row.max_ltv_cash_out, row.max_cltv]
    .map(numberOrUndefined)
    .filter((value) => value !== undefined);
  const sourceMaxLtv = ltvValues.length ? Math.max(...ltvValues) : undefined;
  const baseMaxLtv = sourceMaxLtv === undefined ? undefined : Math.min(sourceMaxLtv, 90);
  const categories = split(row.categories);
  const matrixDate = row.matrix_date || IMPORTED_ON;
  const primarySource = row.matrix_url || row.guidelines_url || SOURCE_URL;

  return compact({
    incomeDocTypes: incomeDocTypes(row),
    loanPurposes: loanPurposes(row),
    occupancies: occupancies(row),
    propertyTypes: propertyTypes(row),
    eligibleStates: eligibleStates(row),
    citizenshipEligible: citizenshipEligible(row),
    vestingEligible: [],
    prepaymentPenaltyOptions: [],
    minLoanAmount: numberOrUndefined(row.min_loan_amount),
    maxLoanAmount: numberOrUndefined(row.max_loan_amount),
    minFico: numberOrUndefined(row.min_fico),
    maxDti: numberOrUndefined(row.max_dti),
    minDscr: numberOrUndefined(row.min_dscr),
    baseMaxLtv,
    propertyTypeLtvCaps: {
      condo: Math.min(numberOrUndefined(row.nexus_warrantable_condo_ltv_cap) ?? 85, 85),
      non_warrantable_condo: Math.min(numberOrUndefined(row.nexus_nonwarrantable_condo_ltv_cap) ?? 80, 80),
    },
    minDownPercent: 10,
    lienPosition: categories.includes("heloc") || categories.includes("second_lien") ? "standalone_second" : "first",
    firstTimeHomebuyerAllowed: boolOrUndefined(row.first_time_homebuyer_allowed),
    firstTimeInvestorAllowed: boolOrUndefined(row.first_time_investor_allowed),
    giftFundsAllowed: boolOrUndefined(row.gift_funds_allowed),
    ruralAllowed: boolOrUndefined(row.rural_allowed),
    bankStatementMonths: numberOrUndefined(row.bank_statement_months),
    pnlMonths: numberOrUndefined(row.pnl_months),
    pnlTaxReturnsRequired: categories.includes("pnl_only") ? false : undefined,
    pnlPreparerAttestationPurpose: categories.includes("pnl_only")
      ? "Confirms tax filing only; the P&L is the income document."
      : undefined,
    guidelineVersionLabel: `Mtg.Broker extraction ${matrixDate} — pending review`,
    effectiveDate: matrixDate,
    lastVerifiedDate: row.matrix_last_checked_date || IMPORTED_ON,
    sourceCitation: `${row.program_name} — ${primarySource}`,
    importStatus: "imported_pending_review",
    importSource: SOURCE_URL,
    importRecordId: row.mtg_broker_record_id,
    sourceCategories: categories,
    sourceLoanProduct: row.mtg_broker_loan_product,
    sourceData: row,
  });
}

async function resolveAdmin(admin) {
  const { data, error } = await admin.from("users").select("id").eq("email", "nonqmnexusadmin@gmail.com").maybeSingle();
  if (error || !data) throw new Error(`Unable to resolve platform admin: ${error?.message ?? "not found"}`);
  return data.id;
}

async function resolveLender(admin, adminId, name) {
  const { data, error } = await admin.from("lenders").select("id,name").eq("organization_id", PLATFORM_ORG).is("deleted_at", null);
  if (error) throw new Error(error.message);
  const match = (data ?? []).find((row) => normalize(row.name) === normalize(name));
  if (match) {
    const updated = await admin.from("lenders").update({ active: true, is_sample_data: false }).eq("id", match.id);
    if (updated.error) throw new Error(`Update lender ${name}: ${updated.error.message}`);
    return match.id;
  }
  const created = await admin.from("lenders").insert({
    organization_id: PLATFORM_ORG,
    name,
    is_sample_data: false,
    active: true,
    tier_level: 3,
    created_by: adminId,
    notes: `Mtg.Broker residential NON-QM catalog import ${IMPORTED_ON}. Program details remain pending human guideline review.`,
  }).select("id").single();
  if (created.error) throw new Error(`Create lender ${name}: ${created.error.message}`);
  return created.data.id;
}

async function upsertProgram(admin, adminId, lenderId, row) {
  const config = buildConfig(row);
  const { data: current, error } = await admin.from("programs").select("id,name,version").eq("lender_id", lenderId).is("deleted_at", null);
  if (error) throw new Error(error.message);
  const match = (current ?? []).find((item) => normalize(item.name) === normalize(row.program_name));
  let programId;
  if (match) {
    programId = match.id;
    const updated = await admin.from("programs").update({
      name: row.program_name,
      active: true,
      is_sample_data: false,
      config,
      version: (match.version ?? 0) + 1,
    }).eq("id", programId);
    if (updated.error) throw new Error(`Update program ${row.lender} / ${row.program_name}: ${updated.error.message}`);
  } else {
    const created = await admin.from("programs").insert({
      organization_id: PLATFORM_ORG,
      lender_id: lenderId,
      name: row.program_name,
      is_sample_data: false,
      active: true,
      config,
      created_by: adminId,
    }).select("id").single();
    if (created.error) throw new Error(`Create program ${row.lender} / ${row.program_name}: ${created.error.message}`);
    programId = created.data.id;
  }

  const label = `Mtg.Broker ${row.mtg_broker_record_id} — ${IMPORTED_ON}`;
  const guideline = {
    organization_id: PLATFORM_ORG,
    program_id: programId,
    label,
    effective_date: row.matrix_date || IMPORTED_ON,
    last_verified_date: row.matrix_last_checked_date || IMPORTED_ON,
    verification_status: "imported_pending_review",
    reviewed_by: null,
    published_at: null,
    source_url: row.matrix_url || row.guidelines_url || SOURCE_URL,
    last_checked_at: new Date().toISOString(),
    change_detected: true,
  };
  const existing = await admin.from("guideline_versions").select("id").eq("program_id", programId).eq("label", label).maybeSingle();
  if (existing.error) throw new Error(`Read guideline ${row.program_name}: ${existing.error.message}`);
  const saved = existing.data
    ? await admin.from("guideline_versions").update(guideline).eq("id", existing.data.id)
    : await admin.from("guideline_versions").insert(guideline);
  if (saved.error) throw new Error(`Save guideline ${row.program_name}: ${saved.error.message}`);
}

export function dryRun() {
  const rows = parseCsv();
  return {
    lenderCount: new Set(rows.map((row) => row.lender)).size,
    programCount: rows.length,
    pendingReviewCount: rows.filter((row) => row.review_status === "source_extracted_not_human_verified").length,
    programs: rows.map((row) => ({ lender: row.lender, name: row.program_name, config: buildConfig(row) })),
  };
}

export async function runIngestion() {
  const rows = parseCsv();
  const env = loadEnv();
  if (!env.NEXT_PUBLIC_SUPABASE_URL || !env.SUPABASE_SERVICE_ROLE_KEY || env.NEXT_PUBLIC_SUPABASE_URL === "[SENSITIVE]") {
    return { skipped: true, lenders: 0, programs: 0 };
  }
  const admin = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const adminId = await resolveAdmin(admin);
  const byLender = new Map();
  for (const row of rows) {
    const items = byLender.get(row.lender) ?? [];
    items.push(row);
    byLender.set(row.lender, items);
  }
  let importedPrograms = 0;
  for (const [lender, items] of byLender) {
    const lenderId = await resolveLender(admin, adminId, lender);
    for (const row of items) {
      await upsertProgram(admin, adminId, lenderId, row);
      importedPrograms += 1;
    }
    console.log(`[mtg-broker] ${lender}: ${items.length} pending-review programs`);
  }
  console.log(`[mtg-broker] complete: ${byLender.size} lenders, ${importedPrograms} programs`);
  return { skipped: false, lenders: byLender.size, programs: importedPrograms };
}

if (process.argv.includes("--dry-run")) {
  console.log(JSON.stringify(dryRun(), null, 2));
} else if (import.meta.url === pathToFileURL(process.argv[1] ?? "").href) {
  runIngestion().catch((error) => {
    console.error("[mtg-broker] fatal", error);
    process.exit(1);
  });
}
