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
const TODAY = "2026-07-27";

async function resolveAdminId() {
  const { data } = await admin.from("users").select("id").eq("email", "nonqmnexusadmin@gmail.com").single();
  return data.id;
}

async function insertProgram(createdBy, lenderId, name, sourceCitation, versionLabel, p) {
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
    minLoanAmount: p.minLoanAmount,
    propertyTypes: p.propertyTypes,
    eligibleStates: "ALL",
    incomeDocTypes: p.incomeDocTypes,
    sourceCitation,
    vestingEligible: p.vestingEligible,
    lastVerifiedDate: TODAY,
    minReservesMonths: p.minReservesMonths ?? 0,
    citizenshipEligible: p.citizenshipEligible,
    guidelineVersionLabel: versionLabel,
    interestOnlyAvailable: p.interestOnlyAvailable ?? false,
    prepaymentPenaltyOptions: p.prepaymentPenaltyOptions ?? ["none"],
    notes: p.notes,
    ...(p.minDscr !== undefined ? { minDscr: p.minDscr } : {}),
  };
  const { error } = await admin.from("programs").insert({
    organization_id: PLATFORM_ORG,
    lender_id: lenderId,
    name,
    is_sample_data: false,
    active: true,
    config,
    created_by: createdBy,
  });
  if (error) console.error(`Failed to insert ${name}:`, error.message);
  else console.log(`Inserted: ${name}`);
}

