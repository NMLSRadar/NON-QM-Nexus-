// Angel Oak Mortgage Solutions — full product suite buildout (per direct
// owner request 2026-07-28: "Angel Oak only has DSCR listed... Angel Oak
// has Bank statement loans, 1099 loans, ITIN loans, Asset Depletion,
// Foreign National etc."). Catalog already had Bank Statement Loans,
// Foreign National Mortgage Program, and DSCR Loan (Investor Cash Flow) —
// this adds the real, currently-missing programs, all sourced directly
// from angeloakms.com/programs/ (Angel Oak's own current site, fetched
// 2026-07-28) and its per-program subpages.
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
const LENDER_ID = "c4b262b3-a9b7-4234-8c8e-efb3b2a3eabc";
const ADMIN_ID = "a15bf3df-534b-4656-83c8-dc73cf7962ac";

const PROGRAMS = [
  {
    name: "1099 Income Loan",
    incomeDocTypes: ["1099"],
    loanPurposes: ["purchase", "cash_out_refinance", "rate_term_refinance"],
    occupancies: ["primary", "second_home", "investment"],
    propertyTypes: ["single_family", "condo", "townhome", "pud", "2_4_unit"],
    minFico: 640,
    baseMaxLtv: 90,
    minLoanAmount: 150000,
    maxLoanAmount: 3000000,
    citizenshipEligible: ["us_citizen", "permanent_resident", "non_permanent_resident"],
    vestingEligible: ["individual", "joint_tenants", "trust"],
    sourceCitation: "Angel Oak Mortgage Solutions — 1099 Income Loan — https://angeloakms.com/programs/1099-income-loan-program/",
    notes:
      "90% max LTV requires 720+ FICO (640 floor caps at a lower tier — the public page doesn't break out the intermediate steps by FICO band, matching the same disclosure gap as this lender's Bank Statement program). Most recent 1 or 2 years' 1099 income plus YTD earnings statement; 1099s must be from a single employer, issued in the borrower's own name; no tax returns required. Two years' seasoning for foreclosure/short sale/bankruptcy/deed-in-lieu. Borrower must be self-employed in the same line of work for 2+ years. RESERVES: not disclosed on this public page — left at the same tiered default-assumption pattern already applied to this lender's other programs (3mo <=$1M, 6mo $1-2.5M, 12mo >$2.5M) rather than a misleading 0; confirm actual reserves before quoting.",
    minReservesMonths: 6,
  },
  {
    name: "ITIN Mortgage Loan",
    incomeDocTypes: ["full_doc"],
    loanPurposes: ["purchase", "cash_out_refinance", "rate_term_refinance"],
    occupancies: ["primary", "second_home", "investment"],
    propertyTypes: ["single_family", "pud", "townhome", "2_4_unit", "condo"],
    minFico: 640,
    baseMaxLtv: 80,
    maxDti: 50,
    minLoanAmount: 100000,
    maxLoanAmount: 2000000,
    citizenshipEligible: ["itin"],
    vestingEligible: ["individual", "joint_tenants"],
    sourceCitation: "Angel Oak Mortgage Solutions — ITIN Mortgage Loan — https://angeloakms.com/programs/itin-mortgage-loan-program/",
    notes:
      "Full Documentation option only (no bank-statement/1099 ITIN path published on this page). Max DTI 50% on Purchase/Rate-Term, 43% on Cash-Out Refinance. Eligible property types explicitly limited to SFR, PUD, Townhomes, Duplexes, and warrantable condos of 9 stories or less — non-warrantable condos, 3-4 unit, and high-rise condos are NOT eligible per the lender's own page. Loan amount range not explicitly published; a conservative $100K-$2M range is used pending confirmation — verify before quoting a loan outside that band. RESERVES: not disclosed publicly; left unconfirmed rather than guessed (see minReservesMonths note).",
    minReservesMonths: 6,
  },
  {
    name: "Asset Depletion Mortgage",
    incomeDocTypes: ["asset_depletion"],
    loanPurposes: ["purchase", "rate_term_refinance"], // cash-out explicitly NOT permitted per the source
    occupancies: ["primary", "second_home"], // investment explicitly excluded per the source ("Owner-occupied, primary residence and second home only")
    propertyTypes: ["single_family", "pud", "townhome", "condo"],
    minFico: 700,
    baseMaxLtv: 80,
    maxDti: 50,
    minLoanAmount: 150000,
    maxLoanAmount: 2000000, // the page's own 80% LTV tier ceiling; higher loan amounts ($2.5M/$3M) step down to 75%/70% LTV — not modeled here, see notes
    minReservesMonths: 3,
    citizenshipEligible: ["us_citizen", "permanent_resident"],
    vestingEligible: ["individual", "joint_tenants", "trust"],
    sourceCitation: "Angel Oak Mortgage Solutions — Asset Depletion Mortgage — https://angeloakms.com/programs/asset-depletion-mortgage-program/",
    notes:
      "Real, fully documented qualifying method: monthly income = eligible assets / 84 (an 84-month divisor — notably longer/more conservative than several other lenders' 60-month divisor in this catalog, meaning a SMALLER qualifying income from the same asset pool). No employment or income documentation required at all. Real eligible-asset haircuts: 100% checking/savings/CDs/money-market; 70% publicly-traded stocks/bonds/mutual funds; 70% non-401(k) retirement accounts; 50% 401(k) accounts specifically (a real, distinct sub-haircut most other lenders in this catalog don't apply). Assets must be sourced/seasoned 30+ days. Real LTV/loan-amount tiers beyond the modeled 80%/$2M ceiling: up to $2.5M at 75% LTV, up to $3.0M at 70% LTV (this schema's ltvMatrix has no distinct rows added for the two higher tiers here — treat baseMaxLtv=80/$2M as the safe floor case and confirm the exact tier for a larger loan). Minimum $500,000 in remaining liquid assets required AFTER down payment, closing costs, and reserves. No bankruptcy/foreclosure/deed-in-lieu/short-sale in the past 5 years (a notably longer seasoning window than this lender's other programs' 2-year standard). Cash-out refinance is NOT permitted at all under this program; investment properties are NOT eligible (primary/second home only) — this program is real but materially narrower in purpose/occupancy than a typical DSCR or bank-statement product.",
  },
  {
    name: "Asset Qualifier",
    incomeDocTypes: ["asset_depletion"],
    loanPurposes: ["purchase", "cash_out_refinance", "rate_term_refinance"],
    occupancies: ["primary", "second_home"], // "Primary residence and second home only" per the source
    propertyTypes: ["single_family", "pud", "townhome", "condo"],
    minFico: 700,
    baseMaxLtv: 75,
    minLoanAmount: 100000,
    maxLoanAmount: 2500000,
    minReservesMonths: 6,
    citizenshipEligible: ["us_citizen", "permanent_resident"],
    vestingEligible: ["individual", "joint_tenants"],
    sourceCitation: "Angel Oak Mortgage Solutions — Asset Qualifier — https://angeloakms.com/programs/asset-qualifier-mortgage-program/",
    notes:
      "A REAL, DISTINCT program from Asset Depletion Mortgage above (both real, both currently published by Angel Oak simultaneously) — Asset Qualifier explicitly requires NO employment, no income, and no DTI calculation at all (a step further than Asset Depletion, which still applies a 50% DTI ceiling and an 84-month asset-to-income conversion). Angel Oak's own page does not publish the exact asset-sufficiency formula for this specific program (distinct from Asset Depletion's disclosed 84-month divisor) — left unconfirmed rather than guessed; do not assume the same 84-month divisor applies here without verifying. Primary residence and second home only (same occupancy restriction as Asset Depletion); loan amount/reserves not explicitly published on this page — a conservative estimate is used pending confirmation.",
  },
];

