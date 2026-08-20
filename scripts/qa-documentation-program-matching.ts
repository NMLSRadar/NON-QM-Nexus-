import { writeFile } from "node:fs/promises";
import { createClient } from "@supabase/supabase-js";
import { PLATFORM_CATALOG_ORGANIZATION_ID } from "@/lib/platformCatalog";
import { runCalculations } from "@/domain/calc";
import { evaluateProgram, rankEvaluations } from "@/domain/matching/evaluateProgram";
import type { IncomeDocType } from "@/domain/types/enums";
import type { Scenario } from "@/domain/types/scenario";

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!url || !key) throw new Error("Missing Supabase production configuration");

async function main() {
const supabase = createClient(url!, key!, { auth: { persistSession: false } });
const { data: lenderRows, error: lenderError } = await supabase
  .from("lenders")
  .select("id,organization_id,name,is_sample_data,active,tier_level")
  .eq("organization_id", PLATFORM_CATALOG_ORGANIZATION_ID)
  .is("deleted_at", null);
if (lenderError) throw lenderError;
const { data: programRows, error: programError } = await supabase
  .from("programs")
  .select("id,organization_id,lender_id,name,is_sample_data,active,config")
  .eq("organization_id", PLATFORM_CATALOG_ORGANIZATION_ID)
  .is("deleted_at", null);
if (programError) throw programError;
const catalog = {
  lenders: lenderRows.map((row) => ({
    id: row.id,
    organizationId: row.organization_id,
    name: row.name,
    isSampleData: row.is_sample_data,
    active: row.active,
    tierLevel: row.tier_level,
  })),
  programs: programRows
    .filter((row) => row.config && Array.isArray(row.config.incomeDocTypes))
    .map((row) => ({
      ...row.config,
      id: row.id,
      organizationId: row.organization_id,
      lenderId: row.lender_id,
      name: row.name,
      isSampleData: row.is_sample_data,
      active: row.active,
    })),
  rules: [],
};
const lenderById = new Map(catalog.lenders.map((lender) => [lender.id, lender]));
const docs: IncomeDocType[] = ["bank_statement", "1099", "pnl_only", "asset_depletion", "wvoe_only"];

const qa = [];
for (const documentationType of docs) {
  const scenario: Scenario = {
    id: `qa-${documentationType}`,
    organizationId: PLATFORM_CATALOG_ORGANIZATION_ID,
    name: `QA ${documentationType}`,
    createdByUserId: "program-level-qa",
    loanPurpose: "purchase",
    occupancy: "primary",
    propertyType: "single_family",
    purchasePrice: 500_000,
    estimatedValue: 500_000,
    requestedLoanAmount: 400_000,
    fico: 720,
    incomeDocType: documentationType,
    citizenship: "us_citizen",
    pnl: documentationType === "pnl_only" ? { periodMonths: 12, supportingBankStatements: true } : undefined,
    createdAt: "2026-08-19T00:00:00.000Z",
    updatedAt: "2026-08-19T00:00:00.000Z",
  };
  const calc = runCalculations(scenario);
  const evaluations = rankEvaluations(
    catalog.programs
      .filter((program) => program.active)
      .map((program) => {
        const lender = lenderById.get(program.lenderId);
        return lender?.active ? evaluateProgram(scenario, calc, program, lender, catalog.rules, new Date("2026-08-19T12:00:00Z")) : null;
      })
      .filter((evaluation): evaluation is NonNullable<typeof evaluation> => evaluation != null),
  );
  const eligible = evaluations.filter((evaluation) =>
    !evaluation.guidelineVerificationRequired &&
    ["strong_match", "eligible", "conditional", "manual_review"].includes(evaluation.status),
  );
  const verificationRequired = evaluations.filter((evaluation) => evaluation.guidelineVerificationRequired);
  qa.push({
    documentationType,
    scenario: { loanPurpose: "purchase", propertyType: "single_family", occupancy: "primary", ltv: 80, fico: 720 },
    counts: { evaluated: evaluations.length, eligible: eligible.length, verificationRequired: verificationRequired.length },
    recommendations: eligible.slice(0, 25).map((evaluation) => ({
      lender: evaluation.lenderName,
      program: evaluation.programName,
      matchedDocumentation: evaluation.documentationType,
      status: evaluation.status,
      confidenceScore: evaluation.matchScore,
      maxLtv: evaluation.maxLtv,
      minFico: evaluation.minFico,
      maxDti: evaluation.maxDti,
      maxLoanAmount: evaluation.maxLoanAmount,
      reservesMonths: evaluation.estimatedReservesRequiredMonths,
      sourceCitation: evaluation.sourceCitation,
      whyThisLenderRuleIds: evaluation.ruleResults.filter((rule) => rule.outcome === "pass").map((rule) => rule.ruleId),
      siblingDocumentationLeaked: evaluation.incomeDocTypes.some((doc) => doc !== documentationType),
    })),
    quarantinedExamples: verificationRequired.slice(0, 25).map((evaluation) => ({
      lender: evaluation.lenderName,
      program: evaluation.programName,
      matchedDocumentation: evaluation.documentationType,
      score: evaluation.matchScore,
      numericValuesSuppressed:
        evaluation.maxLtv == null && evaluation.minFico == null && evaluation.maxDti == null &&
        evaluation.maxLoanAmount == null && evaluation.estimatedReservesRequiredMonths == null,
      issues: evaluation.profileVerificationIssues,
    })),
  });
}

const report = {
  generatedAt: new Date().toISOString(),
  catalogCounts: { lenders: catalog.lenders.length, programs: catalog.programs.length, rules: catalog.rules.length },
  invariants: {
    allRecommendationsUseOneDocumentationType: qa.every((group) => group.recommendations.every((row) => !row.siblingDocumentationLeaked)),
    allQuarantinedRowsSuppressNumbers: qa.every((group) => group.quarantinedExamples.every((row) => row.numericValuesSuppressed)),
    noVerificationRequiredRowIsRecommended: qa.every((group) => group.recommendations.every((row) => row.confidenceScore > 0)),
  },
  qa,
};
await writeFile("docs/program-documentation-matching-qa-2026-08-19.json", JSON.stringify(report, null, 2));
console.log(JSON.stringify({ catalogCounts: report.catalogCounts, invariants: report.invariants, groups: qa.map((group) => ({ documentationType: group.documentationType, ...group.counts })) }, null, 2));
}

void main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
});
