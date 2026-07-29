import type {
  Citizenship,
  IncomeDocType,
  LoanPurpose,
  Occupancy,
  PropertyType,
  RuleOutcome,
  RuleSeverity,
  VerificationStatus,
  Vesting,
} from "./enums";

/** A configurable comparison operator supported by the rules engine. */
export type RuleOperator =
  | "equals"
  | "not_equals"
  | "gt"
  | "gte"
  | "lt"
  | "lte"
  | "between"
  | "in"
  | "not_in"
  | "contains"
  | "exists"
  | "not_exists";

export type RuleValue = string | number | boolean | Array<string | number> | null;

/** A single leaf condition: evaluate `field` with `operator` against `value`. */
export interface RuleCondition {
  field: string; // dot-path into the evaluation context, e.g. "fico" or "calc.ltv"
  operator: RuleOperator;
  value?: RuleValue;
  unit?: string; // documentation only, e.g. "percent", "months", "usd"
}

/** A nested boolean group. Exactly one of `all` / `any` is populated per node. */
export interface RuleGroup {
  all?: Array<RuleGroup | RuleCondition>;
  any?: Array<RuleGroup | RuleCondition>;
}

export function isCondition(node: RuleGroup | RuleCondition): node is RuleCondition {
  return (node as RuleCondition).operator !== undefined;
}

/** A named, versioned, reviewable eligibility rule. */
export interface Rule {
  id: string;
  lenderId: string;
  programId: string;
  guidelineVersionId: string;
  category: string; // e.g. "ltv", "fico", "occupancy", "reserves", "credit_event"
  name: string;
  conditions: RuleGroup;
  /**
   * Outcome applied when `conditions` evaluate TRUE. If a rule expresses a
   * requirement, model the conditions as the passing case and set
   * `outcomeWhenFalse` to the failing outcome. See rules-engine docs.
   */
  outcomeWhenTrue: RuleOutcome;
  outcomeWhenFalse: RuleOutcome;
  severity: RuleSeverity;
  userExplanation: string;
  internalExplanation?: string;
  /** When this rule passes and sets a derived maximum (e.g. max LTV), record it. */
  setsField?: { field: "maxLtv" | "maxCltv" | "maxLoanAmount" | "minReservesMonths"; value: number };
  sourceSection?: string;
  sourcePage?: number;
  effectiveDate?: string;
  expirationDate?: string;
  createdBy?: string;
  reviewedBy?: string;
  verificationStatus: VerificationStatus;
}

export interface LtvMatrixEntry {
  minFico: number;
  maxLtv: number; // percent 0-100
  occupancy?: Occupancy;
  maxLoanAmount?: number;
}

