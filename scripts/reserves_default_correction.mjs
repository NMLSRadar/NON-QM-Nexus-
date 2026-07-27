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

// Per direct guidance from the platform's licensed domain expert: a genuine
// "0 months reserves" is rare in real Non-QM lending — most programs
// require somewhere from 3 to 9 months, with larger loan amounts (above
// $2.5M) commonly requiring up to 12 months. minReservesMonths=0 was
// previously used both for (a) a small number of genuinely confirmed
// zero-reserve programs (disclosed as such in their notes — e.g. Acra's
// "No Reserve Options", ARDRI's "No Reserve Options") and (b) as a silent
// placeholder for "not disclosed by the source," which is misleading since
// it displays identically to a real confirmed zero. This corrects ONLY
// the silent/undisclosed group with a tiered default by loan amount,
// leaving the small number of genuinely-confirmed-zero programs untouched.
function tieredDefaultReserves(maxLoanAmount) {
  if (typeof maxLoanAmount !== "number") return 6; // no loan-amount tier to key off; use the middle of the general 3-9 range
  if (maxLoanAmount > 2_500_000) return 12;
  if (maxLoanAmount > 1_000_000) return 6;
  return 3;
}

async function main() {
  const { data: programs, error } = await admin
    .from("programs")
    .select("id, name, lender_id, config")
    .eq("organization_id", PLATFORM_ORG)
    .eq("active", true)
    .eq("is_sample_data", false);
  if (error) throw error;

  const CONFIRMED_ZERO_PATTERN = /no reserve|reserves? (?:are )?(?:not|n't) required|no reserves? options?|no reserve requirement/i;

  let corrected = 0;
  let skippedConfirmedZero = 0;
  let skippedNonZero = 0;

  for (const p of programs) {
    const currentReserves = p.config.minReservesMonths ?? 0;
    if (currentReserves !== 0) {
      skippedNonZero++;
      continue;
    }
    if (CONFIRMED_ZERO_PATTERN.test(p.config.notes || "")) {
      skippedConfirmedZero++;
      continue;
    }
    const defaultReserves = tieredDefaultReserves(p.config.maxLoanAmount);
    const { error: updateErr } = await admin
      .from("programs")
      .update({
        config: {
          ...p.config,
          minReservesMonths: defaultReserves,
          lastVerifiedDate: TODAY,
          notes:
            (p.config.notes ? p.config.notes + " " : "") +
            `RESERVES CORRECTED 2026-07-27: this program's real source did not disclose a specific reserves figure, and it had been left at 0 months — per direct guidance from the platform's licensed domain expert that a genuine zero-reserve program is rare in real Non-QM lending, this is now a disclosed DEFAULT ASSUMPTION of ${defaultReserves} months (tiered by this program's max loan amount: 3 months up to $1M, 6 months $1-2.5M, 12 months above $2.5M) rather than a misleading 0. Confirm the lender's actual current reserves requirement before quoting to a borrower.`,
        },
      })
      .eq("id", p.id);
    if (updateErr) {
      console.error(`Failed to update ${p.name}:`, updateErr.message);
      continue;
    }
    corrected++;
  }

  console.log(`Corrected (silent 0 -> tiered default): ${corrected}`);
  console.log(`Skipped (already non-zero): ${skippedNonZero}`);
  console.log(`Skipped (confirmed real zero, left untouched): ${skippedConfirmedZero}`);
}

main().catch((err) => {
  console.error("FATAL", err.message);
  process.exit(1);
});
