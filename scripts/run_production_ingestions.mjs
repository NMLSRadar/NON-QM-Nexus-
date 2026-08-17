import { spawnSync } from "node:child_process";

const hasSupabaseCredentials = Boolean(
  process.env.NEXT_PUBLIC_SUPABASE_URL && process.env.SUPABASE_SERVICE_ROLE_KEY,
);

if (!hasSupabaseCredentials) {
  console.log("[production-ingestions] skipped: protected Supabase credentials are not available in this build environment");
  process.exit(0);
}

const scripts = [
  "redwood_newfi_ingest_2026_08_06.mjs",
  "ingest_deephaven_golchis_2026_08_06.mjs",
  "ingest_bff_2026_08_06.mjs",
  "ingest_cake_2026_08_06.mjs",
  "ingest_eresi_core_2026_08_06.mjs",
  "ingest_planet_home_2026_08_06.mjs",
  "ingest_nqmf_carrington_category_expansion_2026_08_07.mjs",
  "fix_missing_guideline_versions_2026_08_07.mjs",
  "ingest_cake_category_expansion_2026_08_07.mjs",
  "ahl_credit_matrix_ingest_2026_08_07.mjs",
  "ingest_fnba_nonqm_matrix_2026_08_07.mjs",
  "ingest_jmac_complete_2026_08_08.mjs",
  "luxury_mortgage_full_audit_2026_08_08.mjs",
  "ingest_acra_complete_2026_08_08.mjs",
  "acc_mortgage_complete_audit_2026_08_08.mjs",
  "ingest_amwest_pennymac_clearedge_fundloans_2026_08_08.mjs",
  "ingest_ten_lender_nonqm_2026_08_08.mjs",
  "ingest_thelender_complete_2026_08_17.mjs",
];

for (const script of scripts) {
  console.log(`[production-ingestions] running ${script}`);
  const result = spawnSync(process.execPath, [`scripts/${script}`], {
    stdio: "inherit",
    env: process.env,
  });
  if (result.status !== 0) {
    console.error(`[production-ingestions] failed: ${script}`);
    process.exit(result.status ?? 1);
  }
}

console.log(`[production-ingestions] complete: ${scripts.length} scripts`);
