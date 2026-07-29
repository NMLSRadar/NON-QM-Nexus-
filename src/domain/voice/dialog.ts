import { IncomeDocType, LoanPurpose } from "@/domain/types/enums";
import type { ScenarioInput } from "@/domain/validation/scenarioSchema";
import { VITAL_KEYS, VITAL_LABELS, VITAL_QUESTIONS, VitalKey, VoiceExtraction } from "./slots";

/**
 * Slot-filling dialog manager for voice intake.
 *
 * Deterministically assesses what has been captured, derives what can be
 * derived (any one of {property value, loan amount, LTV} from the other two),
 * detects contradictions, and produces the assistant's next prompt: an
 * acknowledgment of what it heard plus targeted questions for exactly the
 * vitals still missing. When all eight vitals resolve and there are no
 * conflicts, `readyToAnalyze` is true and the UI runs the analysis
 * automatically.
 */

export interface Assessment {
  /** All eight vitals resolved (stated or derived). */
  complete: boolean;
  /** Complete AND no unresolved conflicts — safe to auto-run analysis. */
  readyToAnalyze: boolean;
  vitalsFilled: number;
  vitalsTotal: number;
  filledSummary: string[];
  missing: VitalKey[];
  questions: string[];
  prompt: string;
  derived: { ltv?: number; loanAmount?: number; propertyValue?: number };
  conflicts: string[];
  /** Set when down payment/LTV was never stated and a conservative default
   * (bank statement 10% down / DSCR 15% down / ITIN 15% down) was assumed
   * instead — surfaced to the user so they can correct it. */
  assumedDownPaymentNote?: string;
  /** Set when the citizenship classification was resolved at MEDIUM
   * confidence — currently only the ambiguous "I-10"/"I ten"/"eye ten"
   * ITIN surface form, accepted only because nearby mortgage-borrower
   * context anchored it (see classifyCitizenship in extract.ts). Shown as
   * a soft confirmation rather than a definitive statement, since an
   * explicit "ITIN"/"eye-tin"/"individual taxpayer ID" mention needs no
   * such caveat. */
  citizenshipConfidenceNote?: string;
  /** Set when the citizenship classification came from an explicit visa
   * code (currently only F-1) — explains the auto-classification per the
   * F-1 visa / no-FICO fix (2026-07-28). */
  visaClassificationNote?: string;
  /** Set when a nonnumeric credit-profile status (No FICO, No U.S.
   * Credit, Foreign Credit, Insufficient Credit History, Credit Score
   * Unknown) was captured in place of a numeric FICO — explains how this
   * affects lender matching per the F-1 visa / no-FICO fix (2026-07-28). */
  noFicoNote?: string;
  /** Refinance-only figures — present whenever propertyValue and
   * existingLienBalance are both known, regardless of whether the 8 core
   * vitals are complete yet (so they update live as soon as they can). */
  refinanceCalc?: {
    currentLienLtv: number;
    proposedLtv?: number;
    grossEquity: number;
    /** Only set when the requested new loan amount exceeds the current
     * lien balance — never a negative "cash-out". */
    grossCashOut?: number;
  };
}

const round2 = (n: number) => Math.round(n * 100) / 100;
const usd = (n: number) => `$${Math.round(n).toLocaleString("en-US")}`;

// Conservative default max-LTV assumptions used ONLY as a last-resort safety
// net — the assistant should always actively ask for the actual down
// payment/LTV first (see the `ltv` VITAL_QUESTION); this only fires if a
// scenario is otherwise complete except for down payment/LTV never having
// been captured despite asking. Per real published guidelines: no real
// bank-statement Non-QM program exceeds 90% LTV (10% min down). DSCR: per
// user decision 2026-07-27, the default is 85% LTV (15% min down) — a real,
// commonly-available DSCR ceiling across this catalog (e.g. NQM Funding's
// Investor DSCR, Angel Oak), used deliberately over the more conservative
// 80%/20%-down figure some lenders cap at. Only the two doc types the user
// explicitly specified a rule for are covered here; other doc types fall
// back to no default (the assistant keeps asking).
const DEFAULT_MAX_LTV_BY_DOC_TYPE: Partial<Record<IncomeDocType, number>> = {
  bank_statement: 90,
  dscr: 85,
};
// ITIN borrowers: typically capped at 85% LTV (15% min down) across this
// catalog, with GreenBox Loans' ITIN Full Doc program as the one disclosed
// exception at 89% LTV — 85% (the general case, not the exception) is used
// as the safety-net default; GreenBox's real 89% figure is still evaluated
// normally by the matching engine once a real scenario is run, this only
// affects what's ASSUMED when the user never states a down payment at all.
const DEFAULT_MAX_LTV_ITIN = 85;

