// Structures an ALREADY-CITED real fact into the noFicoPolicy field the
// matching engine actually reads — no new source, no new claim. ACC
// Mortgage's ITIN Mortgage Program notes (recorded 2026-07-xx, citation:
// https://accmortgage.com/itin-mortgage-program/) already state
// explicitly: "credit scores down to 620 or NO SCORE ALLOWED" — this is
// an unambiguous, real, cited confirmation that this program accepts a
// no-FICO borrower, but the structured noFicoPolicy field the matching
// engine (baseChecks.ts) actually reads was never populated. GreenBox
// Loans and Champions Funding's comparable notes only say the lender
// "publishes no minimum FICO requirement" / "does not state a minimum" —
// genuinely ambiguous (could mean "unpublished," not "explicitly no-FICO-
// eligible") and are deliberately NOT touched here; they stay
// unconfirmed/manual-review per the platform's anti-fabrication rule.
import { createClient } from "@supabase/supabase-js";
import fs from "fs";

const env = Object.fromEntries(
  fs.readFileSync(".env.local", "utf8").split("\n").filter((l) => l.includes("=")).map((l) => {
    const i = l.indexOf("=");
    return [l.slice(0, i), l.slice(i + 1)];
  })
);
const admin = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY);

const ACC_ITIN_PROGRAM_ID_QUERY = await admin
  .from("programs")
  .select("id, config")
  .eq("lender_id", "eb10aa3f-e4b6-4176-a53c-476329d4dc9e")
  .eq("name", "ITIN Mortgage Program")
  .single();

if (ACC_ITIN_PROGRAM_ID_QUERY.error) throw ACC_ITIN_PROGRAM_ID_QUERY.error;
const { id, config } = ACC_ITIN_PROGRAM_ID_QUERY.data;

const updatedConfig = {
  ...config,
  noFicoPolicy: "eligible",
  lastVerifiedDate: "2026-08-01",
  notes:
    config.notes +
    "\n\nSTRUCTURED 2026-08-01 (Lender Database Audit): noFicoPolicy set to \"eligible\" — this program's own notes already confirmed \"NO SCORE ALLOWED\" (cited from https://accmortgage.com/itin-mortgage-program/), but the structured field the No-FICO matching engine reads had never been populated until now. No new claim is being made; this only structures an already-cited, already-verified fact.",
};

const { error } = await admin.from("programs").update({ config: updatedConfig }).eq("id", id);
if (error) throw error;
console.log(`Updated ACC Mortgage ITIN Mortgage Program (${id}): noFicoPolicy = "eligible".`);
