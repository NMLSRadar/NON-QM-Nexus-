import { createClient } from "@supabase/supabase-js";
import fs from "fs";

// Per direct guidance from the platform's licensed domain expert (2026-07-29):
// virtually every real lender in this catalog that finances condos caps a
// WARRANTABLE condo at 85% LTV and a NON-WARRANTABLE condo at 80% LTV, even
// when the program's general base LTV ceiling is higher (e.g. 90%). This
// script back-fills Program.propertyTypeLtvCaps (see src/domain/types/
// program.ts + src/domain/matching/baseChecks.ts::deriveMaxLtv) for every
// real (non-sample), active program that lists "condo" and/or
// "non_warrantable_condo" in its propertyTypes and does not already have a
// documented cap for that type — it NEVER overwrites an existing
// propertyTypeLtvCaps entry (that would mean somebody already verified a
// more specific real figure for this lender) and NEVER sets a cap that
// would be looser than the program's own base/matrix ceiling.

const env = Object.fromEntries(
  fs.readFileSync(".env.local", "utf8").split("\n").filter((l) => l.includes("=")).map((l) => {
    const i = l.indexOf("=");
    return [l.slice(0, i), l.slice(i + 1)];
  })
);
const admin = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY);
const PLATFORM_ORG = "bfe87b1c-86e7-4186-b1c4-ecc25d0e4420";
const TODAY = "2026-07-29";

const WARRANTABLE_CAP = 85;
const NON_WARRANTABLE_CAP = 80;

async function main() {
  const dryRun = process.argv.includes("--dry-run");

  const { data: programs, error } = await admin
    .from("programs")
    .select("id, name, lender_id, config")
    .eq("organization_id", PLATFORM_ORG)
    .eq("active", true)
    .eq("is_sample_data", false);
  if (error) throw error;

  let corrected = 0;
  let skippedNoCondo = 0;
  let skippedAlreadyDocumented = 0;
  let skippedNoTightening = 0;
  const changes = [];

  for (const p of programs) {
    const propertyTypes = p.config.propertyTypes ?? [];
    const doesWarrantable = propertyTypes.includes("condo");
    const doesNonWarrantable = propertyTypes.includes("non_warrantable_condo");
    if (!doesWarrantable && !doesNonWarrantable) {
      skippedNoCondo++;
      continue;
    }

    const existingCaps = p.config.propertyTypeLtvCaps ?? {};
    const baseMaxLtv = p.config.baseMaxLtv;
    const newCaps = { ...existingCaps };
    const notesAdditions = [];

    if (doesWarrantable && existingCaps.condo == null) {
      if (typeof baseMaxLtv === "number" && baseMaxLtv > WARRANTABLE_CAP) {
        newCaps.condo = WARRANTABLE_CAP;
        notesAdditions.push(`warrantable condo capped at ${WARRANTABLE_CAP}% LTV`);
      }
    } else if (doesWarrantable) {
      skippedAlreadyDocumented++;
    }

    if (doesNonWarrantable && existingCaps.non_warrantable_condo == null) {
      if (typeof baseMaxLtv === "number" && baseMaxLtv > NON_WARRANTABLE_CAP) {
        newCaps.non_warrantable_condo = NON_WARRANTABLE_CAP;
        notesAdditions.push(`non-warrantable condo capped at ${NON_WARRANTABLE_CAP}% LTV`);
      }
    } else if (doesNonWarrantable) {
      skippedAlreadyDocumented++;
    }

    if (notesAdditions.length === 0) {
      skippedNoTightening++;
      continue;
    }

    const note = `CONDO LTV CAP CORRECTED ${TODAY}: ${notesAdditions.join("; ")} (this program's general base LTV was ${baseMaxLtv}%, which does not reflect this lender's real condo restriction) — per direct guidance from the platform's licensed domain expert that this cap applies across virtually every real lender in this catalog. Confirm the lender's current condo guidelines before quoting to a borrower.`;

    changes.push({ id: p.id, name: p.name, newCaps, note });

    if (dryRun) {
      console.log(`[dry-run] ${p.name}: ${JSON.stringify(newCaps)}`);
      corrected++;
      continue;
    }

    const { error: updateErr } = await admin
      .from("programs")
      .update({
        config: {
          ...p.config,
          propertyTypeLtvCaps: newCaps,
          lastVerifiedDate: TODAY,
          notes: (p.config.notes ? p.config.notes + " " : "") + note,
        },
      })
      .eq("id", p.id);
    if (updateErr) {
      console.error(`Failed to update ${p.name}:`, updateErr.message);
      continue;
    }
    corrected++;
  }

  console.log(`Corrected: ${corrected}`);
  console.log(`Skipped (doesn't offer condo/non-warrantable-condo): ${skippedNoCondo}`);
  console.log(`Skipped (already has a documented cap for that type): ${skippedAlreadyDocumented}`);
  console.log(`Skipped (base ceiling already at/below the target cap — nothing to tighten): ${skippedNoTightening}`);
  if (dryRun) console.log("\nDRY RUN — no rows were written. Re-run without --dry-run to apply.");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