async function main() {
  const createdBy = await resolveAdminId();
  const plazaId = "7ca8a948-f531-4a33-891b-9009f59ce7e0";
  const uwmId = "b5d1e213-5784-4f68-99eb-574e53192eca";
  const velocityId = "0c31567b-b8f3-4df1-b59c-7bf01952ee9a";

  // --- Plaza Home Mortgage ---
  await insertProgram(createdBy, plazaId, "Solutions Non-QM 4 — Bank Statement / 1099 / Asset Utilization", "Plaza Home Mortgage — Solutions Non-QM 4 Program Guidelines — https://news.plazahomemortgage.com/hubfs/Program%20Updates/Solutions%20Non-QM%204%20Program%20Guidelines%2012.8.25.pdf", "Plaza Home Mortgage Solutions Non-QM 4 Program Guidelines (12.8.25) — verified 2026-07-27", {
    incomeDocTypes: ["bank_statement", "1099", "asset_depletion"],
    loanPurposes: ["purchase", "rate_term_refinance", "cash_out_refinance"],
    occupancies: ["primary", "second_home", "investment"],
    propertyTypes: ["single_family", "condo", "townhome"],
    minFico: 0,
    baseMaxLtv: 85,
    minLoanAmount: 100000,
    maxLoanAmount: 3000000,
    interestOnlyAvailable: true,
    citizenshipEligible: ["us_citizen", "permanent_resident"],
    vestingEligible: ["individual", "trust"],
    notes:
      "Personal or business bank statements (12 or 24 month), 1099, or Asset Utilization all qualify under this one program. LTVs to 85% with no mortgage insurance; DTI to 50%; interest-only and fully amortized products both available. Asset Utilization specifics: minimum $250,000 in post-close eligible assets; eligible asset factors are 100% checking/savings/money market/U.S. Treasuries under 1 year and life insurance cash surrender value, 80% stocks/bonds/mutual funds, 80% retirement assets (59.5+), 70% retirement assets (under 59.5); qualifying income = (total eligible assets minus down payment minus closing costs minus required reserves) divided by 84. Plaza's own guideline explicitly excludes Foreign Nationals, entities/corporations/partnerships, non-revocable trusts, land trusts, and persons without a Social Security number (ITIN-only borrowers are NOT eligible). Plaza separately publishes a higher-leverage 'Solutions Non-QM 3' tier (up to 90% LTV, no MI, 55% DTI on 24-month standard doc) covering the same doc types at different LTV/FICO combinations — not added as a separate row here; the 85%/50% figures above reflect Solutions Non-QM 4 specifically.",
  });

  // --- RCN Capital: intentionally NOT adding new program rows beyond the
  // existing Long-Term Rental Loan Program already in this catalog. RCN's
  // remaining real published products (Fix & Flip/ARV loans, Multi-Family
  // bridge financing, Rental Portfolio Loans for institutional investors)
  // are business-purpose, asset/project-based commercial financing
  // qualified on after-repair value, rehab scope, or portfolio scale
  // rather than any income-documentation type — the same reasoning
  // already applied to CoreVest Finance (batch 10) and LendingOne
  // (batch 12).
  console.log("RCN Capital: no new program rows added (remaining products are fix-and-flip/bridge/portfolio commercial financing, out of schema scope).");

  // --- Stratton Equities: intentionally NOT adding new program rows
  // beyond the existing DSCR program already in this catalog. Stratton is
  // fundamentally a hard-money/private-money asset-based lender for
  // investment and commercial properties; its other real published
  // products (No-Income-Verification/Stated-Income loans, NO-DOC
  // Commercial Loans, Hard Money loans) are marketing pages with no
  // published numeric LTV/FICO matrix captured in this pass, and several
  // (NO-DOC Commercial) apply to commercial property types outside this
  // platform's residential-focused schema.
  console.log("Stratton Equities: no new program rows added (remaining products are asset-based/no-doc private money loans with no published matrix figures found).");

  // --- United Wholesale Mortgage ---
  await insertProgram(createdBy, uwmId, "Bank Statement Loan Program", "United Wholesale Mortgage — press coverage (HousingWire, National Mortgage Professional) — https://www.housingwire.com/articles/uwm-rolls-out-bank-statement-borrower-loans/", "UWM Bank Statement Loan Program (per press coverage) — verified 2026-07-27", {
    incomeDocTypes: ["bank_statement"],
    loanPurposes: ["purchase", "rate_term_refinance", "cash_out_refinance"],
    occupancies: ["primary", "second_home", "investment"],
    propertyTypes: ["single_family", "condo", "townhome"],
    minFico: 0,
    baseMaxLtv: 90,
    minLoanAmount: 100000,
    maxLoanAmount: 3000000,
    citizenshipEligible: ["us_citizen", "permanent_resident"],
    vestingEligible: ["individual", "trust"],
    notes:
      "Same data-quality caveat already disclosed for this lender's existing DSCR program: sourced from press coverage (HousingWire, National Mortgage Professional, Inside Mortgage Finance) rather than UWM's own published matrix, since UWM's broker-facing rate sheets require an approved-broker login. Personal or business bank statements accepted for self-employed borrowers only, in lieu of tax transcripts/income documents. Loans up to $3,000,000, up to 90% LTV, no mortgage insurance required. UWM has since expanded this into four color-coded variants (Bank Statement Blue, Yellow, Pink, and Orange per National Mortgage Professional's coverage) with slightly different qualifying requirements per variant — those per-variant figures were not individually confirmed in this pass; the $3M/90%/no-MI figures above are UWM's original published headline figures for the program as a whole.",
  });

  // --- Velocity Mortgage Capital ---
  await insertProgram(createdBy, velocityId, "Foreign Investor Program", "Velocity Mortgage Capital — Mortgage Programs — https://www.velocitymortgage.com/mortgage-programs/", "Velocity Mortgage Capital program page (figures per HardMoneyHome.com lending-guidelines summary) — verified 2026-07-27", {
    incomeDocTypes: ["dscr"],
    loanPurposes: ["purchase", "rate_term_refinance", "cash_out_refinance"],
    occupancies: ["investment"],
    propertyTypes: ["single_family", "condo", "townhome", "2_4_unit"],
    minFico: 0,
    baseMaxLtv: 75,
    minLoanAmount: 75000,
    maxLoanAmount: 5000000,
    interestOnlyAvailable: true,
    citizenshipEligible: ["foreign_national"],
    vestingEligible: ["individual", "llc"],
    notes:
      "Confirmed real via Velocity's own site ('Our Foreign Investor program is specifically designed for foreign investors who are seeking investment properties in the U.S.') — a direct portfolio/asset-based lender, qualifying on the investment property's revenue-generating potential rather than the borrower's personal income or tax returns (no income, no asset, no tax verification to the borrower, per third-party lending-guideline summaries). Velocity's own program page did not publish a specific LTV/FICO/loan-amount matrix for this product distinctly from its general investment-property loan lineup — figures above are carried over from Velocity's general Investment Property Loan tier ($75,000-$5,000,000, max 75% LTV) per a third-party guideline summary (hardmoneyhome.com), not Velocity's own page directly; confirm current Foreign Investor-specific figures with a Velocity account executive before quoting to a borrower.",
  });
  await insertProgram(createdBy, velocityId, "Bank Statement / Stated Income", "Velocity Mortgage Capital — Mortgage Programs — https://www.velocitymortgage.com/mortgage-programs/", "Velocity Mortgage Capital program page (figures per HardMoneyHome.com lending-guidelines summary) — verified 2026-07-27", {
    incomeDocTypes: ["bank_statement"],
    loanPurposes: ["purchase", "rate_term_refinance", "cash_out_refinance"],
    occupancies: ["investment"],
    propertyTypes: ["single_family", "condo", "townhome", "2_4_unit"],
    minFico: 650,
    baseMaxLtv: 75,
    minLoanAmount: 75000,
    maxLoanAmount: 5000000,
    citizenshipEligible: ["us_citizen", "permanent_resident"],
    vestingEligible: ["individual", "llc"],
    notes:
      "Confirmed as a real, distinct Velocity product line (per an independent lender-directory profile listing Velocity's full program menu: Jumbo, Interest Only, Non-Owner Occupied, Portfolio, Credit-Challenged, Self-Employed, Bank Statement/Stated Income, Foreign National, Private Money). Velocity is fundamentally an asset-based direct portfolio lender for self-employed real estate investors and small business owners who have difficulty verifying personal income. Figures above are carried over from Velocity's general Investment Property Loan tier per a third-party guideline summary (hardmoneyhome.com) rather than a Velocity-published matrix specific to this named product — confirm current figures with a Velocity account executive before quoting to a borrower.",
  });

  console.log("Batch 14 complete.");
}

main().catch((err) => {
  console.error("FATAL", err.message);
  process.exit(1);
});
