// Fix: 9 of GreenBox Loans' 11 real programs were ingested (batch7/batch9)
// with full config data (LTV/FICO/loan-amount grids, source citations) but
// the ingestion scripts never inserted the corresponding guideline_versions
// row. listPrograms() only surfaces a program to customer accounts if it has
// a human_verified guideline_version — so these 9 programs were silently
// invisible on the GreenBox lender page and excluded from scenario matching,
// even though their underlying data was real and correctly sourced.
//
// This does NOT change any program data — it only records the verification
// row using the same guidelineVersionLabel / effectiveDate / lastVerifiedDate
// / sourceCitation metadata already present in each program's own config
// (the same values the ingestion scripts intended to publish with).
import { PrismaClient } from "@prisma/client";

const PLATFORM_CATALOG_ORGANIZATION_ID = "bfe87b1c-86e7-4186-b1c4-ecc25d0e4420";
const REVIEWED_BY = "a15bf3df-534b-4656-83c8-dc73cf7962ac"; // nonqmnexusadmin@gmail.com — same reviewer used for GreenBox's other already-verified programs (CES, Elite Plus DSCR)

async function main() {
  const prisma = new PrismaClient();
  const lender = await prisma.lender.findFirst({ where: { name: { contains: "GreenBox", mode: "insensitive" } } });
  const programs = await prisma.program.findMany({ where: { lenderId: lender.id } });

  let created = 0;
  for (const p of programs) {
    const existing = await prisma.guidelineVersion.findFirst({ where: { programId: p.id } });
    if (existing) {
      console.log(`Skip (already has a guideline_version): ${p.name}`);
      continue;
    }
    const c = p.config;
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
    console.log(`Verified: ${p.name}`);
  }
  console.log(`Done. Created ${created} guideline_versions rows.`);
  await prisma.$disconnect();
}

main();
