import { Citizenship, PropertyType } from "../types/enums";
import type { Scenario } from "../types/scenario";
import type { CalculationSummary } from "../types/results";

/**
 * Deterministic bank-statement FILE COMPLEXITY classifier — per the
 * "Bank Statement Guideline-First Lender Intelligence" platform spec
 * (2026-07-28). Purely a rule-based read of real scenario fields already
 * captured (BankStatementDetails, CreditEvents, citizenship, LTV, property
 * type, occupancy, vesting, first-time-homebuyer/investor) — no AI
 * judgment call, no invented signal. Every flag traces to a real field the
 * borrower/broker actually stated; nothing here is guessed.
 *
 * SCOPE NOTE: the spec also lists "number of NSFs", "number of overdrafts",
 * and "cash-deposit frequency" as inputs. This schema currently only
 * captures BOOLEAN hasCashDeposits/hasAtmDeposits flags (no NSF/overdraft
 * COUNT field exists anywhere in Scenario/BankStatementDetails) — using
 * those booleans as the closest real proxy rather than inventing a count
 * field or a numeric NSF threshold this platform has never actually asked
 * for. Adding true NSF/overdraft counts is a real, separate schema
 * extension (voice + manual intake + this classifier) for a future pass.
 */

export type BankStatementFileClassification =
  | "clean"
  | "moderate_complexity"
  | "high_complexity"
  | "manual_review_recommended";

export interface ComplexityFlag {
  label: string;
  severity: "moderate" | "high" | "severe";
}

export interface BankStatementComplexityResult {
  classification: BankStatementFileClassification;
  label: string;
  explanation: string;
  flags: ComplexityFlag[];
}

const NON_WARRANTABLE_OR_UNUSUAL_PROPERTY: PropertyType[] = [
  PropertyType.NonWarrantableCondo,
  PropertyType.TwoToFourUnit,
  PropertyType.FivePlusUnit,
  PropertyType.Rural,
  PropertyType.Condotel,
  PropertyType.Manufactured,
];

/** Detects the flags a real scenario/calc actually support — every flag
 * cites the exact field(s) it read, in `note`, so the UI/AI narrative can
 * quote the real reason rather than a vague label. */
