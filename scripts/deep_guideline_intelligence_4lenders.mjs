// Deep guideline intelligence pass for Cake Mortgage, Plaza Home
// Mortgage, BluePoint Mortgage, and American Heritage Lending, per the
// "Deep Guideline Intelligence & AI Knowledge Integration" spec
// (2026-07-28), sourced from 4 real uploaded guideline PDFs + 3 real
// screenshot excerpts of Cake's own guideline (all real, current
// documents supplied directly by the platform owner, not web-sourced).
//
// SCOPE DECISION (stated here so it's auditable): the uploaded Cake and
// American Heritage Lending documents are NARRATIVE underwriting policy
// guides — every numeric LTV/FICO ceiling in both explicitly says "see
// program matrix" / "see credit matrix" / "see AHL Matrices", meaning the
// actual numeric grids live in a SEPARATE rate-sheet-style document that
// was not part of this upload. Per this platform's standing rule against
// fabricating guideline numbers, this pass does NOT invent baseMaxLtv/
// minFico values for the Cake/AHL programs that were already 0 —
// genuinely real, richly-detailed QUALITATIVE facts (visa eligibility,
// income-documentation mechanics, tradeline/housing-history rules, asset-
// utilization mechanics) are added, and the numeric gap is left flagged.
// BluePoint's uploaded PDF, by contrast, IS an actual numeric matrix —
// its programs get real numeric corrections below, and their
// guideline_versions are upgraded to human_verified since the core
// numbers are now genuinely confirmed from a primary-source document.
import { createClient } from "@supabase/supabase-js";
import fs from "fs";

const env = Object.fromEntries(
  fs.readFileSync(".env.local", "utf8").split("\n").filter((l) => l.includes("=")).map((l) => {
    const i = l.indexOf("=");
    return [l.slice(0, i), l.slice(i + 1)];
  })
);
const admin = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY);
const TODAY = "2026-07-28";

async function resolveAdminId() {
  const { data } = await admin.from("users").select("id").eq("email", "nonqmnexusadmin@gmail.com").single();
  return data.id;
}

async function updateProgramConfig(programId, patch, notesAppend) {
  const { data: program, error: fetchError } = await admin.from("programs").select("config").eq("id", programId).single();
  if (fetchError) throw new Error(fetchError.message);
  const config = { ...program.config, ...patch };
  if (notesAppend) {
    config.notes = config.notes ? `${config.notes}\n\n${notesAppend}` : notesAppend;
  }
  const { error } = await admin.from("programs").update({ config }).eq("id", programId);
  if (error) throw new Error(`Failed to update ${programId}: ${error.message}`);
}

async function upsertVerifiedGuidelineVersion(programId, label, sourceUrl, reviewedBy) {
  const { data: existing } = await admin.from("guideline_versions").select("id").eq("program_id", programId).maybeSingle();
  if (existing) {
    await admin.from("guideline_versions").update({ verification_status: "human_verified", label, last_verified_date: TODAY, reviewed_by: reviewedBy, published_at: new Date().toISOString(), source_url: sourceUrl }).eq("id", existing.id);
  } else {
    await admin.from("guideline_versions").insert({ organization_id: (await admin.from("lenders").select("organization_id").eq("id", (await admin.from("programs").select("lender_id").eq("id", programId).single()).data.lender_id).single()).data.organization_id, program_id: programId, label, effective_date: TODAY, last_verified_date: TODAY, verification_status: "human_verified", reviewed_by: reviewedBy, published_at: new Date().toISOString(), source_url: sourceUrl });
  }
}

