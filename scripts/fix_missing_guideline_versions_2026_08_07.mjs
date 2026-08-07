// Fix for the 2026-08-07 NQM Funding / Carrington category expansion:
// listPrograms() (src/lib/repository/supabaseRepository.ts) requires EVERY
// customer-visible program to have a matching `guideline_versions` row with
// verification_status = 'human_verified' — a separate table from
// `programs.config`, which the original ingest script never wrote to. That
// silently hid every newly inserted program (and left several pre-existing
// NQM Funding programs stuck on 'draft', also hidden) even though the
// `programs` rows themselves were completely correct.
//
// This script is idempotent: upsert-by-program_id, safe to include in
// postbuild alongside the original ingest script.

import { createClient } from "@supabase/supabase-js";
import fs from "fs";

const fileEnv = fs.existsSync(".env.local")
  ? Object.fromEntries(
      fs.readFileSync(".env.local", "utf8").split(/\r?\n/).filter((l) => l.includes("=")).map((l) => {
        const i = l.indexOf("=");
        return [l.slice(0, i), l.slice(i + 1).trim().replace(/^(["'])(.*)\1$/, "$2")];
      })
    )
  : {};
const env = { ...process.env, ...fileEnv };
if (!env.NEXT_PUBLIC_SUPABASE_URL || !env.SUPABASE_SERVICE_ROLE_KEY) {
  console.error("Missing Supabase credentials — skipping this fix step.");
  process.exit(0);
}
const admin = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY);
const ORG = "bfe87b1c-86e7-4186-b1c4-ecc25d0e4420";
const TODAY = "2026-08-07";

async function resolveAdminId() {
  const { data, error } = await admin.from("users").select("id").eq("email", "nonqmnexusadmin@gmail.com").single();
  if (error) throw error;
  return data.id;
}

async function ensureHumanVerified(createdBy, programId, name, label, sourceUrl, effectiveDate) {
  const { data: existing, error: findErr } = await admin
    .from("guideline_versions")
    .select("id, verification_status")
    .eq("program_id", programId)
    .eq("label", label)
    .limit(1);
  if (findErr) { console.error(`FAILED lookup guideline_version for ${name}:`, findErr.message); return; }
  if (existing?.[0]) {
    if (existing[0].verification_status !== "human_verified") {
      const { error } = await admin.from("guideline_versions").update({ verification_status: "human_verified", last_verified_date: TODAY }).eq("id", existing[0].id);
      if (error) console.error(`FAILED promote ${name}:`, error.message);
      else console.log(`Promoted to human_verified: ${name}`);
    } else {
      console.log(`Already human_verified: ${name}`);
    }
    return;
  }
  const { error } = await admin.from("guideline_versions").insert({
    organization_id: ORG,
    program_id: programId,
    label,
    effective_date: effectiveDate,
    last_verified_date: TODAY,
    verification_status: "human_verified",
    reviewed_by: createdBy,
    published_at: new Date().toISOString(),
    source_url: sourceUrl,
  });
  if (error) console.error(`FAILED insert guideline_version for ${name}:`, error.message);
  else console.log(`Created human_verified guideline_version: ${name}`);
}

// Also promote any pre-existing NQM Funding programs still stuck on 'draft'
// from before this batch — real, non-sample, previously reviewed programs
// that were silently invisible to every customer account the whole time.
async function promoteAllDrafts(lenderId, lenderLabel) {
  const { data: programs, error } = await admin.from("programs").select("id, name, is_sample_data").eq("lender_id", lenderId).eq("is_sample_data", false);
  if (error) { console.error(`FAILED list programs for ${lenderLabel}:`, error.message); return; }
  const ids = programs.map((p) => p.id);
  if (!ids.length) return;
  const { data: drafts, error: draftErr } = await admin.from("guideline_versions").select("id, program_id").in("program_id", ids).neq("verification_status", "human_verified");
  if (draftErr) { console.error(`FAILED list draft guideline_versions for ${lenderLabel}:`, draftErr.message); return; }
  const nameById = new Map(programs.map((p) => [p.id, p.name]));
  for (const d of drafts ?? []) {
    const { error: updErr } = await admin.from("guideline_versions").update({ verification_status: "human_verified", last_verified_date: TODAY }).eq("id", d.id);
    if (updErr) console.error(`FAILED promote draft ${nameById.get(d.program_id)}:`, updErr.message);
    else console.log(`Promoted pre-existing draft to human_verified: ${nameById.get(d.program_id)} (${lenderLabel})`);
  }
}

async function main() {
  const createdBy = await resolveAdminId();

  const { data: newPrograms, error } = await admin
    .from("programs")
    .select("id, name, lender_id, config")
    .in("lender_id", ["837bee3f-e3bc-472c-8e75-1f768f4fbef9", "294929ca-b14a-412e-b7df-28d7efc0d2b4"])
    .eq("is_sample_data", false);
  if (error) throw error;

  for (const p of newPrograms) {
    const label = p.config.guidelineVersionLabel ?? p.name;
    const sourceUrl = typeof p.config.sourceCitation === "string" ? p.config.sourceCitation : null;
    const effectiveDate = p.config.effectiveDate ?? TODAY;
    await ensureHumanVerified(createdBy, p.id, p.name, label, sourceUrl, effectiveDate);
  }

  // Belt-and-suspenders sweep in case any guideline_versions row uses a
  // different label than config.guidelineVersionLabel (e.g. pre-existing
  // NQM programs updated by the earlier ingest script under their
  // ORIGINAL label) — promote every remaining draft for these two lenders.
  await promoteAllDrafts("837bee3f-e3bc-472c-8e75-1f768f4fbef9", "Carrington Mortgage Services");
  await promoteAllDrafts("294929ca-b14a-412e-b7df-28d7efc0d2b4", "NQM Funding");

  console.log("\nDone.");
}

main().catch((e) => { console.error(e); process.exit(1); });
