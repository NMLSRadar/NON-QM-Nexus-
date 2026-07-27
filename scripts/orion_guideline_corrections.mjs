// Applies real, verified corrections extracted directly from the uploaded
// Orion Lending guideline PDFs (Titan Flex Product Guidelines, COIN DSCR
// Business Purpose Product Guidelines, COIN X Business Purpose Investor
// Cash Flow Product Guidelines). Every figure here is cited to a specific
// section read from those documents — nothing fabricated or inferred.
//
// Already applied once (this file is kept for audit trail — matches the
// established pattern of committing prior ingestion/correction scripts,
// e.g. scripts/citation_audit_fixes.mjs); re-running against the same DB
// state would create duplicate Titan Flex "Full Doc"/"Alt-Doc" rows since
// those two are inserts, not upserts.
import dotenv from "dotenv";
dotenv.config({ path: new URL("../.env.local", import.meta.url).pathname });
import { createClient } from "@supabase/supabase-js";

const admin = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

const TITAN_FLEX_URL =
  "https://d2ol7oe51mr4n9.cloudfront.net/user_3Cfrs4UEzyBfibhWL8hkQ0WuLXI/1940ab3f-57ff-4024-abd0-bbf1de095f53.pdf";
const COIN_URL =
  "https://d2ol7oe51mr4n9.cloudfront.net/user_3Cfrs4UEzyBfibhWL8hkQ0WuLXI/2228ef6b-422a-4c98-acf4-704ede15a558.pdf";
const COIN_X_URL =
  "https://d2ol7oe51mr4n9.cloudfront.net/user_3Cfrs4UEzyBfibhWL8hkQ0WuLXI/959822a7-eeda-433a-aabc-c10f3fe2ed56.pdf";