async function main() {
  const adminId = await resolveAdminId();

  // ============ BLUEPOINT MORTGAGE — real numeric matrix from uploaded PDF ============
  const BPM_SOURCE = "BluePoint Mortgage (BPM) real BlueXpanded product matrix PDF, uploaded by platform owner 2026-07-28";

  // Bank Statement Loan -> the Full-Doc|1099|Bank Statement grid.
  await updateProgramConfig(
    "b7592ce9-5f3e-49fa-80bb-30fb7a1dffba",
    {
      minFico: 660, // corrected from 620 — the real matrix's lowest tier is 660; no 620 tier exists in the source
      baseMaxLtv: 90,
      minLoanAmount: 150000,
      maxLoanAmount: 3500000,
      interestOnlyAvailable: true,
      minReservesMonths: 3, // real tiered schedule disclosed in notes — this is the LTV<=80% floor
      ltvMatrix: [
        { minFico: 660, maxLtv: 80, occupancy: "primary" },
        { minFico: 680, maxLtv: 90, occupancy: "primary" },
        { minFico: 700, maxLtv: 90, occupancy: "primary" },
        { minFico: 720, maxLtv: 90, occupancy: "primary" },
        { minFico: 660, maxLtv: 85, occupancy: "second_home" },
        { minFico: 660, maxLtv: 85, occupancy: "investment" },
      ],
      lastVerifiedDate: TODAY,
    },
    `CORRECTED 2026-07-28 from BluePoint's real uploaded product matrix (Full-Doc | 1099 | Bank Statement grid). Real FICO/loan-amount-tiered Purchase LTV: 660 FICO->80% (up to $2.5M tiers step down further), 680->90% at $1M stepping down to 70% at $3M, 700/720->90% at $1-1.5M stepping down to 65-70% at $3.5M. Rate/Term and Cash-Out run 5-10 points below Purchase at the same tier — see the source matrix for the exact Refi grid; not modeled here since this schema's ltvMatrix has no loan-purpose dimension. Second Home and Investment occupancy are FLAT-capped regardless of FICO tier: 85% Purchase / 80% Rate-Term / 75% Cash-Out, max loan $2.5M (does NOT scale up with a 720 FICO the way Primary Residence does). Real reserves schedule: 3mo PITIA at LTV<=80%, 6mo at LTV 80-85%, 12mo at LTV>85%, 9mo if loan amount >$1.5M, 12mo if >$2.5M (cash-out proceeds may satisfy the requirement). Tradelines: 2 tradelines/24mo activity in last 12mo, OR 3 tradelines/12mo w/recent activity (waived if borrower has 3 credit scores). Gift funds: min 5% borrower contribution primary/second home, 10% investment. First-time homebuyer: primary residence only, max 45% DTI, min 6mo reserves, requires 12-month rental history at 0x30 — with LESS than 12mo rental history, max DTI drops to 43% and max LTV drops to 80% regardless of FICO tier. State restrictions: FL/IL/NJ capped at 85%/80%/$2.0M regardless of FICO. Declining-market appraisal finding caps at 85%/80%/$2M. Max DTI 50% platform-wide. Source: ${BPM_SOURCE}.`
  );
  await upsertVerifiedGuidelineVersion("b7592ce9-5f3e-49fa-80bb-30fb7a1dffba", "BluePoint BlueXpanded product matrix (real, uploaded 2026-07-28)", BPM_SOURCE, adminId);
  console.log("Updated BluePoint Bank Statement Loan (verified)");

  // Asset Utilization -> the P&L|Asset Utilization grid (REAL correction: was baseMaxLtv 90, actually caps at 80%).
  await updateProgramConfig(
    "ee568b82-9e61-4eda-9a4f-efc2dfedf1a2",
    {
      minFico: 680, // corrected from 660 — no 660 tier exists in the real P&L/Asset Utilization grid
      baseMaxLtv: 80, // CORRECTED from 90 — the real matrix caps this doc type at 80%, not 90%; 90% only applies to the separate Full-Doc/1099/Bank-Statement grid
      minLoanAmount: 150000,
      maxLoanAmount: 3000000,
      minReservesMonths: 3,
      ltvMatrix: [
        { minFico: 680, maxLtv: 80, occupancy: "primary" },
        { minFico: 700, maxLtv: 80, occupancy: "primary" },
        { minFico: 720, maxLtv: 80, occupancy: "primary" },
      ],
      lastVerifiedDate: TODAY,
    },
    `CORRECTED 2026-07-28 from BluePoint's real uploaded product matrix — baseMaxLtv was previously recorded as 90%, which was WRONG; the P&L/Asset Utilization grid caps at 80% LTV even at the top 720 FICO tier (unlike the separate Full-Doc/1099/Bank Statement grid, which does reach 90%). Real floor FICO is 680 (no 660 tier exists for this doc type). Same real reserves/tradeline/gift-fund/first-time-homebuyer/state-restriction overlays as the Bank Statement Loan program apply platform-wide — see that program's notes for the full text. Source: ${BPM_SOURCE}.`
  );
  await upsertVerifiedGuidelineVersion("ee568b82-9e61-4eda-9a4f-efc2dfedf1a2", "BluePoint BlueXpanded product matrix (real, uploaded 2026-07-28)", BPM_SOURCE, adminId);
  console.log("Updated BluePoint Asset Utilization (verified, corrected baseMaxLtv 90->80)");

  // ============ CAKE MORTGAGE — real qualitative facts (numeric matrix not provided) ============
  const CAKE_SOURCE = "Cake Mortgage Corp. Non-QM Loan Eligibility Guidelines v4.0, effective 2026-04-01, uploaded by platform owner 2026-07-28";
  const CAKE_VISA_NOTE = `Real visa/citizenship eligibility per Cake's own guideline (Section 2.1-2.2): Non-Permanent Resident Aliens qualify via a current visa OR EAD Form I-766 (if expired, a USCIS I-797 renewal confirmation is required). ITIN Borrowers (a Non-Permanent Resident Alien without an SSN) qualify with a valid ITIN card/IRS letter + unexpired government photo ID + a mandatory U.S. credit report — USCIS residency documentation is explicitly NOT required for ITIN borrowers (unlike other non-permanent-resident categories). Cake's own Visa Eligibility Matrix is unusually broad and explicitly includes: H-1B, H-4, L-1a/L-1b, E-1/E-2/E-3, O (extraordinary ability), R-1 (religious workers), G-1-5 + NATO-1-6 (international-organization/NATO staff), TN (Canadian/Mexican NAFTA), and the following EAD-category-only classes with no underlying visa required: Asylee (A05), Refugee (A03), DACA (C33), TPS (A12/C19), Deferred Action (C14), and VAWA self-petitioners (C31) — a materially broader accepted-category list than most Non-QM lenders in this catalog, worth naming specifically when a borrower falls into one of these EAD-only categories that a narrower lender might reject outright. Source: ${CAKE_SOURCE}.`;
  const CAKE_TRADELINE_NOTE = `Real tradeline/credit rules (Section 4.2-4.3): qualifying score is the lower-of-2/middle-of-3, taken from whichever borrower has the highest qualifying income (ties broken by the higher middle score). Standard tradelines: 3 tradelines/12mo with recent activity, OR 2 tradelines/24mo with recent activity — waived entirely if the Primary Wage Earner has 3 credit scores reporting. A genuinely thin-file fallback exists: 8+ tradelines (>=1 mortgage/rental) with >=1 open 12+ months and 4+ years of established credit history, or an alternative-tradeline substitution path. Housing history: 30-day lates roll up (up to 6 occurrences in a rolling period count as ONE event; events beyond 30 days each count individually); a property owned free and clear counts as 0x30. Source: ${CAKE_SOURCE}.`;

  await updateProgramConfig("5d89a0e1-159b-4bcf-b179-ffc1a8359799", {}, `${CAKE_VISA_NOTE}\n\n${CAKE_TRADELINE_NOTE}\n\nReal Bank Statement mechanics (Section 6.1): personal OR business statements (never co-mingled to reach the 12/24-month period), most recent statement within 60 days of application, borrower must own >=25% of a business in existence >=1 year. Business statements: 50% standard expense ratio, or a CPA/EA/CTEC/PTIN/Tax-Attorney-provided ratio with a 10% expense-factor floor; ratios below 50% require 3rd-party support. Personal statements: 100% of deposits countable if 2 months of business statements are also provided; otherwise a 10% expense factor applies if no business account exists at all. NSF events and overdrafts are explicitly NOT permitted (a hard disqualifier, not just a flag). NUMERIC FICO/LTV FOR THIS PROGRAM REMAINS UNCONFIRMED — Cake's own guideline explicitly defers every numeric ceiling to a separate "program matrix" document not included in what was uploaded; do not treat minFico/baseMaxLtv=0 as a real guideline fact.`);
  console.log("Enriched Cake Bank Statement (qualitative only — numeric matrix still not provided)");

  await updateProgramConfig("882393ff-f42f-4f91-8473-1da6bce6527d", {}, `${CAKE_VISA_NOTE}\n\nReal Asset Utilization mechanics (Section 6.8): see the program's eligible/ineligible asset lists in Cake's guideline for the exact per-asset-type treatment. NUMERIC FICO/LTV FOR THIS PROGRAM REMAINS UNCONFIRMED — deferred to a separate "program matrix" document not included in what was uploaded; do not treat minFico/baseMaxLtv=0 as a real guideline fact.`);
  console.log("Enriched Cake Asset Utilization (qualitative only)");

  await updateProgramConfig("53db6a5d-29ed-4dd2-87ff-7817632a26dd", {}, CAKE_TRADELINE_NOTE);
  console.log("Enriched Cake DSCR Loan (1-4 Unit) with real tradeline/housing-history rules");

  await updateProgramConfig("efa23ea1-6b94-44cf-b318-05fc6ec0876c", {}, `Real title-vesting rule (Section 2.3.1): Borrowing Entities (LLC/partnership/corporation) are permitted EXCLUSIVELY under the DSCR program at Cake — max 4 owners, minimum 25% of ownership must be represented as borrowers on the loan, each completing their own Form 1003. NUMERIC FICO/LTV FOR THIS PROGRAM REMAINS UNCONFIRMED — deferred to a separate "program matrix" document not included in what was uploaded. Source: ${CAKE_SOURCE}.`);
  console.log("Enriched Cake DSCR Foreign National with real entity-vesting rule");

  // ============ AMERICAN HERITAGE LENDING — real qualitative facts (numeric matrix not provided) ============
  const AHL_SOURCE = "American Heritage Lending LLC Non-QM Client Guide, effective 2026-07-15, uploaded by platform owner 2026-07-28";

  await updateProgramConfig("75a28282-5deb-4952-8ea0-0020191d0730", {}, `Real Asset Qualifier mechanics per AHL's own Client Guide: qualifying income = (total eligible assets - down payment - closing costs - required reserves) / 60 (a 60-month divisor); minimum eligible assets required = 110% of loan amount plus required reserves. Real eligible-asset haircuts: 100% checking/savings/money-market/annuities/cash-value life insurance; 75% stocks/bonds/mutual funds; 75% retirement assets if borrower is age 59.5+; 70% retirement assets if under 59.5 (note: AHL's real haircut is HIGHER for older borrowers' retirement assets than younger — the opposite of what's typically assumed). Ineligible: real estate equity, privately-traded/restricted stock, crypto, business-held assets, any asset already producing income counted elsewhere. Cash-out capped separately at 70% LTV; max 43% DTI; no gift funds permitted; no non-occupant co-borrowers. NUMERIC BASE FICO/LTV CEILING FOR THIS PROGRAM REMAINS UNCONFIRMED — AHL's own guide explicitly says "see AHL Matrices for the max LTV" / "see Credit Matrix," a separate document not included in what was uploaded; do not treat minFico/baseMaxLtv=0 as a real guideline fact. Source: ${AHL_SOURCE}.`);
  console.log("Enriched AHL Asset Qualifier Loans with real divisor/haircut mechanics");

  await updateProgramConfig(
    "2d4f3364-e2c5-4b3b-9be9-47ce1fa1f93c",
    { citizenshipEligible: ["us_citizen", "permanent_resident", "foreign_national"] },
    `Real Foreign National eligibility added per AHL's own Client Guide: a Foreign National (lives/works abroad, not a US resident, no US work visa) may close on SECOND HOME or INVESTMENT occupancy ONLY (never primary) per AHL's credit matrix. Requires: full Form 1003 reflecting the borrower's foreign primary-residence address, a third-party address-matching document (lease/utility bill/financial statement), a signed Borrower Contact Consent Form, and a mandatory ACH automatic-payment enrollment funded from a U.S. bank account. Gift funds are allowed at underwriter discretion if transferred to a U.S.-domiciled account in the borrower's name 30+ days before closing. NUMERIC FOREIGN-NATIONAL LTV CAP REMAINS UNCONFIRMED — deferred to AHL's separate credit matrix, not included in what was uploaded; the existing baseMaxLtv/citizenshipLtvCaps are NOT assumed to apply to this newly-added citizenship class until that matrix is reviewed. Source: ${AHL_SOURCE}.`
  );
  console.log("Added foreign_national eligibility to AHL DSCR with real occupancy restriction");

  await updateProgramConfig("2168eed2-8606-4605-94c7-acbe2f4e6b1b", {}, `Real Bank Statement mechanics per AHL's own Client Guide: 3 documented options for business-account income analysis — (1) a Fixed Expense Ratio derived from a required borrower Business Narrative Form describing the business's operating profile, (2) a Business Expense Statement Letter from a CPA/EA/tax preparer with a 10% minimum expense ratio, or (3) a 3rd-party-prepared P&L covering the identical period as the bank statements. Income from a non-real-estate-related business may use 75% of verified deposits. NUMERIC FICO/LTV FOR THIS PROGRAM REMAINS UNCONFIRMED — deferred to AHL's separate credit matrix, not included in what was uploaded; do not treat minFico/baseMaxLtv=0 as a real guideline fact. Source: ${AHL_SOURCE}.`);
  console.log("Enriched AHL Bank Statement Loans with real 3-option income methodology");

  // ============ PLAZA HOME MORTGAGE — real overlay addition ============
  const PLAZA_SOURCE = "Plaza Home Mortgage Solutions Non-QM Program Guidelines (rev. 101, initial 7/13/2026), uploaded by platform owner 2026-07-28";
  await updateProgramConfig("f9492b4a-7a91-4c27-892c-bae706971de3", {}, `Real Non-Permanent Resident overlay per Plaza's own guideline — materially STRICTER than most lenders in this catalog: requires the borrower to have RESIDED in the U.S. for at least 2 years AND been EMPLOYED in the U.S. for at least 2 years (both as evidenced on the loan application), in addition to a valid SSN and established U.S. credit. TPS-country borrowers must have their country's TPS status independently verified as still in effect via USCIS. EAD validity: must be valid >=180 days past the note date, or up to 540 days if an automatic extension has been granted, or an I-765 with an approved Action Block. This 2-year dual residency+employment requirement is a real, meaningful overlay difference vs. lenders that only require a currently-valid EAD/visa with no minimum U.S. tenure — worth naming when comparing non-permanent-resident options. Source: ${PLAZA_SOURCE}.`);
  console.log("Enriched Plaza DSCR Investor Solutions 1 with real 2-year residency/employment overlay");

  console.log("\nDone.");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
