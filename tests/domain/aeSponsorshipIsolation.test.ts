import { describe, expect, it } from "vitest";
import fs from "node:fs";
import path from "node:path";

/**
 * AE Directory / Sponsored Placement compliance test (RESPA Section 8
 * conservative design — see docs/legal-agenda.md): sponsorship must have
 * ZERO influence on lender/program matching, eligibility, or ranking.
 * This is a static dependency check — the matching/ranking modules must
 * never import anything from ae_* tables or the src/lib/ae/* modules.
 */
const MATCHING_FILES = [
  "src/domain/matching/baseChecks.ts",
  "src/domain/matching/evaluateProgram.ts",
  "src/domain/matching/score.ts",
  "src/domain/matching/restructure.ts",
  "src/domain/analyze.ts",
];

describe("AE sponsorship is completely isolated from the matching/ranking engine", () => {
  for (const relPath of MATCHING_FILES) {
    it(`${relPath} imports nothing from src/lib/ae/* or any ae_* table`, () => {
      const fullPath = path.join(process.cwd(), relPath);
      const source = fs.readFileSync(fullPath, "utf8");
      expect(source).not.toMatch(/@\/lib\/ae\//);
      expect(source).not.toMatch(/ae_profiles|ae_placements|ae_profile_events/);
    });
  }
});