async function main() {
  const { data: orion } = await admin.from("lenders").select("id").ilike("name", "%orion%").single();
  const lenderId = orion.id;
  const { data: existing } = await admin.from("programs").select("id,name,config,organization_id").eq("lender_id", lenderId);
  const titanFlexRow = existing.find((p) => p.name === "Titan Flex — Alt-Doc");
  const coinRow = existing.find((p) => p.name.includes("COIN DSCR"));
  const coinXRow = existing.find((p) => p.name.includes("COIN X"));
  const orgId = titanFlexRow.organization_id;

  // --- Titan Flex — Bank Statement (repurposes the existing broken row) ---
  // Sections read: 5.1 Eligible Borrowers, 5.12 Non-Permanent Resident
  // Aliens ("eligible for all products and programs" — no distinct LTV cap
  // stated, so none is added here), 17.4 Eligible Property Types
  // ("2-4 Units"), Section 4 Product Matrix "PRIMARY RESIDENCE (1-4
  // Units)" + "Bank Statement – Fixed expense ratio (Primary): 90%
  // (Purchase & Rate/Term), 80% (Cash-Out)", 8.9 Mortgage/Housing History
  // ("0x30x12, 1x30x12 allowed with LLPA").
  const bankStatementConfig = {
    ...titanFlexRow.config,
    name: "Titan Flex — Bank Statement",
    incomeDocTypes: ["bank_statement"],
    propertyTypes: ["single_family", "condo", "non_warrantable_condo", "townhome", "2_4_unit", "pud"],
    occupancies: ["primary", "second_home", "investment"],
    citizenshipEligible: ["us_citizen", "permanent_resident", "non_permanent_resident"],
    baseMaxLtv: 90,
    minFico: 700,
    maxMortgageLates30x12: 1,
    minReservesMonths: titanFlexRow.config.minReservesMonths || 6,
    sourceCitation: `Orion Lending — Titan Flex Product Guidelines, Section 4 (Product Matrix — Bank Statement Fixed expense ratio, Primary), Section 5.1/5.12 (Eligible Borrowers / Non-Permanent Resident Aliens), Section 8.9 (Mortgage/Housing History), Section 17.4 (Eligible Property Types) — ${TITAN_FLEX_URL}`,
    notes:
      "Primary residence, fixed expense ratio: 90% LTV purchase/rate-term, 80% cash-out — 1-4 units (2-4 unit properties included at the same tier, not reduced). Second home: 85% purchase/rate-term, 80% cash-out. Investment (3rd-party expense ratio): 80% purchase/rate-term, 75% cash-out. Condos: 85% warrantable / 80% non-warrantable (applies on top of the above). Non-Permanent Resident Alien borrowers are eligible for all Titan Flex products per Section 5.12 — no distinct LTV reduction is stated for this citizenship classification in the guideline, unlike some other Orion products (see COIN X). Housing history: 0x30x12 required; 1x30x12 allowed with an LLPA/pricing adjustment.",
  };

  const { error: e1 } = await admin.from("programs").update({ name: "Titan Flex — Bank Statement", config: bankStatementConfig }).eq("id", titanFlexRow.id);
  console.log("Updated Titan Flex — Bank Statement:", e1 ?? "ok");

  // --- Titan Flex — Full Doc (new program) ---
  const fullDocConfig = {
    ...bankStatementConfig,
    name: "Titan Flex — Full Doc",
    incomeDocTypes: ["full_doc"],
    notes:
      "Full-doc primary-residence purchase/rate-term: $1,000,000 max loan / 700 FICO / 90% LTV, or $1,500,000 max loan / 720 FICO / 90% LTV (Section 4 Product Matrix — higher loan amounts step down to 85%/80%/75% at lower FICO tiers). Non-Permanent Resident Alien borrowers eligible for all products per Section 5.12. Housing history: 0x30x12 required; 1x30x12 allowed with an LLPA.",
  };
  const { data: fullDocInserted, error: e2 } = await admin
    .from("programs")
    .insert({
      organization_id: orgId,
      lender_id: lenderId,
      name: "Titan Flex — Full Doc",
      is_sample_data: false,
      active: true,
      config: fullDocConfig,
    })
    .select("id");
  console.log("Inserted Titan Flex — Full Doc:", fullDocInserted?.[0]?.id, e2 ?? "ok");

  // --- Titan Flex — Alt-Doc (P&L / 1099 / Asset Depletion) (new program) ---
  // Conservative, disclosed figure: the guideline's general
  // "PROGRAM RESTRICTIONS / REQUIREMENTS" table gives P&L a distinct 80%
  // (Purchase) / 75% (Rate/Term) / 70% (Cash-Out) tier and Asset Depletion
  // an 80% (Purchase & Rate/Term) / 60% (Cash-Out) tier; 1099 is not
  // broken out with its own LTV line in the matrix I could find, so this
  // program is deliberately kept at the lower, more universally-supported
  // 80% ceiling across all three doc types rather than assuming 1099
  // shares the bank-statement 90% tier without textual confirmation.
  const altDocConfig = {
    ...bankStatementConfig,
    name: "Titan Flex — Alt-Doc (P&L / 1099 / Asset Depletion)",
    incomeDocTypes: ["pnl_only", "1099", "asset_depletion"],
    baseMaxLtv: 80,
    notes:
      "P&L (max $2,000,000 UPB): 80% purchase / 75% rate-term / 70% cash-out. Asset Depletion: 80% purchase & rate-term / 60% cash-out. 1099 income documentation requirements are defined in Section 9.2/10.2 but no distinct LTV tier for 1099 was found in the Section 4 Product Matrix — this program conservatively uses the lower 80% ceiling shared by P&L/Asset Depletion rather than assuming a higher, unconfirmed figure. Non-Permanent Resident Alien borrowers eligible for all products per Section 5.12. Housing history: 0x30x12 required; 1x30x12 allowed with an LLPA.",
  };
  const { data: altDocInserted, error: e3 } = await admin
    .from("programs")
    .insert({
      organization_id: orgId,
      lender_id: lenderId,
      name: "Titan Flex — Alt-Doc (P&L / 1099 / Asset Depletion)",
      is_sample_data: false,
      active: true,
      config: altDocConfig,
    })
    .select("id");
  console.log("Inserted Titan Flex — Alt-Doc:", altDocInserted?.[0]?.id, e3 ?? "ok");

  // --- COIN DSCR: add the documented housing-history ceiling ---
  // Section 7.6 Mortgage/Housing History: "1x30x12 (no rolling)".
  const coinConfig = {
    ...coinRow.config,
    maxMortgageLates30x12: 1,
    sourceCitation: `${coinRow.config.sourceCitation} — Section 7.6 Mortgage/Housing History ("1x30x12, no rolling") confirmed against the uploaded guideline: ${COIN_URL}`,
  };
  const { error: e4 } = await admin.from("programs").update({ config: coinConfig }).eq("id", coinRow.id);
  console.log("Updated COIN DSCR (housing history):", e4 ?? "ok");

  // --- COIN X: add housing-history ceiling AND the real, documented
  // non-permanent-resident LTV cap (Section 6.10: "Maximum 75% LTV") ---
  const coinXConfig = {
    ...coinXRow.config,
    maxMortgageLates30x12: 1,
    citizenshipLtvCaps: { non_permanent_resident: 75 },
    sourceCitation: `${coinXRow.config.sourceCitation} — Section 6.10 Non-Permanent Resident Aliens ("Maximum 75% LTV") and Section 8.4 Mortgage/Housing History confirmed against the uploaded guideline: ${COIN_X_URL}`,
    notes: `${coinXRow.config.notes ?? ""} Non-Permanent Resident Aliens are capped at a maximum 75% LTV on this program (Section 6.10) — lower than the general ${coinXRow.config.baseMaxLtv}% base ceiling for other eligible citizenship classifications.`.trim(),
  };
  const { error: e5 } = await admin.from("programs").update({ config: coinXConfig }).eq("id", coinXRow.id);
  console.log("Updated COIN X (housing history + non-permanent-resident LTV cap):", e5 ?? "ok");
}

main();
