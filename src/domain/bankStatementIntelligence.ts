/**
 * BANK STATEMENT EXPENSE-FACTOR INTELLIGENCE (2026-08-06 spec §§2-11, 17).
 *
 * Deterministic knowledge for reasoning about expense factors. This is the
 * GENERAL EDUCATIONAL layer — it never overrides a lender's verified
 * guideline (spec §1). The priority order it supports is:
 *   1. actual lender guideline (Program.standardExpenseFactor etc.)
 *   2. lender-specific exception / alternative methodology
 *   3. documentation-supported expense factor (CPA/EA letter, P&L, narrative)
 *   4. this general industry-expectation layer (education / estimation only)
 *
 * Nothing here is ever presented as a lender requirement. It classifies a
 * business's likely overhead profile and estimates qualifying income across a
 * range of expense factors so the assistant can ask smarter questions and
 * compare lenders — then the model defers to real guideline data.
 */

// ---------------------------------------------------------------------------
// §12 — phrase recognition for the conversational assistant + voice scenario.
// Kept as a tested list so the prompt can cite it and the deterministic
// extractor can match on it.
// ---------------------------------------------------------------------------
export const EXPENSE_FACTOR_PHRASES = [
  "expense ratio",
  "expense factor",
  "business expense factor",
  "reduced expense factor",
  "lower expense ratio",
  "10% expense factor",
  "15% expense factor",
  "20% expense factor",
  "50% expense factor",
  "cpa expense factor",
  "cpa letter",
  "accountant expense letter",
  "ea expense letter",
  "low overhead",
  "high overhead",
  "business overhead",
  "use more deposits",
  "use 100% of deposits",
  "qualifying deposits",
  "bank statement income",
  "bank statement qualifying income",
  "business bank statements",
  "personal bank statements",
] as const;

// ---------------------------------------------------------------------------
// §§3-4 — business-type → overhead profile. These are STARTING POINTS ONLY
// (spec: "general educational starting points only, subject to lender
// guidelines"). Spec §5 warns against deciding from the business title alone,
// so classification is a soft prior that must be confirmed with the
// overhead-detail questions in §11.
// ---------------------------------------------------------------------------
export type OverheadProfile = "low" | "high" | "unknown";

/** Ordered from most-specific to least — first match wins. */
const HIGH_OVERHEAD: RegExp[] = [
  /\brestaurant|bar\b|food service|food truck|catering/i,
  /\bretail|store|boutique|e-?commerce|shop\b/i,
  /\bmanufactur|factory|production/i,
  /\bconstruction|contractor|builder|remodel|roofing|plumb|electric|hvac|landscap/i,
  /\bauto (repair|shop|body)|mechanic|body shop/i,
  /\btrucking|freight|logistics|fleet/i,
  /\bsalon|barber|spa\b|gym|fitness (studio|center)/i,
  /\bmedical (practice|clinic)|dental|veterinar/i,
];
const LOW_OVERHEAD: RegExp[] = [
  /\breal estate (agent|broker)|realtor/i,
  /\b(mortgage )?(loan officer|\blo\b)\b/i,
  /\bconsultant|consulting|coach\b|coaching/i,
  /\binsurance agent/i,
  /\bfreelanc|freelance/i,
  /\bmarketing (consultant|agency)|copywriter|designer/i,
  /\b(software|it|tech|technology) consult/i,
  /\baccountant|bookkeep|\bcpa\b/i,
  /\bphotograph/i,
];

/** §5 overhead-detail signals that can UPGRADE a low-titled business to high.
 *  Negation-aware: each pattern asserts the overhead is PRESENT, so it must
 *  not match when preceded by "no/without/zero" (e.g. "no employees" is LOW
 *  overhead, not high). */
const HIGH_OVERHEAD_SIGNALS: RegExp[] = [
  /(?<!no\s)(?<!without\s)(?<!zero\s)(?<!has no\s)\b\d+\s*employees?\b/i, // a specific headcount
  /(?<!no\s)(?<!without\s)(?<!has no\s)\b(has|employs|with)\s+\w*\s*employees?\b/i,
  /(?<!no\s)(?<!without\s)\boffice (space|lease)|lease[sd]? (an )?office|commercial (space|location|building)/i,
  /(?<!no\s)(?<!without\s)(?<!carries no\s)\binventory|warehouse/i,
  /(?<!no\s)(?<!without\s)(?<!significant\s)\b(significant|substantial|large)\s+(equipment|inventory|materials|payroll|overhead)/i,
  /\bmachinery|fleet of|work trucks?\b/i,
  /\bcost of goods|\bcogs\b|raw materials?\b/i,
  /(?<!no\s)(?<!without\s)(?<!uses? no\s)\bsubcontractors?\b|1099 (workers?|contractors?)/i,
  /\bmultiple (employees|locations|trucks|crews)\b|\bpayroll of\b/i,
];
/** §5 signals that keep a business genuinely LOW overhead. */
const LOW_OVERHEAD_SIGNALS: RegExp[] = [
  /\bno employees?\b|just me\b|only me\b|sole prop|solo\b/i,
  /\bwork(s|ing)? from home|home[- ]based|home office/i,
  // "no office/inventory/equipment/overhead" — a bare negation list. Kept
  // specific (not "no <word>") so it never misfires on "no experience" etc.
  /\bno (office space|office lease|office|inventory|equipment|overhead|materials|staff|payroll)\b/i,
  /\bno overhead|low overhead|minimal overhead|little overhead/i,
];