export function classifyBankStatementComplexity(
  scenario: Scenario,
  calc: CalculationSummary,
): BankStatementComplexityResult {
  const flags: ComplexityFlag[] = [];
  const bs = scenario.bankStatement;

  // --- Credit / leverage ----------------------------------------------
  if (scenario.fico != null && scenario.fico < 600) {
    flags.push({ label: `FICO ${scenario.fico} is below 600`, severity: "severe" });
  } else if (scenario.fico != null && scenario.fico < 680) {
    flags.push({ label: `FICO ${scenario.fico} is below 680`, severity: "moderate" });
  }
  const ltv = calc.ltv?.value;
  if (ltv != null && ltv > 85) {
    flags.push({ label: `Requested LTV ${ltv}% exceeds 85%`, severity: "high" });
  } else if (ltv != null && ltv > 80) {
    flags.push({ label: `Requested LTV ${ltv}% exceeds 80%`, severity: "moderate" });
  }

  // --- Credit events / housing history ---------------------------------
  const ce = scenario.creditEvents;
  if (ce?.bankruptcyMonthsSinceDischarge != null && ce.bankruptcyMonthsSinceDischarge < 24) {
    flags.push({ label: `Bankruptcy discharged ${ce.bankruptcyMonthsSinceDischarge} months ago`, severity: "severe" });
  }
  if (ce?.foreclosureMonthsSince != null && ce.foreclosureMonthsSince < 36) {
    flags.push({ label: `Foreclosure ${ce.foreclosureMonthsSince} months ago`, severity: "severe" });
  }
  if (ce?.shortSaleMonthsSince != null && ce.shortSaleMonthsSince < 24) {
    flags.push({ label: `Short sale/deed-in-lieu ${ce.shortSaleMonthsSince} months ago`, severity: "high" });
  }
  if (ce?.mortgageLates30x12 != null && ce.mortgageLates30x12 > 0) {
    flags.push({ label: `${ce.mortgageLates30x12} mortgage late payment(s) in the last 12 months`, severity: "high" });
  }

  // --- Citizenship / borrower profile -----------------------------------
  if (scenario.citizenship === Citizenship.ForeignNational) {
    flags.push({ label: "Foreign national borrower", severity: "high" });
  } else if (scenario.citizenship === Citizenship.Itin) {
    flags.push({ label: "ITIN borrower", severity: "high" });
  } else if (scenario.citizenship === Citizenship.NonPermanentResident) {
    flags.push({ label: "Non-permanent resident borrower", severity: "moderate" });
  }
  if (scenario.firstTimeHomebuyer) flags.push({ label: "First-time homebuyer", severity: "moderate" });
  if (scenario.firstTimeInvestor || scenario.investorExperience === "first_time_investor") {
    flags.push({ label: "First-time investor", severity: "moderate" });
  }

  // --- Property ----------------------------------------------------------
  if (scenario.propertyType && NON_WARRANTABLE_OR_UNUSUAL_PROPERTY.includes(scenario.propertyType)) {
    flags.push({ label: `${scenario.propertyType.replace(/_/g, " ")} property type`, severity: "moderate" });
  }

  // --- Vesting / cash-out --------------------------------------------------
  if (scenario.vesting && scenario.vesting !== "individual") {
    flags.push({ label: `Title vesting in ${scenario.vesting.replace(/_/g, " ")}`, severity: "moderate" });
  }
  if (scenario.loanPurpose === "cash_out_refinance" && scenario.requestedCashOut != null && scenario.requestedCashOut > 300_000) {
    flags.push({ label: `Large cash-out request ($${scenario.requestedCashOut.toLocaleString("en-US")})`, severity: "moderate" });
  }

  // --- Bank statement income-analysis specifics --------------------------
  if (bs) {
    if (bs.depositsDeclining) flags.push({ label: "Declining deposit trend", severity: "high" });
    if (bs.hasLargeUnusualDeposits) flags.push({ label: "Large or unusual deposits requiring sourcing", severity: "high" });
    if (bs.hasComingling) flags.push({ label: "Commingled personal/business funds requiring analysis", severity: "high" });
    if (bs.combiningMultipleAccounts) flags.push({ label: "Multiple bank accounts combined for qualifying", severity: "moderate" });
    if (bs.hasCashDeposits) flags.push({ label: "Cash deposits present", severity: "moderate" });
    if (bs.hasAtmDeposits) flags.push({ label: "ATM deposits present", severity: "moderate" });
    if (bs.ownershipPercent != null && bs.ownershipPercent < 100) {
      flags.push({ label: `Borrower owns only ${bs.ownershipPercent}% of the business`, severity: "moderate" });
    }
    if (bs.expenseFactorPercent != null && bs.expenseFactorPercent < 20) {
      flags.push({ label: `Requested expense factor of ${bs.expenseFactorPercent}% is below most lenders' standard default`, severity: "high" });
    }
    if (bs.businessStartDate) {
      const months = monthsSince(bs.businessStartDate);
      if (months != null && months < 24) {
        flags.push({ label: `Business established ${months} months ago (recently formed)`, severity: "high" });
      }
    }
  }

  const severeCount = flags.filter((f) => f.severity === "severe").length;
  const highCount = flags.filter((f) => f.severity === "high").length;
  const moderateCount = flags.filter((f) => f.severity === "moderate").length;

  let classification: BankStatementFileClassification;
  if (severeCount > 0 || highCount >= 3) {
    classification = "manual_review_recommended";
  } else if (highCount >= 1 || moderateCount >= 3) {
    classification = "high_complexity";
  } else if (moderateCount >= 1) {
    classification = "moderate_complexity";
  } else {
    classification = "clean";
  }

  const label = {
    clean: "Clean and Straightforward",
    moderate_complexity: "Moderate Guideline Complexity",
    high_complexity: "High Guideline Complexity",
    manual_review_recommended: "Manual Review Recommended",
  }[classification];

  const explanation = buildExplanation(classification, flags);

  return { classification, label, explanation, flags };
}

function monthsSince(isoDate: string): number | null {
  const d = new Date(isoDate);
  if (Number.isNaN(d.getTime())) return null;
  const now = new Date();
  return (now.getFullYear() - d.getFullYear()) * 12 + (now.getMonth() - d.getMonth());
}

function buildExplanation(classification: BankStatementFileClassification, flags: ComplexityFlag[]): string {
  if (classification === "clean") {
    return "No meaningful guideline complications were identified from the captured scenario — strong credit, conservative leverage, and no flagged income-analysis, property, or borrower-profile concerns. Pricing and technology may reasonably be the deciding factors once eligibility is confirmed.";
  }
  const topFlags = [...flags]
    .sort((a, b) => severityRank(b.severity) - severityRank(a.severity))
    .slice(0, 3)
    .map((f) => f.label.toLowerCase());
  const flagText = topFlags.length > 0 ? topFlags.join("; ") : "multiple factors";
  if (classification === "moderate_complexity") {
    return `This file is classified as Moderate Guideline Complexity because of: ${flagText}. These items may eliminate lenders with more restrictive bank statement guidelines, so guideline flexibility should weigh more heavily than pricing alone.`;
  }
  if (classification === "high_complexity") {
    return `This file is classified as High Guideline Complexity because of multiple compounding factors: ${flagText}. A lender with broader Non-QM underwriting flexibility is materially more likely to close this file than a standardized, pricing-led execution.`;
  }
  return `This file is recommended for manual review because of a severe or heavily compounding factor: ${flagText}. Confirm eligibility directly with a lender's underwriting/AE team before relying on an automated ranking alone.`;
}

function severityRank(s: ComplexityFlag["severity"]): number {
  return s === "severe" ? 3 : s === "high" ? 2 : 1;
}