export interface Program {
  id: string;
  lenderId: string;
  organizationId: string; // null-equivalent for platform templates handled at repo layer
  name: string;
  isSampleData: boolean;
  active: boolean;
  incomeDocTypes: IncomeDocType[];
  loanPurposes: LoanPurpose[];
  occupancies: Occupancy[];
  propertyTypes: PropertyType[];
  eligibleStates: string[] | "ALL";
  citizenshipEligible: Citizenship[];
  vestingEligible: Vesting[];
  minLoanAmount: number;
  maxLoanAmount: number;
  minFico: number;
  maxDti?: number; // percent; omitted for pure DSCR / no-ratio programs
  minDscr?: number;
  baseMaxLtv: number; // percent, before matrix/rule refinement
  minReservesMonths: number;
  interestOnlyAvailable: boolean;
  prepaymentPenaltyOptions: string[];
  ltvMatrix?: LtvMatrixEntry[];
  // Borrower-experience eligibility flags. All optional/undefined = no
  // restriction on that dimension (matches every existing Program record
  // without any migration — see docs/voice-vitals.md).
  firstTimeHomebuyerAllowed?: boolean;
  firstTimeInvestorAllowed?: boolean;
  /** true = this program requires an experienced investor (first-time
   * investors are ineligible); undefined/false = no such requirement. */
  experiencedInvestorRequired?: boolean;
  /** Maximum 30-day mortgage/housing-history lates allowed in the trailing
   * 12 months (real guideline language: "0x30x12", "1x30x12 allowed with
   * LLPA"). undefined = not yet documented for this program (never
   * evaluated, matching the "no restriction on this dimension" pattern
   * used by the other optional eligibility flags above) — NOT the same as
   * 0, which means the guideline explicitly requires a clean 12-month
   * housing history. */
  maxMortgageLates30x12?: number;
  /** Per-citizenship maximum LTV override — real guidelines frequently cap
   * a specific citizenship classification below the program's general
   * baseMaxLtv/ltvMatrix (e.g. "Non-Permanent Resident Aliens: Maximum
   * 75% LTV" even though the same program otherwise allows 80%). Applied
   * as an ADDITIONAL cap in deriveMaxLtv (the more restrictive of this and
   * the base/matrix-derived cap wins) — never used to grant a HIGHER LTV
   * than the base program allows. Omit a citizenship key entirely when
   * the guideline states no distinct cap for it (e.g. "eligible for all
   * products" with no separate LTV language) — do not default it to the
   * base cap, which would misrepresent an undocumented figure as verified. */
  citizenshipLtvCaps?: Partial<Record<Citizenship, number>>;
  /** Per-property-type maximum LTV override — real guidelines routinely cap
   * condos below a program's general baseMaxLtv/ltvMatrix ceiling (e.g. a
   * program that otherwise goes to 90% LTV may cap a Fannie/Freddie
   * warrantable condo at 85% LTV and a non-warrantable condo at 80% LTV).
   * Applied as an ADDITIONAL cap in deriveMaxLtv, same "only ever tightens,
   * never loosens" rule as citizenshipLtvCaps: the more restrictive of this
   * and the base/matrix/citizenship-derived cap wins. Keyed by PropertyType
   * (e.g. "condo", "non_warrantable_condo", "condotel") — omit a property
   * type entirely when the guideline documents no distinct cap for it; do
   * NOT default it to the base cap, which would misrepresent an
   * undocumented figure as verified. Added 2026-07-29 after a real
   * data-integrity bug: a lender's condo/non-warrantable-condo LTV
   * restriction was undocumented in the engine, so scenarios were matched
   * against that lender's full baseMaxLtv (e.g. 90%) even though the
   * lender's own guidelines cap a warrantable condo at 85% LTV and a
   * non-warrantable condo at 80% LTV. */
  propertyTypeLtvCaps?: Partial<Record<PropertyType, number>>;
  /**
   * No-FICO / nonnumeric-credit-profile policy — per the F-1 visa / no-FICO
   * fix (2026-07-28). A borrower legitimately without a numeric U.S. FICO
   * (e.g. a foreign national, or an F-1 visa holder who never established
   * U.S. credit) must NEVER be auto-rejected just because `minFico` can't
   * be evaluated numerically — but the platform must also never INVENT an
   * eligibility answer the uploaded guideline doesn't actually state.
   * undefined = "guidelines do not specify" (never evaluated as a pass OR
   * a fail — surfaced as a manual-review item asking the user to confirm
   * with the lender's AE), matching the "no restriction documented yet"
   * pattern used by the other optional eligibility flags on this type.
   *  - "eligible": this program explicitly accepts a no-FICO borrower with
   *    no additional alternative-credit documentation required.
   *  - "eligible_with_alternative_credit": accepted, but the guideline
   *    requires alternative credit documentation (foreign credit report,
   *    international credit-reference letters, housing/rental history,
   *    bank or utility payment history, additional reserves, etc.).
   *  - "requires_foreign_credit": the guideline specifically requires a
   *    foreign credit report/reference (not just any alternative credit).
   *  - "requires_us_fico": this program requires a numeric U.S. FICO score
   *    and does NOT accept a no-FICO borrower at all.
   */
  noFicoPolicy?: "eligible" | "eligible_with_alternative_credit" | "requires_foreign_credit" | "requires_us_fico";
  /** Per-guideline maximum LTV override applied ONLY to a no-FICO /
   * nonnumeric-credit-profile borrower — real guidelines commonly cap a
   * no-FICO or foreign-credit-only borrower below the program's general
   * baseMaxLtv (parallel to citizenshipLtvCaps above). Applied as an
   * ADDITIONAL cap in deriveMaxLtv (the more restrictive of this and any
   * other applicable cap wins). Omit when the guideline documents no
   * distinct no-FICO LTV cap — never default it to the base cap. */
  noFicoMaxLtv?: number;
  /** Editorial flag, admin-set: this program is curated as a specialist
   * Foreign National lender (broad guidelines, consistent execution) —
   * per user direction 2026-07-28. This NEVER overrides real eligibility
   * (a program that hard-fails citizenship/LTV/etc. is still excluded
   * outright) and never silently reorders results — it only adds a small,
   * disclosed scoring factor (see score.ts) shown in the transparent score
   * breakdown, and a distinct "Foreign National Specialist" badge in the
   * UI, so the boost is always auditable rather than a hidden thumb on
   * the scale. Only ever set on a program ALREADY citizenship-eligible
   * for foreign_national — flagging an ineligible program would have no
   * effect (the hard citizenship filter runs first) but should still never
   * be done, since it would misrepresent the editorial curation itself. */
  foreignNationalSpecialist?: boolean;
  /** Same editorial-signal pattern, for ITIN — admin-set, per user
   * direction 2026-07-28. Same rules apply: never overrides real
   * eligibility (a program that hard-fails citizenship/LTV/etc. is still
   * excluded outright regardless of this flag) and never silently
   * reorders results — only a small, disclosed scoring factor (score.ts)
   * plus a distinct "ITIN Specialist" badge in the UI. Only ever set on a
   * program ALREADY citizenship-eligible for itin. */
  itinSpecialist?: boolean;
  /** Same editorial-signal pattern, for a CLEAN, straightforward bank
   * statement file — per the "Bank Statement Guideline-First Lender
   * Intelligence" spec (2026-07-28). Only applies its scoring boost when
   * the scenario's own bank-statement file classification (see
   * bankStatementComplexity.ts) is "clean" — never for a moderate/high/
   * manual-review file, where pricing/technology should NOT outweigh
   * guideline flexibility. */
  bankStatementCleanExecution?: boolean;
  /** Same editorial-signal pattern, for a bank-statement file that needs
   * GUIDELINE FLEXIBILITY (a nuance, overlay, or complication) — only
   * applies its scoring boost when the file classification is moderate,
   * high complexity, or manual-review-recommended; never for a clean
   * file. */
  bankStatementFlexible?: boolean;
  /**
   * ITIN + DSCR combination fields — added 2026-07-29 per the "Lender
   * Program Expansion and ITIN DSCR Update" spec. A program can
   * independently list `itin` in citizenshipEligible AND `dscr` in
   * incomeDocTypes without its guideline actually permitting the SAME
   * borrower to combine both — many lenders sell ITIN and DSCR as
   * entirely separate product lines with different underwriting. These
   * fields are deliberately NEVER inferred from citizenshipEligible/
   * incomeDocTypes membership; each is its own explicit fact that must
   * trace to the lender's current matrix. undefined = not yet confirmed
   * (evaluated as a manual-review "guideline confirmation required" item
   * in baseProgramChecks, never silently assumed eligible OR ineligible);
   * true = the current matrix expressly confirms the combination; false =
   * the current matrix expressly DENIES it (e.g. NQM Funding's own Flex
   * guidelines state ITIN borrowers are ineligible for its Investor DSCR
   * program) — modeled as a hard fail, distinct from "not yet confirmed".
   */
  itinDscrEligible?: boolean;
  /** Same pattern, for ITIN + NO-RATIO (DSCR-family qualification with no
   * minimum DSCR ratio requirement) specifically. */
  itinNoRatioEligible?: boolean;
  /** Same pattern, for FOREIGN NATIONAL + DSCR combination specifically —
   * independent of citizenshipEligible including foreign_national and
   * incomeDocTypes including dscr both being true on their own. */
  foreignNationalDscrEligible?: boolean;
  /** Explicit confirmation that this program's ITIN eligibility extends to
   * OWNER-OCCUPIED (primary residence) transactions specifically. Some
   * lenders' ITIN programs are investment-only (or vice versa) — omit
   * when the guideline doesn't distinguish by occupancy (citizenshipEligible
   * + occupancies already govern eligibility with no further restriction).
   * Only meaningful when false: it then hard-fails an ITIN + primary-
   * occupancy scenario even though the program otherwise lists itin in
   * citizenshipEligible and primary in occupancies. */
  ownerOccupiedItinEligible?: boolean;
  /** Same pattern, for INVESTMENT-property ITIN eligibility specifically. */
  investmentItinEligible?: boolean;
  guidelineVersionId: string;
  guidelineVersionLabel: string;
  effectiveDate: string;
  lastVerifiedDate?: string;
  sourceCitation: string;
  notes?: string;
}

export interface Lender {
  id: string;
  organizationId: string;
  name: string;
  isSampleData: boolean;
  active: boolean;
  contactEmail?: string;
  notes?: string;
  /** Minimum subscription tier (1 Essential, 2 Professional, 3 Enterprise) required to see this lender. */
  tierLevel: number;
}

export interface GuidelineVersion {
  id: string;
  lenderId: string;
  programId: string;
  label: string; // e.g. "v1.0"
  effectiveDate: string;
  expirationDate?: string;
  lastVerifiedDate?: string;
  verificationStatus: VerificationStatus;
  publishedAt?: string;
  reviewedBy?: string;
}
