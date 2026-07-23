/**
 * Seed / sample-data sanity check (run with: npm run seed:check).
 *
 * Validates every sample scenario against the shared Zod schema, confirms all
 * lenders and programs are labeled as sample data, and prints each scenario's
 * best display status so drift from tests/domain/scenarios.test.ts is easy to
 * spot. Exits non-zero on any failure.
 */
import { scenarioInputSchema } from "../src/domain/validation/scenarioSchema";
import { analyzeScenario } from "../src/domain/analyze";
import { sampleLenders, samplePrograms } from "../src/data/sampleLenders";
import { sampleRules } from "../src/data/sampleRules";
import { sampleScenarios } from "../src/data/sampleScenarios";

const catalog = { lenders: sampleLenders, programs: samplePrograms, rules: sampleRules };
const ASOF = new Date("2026-07-01");
let failures = 0;

console.log(`Lenders: ${sampleLenders.length} · Programs: ${samplePrograms.length} · Rules: ${sampleRules.length} · Scenarios: ${sampleScenarios.length}\n`);

for (const lender of sampleLenders) {
  if (!lender.name.includes("(Sample)")) {
    console.error(`✗ lender not labeled as sample data: ${lender.name}`);
    failures++;
  }
}
for (const program of samplePrograms) {
  if (!program.name.includes("(Sample)")) {
    console.error(`✗ program not labeled as sample data: ${program.name}`);
    failures++;
  }
}

console.log("scenario                    schema   best status");
console.log("─".repeat(66));
for (const scenario of sampleScenarios) {
  const parsed = scenarioInputSchema.safeParse(scenario);
  if (!parsed.success) {
    failures++;
    console.error(`✗ ${scenario.id}: schema validation failed`);
    for (const [field, messages] of Object.entries(parsed.error.flatten().fieldErrors)) {
      console.error(`    ${field}: ${(messages ?? []).join("; ")}`);
    }
    continue;
  }
  const best = analyzeScenario(scenario, catalog, ASOF).evaluations[0];
  console.log(`${scenario.id.padEnd(28)}ok       ${best?.status ?? "(no programs)"}`);
}

if (failures > 0) {
  console.error(`\nseed:check FAILED with ${failures} problem(s).`);
  process.exit(1);
}
console.log("\nseed:check passed.");
