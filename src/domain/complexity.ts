/**
 * Scenario complexity classification.
 *
 * A deterministic, explainable summary of how hard it is to match a given
 * borrower scenario to a strong lender program — shown just above the ranked
 * lender results. It evaluates only facts actually captured in the scenario
 * (never real borrower PII), produces an integer complexity band
 * (low / moderate / high), and returns very short, fragment-style reasons for
 * that band. The scoring is stable and testable: each applicable factor
 * contributes a fixed number of points, and the band thresholds are fixed.
 *
 * It is NOT a credit decision and never substitutes for eligibility
 * matching — it is a glanceable "this file is straightforward / complex"
 * signal for the broker. Missing data is treated as mild uncertainty
 * (a small penalty), never as a fail.
 */

import type { Scenario } from "./types/scenario";
import type { MortgageLatesCategory, PropertyType } from "./types/enums";

export type ComplexityLevel = "low" | "moderate" | "high";

export interface ComplexityResult {
  level: ComplexityLevel;
  /** Short fragment reasons, e.g. ["Low DSCR", "High LTV", "FICO not provided"]. */
  reasons: string[];
  /** The underlying integer score (for tests / debugging). */
  score: number;
}

/* Per-factor point weights. Keep simple and explicit. */
const WEIGHTS = {
  // Credit challenges
  lowFico: 2, // fico < 620
  fico620to660: 1, // 620 <= fico < 660
  noFicoProfile: 1, // nonnumeric credit profile (foreign credit / no-FICO / etc.)
  recentLate: 3, // any recent mortgage late (mortgageLates* or late category)
  // Loan structure
  highLtv: 2, // LTV > 85
  veryHighLtv: 3, // LTV > 90
  lowDscr: 3, // DSCR < 1.00
  thinDscr: 1, // DSCR 1.00-1.19
  cashOut: 1, // cash-out refi
  secondLien: 2, // standalone second / HELOC
  interestOnly: 1,
  largeLoan: 1, // loan amount >= 1.5M
  // Borrower profile
  firstTimeHomebuyer: 1,
  firstTimeInvestor: 1,
  foreignOrItin: 2, // foreign national / ITIN / non-permanent resident
  visaRestriction: 1, // specific visa type (F-1 etc.)
  llcVesting: 1, // LLC/trust/corp vesting
  // Income doc complexity
  bankStatement: 1,
  pnlOnly: 2,
  shortTermRental: 1,
  insufficientSelfEmploymentMonths: 1, // self employed < 24 months
  // Property
  unusualProperty: 1, // condo, non-warrantable condo, manufactured, 2-4 unit, 5-8 unit, condotel
  limitedReserves: 1, // reserves clearly thin (<= 6 months)
  // Missing / uncertain data
  missingFico: 1,
  missingReserves: 1,
  missingIncomeType: 1,
  missingOccupancy: 1,
} as const;

const LO = 2; // 0 - 2  → low
const HI = 5; // 3 - 5  → moderate, 6+ → high

function classifyLevel(score: number): ComplexityLevel {
  if (score <= LO) return "low";
  if (score <= HI) return "moderate";
  return "high";
}

/** True when the scenario signals a recent mortgage late (any severity). */
function hasRecentLate(s: Scenario): boolean {
  const le = s.creditEvents;
  if (!le) return false;
  if ((le.mortgageLatesCategory ?? "none") !== "none") return true;
  if ((le.mortgageLates30x12 ?? 0) > 0) return true;
  if ((le.mortgageLates60x12 ?? 0) > 0) return true;
  if ((le.mortgageLates90x12 ?? 0) > 0) return true;
  return false;
}

/** Approximate LTV. Prefer the explicit listed value; fall back to math. */
function approximateLtv(s: Scenario): number | null {
  if (s.estimatedValue && s.requestedLoanAmount) {
    const v = (s.requestedLoanAmount / s.estimatedValue) * 100;
    if (Number.isFinite(v)) return v;
  }
  if (s.purchasePrice && s.requestedLoanAmount) {
    const v = (s.requestedLoanAmount / s.purchasePrice) * 100;
    if (Number.isFinite(v)) return v;
  }
  return null;
}

function approximateDscr(s: Scenario): number | null {
  const d = s.dscr;
  if (!d) return null;
  if (d.monthlyLease && d.principalAndInterest) {
    const r = d.monthlyLease / d.principalAndInterest;
    if (Number.isFinite(r)) return r;
  }
  if (d.marketRent && d.principalAndInterest) {
    const r = d.marketRent / d.principalAndInterest;
    if (Number.isFinite(r)) return r;
  }
  return null;
}