function defaultMaxLtv(docType: IncomeDocType | undefined, isItin: boolean): number | undefined {
  if (isItin) return DEFAULT_MAX_LTV_ITIN;
  if (!docType) return undefined;
  return DEFAULT_MAX_LTV_BY_DOC_TYPE[docType];
}

export function assess(x: VoiceExtraction): Assessment {
  const derived: Assessment["derived"] = {};
  const conflicts: string[] = [];
  /** Set when down payment/LTV was never stated and a conservative default
   * was assumed instead — surfaced distinctly in the summary/prompt so the
   * user can correct it, and carried into the final scenario's notes. */
  let assumedDownPaymentNote: string | undefined;

  let value = x.propertyValue?.value;
  let loan = x.loanAmount?.value;
  const stated = x.statedLtv?.value;

  // Cash-out refinance derivation: Property Value + Current Mortgage
  // Balance + Cash Requested -> Estimated New Loan Amount -> Estimated LTV.
  // Takes priority over the generic value/loan/LTV algebra below whenever
  // no loan amount or LTV was stated directly but the two refinance-
  // specific figures were — this is the single most common way a real
  // cash-out refinance is actually described ("they owe $300,000 and want
  // $250,000 cash after closing costs" — never a loan amount or LTV
  // stated at all, since the broker doesn't do that math out loud).
  if (loan === undefined && stated === undefined && value !== undefined && x.existingLienBalance !== undefined && x.requestedCashOut !== undefined) {
    loan = Math.round(x.existingLienBalance.value + x.requestedCashOut.value);
    derived.loanAmount = loan;
    derived.ltv = round2((loan / value) * 100);
  }

  if (value && loan) {
    derived.ltv = round2((loan / value) * 100);
    if (stated !== undefined && Math.abs(stated - derived.ltv) > 1) {
      conflicts.push(
        `You said ${stated}% LTV, but ${usd(loan)} against ${usd(value)} is ${derived.ltv}% — confirm which figure to use, or correct one of the numbers.`
      );
    }
  } else if (value && stated !== undefined) {
    loan = Math.round(value * (stated / 100));
    derived.loanAmount = loan;
    derived.ltv = stated;
  } else if (loan && stated !== undefined) {
    value = Math.round(loan / (stated / 100));
    derived.propertyValue = value;
    derived.ltv = stated;
  } else if (stated !== undefined) {
    derived.ltv = stated;
  } else {
    // Nothing about down payment/LTV was ever stated — safety-net default
    // ONLY (never a substitute for actively asking first; this is what
    // lets a scenario resolve if the user truly never answers).
    const isItin = x.citizenship?.value === "itin";
    const maxLtv = defaultMaxLtv(x.incomeDocType?.value, isItin);
    if (maxLtv !== undefined) {
      const docLabel = isItin ? "ITIN" : x.incomeDocType?.value === "bank_statement" ? "bank statement" : "DSCR";
      if (value !== undefined && loan === undefined) {
        loan = Math.round(value * (maxLtv / 100));
        derived.loanAmount = loan;
        derived.ltv = maxLtv;
        assumedDownPaymentNote = `Down payment wasn't stated, so ${100 - maxLtv}% down (${maxLtv}% LTV) was assumed as the default minimum for a ${docLabel} scenario — say the actual down payment or LTV to correct this.`;
      } else if (loan !== undefined && value === undefined) {
        value = Math.round(loan / (maxLtv / 100));
        derived.propertyValue = value;
        derived.ltv = maxLtv;
        assumedDownPaymentNote = `Property value wasn't stated, so it was derived from the loan amount assuming ${maxLtv}% LTV (the default minimum down payment for a ${docLabel} scenario) — say the actual property value, down payment, or LTV to correct this.`;
      }
    }
  }

  const has: Record<VitalKey, boolean> = {
    loanPurpose: x.loanPurpose !== undefined && !x.refinancePendingSubtype,
    occupancy: x.occupancy !== undefined,
    propertyType: x.propertyType !== undefined && !x.condoPendingWarrantability,
    propertyValue: value !== undefined,
    loanAmount: loan !== undefined,
    ltv: derived.ltv !== undefined,
    fico: x.fico !== undefined || x.creditProfileType !== undefined,
    incomeDocType: x.incomeDocType !== undefined,
    citizenship: x.citizenship !== undefined,
  };

  const missing = VITAL_KEYS.filter((k) => !has[k]);
  // If both value and loan are missing, LTV alone can't resolve them — but
  // asking for LTV *and* both dollar figures is redundant; ask for the two
  // dollar figures (or one figure + LTV) and drop the separate LTV question.
  const askable = missing.filter((k) => k !== "ltv" || (!has.propertyValue && !has.loanAmount && stated === undefined));

  const questions = askable.map((k) =>
    k === "loanPurpose" && x.refinancePendingSubtype
      ? "Is the refinance rate-and-term or cash-out?"
      : k === "propertyType" && x.condoPendingWarrantability
        ? "Is the condo warrantable or non-warrantable? (Warrantable condos are generally capped at 85% LTV; non-warrantable condos are generally capped at 80% LTV.)"
        : VITAL_QUESTIONS[k]
  );

  const filledSummary: string[] = [];
  if (has.loanPurpose && x.loanPurpose) filledSummary.push(purposeLabel(x.loanPurpose.value));
  if (x.occupancy) filledSummary.push(x.occupancy.source);
  if (has.propertyType && x.propertyType) filledSummary.push(x.propertyType.source);
  if (value !== undefined) filledSummary.push(`${usd(value)} value`);
  if (loan !== undefined)
    filledSummary.push(`${usd(loan)} loan${derived.ltv !== undefined ? ` (${derived.ltv}% LTV)` : ""}`);
  if (x.fico) filledSummary.push(`FICO ${x.fico.value}`);
  else if (x.creditProfileType) filledSummary.push(creditProfileLabel(x.creditProfileType.value));
  if (x.incomeDocType)
    filledSummary.push(
      x.incomeDocType.value === "bank_statement"
        ? `${x.bankStatementMonths ?? 12}-mo ${x.bankStatementKind ?? "business"} bank statements`
        : x.incomeDocType.source
    );
  if (x.employmentType) filledSummary.push(x.employmentType.value === "self_employed" ? "self-employed" : "W-2/salaried");
  if (x.citizenship) filledSummary.push(citizenshipLabel(x.citizenship.value, x.citizenship.visaType));
  const citizenshipConfidenceNote =
    x.citizenship?.confidence === "medium" ? "Borrower classification interpreted as ITIN." : undefined;
  // F-1 visa / no-FICO fix (2026-07-28): when the citizenship classification
  // came from an explicit visa code (currently only F-1), and/or a
  // nonnumeric credit-profile status was captured instead of a numeric
  // FICO, surface a plain-language explanation of what was auto-populated
  // and how it affects lender matching — mirrors the spec's worked example
  // response (never silently absorbed into the generic summary line).
  const visaClassificationNote =
    x.citizenship?.visaType === "F-1"
      ? `The borrower has been classified as a foreign national based on the stated F-1 visa.`
      : undefined;
  const noFicoNote = x.creditProfileType
    ? `The borrower has also been marked as having ${creditProfileLabel(x.creditProfileType.value).toLowerCase()} — Non-QM Nexus will prioritize lenders that permit no-FICO or foreign-national borrowers, foreign credit, or alternative credit documentation; maximum LTV and eligibility may depend on occupancy, housing history, reserves, loan amount, and whether foreign or alternative credit can be documented.`
    : undefined;
  // Extra (non-blocking) vitals — included in the summary whenever captured
  // so the assistant's spoken response and the Vitals tiles never disagree.
  if (x.firstTimeHomebuyer) filledSummary.push(x.firstTimeHomebuyer.value ? "first-time homebuyer" : "not a first-time homebuyer");
  if (x.investorExperience) filledSummary.push(investorExperienceLabel(x.investorExperience.value));
  if (x.vesting) filledSummary.push(`vesting: ${vestingLabel(x.vesting.value)}`);
  if (x.state) filledSummary.push(`${x.state.value} property`);
  if (x.existingLienBalance) filledSummary.push(`${usd(x.existingLienBalance.value)} current balance`);

  // Refinance-only: current lien-to-value / proposed LTV / equity / cash-out
  // — computed as soon as property value and the existing lien balance are
  // both known, independent of whether the 8 core vitals are complete yet,
  // so these figures can appear and update live as the borrower's answers
  // come in. The requested NEW loan amount (never the old balance) controls
  // the qualifying/proposed LTV — see docs/voice-vitals.md.
  let refinanceCalc: Assessment["refinanceCalc"];
  if (value !== undefined && x.existingLienBalance !== undefined) {
    const lien = x.existingLienBalance.value;
    const currentLienLtv = round2((lien / value) * 100);
    const proposedLtv = derived.ltv;
    const grossEquity = Math.round(value - lien);
    const grossCashOut = loan !== undefined && loan > lien ? Math.round(loan - lien) : undefined;
    refinanceCalc = { currentLienLtv, proposedLtv, grossEquity, grossCashOut };
  }

  const vitalsFilled = VITAL_KEYS.filter((k) => has[k]).length;
  const complete = missing.length === 0;
  const readyToAnalyze = complete && conflicts.length === 0;

  let prompt: string;
  if (conflicts.length > 0) {
    prompt = conflicts.join(" ");
  } else if (complete) {
    prompt = `All set — ${vitalsFilled} of ${VITAL_KEYS.length} vitals captured: ${filledSummary.join(", ")}.${
      citizenshipConfidenceNote ? ` ${citizenshipConfidenceNote}` : ""
    }${visaClassificationNote ? ` ${visaClassificationNote}` : ""}${noFicoNote ? ` ${noFicoNote}` : ""}${assumedDownPaymentNote ? ` ${assumedDownPaymentNote}` : ""} Analyzing your scenario and ranking matching lenders now.`;
  } else if (filledSummary.length === 0) {
    prompt = `Tell me the full scenario in one go — I need ${listNaturally(askable.map((k) => VITAL_LABELS[k].toLowerCase()))}.`;
  } else {
    prompt = `Got ${filledSummary.join(", ")}.${
      citizenshipConfidenceNote ? ` ${citizenshipConfidenceNote}` : ""
    }${visaClassificationNote ? ` ${visaClassificationNote}` : ""}${noFicoNote ? ` ${noFicoNote}` : ""} I still need ${listNaturally(askable.map((k) => VITAL_LABELS[k].toLowerCase()))}. ${questions.slice(0, 3).join(" ")}`;
  }

  return {
    complete,
    readyToAnalyze,
    vitalsFilled,
    vitalsTotal: VITAL_KEYS.length,
    filledSummary,
    missing,
    questions,
    prompt,
    derived,
    conflicts,
    assumedDownPaymentNote,
    citizenshipConfidenceNote,
    visaClassificationNote,
    noFicoNote,
    refinanceCalc,
  };
}

