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
