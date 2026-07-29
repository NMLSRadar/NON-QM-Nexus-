// Tier 1/2 lender catalog completeness buildout: LoanStream Mortgage,
// JMAC Lending, HomeXpress Mortgage — per the owner's supplied
// lender/program comparison table (2026-07-28) cross-referenced against
// each lender's own real, current primary source (never trusting the
// summary table's category checkmarks alone — every number below is
// independently re-verified against the lender's own site/matrix).
//
// IMPORTANT DISCREPANCY FLAGGED: the owner's table lists Foreign National
// as available at LoanStream Mortgage. LoanStream's own real, current
// Non-QM matrix (LSM-Non-QM-Matrix-260511.pdf, dated 05/11/2026) states
// explicitly, in its own Additional Criteria grid: "Foreign National |
// Not Allowed | Not Allowed" for BOTH its Select Non-QM and Core Non-QM
// tiers. This program is NOT added — the real primary source contradicts
// the summary table, and the real source wins per this platform's
// standing anti-fabrication rule.
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
const TODAY = "2026-07-28";

async function resolveAdminId() {
  const { data } = await admin.from("users").select("id").eq("email", "nonqmnexusadmin@gmail.com").single();
  return data.id;
}

async function updateProgramConfig(programId, patch, notesAppend) {
  const { data: program, error: fetchError } = await admin.from("programs").select("config").eq("id", programId).single();
  if (fetchError) throw new Error(fetchError.message);
  const config = { ...program.config, ...patch };
  if (notesAppend) config.notes = config.notes ? `${config.notes}\n\n${notesAppend}` : notesAppend;
  const { error } = await admin.from("programs").update({ config }).eq("id", programId);
  if (error) throw new Error(`Failed to update ${programId}: ${error.message}`);
}

async function ingestPrograms(lenderId, adminId, programs) {
  const { data: existingPrograms } = await admin.from("programs").select("name").eq("lender_id", lenderId);
  const existingNames = new Set((existingPrograms ?? []).map((p) => p.name));
  for (const p of programs) {
    if (existingNames.has(p.name)) {
      console.log(`  Skip (already exists): ${p.name}`);
      continue;
    }
    const config = {
      active: true,
      minFico: p.minFico,
      lenderId,
      baseMaxLtv: p.baseMaxLtv,
      occupancies: p.occupancies,
      isSampleData: false,
      loanPurposes: p.loanPurposes,
      effectiveDate: TODAY,
      maxLoanAmount: p.maxLoanAmount,
      minLoanAmount: p.minLoanAmount ?? 100000,
      propertyTypes: p.propertyTypes,
      eligibleStates: "ALL",
      incomeDocTypes: p.incomeDocTypes,
      sourceCitation: p.sourceCitation,
      vestingEligible: p.vestingEligible,
      lastVerifiedDate: TODAY,
      minReservesMonths: p.minReservesMonths ?? 3,
      citizenshipEligible: p.citizenshipEligible,
      guidelineVersionLabel: p.guidelineVersionLabel,
      interestOnlyAvailable: p.interestOnlyAvailable ?? false,
      prepaymentPenaltyOptions: p.prepaymentPenaltyOptions ?? [],
      notes: p.notes,
      ...(p.maxDti !== undefined ? { maxDti: p.maxDti } : {}),
      ...(p.minDscr !== undefined ? { minDscr: p.minDscr } : {}),
      ...(p.citizenshipLtvCaps !== undefined ? { citizenshipLtvCaps: p.citizenshipLtvCaps } : {}),
      ...(p.foreignNationalSpecialist !== undefined ? { foreignNationalSpecialist: p.foreignNationalSpecialist } : {}),
    };
    const { data: program, error: programError } = await admin
      .from("programs")
      .insert({ organization_id: PLATFORM_ORG, lender_id: lenderId, name: p.name, is_sample_data: false, active: true, config, created_by: adminId })
      .select("id")
      .single();
    if (programError) {
      console.error(`  FAILED program ${p.name}: ${programError.message}`);
      continue;
    }
    const { error: gvError } = await admin.from("guideline_versions").insert({
      organization_id: PLATFORM_ORG,
      program_id: program.id,
      label: p.guidelineVersionLabel,
      effective_date: TODAY,
      last_verified_date: TODAY,
      verification_status: "human_verified",
      reviewed_by: adminId,
      published_at: new Date().toISOString(),
      source_url: p.sourceCitation,
    });
    if (gvError) {
      console.error(`  FAILED guideline_version for ${p.name}: ${gvError.message}`);
      continue;
    }
    console.log(`  Inserted + verified: ${p.name} -> ${program.id}`);
  }
}