function purposeLabel(p: LoanPurpose): string {
  return p === "purchase"
    ? "purchase"
    : p === "cash_out_refinance"
      ? "cash-out refinance"
      : p === "rate_term_refinance"
        ? "rate-and-term refinance"
        : p === "heloc"
          ? "HELOC"
          : "second lien";
}

function investorExperienceLabel(v: "first_time_investor" | "experienced_investor" | "not_applicable"): string {
  return v === "first_time_investor" ? "first-time investor" : v === "experienced_investor" ? "experienced investor" : "not an investor scenario";
}

function vestingLabel(v: "individual" | "joint_tenants" | "llc" | "corporation" | "trust"): string {
  return v === "joint_tenants" ? "joint tenants" : v;
}

function citizenshipLabel(v: "us_citizen" | "permanent_resident" | "non_permanent_resident" | "itin" | "foreign_national", visaType?: string): string {
  const base = (() => {
    switch (v) {
      case "us_citizen":
        return "U.S. citizen";
      case "permanent_resident":
        return "permanent resident";
      case "non_permanent_resident":
        return "non-permanent resident";
      case "itin":
        return "ITIN borrower";
      case "foreign_national":
        return "foreign national";
    }
  })();
  return visaType ? `${base} (${visaType} visa)` : base;
}

