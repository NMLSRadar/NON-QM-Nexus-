// ITIN DSCR Update (2026-07-29 spec): sets the new itinDscrEligible /
// itinNoRatioEligible / investmentItinEligible / ownerOccupiedItinEligible
// fields on programs whose real, already-verified guideline data was
// re-confirmed this pass. Never invents a combination — every program
// touched here already had its ITIN+DSCR eligibility directly documented
// in its own real, cited source (see each program's existing notes/
// sourceCitation, unchanged by this script).
import { createClient } from "@supabase/supabase-js";
import fs from "fs";

const env = Object.fromEntries(
  fs.readFileSync(".env.local", "utf8").split("\n").filter((l) => l.includes("=")).map((l) => {
    const i = l.indexOf("=");
    return [l.slice(0, i), l.slice(i + 1)];
  })
);
const admin = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY);

async function setFields(programId, patch, label) {
  const { data: existing, error: readError } = await admin.from("programs").select("config").eq("id", programId).single();
  if (readError) { console.error(`FAILED reading ${label}: ${readError.message}`); return; }
  const config = { ...existing.config, ...patch };
  const { error } = await admin.from("programs").update({ config }).eq("id", programId);
  console.log(error ? `FAILED updating ${label}: ${error.message}` : `Updated: ${label}`);
}

async function main() {
  // GreenBox Loans — "ITIN – DSCR" (investment-only, real matrix source
  // already cited: greenboxloans.com/gbl-programs/).
  await setFields(
    "5e198ec5-7966-4d85-8152-7dd229fd00d8",
    { itinDscrEligible: true, investmentItinEligible: true, ownerOccupiedItinEligible: false },
    "GreenBox Loans — ITIN – DSCR",
  );

  // Acra Lending — "Platinum DSCR Program" (real matrix already documents
  // ITIN eligibility with its own distinct citizenshipLtvCaps.itin=70
  // override, confirming the combination is real and matrix-sourced, not
  // merely two unrelated facts co-existing on the same row).
  await setFields(
    "63c9ddb5-ac63-4ce5-9b57-744225187e8d",
    { itinDscrEligible: true, investmentItinEligible: true, ownerOccupiedItinEligible: false },
    "Acra Lending — Platinum DSCR Program",
  );

  // Champions Funding — "ITIN Accelerator (DSCR)" (investment-only, real
  // source: champstpo.com/programs — distinct from Champions' separate
  // owner-occupied "ITIN Activator" program, which is NOT a DSCR product
  // and is correctly left untouched here).
  await setFields(
    "e4b15d88-5c0a-4e74-abcb-d4171f0a45b4",
    { itinDscrEligible: true, itinNoRatioEligible: true, investmentItinEligible: true, ownerOccupiedItinEligible: false },
    "Champions Funding — ITIN Accelerator (DSCR)",
  );
}

async function setNqm() {
  const { data: program } = await admin
    .from("programs")
    .select("id,config")
    .eq("lender_id", "294929ca-b14a-412e-b7df-28d7efc0d2b4")
    .eq("name", "Investor DSCR")
    .single();
  const config = {
    ...program.config,
    itinDscrEligible: false,
    itinNoRatioEligible: false,
    notes:
      (program.config.notes ?? "") +
      " ITIN DSCR COMBINATION EXPLICITLY DENIED (confirmed 2026-07-29): NQM Funding's own real, current Non-QM Flex Guidelines (effective 11.01.2024) state \"Loans to borrowers who have been issued an Individual Tax Identification Number (ITIN) in lieu of a Social Security number are ineligible\" for this Investor DSCR program — ITIN and DSCR are separate, non-combinable product lines at NQM Funding. NQM's own separate ITIN program page/matrix confirms its ITIN doc types are Full Documentation, Bank Statement, 1099, and Asset Utilization only — DSCR is never listed. Source: NQM Funding, LLC Non-QM Flex Guidelines (eff. 11.01.2024) and https://www.nqmf.com/products/itin/, both fetched 2026-07-29.",
  };
  const { error } = await admin.from("programs").update({ config }).eq("id", program.id);
  console.log(error ? `FAILED updating NQM Investor DSCR: ${error.message}` : "Updated: NQM Funding — Investor DSCR (itinDscrEligible=false, real denial confirmed)");
}

main()
  .then(setNqm)
  .catch((err) => {
    console.error(err);
    process.exit(1);
  });
