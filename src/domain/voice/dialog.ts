import { LoanPurpose } from "@/domain/types/enums";
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
}

const round2 = (n: number) => Math.round(n * 100) / 100;
const usd = (n: number) => `$${Math.round(n).toLocaleString("en-US")}`;

export function assess(x: VoiceExtraction): Assessment {
  const derived: Assessment["derived"] = {};
  const conflicts: string[] = [];

  let value = x.propertyValue?.value;
  let loan = x.loanAmount?.value;
  const stated = x.statedLtv?.value;

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
  }

  const has: Record<VitalKey, boolean> = {
    loanPurpose: x.loanPurpose !== undefined && !x.refinancePendingSubtype,
    occupancy: x.occupancy !== undefined,
    propertyType: x.propertyType !== undefined,
    propertyValue: value !== undefined,
    loanAmount: loan !== undefined,
    ltv: derived.ltv !== undefined,
    fico: x.fico !== undefined,
    incomeDocType: x.incomeDocType !== undefined,
  };

  const missing = VITAL_KEYS.filter((k) => !has[k]);
  // If both value and loan are missing, LTV alone can't resolve them — but
  // asking for LTV *and* both dollar figures is redundant; ask for the two
  // dollar figures (or one figure + LTV) and drop the separate LTV question.
  const askable = missing.filter((k) => k !== "ltv" || (!has.propertyValue && !has.loanAmount && stated === undefined));

  const questions = askable.map((k) =>
    k === "loanPurpose" && x.refinancePendingSubtype ? "Is the refinance rate-and-term or cash-out?" : VITAL_QUESTIONS[k]
  );

  const filledSummary: string[] = [];
  if (has.loanPurpose && x.loanPurpose) filledSummary.push(purposeLabel(x.loanPurpose.value));
  if (x.occupancy) filledSummary.push(x.occupancy.source);
  if (x.propertyType) filledSummary.push(x.propertyType.source);
  if (value !== undefined) filledSummary.push(`${usd(value)} value`);
  if (loan !== undefined)
    filledSummary.push(`${usd(loan)} loan${derived.ltv !== undefined ? ` (${derived.ltv}% LTV)` : ""}`);
  if (x.fico) filledSummary.push(`FICO ${x.fico.value}`);
  if (x.incomeDocType)
    filledSummary.push(
      x.incomeDocType.value === "bank_statement"
        ? `${x.bankStatementMonths ?? 12}-mo ${x.bankStatementKind ?? "business"} bank statements`
        : x.incomeDocType.source
    );

  const vitalsFilled = VITAL_KEYS.filter((k) => has[k]).length;
  const complete = missing.length === 0;
  const readyToAnalyze = complete && conflicts.length === 0;

  let prompt: string;
  if (conflicts.length > 0) {
    prompt = conflicts.join(" ");
  } else if (complete) {
    prompt = `All set — ${vitalsFilled} of ${VITAL_KEYS.length} vitals captured: ${filledSummary.join(", ")}. Analyzing your scenario and ranking matching lenders now.`;
  } else if (filledSummary.length === 0) {
    prompt = `Tell me the full scenario in one go — I need ${listNaturally(askable.map((k) => VITAL_LABELS[k].toLowerCase()))}.`;
  } else {
    prompt = `Got ${filledSummary.join(", ")}. I still need ${listNaturally(askable.map((k) => VITAL_LABELS[k].toLowerCase()))}. ${questions.slice(0, 3).join(" ")}`;
  }

  return { complete, readyToAnalyze, vitalsFilled, vitalsTotal: VITAL_KEYS.length, filledSummary, missing, questions, prompt, derived, conflicts };
}

function purposeLabel(p: LoanPurpose): string {
  return p === "purchase" ? "purchase" : p === "cash_out_refinance" ? "cash-out refinance" : "rate-and-term refinance";
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
  if (value === undefined || loan === undefined || !x.loanPurpose || !x.occupancy || !x.propertyType || !x.fico || !x.incomeDocType) {
    throw new Error("buildScenarioInput: assessment reported complete but a vital is missing");
  }

  const assumptions = [...x.notesFragments];
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
    x.incomeDocType && `income doc ← "${x.incomeDocType.source}"`,
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
    fico: x.fico.value,
    incomeDocType: doc,
    ...(x.citizenship ? { citizenship: x.citizenship.value } : {}),
    ...(x.firstTimeInvestor !== undefined ? { firstTimeInvestor: x.firstTimeInvestor } : {}),
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
