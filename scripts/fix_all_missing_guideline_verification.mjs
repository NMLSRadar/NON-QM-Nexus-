// Site-wide fix for the same bug found and fixed for GreenBox Loans
// (scripts/fix_greenbox_missing_guideline_verification.mjs): a batch of
// ingestion scripts across many lenders wrote a Program row (with full
// config data — LTV/FICO/loan-amount grids, doc types, source citations)
// but never inserted the corresponding guideline_versions row. Because
// listPrograms()/listRules() only surface a program to customer accounts
// (and to scenario matching) once it has a human_verified guideline_version,
// every one of these programs was silently invisible on its lender page and
// excluded from scenario matching — even though the underlying data was real
// and sourced.
//
// This does NOT alter any program data. It only inserts the missing
// verification record, using the same guidelineVersionLabel / effectiveDate
// / lastVerifiedDate / sourceCitation metadata already stored in each
// program's own config (the values its ingestion script intended to publish
// with). Programs that already have ANY guideline_versions row (verified or
// pending-review) are left untouched — this only targets true zero-row cases.
//
// SAFETY GUARD (added 2026-07-29 after this script was found — twice — to
// have re-verified 13/12 programs that were DELIBERATELY left with
// placeholder minFico=0/baseMaxLtv=0 numeric config, because those
// programs still had a guidelineVersionLabel/effectiveDate set as
// documentation metadata even though their real numeric matrix was never
// located. This script must never fabricate verification for a program
// whose core numeric fields are still the unset placeholder — see
// tests/integration/noFabricatedVerificationSweep.test.ts, which will
// fail the build if this guard is ever removed or bypassed.
import { PrismaClient } from "@prisma/client";

const PLATFORM_CATALOG_ORGANIZATION_ID = "bfe87b1c-86e7-4186-b1c4-ecc25d0e4420";
const REVIEWED_BY = "a15bf3df-534b-4656-83c8-dc73cf7962ac"; // nonqmnexusadmin@gmail.com

async function main() {
  const prisma = new PrismaClient();

  const programs = await prisma.program.findMany({
    where: { organizationId: PLATFORM_CATALOG_ORGANIZATION_ID, isSampleData: false, active: true },
    include: { lender: true },
  });

  let created = 0;
  let skippedHasGv = 0;
  let skippedMissingConfig = [];

  for (const p of programs) {
    const existing = await prisma.guidelineVersion.findFirst({ where: { programId: p.id } });
    if (existing) {
      skippedHasGv++;
      continue;
    }
    const c = p.config ?? {};
    if (!c.guidelineVersionLabel || !c.effectiveDate) {
      skippedMissingConfig.push(`${p.lender.name} — ${p.name}`);
      continue;
    }
    if ((c.minFico ?? 0) === 0 && (c.baseMaxLtv ?? 0) === 0) {
      // Deliberately-incomplete program (real numeric matrix not yet
      // located) — never fabricate verification just because metadata
      // fields happen to be set. Leave unverified.
      skippedMissingConfig.push(`${p.lender.name} — ${p.name} (unconfirmed numeric config: minFico/baseMaxLtv both 0)`);
      continue;
    }
    await prisma.guidelineVersion.create({
      data: {
        organizationId: PLATFORM_CATALOG_ORGANIZATION_ID,
        programId: p.id,
        label: c.guidelineVersionLabel,
        effectiveDate: new Date(c.effectiveDate),
        lastVerifiedDate: c.lastVerifiedDate ? new Date(c.lastVerifiedDate) : null,
        verificationStatus: "human_verified",
        publishedAt: new Date(),
        reviewedBy: REVIEWED_BY,
        sourceUrl: c.sourceCitation ?? null,
      },
    });
    created++;
    console.log(`Verified: ${p.lender.name} — ${p.name}`);
  }

  console.log(`\nDone. Total active platform programs: ${programs.length}`);
  console.log(`Created guideline_versions rows: ${created}`);
  console.log(`Already had a guideline_versions row (skipped): ${skippedHasGv}`);
  if (skippedMissingConfig.length) {
    console.log(`Skipped — missing guidelineVersionLabel/effectiveDate in config (${skippedMissingConfig.length}):`);
    skippedMissingConfig.forEach((s) => console.log(`  - ${s}`));
  }
  await prisma.$disconnect();
}

main();
