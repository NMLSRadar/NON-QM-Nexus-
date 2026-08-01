// Read-only audit query — Lender Database Audit (2026-08-01). Reports the
// REAL current state of the catalog (never fabricated): every lender,
// program count, FICO range actually on file, no-FICO policy coverage,
// and 5-8 unit coverage. Used to produce the QC table in the final
// deliverable — this script makes NO writes.
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

const { data: lenders, error: lError } = await admin
  .from("lenders")
  .select("id, name, active, is_sample_data")
  .eq("organization_id", PLATFORM_ORG)
  .eq("is_sample_data", false);
if (lError) throw lError;

const { data: programs, error: pError } = await admin
  .from("programs")
  .select("id, lender_id, name, active, is_sample_data, config")
  .eq("organization_id", PLATFORM_ORG)
  .eq("is_sample_data", false);
if (pError) throw pError;

const { data: gvs, error: gError } = await admin
  .from("guideline_versions")
  .select("program_id, verification_status")
  .eq("organization_id", PLATFORM_ORG);
if (gError) throw gError;
const gvByProgram = new Map();
for (const gv of gvs) gvByProgram.set(gv.program_id, gv.verification_status);

const byLender = new Map();
for (const l of lenders) byLender.set(l.id, { lender: l, programs: [] });
for (const p of programs) {
  const bucket = byLender.get(p.lender_id);
  if (bucket) bucket.programs.push(p);
}

let totalLow620 = 0, totalLow600 = 0, totalNoFicoPolicy = 0, total58Unit = 0, total58WithMatrix = 0;
const rows = [];
for (const [, { lender, programs: progs }] of byLender) {
  const ficos = progs.map((p) => p.config?.minFico).filter((f) => typeof f === "number");
  const minFico = ficos.length ? Math.min(...ficos) : null;
  const has620orBelow = ficos.some((f) => f <= 620);
  const has600orBelow = ficos.some((f) => f <= 600);
  const noFicoPrograms = progs.filter((p) => p.config?.noFicoPolicy != null);
  const fiveEightPrograms = progs.filter((p) => Array.isArray(p.config?.propertyTypes) && p.config.propertyTypes.includes("5_8_unit"));
  const fiveEightWithMatrix = fiveEightPrograms.filter((p) => Array.isArray(p.config?.fiveToEightUnitLtvMatrix) && p.config.fiveToEightUnitLtvMatrix.length > 0);
  const verifiedPrograms = progs.filter((p) => gvByProgram.get(p.id) === "human_verified");
  if (has620orBelow) totalLow620++;
  if (has600orBelow) totalLow600++;
  if (noFicoPrograms.length > 0) totalNoFicoPolicy++;
  if (fiveEightPrograms.length > 0) total58Unit++;
  if (fiveEightWithMatrix.length > 0) total58WithMatrix++;

  rows.push({
    lender: lender.name,
    active: lender.active,
    programCount: progs.length,
    minFicoOnFile: minFico,
    has620orBelow,
    has600orBelow,
    noFicoProgramCount: noFicoPrograms.length,
    fiveEightUnitProgramCount: fiveEightPrograms.length,
    fiveEightUnitWithMatrix: fiveEightWithMatrix.length,
    verifiedProgramCount: verifiedPrograms.length,
    status:
      verifiedPrograms.length > 0
        ? "VERIFIED"
        : progs.length > 0
          ? "PARTIALLY VERIFIED"
          : "GUIDELINE MISSING",
  });
}

rows.sort((a, b) => a.lender.localeCompare(b.lender));
console.log(JSON.stringify({ rows, totals: { lenders: lenders.length, programs: programs.length, totalLow620, totalLow600, totalNoFicoPolicy, total58Unit, total58WithMatrix } }, null, 2));