const isUnusualProperty = (p: PropertyType | undefined): boolean =>
  !!p &&
  (p === "condo" ||
    p === "non_warrantable_condo" ||
    p === "manufactured" ||
    p === "2_4_unit" ||
    p === "5_8_unit" ||
    p === "condotel" ||
    p === "rural");

export function classifyScenarioComplexity(s: Scenario): ComplexityResult {
  let score = 0;
  const reasons: string[] = [];

  const add = (w: number, reason: string): void => {
    score += w;
    reasons.push(reason);
  };

  // Credit
  if (s.fico != null) {
    if (s.fico < 620) add(WEIGHTS.lowFico, "Low FICO");
    else if (s.fico < 660) add(WEIGHTS.fico620to660, "Mid-range FICO");
  } else if (s.creditProfileType && s.creditProfileType !== "us_fico_score") {
    add(WEIGHTS.noFicoProfile, s.creditProfileType === "foreign_credit" ? "Foreign credit" : "No U.S. FICO");
  } else {
    add(WEIGHTS.missingFico, "FICO not provided");
  }

  if (hasRecentLate(s)) add(WEIGHTS.recentLate, "Recent mortgage late");

  // Loan structure
  const ltv = approximateLtv(s);
  if (ltv != null) {
    if (ltv > 90) add(WEIGHTS.veryHighLtv, "High LTV");
    else if (ltv > 85) add(WEIGHTS.highLtv, "Elevated LTV");
  }

  const dscr = approximateDscr(s);
  if (dscr != null) {
    if (dscr < 1.0) add(WEIGHTS.lowDscr, "Low DSCR");
    else if (dscr < 1.2) add(WEIGHTS.thinDscr, "Thin DSCR");
  }

  if (s.loanPurpose === "cash_out_refinance") add(WEIGHTS.cashOut, "Cash-out");
  if (s.lienPosition === "standalone_second" || s.loanPurpose === "heloc" || s.loanPurpose === "second_lien")
    add(WEIGHTS.secondLien, "Second lien");
  if (s.interestOnlyRequested) add(WEIGHTS.interestOnly, "Interest-only");
  if (s.requestedLoanAmount && s.requestedLoanAmount >= 1_500_000) add(WEIGHTS.largeLoan, "Large loan");

  // Borrower profile
  if (s.firstTimeHomebuyer) add(WEIGHTS.firstTimeHomebuyer, "First-time buyer");
  if (s.firstTimeInvestor || s.investorExperience === "first_time_investor") add(WEIGHTS.firstTimeInvestor, "First-time investor");
  if (s.citizenship === "itin" || s.citizenship === "foreign_national" || s.citizenship === "non_permanent_resident") {
    const citizenshipReason = {
      itin: "ITIN borrower",
      foreign_national: "Foreign national",
      non_permanent_resident: "Non-permanent resident",
    }[s.citizenship];
    add(WEIGHTS.foreignOrItin, citizenshipReason);
  }
  if (s.visaType) add(WEIGHTS.visaRestriction, `${s.visaType} visa`);
  if (s.vesting && (s.vesting === "llc" || s.vesting === "corporation" || s.vesting === "trust"))
    add(WEIGHTS.llcVesting, s.vesting === "trust" ? "Trust vesting" : "Entity vesting");

  // Income documentation
  if (s.incomeDocType === "bank_statement") add(WEIGHTS.bankStatement, "Bank-statement income");
  if (s.incomeDocType === "pnl_only") add(WEIGHTS.pnlOnly, "P&L-only income");
  if (s.incomeDocType == null) add(WEIGHTS.missingIncomeType, "Income type missing");
  if (s.incomeDocType === "dscr" && s.dscr?.strIncomeUsed === "yes") add(WEIGHTS.shortTermRental, "Short-term rental");
  if (s.employmentStatus === "self_employed" && s.selfEmploymentMonths != null && s.selfEmploymentMonths < 24)
    add(WEIGHTS.insufficientSelfEmploymentMonths, "Short self-employment");

  // Property
  if (isUnusualProperty(s.propertyType)) add(WEIGHTS.unusualProperty, "Unusual property");
  if (s.propertyType == null) add(WEIGHTS.missingOccupancy, "Property type unknown");

  // Reserves
  const reservesMonths = s.reserveAmountMonthsRequested ?? (s.liquidAssets != null ? 6 : null);
  if (s.liquidAssets == null && s.dscr == null) add(WEIGHTS.missingReserves, "Reserves unknown");
  if (s.liquidAssets != null && s.reserveAmountMonthsRequested != null && s.reserveAmountMonthsRequested <= 6)
    add(WEIGHTS.limitedReserves, "Limited reserves");

  // Occupancy clarity
  if (s.occupancy == null) add(WEIGHTS.missingOccupancy, "Occupancy unclear");

  return { level: classifyLevel(score), reasons, score };
}