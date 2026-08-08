import { createClient } from "@supabase/supabase-js";
import fs from "node:fs";

const RUN_ID = "repair-incorrect-catalog-archives-2026-08-08-v1";
const PLATFORM_ORG = "bfe87b1c-86e7-4186-b1c4-ecc25d0e4420";

const RESTORE = new Map([
  ["BluePoint Mortgage", ["BlueXpanded DSCR (Single Investment Property)", "Bank Statement Loan", "Asset Utilization"]],
  ["Forward Lending", ["DSCR Loan", "Non-QM Select — Bank Statement / Alt Doc", "Full Doc Non-QM"]],
  ["Oaktree Funding Corporation", ["Bank Statement Program", "Investor Advantage — Alt-Doc / Foreign National"]],
  ["Kiavi", ["DSCR Rental Loan"]],
]);

const PATCH_UNCONFIRMED_VESTING = new Map([
  ["Cake Mortgage", ["DSCR Multifamily — 5-9 Unit", "Closed End Second (CES)"]],
]);

function loadEnv() {
  const env = { ...process.env };
  for (const file of [".env.local", "/home/nexus/.env.local"]) {
    if (!fs.existsSync(file)) continue;
    for (const line of fs.readFileSync(file, "utf8").split("\n")) {
      const index = line.indexOf("=");
      if (index > 0) env[line.slice(0, index)] = line.slice(index + 1).replace(/^"|"$/g, "");
    }
  }
  return env;
}

async function main() {
  if (process.env.RUN_CATALOG_ARCHIVE_REPAIR_20260808 !== "true") {
    console.log(`[${RUN_ID}] skipped: explicit repair flag is off`);
    return;
  }
  const env = loadEnv();
  if (!env.NEXT_PUBLIC_SUPABASE_URL || !env.SUPABASE_SERVICE_ROLE_KEY) throw new Error("Production database credentials are unavailable.");
  const admin = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false, autoRefreshToken: false } });
  const { data: lenders, error: lenderError } = await admin.from("lenders").select("id,name").eq("organization_id", PLATFORM_ORG).in("name", [...RESTORE.keys()]);
  if (lenderError) throw new Error(lenderError.message);
  const lenderByName = new Map((lenders ?? []).map((lender) => [lender.name, lender.id]));
  let restored = 0;

  for (const [lenderName, programNames] of RESTORE) {
    const lenderId = lenderByName.get(lenderName);
    if (!lenderId) throw new Error(`Missing lender: ${lenderName}`);
    const { error: lenderRestoreError } = await admin.from("lenders").update({ active: true, deleted_at: null }).eq("id", lenderId);
    if (lenderRestoreError) throw new Error(lenderRestoreError.message);
    const { data: programs, error: programError } = await admin.from("programs").select("id,name,active,deleted_at,config").eq("lender_id", lenderId).in("name", programNames);
    if (programError) throw new Error(programError.message);
    for (const programName of programNames) {
      const matches = (programs ?? []).filter((program) => program.name === programName);
      if (matches.length !== 1) throw new Error(`${lenderName} — ${programName}: expected exactly one record, found ${matches.length}`);
      const program = matches[0];
      const { data: verified, error: versionError } = await admin.from("guideline_versions").select("id").eq("program_id", program.id).eq("verification_status", "human_verified").limit(1);
      if (versionError) throw new Error(versionError.message);
      if (!verified?.length) throw new Error(`${lenderName} — ${programName}: no human-verified guideline version; refusing to restore`);
      const config = { ...(program.config ?? {}), active: true, archiveRepairRunId: RUN_ID, archiveRepairReason: "Restored after full-catalog audit found a verified program archived without a verified equivalent replacement." };
      const { error: restoreError } = await admin.from("programs").update({ active: true, deleted_at: null, config }).eq("id", program.id);
      if (restoreError) throw new Error(restoreError.message);
      restored += 1;
      console.log(`[${RUN_ID}] restored ${lenderName} — ${programName}`);
    }
  }

  const { data: configLenders, error: configLenderError } = await admin.from("lenders").select("id,name").eq("organization_id", PLATFORM_ORG).in("name", [...PATCH_UNCONFIRMED_VESTING.keys()]);
  if (configLenderError) throw new Error(configLenderError.message);
  const configLenderByName = new Map((configLenders ?? []).map((lender) => [lender.name, lender.id]));
  let repairedConfigs = 0;
  for (const [lenderName, programNames] of PATCH_UNCONFIRMED_VESTING) {
    const lenderId = configLenderByName.get(lenderName);
    if (!lenderId) throw new Error(`Missing lender: ${lenderName}`);
    const { data: programs, error: programError } = await admin.from("programs").select("id,name,config").eq("lender_id", lenderId).in("name", programNames).eq("active", true).is("deleted_at", null);
    if (programError) throw new Error(programError.message);
    for (const program of programs ?? []) {
      const config = {
        ...(program.config ?? {}),
        vestingEligible: [],
        matrixConfirmationRequired: true,
        matrixConfirmationNotes: `${program.config?.matrixConfirmationNotes ?? ""} Vesting eligibility was not confirmed in the reviewed public guideline and must be verified with the lender.`.trim(),
        archiveRepairRunId: RUN_ID,
      };
      const { error: updateError } = await admin.from("programs").update({ config }).eq("id", program.id);
      if (updateError) throw new Error(updateError.message);
      repairedConfigs += 1;
      console.log(`[${RUN_ID}] repaired fail-closed config ${lenderName} — ${program.name}`);
    }
  }
  console.log(`[${RUN_ID}] complete: ${restored} verified programs restored; ${repairedConfigs} hidden verified configs repaired`);
}

main().catch((error) => { console.error(`[${RUN_ID}] fatal`, error); process.exit(1); });
