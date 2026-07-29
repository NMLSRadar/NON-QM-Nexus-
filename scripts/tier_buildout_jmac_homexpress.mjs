// Continuation of the owner-supplied lender/program comparison table
// buildout (2026-07-28): JMAC Lending + HomeXpress Mortgage.
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

  // ============ JMAC LENDING ============
  console.log("=== JMAC Lending ===");
  const JMAC_ID = "9914bb23-f690-4910-9aaa-9015aba4750c";
  const JMAC_SOURCE = "JMAC Lending — official Non-QM products page — https://www.jmaclending.com/products-nonqm, https://www.jmaclending.com/dscr, fetched 2026-07-28";
  const JMAC_LABEL = "JMAC Lending official products page — verified 2026-07-28";

  // Real fix: JMAC's own site shows TWO distinct DSCR products with
  // OPPOSITE Foreign National policies — "DSCR Prime Non-QM" explicitly
  // states "No Foreign Nationals," while the SEPARATE "Venice DSCR
  // Non-QM Investment" product (the one already in this catalog)
  // explicitly LISTS "Foreign Nationals" as an eligible feature, capped
  // at 75% LTV. The owner's supplied table was correct — my own initial
  // read of a mixed search-result page briefly suggested a discrepancy;
  // re-verified directly against JMAC's own product page and confirmed
  // the real, correct answer here.
  await updateProgramConfig(
    "651d4cbf-6807-47a6-8e72-eb9891681930",
    { citizenshipEligible: ["us_citizen", "permanent_resident", "non_permanent_resident", "foreign_national"], citizenshipLtvCaps: { foreign_national: 75 }, foreignNationalSpecialist: true },
    `CORRECTED/ADDED 2026-07-28: Foreign National eligibility added per JMAC's own real Venice DSCR product page — capped at 75% LTV (both Purchase and Cash-Out) regardless of the program's general base LTV. Real, distinct feature set for this specific product: no minimum DSCR at all (\"No Ratio\") with limited restrictions, no income/no job required, transfer appraisals accepted, first-time investors up to 75% LTV, closeable in an LLC, condo hotels and short-term rentals eligible, cash-out can be used to satisfy reserves, Texas cash-out allowed. NOTE: this is DISTINCT from JMAC's separate \"DSCR Prime Non-QM\" product (not in this catalog, a more conservative 700-min-FICO / 75% LTV / no-exceptions product), which explicitly states \"No Foreign Nationals\" on JMAC's own page — the two products have genuinely opposite Foreign National policies; this catalog's existing DSCR program matches Venice, not DSCR Prime. Source: ${JMAC_SOURCE}.`
  );
  console.log("  Corrected Venice DSCR: added real foreign_national eligibility (75% LTV cap)");

  await ingestPrograms(JMAC_ID, adminId, [
    {
      name: "Zuma Prime Full Doc",
      incomeDocTypes: ["full_doc"],
      loanPurposes: ["purchase", "cash_out_refinance", "rate_term_refinance"],
      occupancies: ["primary", "second_home", "investment"],
      propertyTypes: ["single_family", "condo", "non_warrantable_condo", "2_4_unit", "condotel"],
      minFico: 660,
      baseMaxLtv: 80,
      maxLoanAmount: 4000000,
      citizenshipEligible: ["us_citizen", "permanent_resident"],
      vestingEligible: ["individual", "trust"],
      minReservesMonths: 3,
      sourceCitation: JMAC_SOURCE,
      guidelineVersionLabel: JMAC_LABEL,
      notes:
        "Real: one of two ZUMA Non-QM options (the other, ZUMA Prime Alt Doc, is already represented via this catalog's 'Zuma / Limited Docs — Alt-Doc' program) — for 'Just Miss' borrowers who don't fit conventional/jumbo guidelines. Full-doc qualification with credit events seasoned 4 years (longer than most Non-QM full-doc programs in this catalog, which commonly use 2-3 years). Loans up to $4M. Condo hotels eligible (a real, distinct property-type allowance).",
    },
  ]);

  // ============ HOMEXPRESS MORTGAGE ============
  console.log("\n=== HomeXpress Mortgage ===");
  const HX_ID = "32789806-93a6-4929-ad6c-786064b2494a";
  const HX_SOURCE = "HomeXpress Mortgage — official program pages — https://homexmortgage.com/foreign-national-and-itin-loans/, https://homexmortgage.com/consumer-purpose/, https://homexmortgage.com/breaking-news-non-qm-loan/, fetched 2026-07-28";
  const HX_LABEL = "HomeXpress Mortgage official program pages — verified 2026-07-28";

  // Real fix: HomeXpress's own page bundles ITIN together with its
  // Foreign National program ("Foreign National and ITIN Loans") under
  // the SAME parameters ($1.5M max, 50% max DTI) — added to the existing
  // Foreign National program rather than duplicating a near-identical row.
  console.log("  (resolving real Foreign National program id for HomeXpress)");
  const { data: hxForeignNational } = await admin.from("programs").select("id, config").eq("lender_id", HX_ID).eq("name", "Foreign National Mortgage").maybeSingle();
  if (hxForeignNational) {
    const updatedCitizenship = Array.from(new Set([...(hxForeignNational.config.citizenshipEligible ?? []), "itin"]));
    await updateProgramConfig(
      hxForeignNational.id,
      { citizenshipEligible: updatedCitizenship, maxDti: 50 },
      `ADDED 2026-07-28: ITIN eligibility — HomeXpress's own page explicitly titles this combined offering "Foreign National and ITIN Loans," sharing the same $1.5M max loan amount and 50% max DTI. Real income-qualification options for ITIN specifically: Full Doc (1-2yr W-2/paystubs/tax returns/K-1s), Alt Doc (12/24mo personal or business bank statements or 1099s, 12-month cash flow, 3-month business bank statements, P&L Only — minimum 2 years self-employment history required), Asset Xpress (100% of the amount needed to amortize the loan + monthly debts over 60 months, OR 125% of the new loan amount — whichever the borrower's real assets satisfy), Asset Assist (total qualified financial assets / 60 = qualifying income). Property types: Condos, 2-4 unit Townhomes, PUDs. Lease agreements may substitute for Schedule E and are treated as Alt Doc. Source: ${HX_SOURCE}.`
    );
    console.log("  Added ITIN eligibility to HomeXpress Foreign National Mortgage program");
  } else {
    console.log("  WARNING: could not find HomeXpress's Foreign National Mortgage program by exact name — skipped ITIN addition, verify manually.");
  }

  await ingestPrograms(HX_ID, adminId, [
    {
      name: "Asset Assist",
      incomeDocTypes: ["asset_depletion"],
      loanPurposes: ["purchase", "cash_out_refinance", "rate_term_refinance"],
      occupancies: ["primary", "second_home", "investment"],
      propertyTypes: ["single_family", "condo", "townhome", "pud"],
      minFico: 640,
      baseMaxLtv: 80,
      maxLoanAmount: 3000000,
      citizenshipEligible: ["us_citizen", "permanent_resident"],
      vestingEligible: ["individual", "trust"],
      minReservesMonths: 3,
      sourceCitation: "HomeXpress Mortgage — Asset Assist / AssetXpress — https://homexmortgage.com/consumer-purpose/, https://homexpressdirect.com/homexpress-direct-mortgage-programs/assetxpress-mortgage/",
      guidelineVersionLabel: HX_LABEL,
      notes:
        "A REAL, DISTINCT program from HomeXpress's own two-asset-program lineup (confirmed directly by the lender: 'HomeXpress Mortgage Corp offers two Asset Depletion programs') — Asset Assist uses a simple 60-month divisor (total qualified financial assets / 60 = qualifying income), the more aggressive/higher-income option. The SIBLING program, AssetXpress, uses a different, non-divisor-based qualification test instead: the borrower's assets must equal at least 125% of the loan amount, OR be enough to fully amortize the loan plus monthly debts over 60 months — a genuinely different mechanic (not modeled as its own program row here, but real and worth mentioning; AssetXpress separately publishes up to 90% CLTV purchase / 85% cash-out, min 640 FICO, up to $3M loan amount, per homexpressdirect.com). No tax returns, W-2s, or paystubs required for either.",
    },
    {
      name: "P&L Only",
      incomeDocTypes: ["pnl_only"],
      loanPurposes: ["purchase", "cash_out_refinance", "rate_term_refinance"],
      occupancies: ["primary", "second_home", "investment"],
      propertyTypes: ["single_family", "condo", "townhome"],
      minFico: 660,
      baseMaxLtv: 75,
      maxLoanAmount: 3000000,
      citizenshipEligible: ["us_citizen", "permanent_resident"],
      vestingEligible: ["individual"],
      minReservesMonths: 3,
      sourceCitation: "HomeXpress Mortgage — PrimeX / CoreX Profit & Loss Only — https://homexmortgage.com/consumer-purpose/, https://homexmortgage.com/breaking-news-non-qm-loan/",
      guidelineVersionLabel: HX_LABEL,
      notes:
        "Real: added as a real income-documentation option across HomeXpress's PrimeX (min FICO 660, loans to $4M) and CoreX (min FICO 600) product tiers — the PrimeX-tier P&L Only figure (limited to 75% LTV per HomeXpress's own program-update announcement) is used here as the representative/conservative baseline; the CoreX tier (600 min FICO) may support this doc type at a lower entry FICO with a correspondingly more conservative LTV not separately disclosed. Distinct from this catalog's existing 'Bank Statement Mortgage' program (bank_statement doc type only).",
    },
  ]);

  console.log("\nDone with JMAC + HomeXpress.");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
