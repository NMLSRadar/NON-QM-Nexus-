// Fixes a real bug: scripts/itin_lender_restriction_2026_07_29.mjs
// stripped "itin" from Program.citizenshipEligible for every program NOT
// on its hardcoded 7-name allowlist — but that allowlist used lender
// display names, and at least one real casualty was a straightforward
// name confusion ("LoanStream Mortgage" vs the allowlisted "LendSure
// Mortgage Corp." — two entirely different real lenders with similar-
// sounding names). The other 4 casualties (Brokers First Funding, A&D
// Mortgage, Angel Oak Mortgage Solutions, NQM Funding) are real ITIN
// programs this same session sourced and verified earlier, simply never
// added to that later script's allowlist. All 5 are restored here with
// their original, already-cited real sources — no new data is invented,
// only the incorrectly-stripped citizenship value is restored.
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

async function main() {
  const { data: programs } = await admin
    .from("programs")
    .select("id, name, lender_id, config")
    .eq("organization_id", PLATFORM_ORG)
    .eq("active", true)
    .eq("is_sample_data", false);
  const { data: lenders } = await admin.from("lenders").select("id, name").eq("organization_id", PLATFORM_ORG);
  const lenderName = Object.fromEntries(lenders.map((l) => [l.id, l.name]));

  const casualties = programs.filter((p) => (p.config.citizenshipEligible ?? []).length === 0);
  console.log(`Restoring itin citizenship on ${casualties.length} incorrectly-stripped program(s):`);
  for (const p of casualties) {
    const config = { ...p.config, citizenshipEligible: ["itin"] };
    const { error } = await admin.from("programs").update({ config }).eq("id", p.id);
    console.log(error ? `  FAILED: ${lenderName[p.lender_id]} — ${p.name}: ${error.message}` : `  Restored: ${lenderName[p.lender_id]} — ${p.name}`);
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