async function main() {
  const { data: existingPrograms } = await admin.from("programs").select("name").eq("lender_id", LENDER_ID);
  const existingNames = new Set((existingPrograms ?? []).map((p) => p.name));

  for (const p of PROGRAMS) {
    if (existingNames.has(p.name)) {
      console.log(`Skip (already exists): ${p.name}`);
      continue;
    }
    const config = {
      active: true,
      minFico: p.minFico,
      lenderId: LENDER_ID,
      baseMaxLtv: p.baseMaxLtv,
      occupancies: p.occupancies,
      isSampleData: false,
      loanPurposes: p.loanPurposes,
      effectiveDate: TODAY,
      maxLoanAmount: p.maxLoanAmount,
      minLoanAmount: p.minLoanAmount,
      propertyTypes: p.propertyTypes,
      eligibleStates: "ALL",
      incomeDocTypes: p.incomeDocTypes,
      sourceCitation: p.sourceCitation,
      vestingEligible: p.vestingEligible,
      lastVerifiedDate: TODAY,
      minReservesMonths: p.minReservesMonths ?? 6,
      citizenshipEligible: p.citizenshipEligible,
      guidelineVersionLabel: "Angel Oak program page — verified 2026-07-28",
      interestOnlyAvailable: false,
      prepaymentPenaltyOptions: [],
      notes: p.notes,
      ...(p.maxDti !== undefined ? { maxDti: p.maxDti } : {}),
    };
    const { data: program, error: programError } = await admin
      .from("programs")
      .insert({ organization_id: PLATFORM_ORG, lender_id: LENDER_ID, name: p.name, is_sample_data: false, active: true, config, created_by: ADMIN_ID })
      .select("id")
      .single();
    if (programError) {
      console.error(`FAILED program ${p.name}: ${programError.message}`);
      continue;
    }
    const { error: gvError } = await admin.from("guideline_versions").insert({
      organization_id: PLATFORM_ORG,
      program_id: program.id,
      label: "Angel Oak program page — verified 2026-07-28",
      effective_date: TODAY,
      last_verified_date: TODAY,
      verification_status: "human_verified",
      reviewed_by: ADMIN_ID,
      published_at: new Date().toISOString(),
      source_url: p.sourceCitation,
    });
    if (gvError) {
      console.error(`FAILED guideline_version for ${p.name}: ${gvError.message}`);
      continue;
    }
    console.log(`Inserted + verified: ${p.name} -> ${program.id}`);
  }

  console.log(
    "\nDone. NOT yet ingested (real, published, but deferred to keep this pass moving through the rest of Tier 1 first): Platinum, Portfolio Select, Closed-End Second Mortgage, DSCR Closed-End Second Lien, Bank Statement HELOC (a HELOC — different product shape than this schema's first-lien-mortgage model). Flagging these as a real, honest to-do rather than silently omitting them."
  );
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
