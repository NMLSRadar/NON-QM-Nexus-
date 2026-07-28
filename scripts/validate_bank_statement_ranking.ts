import { config } from "dotenv";
config({ path: ".env.local" });
import { createClient } from "@supabase/supabase-js";
import { analyzeScenario } from "../src/domain/analyze";
import type { Scenario } from "../src/domain/types/scenario";
import type { Lender, Program, Rule } from "../src/domain/types/program";

const PLATFORM_CATALOG_ORG = "bfe87b1c-86e7-4186-b1c4-ecc25d0e4420";

function rowToLender(r: any): Lender {
  return {
    id: r.id,
    organizationId: r.organization_id,
    name: r.name,
    isSampleData: r.is_sample_data,
    active: r.active,
    tierLevel: r.tier_level,
  };
}
function rowToProgram(r: any): Program {
  return { id: r.id, lenderId: r.lender_id, organizationId: r.organization_id, name: r.name, isSampleData: r.is_sample_data, active: r.active, ...r.config };
}

async function loadCatalog() {
  const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);
  const { data: lenderRows } = await supabase.from("lenders").select("*").eq("organization_id", PLATFORM_CATALOG_ORG).eq("is_sample_data", false).eq("active", true);
  const { data: programRows } = await supabase.from("programs").select("*").eq("organization_id", PLATFORM_CATALOG_ORG).eq("is_sample_data", false).eq("active", true);
  return { lenders: (lenderRows ?? []).map(rowToLender), programs: (programRows ?? []).map(rowToProgram), rules: [] as Rule[] };
}

function baseScenario(overrides: Partial<Scenario>): Scenario {
  return {
    id: "val-1",
    organizationId: "org1",
    name: "Validation scenario",
    createdByUserId: "u1",
    loanPurpose: "purchase",
    occupancy: "primary",
    propertyType: "single_family",
    state: "TX",
    citizenship: "us_citizen",
    vesting: "individual",
    incomeDocType: "bank_statement",
    purchasePrice: 800_000,
    estimatedValue: 800_000,
    requestedLoanAmount: 560_000,
    fico: 760,
    monthlyHousingPayment: 3500,
    monthlyLiabilities: 500,
    liquidAssets: 100_000,
    createdAt: "2026-01-01",
    updatedAt: "2026-01-01",
    ...overrides,
  } as Scenario;
}

async function main() {
  const catalog = await loadCatalog();

  const scenarios: Array<[string, Scenario]> = [
    ["CLEAN: 70% LTV, 760 FICO, primary, individual vesting, US citizen, no complications", baseScenario({})],
    ["MODERATE: 85% LTV (single moderate flag)", baseScenario({ requestedLoanAmount: 680_000 })],
    [
      "HIGH: 660 FICO + first-time homebuyer + LLC vesting (3 moderate flags)",
      baseScenario({ fico: 660, firstTimeHomebuyer: true, vesting: "llc" }),
    ],
    [
      "MANUAL REVIEW: recent bankruptcy",
      baseScenario({ creditEvents: { bankruptcyMonthsSinceDischarge: 12 } }),
    ],
  ];

  for (const [label, scenario] of scenarios) {
    const analysis = analyzeScenario(scenario, catalog);
    const bsEvals = analysis.evaluations.filter((e) => e.incomeDocTypes.includes("bank_statement")).slice(0, 5);
    console.log("\n=== " + label + " ===");
    console.log("File classification:", analysis.bankStatementFileClassification?.label);
    console.log("Explanation:", analysis.bankStatementFileClassification?.explanation);
    console.log("Top 5 bank-statement lender matches:");
    for (const e of bsEvals) {
      const cleanBoost = e.scoreBreakdown.find((b) => b.factor === "Bank statement clean-file execution");
      const flexBoost = e.scoreBreakdown.find((b) => b.factor === "Bank statement guideline flexibility");
      console.log(
        `  ${e.lenderName} (${e.programName}) — ${e.matchScore}% — status=${e.status}` +
          (cleanBoost ? " [clean-exec boost]" : "") +
          (flexBoost ? " [flexibility boost]" : ""),
      );
    }
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