export interface OverheadAssessment {
  profile: OverheadProfile;
  /** The expense-factor RANGE (percent treated as EXPENSE) that is a
   *  reasonable educational starting point for this profile. Low overhead →
   *  10-20, high overhead → 40-50 (can go higher per lender). null if unknown. */
  typicalExpenseRange: [number, number] | null;
  /** Why the classification was made (surfaceable to the broker). */
  reason: string;
  /** Whether the title alone was ambiguous and §5 overhead details decided it. */
  overheadDriven: boolean;
}

/**
 * Classify a business description into a likely overhead profile.
 * Priority: explicit §5 overhead signals beat the business TITLE every time
 * (a "consultant" with 12 employees and an office lease is NOT low-overhead).
 */
export function classifyOverhead(description: string): OverheadAssessment {
  const d = (description ?? "").toLowerCase();
  if (!d.trim()) {
    return { profile: "unknown", typicalExpenseRange: null, reason: "No business description provided.", overheadDriven: false };
  }

  const hasHighSignal = HIGH_OVERHEAD_SIGNALS.some((r) => r.test(d));
  const hasLowSignal = LOW_OVERHEAD_SIGNALS.some((r) => r.test(d));
  const highTitle = HIGH_OVERHEAD.some((r) => r.test(d));
  const lowTitle = LOW_OVERHEAD.some((r) => r.test(d));

  // §5: concrete overhead facts override the title in BOTH directions.
  if (hasHighSignal) {
    return {
      profile: "high",
      typicalExpenseRange: [40, 50],
      reason: "Has employees, inventory, equipment, materials, or other substantial overhead.",
      overheadDriven: true,
    };
  }
  if (hasLowSignal) {
    return {
      profile: "low",
      typicalExpenseRange: [10, 20],
      reason: "Home-based / no employees / minimal overhead signals present.",
      overheadDriven: true,
    };
  }
  if (highTitle && !lowTitle) {
    return {
      profile: "high",
      typicalExpenseRange: [40, 50],
      reason: "Business type typically carries significant overhead (payroll, inventory, materials, equipment).",
      overheadDriven: false,
    };
  }
  if (lowTitle && !highTitle) {
    return {
      profile: "low",
      typicalExpenseRange: [10, 20],
      reason: "Business type is typically low-overhead (professional service).",
      overheadDriven: false,
    };
  }
  return {
    profile: "unknown",
    typicalExpenseRange: null,
    reason: "Cannot determine overhead from the description — need business type and overhead details.",
    overheadDriven: false,
  };
}

// ---------------------------------------------------------------------------
// §9 — estimated qualifying income across a ladder of expense factors.
// qualifying income = eligible deposits × (1 − expenseFactor)
// (ownership% handled separately by the deterministic calc engine; here we
// show the simple, educational per-factor estimate the assistant quotes).
// ---------------------------------------------------------------------------
export interface ExpenseLadderRow {
  expensePercent: number;
  /** Percentage of deposits counted as qualifying income. */
  incomeFactorPercent: number;
  qualifyingMonthlyIncome: number;
}

export const EXPENSE_LADDER: number[] = [10, 15, 20, 30, 40, 50];

export function estimateIncomeLadder(monthlyEligibleDeposits: number, expensePercents: number[] = EXPENSE_LADDER): ExpenseLadderRow[] {
  const deposits = Math.max(0, monthlyEligibleDeposits);
  return expensePercents.map((pct) => ({
    expensePercent: pct,
    incomeFactorPercent: 100 - pct,
    qualifyingMonthlyIncome: Math.round(deposits * (1 - pct / 100)),
  }));
}

// ---------------------------------------------------------------------------
// §11 — the follow-up questions that materially change the expense-factor
// answer. Returned so the assistant asks only what matters.
// ---------------------------------------------------------------------------
export const EXPENSE_FOLLOWUP_QUESTIONS = [
  "What type of business does the borrower operate?",
  "Does the business have employees, and roughly how many?",
  "Is it home-based or does it lease commercial/office space?",
  "Does it carry inventory, significant equipment, or materials / cost of goods sold?",
  "Does it use independent contractors / subcontractors?",
  "Is this a 12-month or 24-month bank statement program, and personal or business statements?",
  "Is a CPA/EA letter or P&L available to support a reduced expense factor?",
] as const;