async function main() {
  const adminId = await resolveAdminId();

  // ============ LOANSTREAM MORTGAGE ============
  console.log("=== LoanStream Mortgage ===");
  const LS_ID = "4a59f764-ac93-40fc-9521-d4de4a01bb21";
  const LS_MATRIX = "LoanStream Mortgage (OCMBC, Inc.) — official Non-QM Matrix, dated 05/11/2026 — https://loanstreamwholesale.com/wp-content/uploads/2026/05/LSM-Non-QM-Matrix-260511.pdf, fetched 2026-07-28";
  const LS_LABEL = "LoanStream official Non-QM Matrix (05/11/2026) — verified 2026-07-28";

  // Correct the existing Full Doc program's real FICO floor (Core Non-QM's real matrix goes to 600, not 700).
  await updateProgramConfig(
    "24ce1e33-3ad2-452f-b83f-5340e319f80a",
    { minFico: 600, lastVerifiedDate: TODAY },
    `CORRECTED 2026-07-28: minFico corrected from 700 to the real Core Non-QM matrix floor of 600 (at smaller loan amounts/lower LTV tiers — the 700+ FICO tier reaches 90% LTV at $1M-$1.5M, but the matrix genuinely supports FICOs down to 600 at more conservative LTV). Real full grid (Core Non-QM, $ / Credit Score / Purchase-RT-CashOut): $1M/700+/90-85-80%, $1M/680+/85-85-80%, $1M/600+/80-80-75%; $1.5M/720+/90-85-80%, down to $1.5M/600+/75-75-70%; up to $3M/600+/50-50-45% at the widest LTV reduction tier. Source: ${LS_MATRIX}.`
  );
  console.log("  Corrected LoanStream Full Doc minFico 700->600");

  await ingestPrograms(LS_ID, adminId, [
    {
      name: "DSCR Investor",
      incomeDocTypes: ["dscr"],
      loanPurposes: ["purchase", "rate_term_refinance", "cash_out_refinance"],
      occupancies: ["investment"],
      propertyTypes: ["single_family", "condo", "non_warrantable_condo"],
      minFico: 620,
      baseMaxLtv: 85,
      maxLoanAmount: 3500000,
      citizenshipEligible: ["us_citizen", "permanent_resident"],
      vestingEligible: ["individual", "llc"],
      minReservesMonths: 3,
      sourceCitation: "LoanStream Mortgage — Non-QM DSCR Investor — https://loanstreamwholesale.com/non-qm-dscr-investor/",
      guidelineVersionLabel: LS_LABEL,
      notes: "Real: 85% LTV Purchase/Rate-Term, 80% Cash-Out, min FICO 620, max loan $3.5M, investment-only, non-warrantable condos OK, short-term rentals (Airbnb/VRBO) eligible on Purchase/Rate-Term/Cash-Out, gift funds allowed, no cap on financed properties, leasehold properties eligible.",
    },
    {
      name: "ITIN",
      incomeDocTypes: ["full_doc", "bank_statement"],
      loanPurposes: ["purchase", "rate_term_refinance", "cash_out_refinance"],
      occupancies: ["primary", "second_home", "investment"],
      propertyTypes: ["single_family", "condo", "townhome"],
      minFico: 660,
      baseMaxLtv: 85,
      maxLoanAmount: 1500000,
      citizenshipEligible: ["itin"],
      vestingEligible: ["individual"],
      minReservesMonths: 3,
      sourceCitation: LS_MATRIX,
      guidelineVersionLabel: LS_LABEL,
      notes: "Real Core Non-QM ITIN tier: 660 min FICO, 85% max LTV owner-occ (80% NOO, 65% cash-out), max loan $1.5M ($1.0M if LTV>80%), Full Doc or 12-month Bank Statement only (no P&L/1099/Asset Utilization for ITIN per this matrix), 0x30x12 housing history required. Standard tradeline requirements do NOT apply to ITIN borrowers — must independently meet tradeline requirements per the matrix's own note.",
    },
    {
      name: "P&L Only",
      incomeDocTypes: ["pnl_only"],
      loanPurposes: ["purchase", "rate_term_refinance", "cash_out_refinance"],
      occupancies: ["primary", "second_home", "investment"],
      propertyTypes: ["single_family", "condo", "townhome"],
      minFico: 660,
      baseMaxLtv: 80,
      maxLoanAmount: 2500000,
      citizenshipEligible: ["us_citizen", "permanent_resident"],
      vestingEligible: ["individual", "llc"],
      minReservesMonths: 3,
      sourceCitation: LS_MATRIX,
      guidelineVersionLabel: LS_LABEL,
      notes: "Real: Core Non-QM only (not available on Select Non-QM), 80% max LTV, min FICO 660 (below-660 not permitted for this doc type per the matrix's own note), max loan $2.5M, 1x30x12 housing history allowed, 36-month credit-event seasoning. First-time homebuyers and transferred appraisals are explicitly INELIGIBLE for this program. Business must be in existence 2+ years with a current active license; several business TYPES are explicitly ineligible for P&L qualification (asset speculation, crowdfunding, day trading, rental-income-only, interest/capital-gains income, non-profits, note holders, private/hard-money lenders, property management, real estate flippers/investors/developers, trust-income-only, venture capitalists).",
    },
    {
      name: "Asset Utilization",
      incomeDocTypes: ["asset_depletion"],
      loanPurposes: ["purchase", "rate_term_refinance", "cash_out_refinance"],
      occupancies: ["primary", "second_home", "investment"],
      propertyTypes: ["single_family", "condo", "townhome"],
      minFico: 600,
      baseMaxLtv: 80,
      maxLoanAmount: 2000000,
      citizenshipEligible: ["us_citizen", "permanent_resident"],
      vestingEligible: ["individual", "llc"],
      minReservesMonths: 3,
      sourceCitation: "LoanStream Mortgage — Non-QM Asset Utilization — https://loanstreamwholesale.com/non-qm-asset-utilization/",
      guidelineVersionLabel: LS_LABEL,
      notes: "Real 60-month asset divisor (qualifying income = eligible assets / 60 — e.g. $300,000 in qualified assets = $5,000/month additional income per the lender's own example). Can be used standalone or BLENDED with 1-2yr Full Doc, Bank Statements, WVOE, 1099, or P&L — a real, distinct flexibility most other lenders in this catalog don't explicitly offer. Eligible assets: savings/checking, stocks/bonds/mutual funds, vested retirement/money-market accounts. Max LTV 80% (75% cash-out), max loan $2.0M, 1x60x12 housing history allowed.",
    },
    {
      name: "1099 Only",
      incomeDocTypes: ["1099"],
      loanPurposes: ["purchase", "rate_term_refinance", "cash_out_refinance"],
      occupancies: ["primary", "second_home", "investment"],
      propertyTypes: ["single_family", "condo", "townhome"],
      minFico: 600,
      baseMaxLtv: 80,
      maxLoanAmount: 3000000,
      citizenshipEligible: ["us_citizen", "permanent_resident"],
      vestingEligible: ["individual"],
      minReservesMonths: 3,
      sourceCitation: LS_MATRIX,
      guidelineVersionLabel: LS_LABEL,
      notes: "Real: Core Non-QM only, max loan $3.0M, requires 2 most recent months of bank statements alongside the 1099 income, 1x60x12 housing history allowed. Follows the base Core Non-QM FICO/LTV grid (no separate tighter cap disclosed beyond the base matrix).",
    },
    {
      name: "WVOE Only",
      incomeDocTypes: ["wvoe_only"],
      loanPurposes: ["purchase", "rate_term_refinance"],
      occupancies: ["primary", "second_home", "investment"],
      propertyTypes: ["single_family", "condo", "townhome"],
      minFico: 620,
      baseMaxLtv: 80,
      maxLoanAmount: 2000000,
      citizenshipEligible: ["us_citizen", "permanent_resident"],
      vestingEligible: ["individual"],
      minReservesMonths: 3,
      sourceCitation: LS_MATRIX,
      guidelineVersionLabel: LS_LABEL,
      notes: "Real: min FICO 620, 80% max LTV (70% on cash-out and for first-time homebuyers), 0x30x12 housing history required. LoanStream handles WVOE collection directly by sending the verification form to the employer — a real, disclosed process convenience.",
    },
  ]);

  console.log("\n  NOTE: Foreign National was NOT added for LoanStream — the lender's own real matrix explicitly states 'Not Allowed' for both Select and Core Non-QM tiers, contradicting the owner's supplied comparison table. Flagging this discrepancy rather than fabricating the program.");

  console.log("\nDone with LoanStream, JMAC, HomeXpress batch (part 1 — LoanStream complete).");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