function creditProfileLabel(v: "us_fico_score" | "no_fico" | "no_us_credit" | "foreign_credit" | "insufficient_credit_history" | "unknown"): string {
  switch (v) {
    case "us_fico_score":
      return "U.S. FICO score";
    case "no_fico":
      return "No FICO";
    case "no_us_credit":
      return "No U.S. Credit";
    case "foreign_credit":
      return "Foreign Credit Report";
    case "insufficient_credit_history":
      return "Insufficient Credit History";
    case "unknown":
      return "Credit Score Unknown";
  }
}

function listNaturally(items: string[]): string {
  if (items.length <= 1) return items[0] ?? "";
  return `${items.slice(0, -1).join(", ")} and ${items[items.length - 1]}`;
}

/**
 * Build a schema-valid ScenarioInput from a COMPLETE assessment. The result
 * feeds the existing createScenario server action unchanged, which analyzes
 * and displays ranked lender matches, best option first.
 */
export function buildScenarioInput(x: VoiceExtraction, a: Assessment): ScenarioInput {
  if (!a.complete) throw new Error("buildScenarioInput requires a complete assessment");
  const value = x.propertyValue?.value ?? a.derived.propertyValue;
  const loan = x.loanAmount?.value ?? a.derived.loanAmount;
  if (value === undefined || loan === undefined || !x.loanPurpose || !x.occupancy || !x.propertyType || (!x.fico && !x.creditProfileType) || !x.incomeDocType || !x.citizenship) {
    throw new Error("buildScenarioInput: assessment reported complete but a vital is missing");
  }

  const assumptions = [...x.notesFragments];
  if (a.assumedDownPaymentNote) assumptions.push(a.assumedDownPaymentNote);
  const doc = x.incomeDocType.value;
  const bankStatement =
    doc === "bank_statement"
      ? { personalOrBusiness: x.bankStatementKind ?? ("business" as const), months: x.bankStatementMonths ?? (12 as const) }
      : undefined;
  if (doc === "bank_statement" && !x.bankStatementKind) assumptions.push("Assumed BUSINESS bank statements (not stated).");
  if (doc === "bank_statement" && !x.bankStatementMonths) assumptions.push("Assumed 12 months of statements (not stated).");
  const pnl = doc === "pnl_only" ? { periodMonths: 12 } : undefined;
  if (pnl) assumptions.push("Assumed a 12-month P&L period (not stated).");
  const dscr =
    doc === "dscr"
      ? {
          ...(x.shortTermRental !== undefined ? { shortTermRental: x.shortTermRental } : {}),
          ...(x.firstTimeInvestor !== undefined ? { firstTimeInvestor: x.firstTimeInvestor } : {}),
        }
      : undefined;
  const provenance = [
    x.loanPurpose && `purpose ← "${x.loanPurpose.source}"`,
    x.occupancy && `occupancy ← "${x.occupancy.source}"`,
    x.propertyType && `property type ← "${x.propertyType.source}"`,
    x.propertyValue ? `value ← "${x.propertyValue.source}"` : `value ← derived from LTV`,
    x.loanAmount ? `loan ← "${x.loanAmount.source}"` : `loan ← derived from LTV`,
    x.fico && `FICO ← "${x.fico.source}"`,
    !x.fico && x.creditProfileType && `credit profile ← "${x.creditProfileType.source}"`,
    x.incomeDocType && `income doc ← "${x.incomeDocType.source}"`,
    x.citizenship && `citizenship ← "${x.citizenship.source}"`,
    x.citizenship?.visaType && `visa type ← "${x.citizenship.visaType}"`,
  ]
    .filter(Boolean)
    .join("; ");

  return {
    name: `Voice scenario — ${new Date().toISOString().slice(0, 10)}`,
    loanPurpose: x.loanPurpose.value,
    occupancy: x.occupancy.value,
    propertyType: x.propertyType.value,
    ...(x.units !== undefined ? { units: x.units } : {}),
    estimatedValue: value,
    ...(x.loanPurpose.value === "purchase" ? { purchasePrice: value } : {}),
    requestedLoanAmount: loan,
    ...(x.requestedCashOut ? { requestedCashOut: x.requestedCashOut.value } : {}),
    ...(x.existingLienBalance ? { currentLoanBalance: x.existingLienBalance.value } : {}),
    ...(x.fico ? { fico: x.fico.value } : {}),
    ...(!x.fico && x.creditProfileType ? { creditProfileType: x.creditProfileType.value } : {}),
    incomeDocType: doc,
    citizenship: x.citizenship.value,
    ...(x.citizenship.visaType ? { visaType: x.citizenship.visaType } : {}),
    ...(x.state ? { state: x.state.value } : {}),
    ...(x.firstTimeInvestor !== undefined ? { firstTimeInvestor: x.firstTimeInvestor } : {}),
    ...(x.investorExperience ? { investorExperience: x.investorExperience.value } : {}),
    ...(x.firstTimeHomebuyer ? { firstTimeHomebuyer: x.firstTimeHomebuyer.value } : {}),
    ...(x.vesting ? { vesting: x.vesting.value } : {}),
    ...(bankStatement ? { bankStatement } : {}),
    ...(pnl ? { pnl } : {}),
    ...(dscr ? { dscr } : {}),
    notes: [
      "Captured via voice intake; fields extracted deterministically from the transcript and confirmed on screen.",
      provenance && `Provenance: ${provenance}.`,
      assumptions.length > 0 && `Assumptions: ${assumptions.join(" ")}`,
    ]
      .filter(Boolean)
      .join("\n"),
  };
}
