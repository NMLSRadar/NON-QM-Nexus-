// Tags the 4 real standalone second-mortgage/HELOAN programs already in
// the catalog with lienPosition: "standalone_second", so they are no
// longer indistinguishable from an ordinary first-lien cash-out-refinance
// program in the matching engine (see baseChecks.ts's new lien-position
// hard check, 2026-07-29).
import { createClient } from "@supabase/supabase-js";
import fs from "fs";

const env = Object.fromEntries(
  fs.readFileSync(".env.local", "utf8").split("\n").filter((l) => l.includes("=")).map((l) => {
    const i = l.indexOf("=");
    return [l.slice(0, i), l.slice(i + 1)];
  })
);
const admin = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY);

const STANDALONE_SECOND_PROGRAM_IDS = [
  "6a0a6221-293c-4ac9-965d-41511eaebb2a", // GreenBox Loans — CES — Full Doc / Bank Statement / P&L Only (Second Lien)
  "0316f799-e6cc-48fe-a32f-274617423468", // FundLoans — Aspire — Standalone Second Mortgage
  "2765d7a1-0665-4d51-8bc0-539a75d3307a", // FundLoans — Aspire X — Standalone Second Mortgage
  "d5f8734a-7cea-4c64-856d-45531e1b50a0", // Verus Mortgage Capital — Closed End Second Program
];

async function main() {
  for (const id of STANDALONE_SECOND_PROGRAM_IDS) {
    const { data: program, error: readError } = await admin.from("programs").select("id,name,config").eq("id", id).single();
    if (readError) { console.error(`FAILED reading ${id}: ${readError.message}`); continue; }
    const config = { ...program.config, lienPosition: "standalone_second" };
    const { error } = await admin.from("programs").update({ config }).eq("id", id);
    console.log(error ? `FAILED: ${program.name}: ${error.message}` : `Tagged standalone_second: ${program.name}`);
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
