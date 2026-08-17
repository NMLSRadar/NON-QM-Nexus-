import type {
  Citizenship,
  IncomeDocType,
  LienPosition,
  LoanPurpose,
  MortgageLatesCategory,
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

/** A full-fidelity lender matrix row. This preserves transaction purpose,
 * loan-amount band, DSCR band, citizenship and property type instead of
 * collapsing a real matrix to one headline LTV. */
export interface EligibilityLtvMatrixEntry {
  maxLtv: number;
  minFico?: number;
  maxLoanAmount?: number;
  loanPurpose?: LoanPurpose;
  occupancy?: Occupancy;
  propertyType?: PropertyType;
  citizenship?: Citizenship;
  incomeDocType?: IncomeDocType;
  lienPosition?: LienPosition;
  minDscr?: number;
  /** Exclusive upper boundary, e.g. 1.0 for a 0.75–0.99 DSCR tier. */
  maxDscrExclusive?: number;
  sourcePage?: number;
  sourceSection?: string;
}

/** A conditional DTI tier. `maxDti` is available only when every supplied
 * condition is met; otherwise the program's ordinary `maxDti` controls. */
export interface ConditionalDtiRule {
  maxDti: number;
  minFico?: number;
  maxLtv?: number;
  loanPurposes?: LoanPurpose[];
  occupancies?: Occupancy[];
  requiresResidualIncomeReview?: boolean;
  residualIncomeRequirement?: string;
}

/** Credit-event leverage/loan-size overlay selected by the most recent
 * bankruptcy, foreclosure, or short-sale seasoning stated in the scenario. */
export interface CreditEventLtvRule {
  minSeasoningMonths: number;
  maxLoanAmount: number;
  maxLtvPurchase: number;
  maxLtvRefinance: number | null;
}

/** Housing-history overlay for the most severe late category reported. */
export interface HousingHistoryLtvRule {
  category: MortgageLatesCategory;
  maxLoanAmount: number;
  maxLtvPurchase: number;
  maxLtvRefinance: number | null;
}

/** Purpose-aware 1-4 unit matrix row. Null is an explicit N/A cell. */
export interface PurposeLtvMatrixEntry {
  maxLoanAmount: number;
  minFico: number;
  occupancy?: Occupancy;
  minDscr?: number;
  maxLtvPurchase: number | null;
  maxLtvRateTerm: number | null;
  maxLtvCashOut: number | null;
}

/**
 * A single loan-amount-band / FICO-tier row of a lender's 5-8 unit
 * residential LTV grid — added 2026-08-01 (Lender Database Audit & 5-8
 * Unit Expansion spec). Real 5-8 unit matrices (e.g. LoanStream's) vary
 * maximum LTV by loan amount AND FICO AND transaction type at once, which
 * plain LtvMatrixEntry cannot express. Lookup: pick the row with the
 * SMALLEST `maxLoanAmount` that is >= the scenario's loan amount, and
 * within that row's set of FICO tiers pick the tier with the LARGEST
 * `minFico` that is <= the scenario's FICO; then read the LTV for the
 * scenario's transaction type off that tier.
 */
export interface FiveToEightUnitLtvMatrixEntry {
  /** This band's loan-amount ceiling (the matrix's own row header, e.g.
   * $1,500,000 / $2,000,000 / $2,500,000 / $3,000,000). */
  maxLoanAmount: number;
  minFico: number;
  maxLtvPurchase: number;
  maxLtvRateTerm: number;
  maxLtvCashOut: number;
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
  conditionalDtiRules?: ConditionalDtiRule[];
  minDscr?: number;
  baseMaxLtv: number; // percent, before matrix/rule refinement
  minReservesMonths: number;
  /** Conditional reserve overlays. Every matching row applies and the highest
   * months requirement controls. Omitted dimensions mean all. */
  reserveRules?: Array<{
    months: number;
    minLoanAmountExclusive?: number;
    maxLoanAmount?: number;
    minLtvExclusive?: number;
    maxLtv?: number;
    minFico?: number;
    maxFicoExclusive?: number;
    minDscr?: number;
    maxDscrExclusive?: number;
    citizenship?: Citizenship;
    occupancy?: Occupancy;
    loanPurpose?: LoanPurpose;
    firstTimeHomebuyer?: boolean;
    firstTimeInvestor?: boolean;
  }>;
  interestOnlyAvailable: boolean;
  prepaymentPenaltyOptions: string[];
  ltvMatrix?: LtvMatrixEntry[];
  /** Preferred full-fidelity matrix. When present it is authoritative over
   * ltvMatrix/baseMaxLtv for the scenario being evaluated. */
  eligibilityLtvMatrix?: EligibilityLtvMatrixEntry[];
  creditEventLtvRules?: CreditEventLtvRule[];
  housingHistoryLtvRules?: HousingHistoryLtvRule[];
  /** Closed-end seconds and HELOCs are evaluated against combined liens. */
  ltvMetric?: "ltv" | "cltv";
  /** Cash-out dollar caps by leverage band. Select the smallest maxLtv that
   * covers the scenario; null means unlimited at that leverage. */
  cashOutLimits?: Array<{ maxLtv: number; maxCashOutAmount: number | null }>;
  /** Additional documentation-method caps/restrictions. They only tighten the
   * program matrix and prevent a bundled program row from granting a purpose
   * that the lender allows for another documentation method only. */
  incomeDocTypeLtvCaps?: Partial<Record<IncomeDocType, Partial<Record<LoanPurpose, number>>>>;
  incomeDocTypePurposeRestrictions?: Partial<Record<IncomeDocType, LoanPurpose[]>>;
  purposeLtvMatrix?: PurposeLtvMatrixEntry[];
  // Borrower-experience eligibility flags. All optional/undefined = no
  // restriction on that dimension (matches every existing Program record
  // without any migration — see docs/voice-vitals.md).
  firstTimeHomebuyerAllowed?: boolean;
  firstTimeInvestorAllowed?: boolean;
  /** Guideline-specific reduction from the selected matrix cap for a first-time investor. */
  firstTimeInvestorLtvAdjustment?: number;
  /** DSCR short-term-rental reduction from the selected matrix cap. */
  strIncomeLtvAdjustment?: number;
  /** Optional absolute STR leverage ceiling applied after the reduction. */
  strIncomeMaxLtv?: number;
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
  noHousingHistoryReserveMonths?: number;
  noHousingHistoryMinBorrowerContributionPercent?: number;
  noHousingHistoryNotes?: string;
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
  /**
   * Per-citizenship income-documentation RESTRICTION — added 2026-07-29
   * after a real bug: a program bundling several income doc types under
   * one row (common for real multi-doc ITIN/Foreign-National products)
   * would let a citizenship class match EVERY bundled doc type, even when
   * the lender's real guideline only actually extends that citizenship to
   * a SUBSET of them (e.g. a program's general incomeDocTypes includes
   * bank_statement/full_doc/1099/asset_depletion, but its real ITIN
   * eligibility is documented only for bank_statement and full_doc, not
   * the other two). When set for a citizenship key, ONLY the listed doc
   * types are eligible for that citizenship on this program — this
   * TIGHTENS beyond the program's general incomeDocTypes, never loosens
   * it. For ITIN specifically, non-DSCR combinations are closed by default:
   * omitting the `itin` key means no ITIN/document combination has been
   * expressly confirmed, so the program is not recommended for an ITIN
   * scenario. ITIN + DSCR is governed by the dedicated confirmation flags.
   * Other citizenship classes retain the normal open-by-default behavior
   * when their key is omitted. See baseChecks.ts.
   */
  citizenshipDocTypeRestrictions?: Partial<Record<Citizenship, IncomeDocType[]>>;
  /**
   * Lien position — added 2026-07-29 (see LienPosition in enums.ts).
   * undefined = FirstLien (the default for every ordinary program — no
   * migration needed). Only set to StandaloneSecond for a REAL, distinct
   * standalone second-mortgage/HELOAN product (FundLoans Aspire/Aspire X,
   * GreenBox CES, Verus Closed End Second, etc.) — never used to mean
   * "also allows cash-out," which is a separate, existing concept
   * (loanPurposes including cash_out_refinance) that a FIRST-LIEN program
   * already expresses on its own.
   */
  lienPosition?: LienPosition;
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
  /** Exact statement periods supported by this program. Omitted means the
   * reviewed source did not distinguish the period; never guess it. */
  bankStatementMonthsEligible?: Array<12 | 24>;
  /** Exact account types supported by this program. */
  bankStatementAccountTypes?: Array<"personal" | "business">;
  /** Admin-curated product-positioning signal. Never overrides eligibility;
   * it only identifies a lender's explicitly designated flagship product. */
  premierProduct?: boolean;
  /** True when the official narrative guideline confirms the program/rules but
   * defers scenario-specific numeric tiers to a separate matrix not provided. */
  matrixConfirmationRequired?: boolean;
  matrixConfirmationNotes?: string;
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
  /**
   * Secondary Voice Vitals Expansion overlays (added 2026-07-31). Every
   * field below is undefined by default = not yet confirmed for this
   * lender — treated as "no additional restriction/benefit known" by
   * matching (never a silent guess), exactly the same convention as
   * maxMortgageLates30x12 and the ITIN DSCR combination fields above.
   * Populate ONLY from a real, cited guideline fact — never fabricated.
   */
  /** Most severe housing-lates CATEGORY this program still tolerates
   * (see MortgageLatesCategory/MORTGAGE_LATES_SEVERITY in enums.ts) — a
   * richer, 60/90/multiple-aware sibling to the existing
   * maxMortgageLates30x12 (which only models a 30-day count). Both fields
   * can coexist; baseChecks.ts evaluates whichever ones are populated. */
  maxMortgageLatesCategory?: MortgageLatesCategory;
  /** false = a real, documented restriction against using gift funds
   * (down payment/closing costs/reserves) on this program; true = gift
   * funds are explicitly allowed; undefined = not yet confirmed. */
  giftFundsAllowed?: boolean;
  /** Real documentation/seasoning requirements for gift funds on this
   * program (e.g. "requires a signed gift letter and 60-day sourcing of
   * the donor's funds") — surfaced to the user alongside the match,
   * never fabricated when no real citation exists. */
  giftFundsNotes?: string;
  /** DSCR programs only — true = this program's real, current guideline
   * explicitly allows Airbnb/VRBO/AirDNA/Rentalizer-style short-term-
   * rental income for DSCR qualification; false = explicitly disallowed
   * (long-term/market-rent lease income only); undefined = not yet
   * confirmed. Never inferred from the program simply offering DSCR. */
  strIncomeEligible?: boolean;
  /** Real STR-specific requirements (e.g. "requires a 12-month AirDNA/
   * Rentalizer report and a documented STR operating history") —
   * surfaced alongside the match. */
  strIncomeNotes?: string;
  /** Minimum months of self-employment this program's real, current
   * guideline actually requires/allows — e.g. 12 for a genuine one-year
   * self-employment allowance. undefined = not yet confirmed (the
   * standard ~24-month Non-QM assumption is NOT auto-applied here; the
   * field simply isn't evaluated until a real figure is on file). A
   * confirmed value above 12 means this program does NOT support a
   * one-year self-employed borrower without compensating factors. */
  minSelfEmploymentMonths?: number;
  /** P&L-only qualification controls. The P&L itself is the income
   * document; `pnlTaxReturnsRequired: false` must never be rendered as a
   * borrower tax-return requirement. A preparer attestation, when required,
   * confirms tax filing only. */
  pnlPeriodMonths?: number;
  pnlEligiblePeriods?: number[];
  pnlTaxReturnsRequired?: boolean;
  pnlPreparerAttestationPurpose?: "confirms_tax_filing_only";
  pnlSupportingBankStatementsMonths?: number;
  pnlWithSupportingStatementsLtvCaps?: Partial<Record<LoanPurpose, number>>;
  pnlWithoutSupportingStatementsLtvCaps?: Partial<Record<LoanPurpose, number>>;
  pnlWithoutSupportingStatementsMinFico?: number;
  pnlWithoutSupportingStatementsMaxLoanAmount?: number;
  /** Exact P&L-only product facts. These fields never inherit from the
   * program's Bank Statement or generic Alternative Documentation rules. */
  pnlOnlyAvailable?: boolean;
  pnlMaxLtv?: number;
  pnlMinFico?: number;
  pnlMaxDti?: number;
  pnlMaxLoanAmount?: number;
  pnlRequiredMonthsSelfEmployed?: number;
  pnlPreparerRequirements?: string;
  pnlBankStatementSupportRequired?: boolean;
  pnlSupportingStatementMonths?: number;
  pnlReserveRequirements?: number;
  pnlFthbAllowed?: boolean;
  pnlOccupancy?: Occupancy[];
  pnlPropertyTypes?: PropertyType[];
  pnlNotes?: string;
  /**
   * 5-8 Unit Residential / Small-Balance Multifamily overlay — added
   * 2026-08-01 (Lender Database Audit & 5-8 Unit Expansion spec). This
   * property type is architecturally distinct from the program's general
   * baseMaxLtv/ltvMatrix: real lender matrices for 5-8 unit products vary
   * maximum LTV by LOAN AMOUNT BAND, FICO, AND transaction type
   * (purchase/rate-term/cash-out) simultaneously — a dimension the
   * existing LtvMatrixEntry (FICO + occupancy only) cannot express. All
   * fields below are undefined by default = this program has not (yet)
   * had 5-8 unit guideline data ingested — even when `5_8_unit` is listed
   * in `propertyTypes`, matching must NEVER assume a specific LTV/FICO/
   * DSCR figure that isn't backed by `fiveToEightUnitLtvMatrix`; a
   * 5-8-unit-eligible program with no matrix populated is surfaced as
   * "guideline confirmation required," never a fabricated approval. Only
   * ever populate from a real, cited lender matrix (never inferred from
   * the program's general DSCR/1-4-unit terms).
   */
  fiveToEightUnitLtvMatrix?: FiveToEightUnitLtvMatrixEntry[];
  /** Minimum DSCR specifically documented for this program's 5-8 unit
   * product — may differ from the program's general `minDscr`. */
  fiveToEightUnitMinDscr?: number;
  /** true = the lender's 5-8 unit guideline requires an EXPERIENCED
   * investor (first-time investors are ineligible for this specific
   * property-type product, even if the program's general
   * `experiencedInvestorRequired` is false/undefined for its 1-4 unit
   * business). undefined = not yet confirmed for 5-8 unit specifically. */
  fiveToEightUnitExperiencedInvestorRequired?: boolean;
  /** Per-citizenship eligibility restriction specific to the 5-8 unit
   * product — some lenders sell 5-8 unit DSCR only to U.S. Citizens/
   * Permanent Resident Aliens/Non-Permanent Resident Aliens while
   * excluding Foreign National/ITIN/DACA borrowers who ARE otherwise
   * eligible on the lender's general 1-4 unit DSCR program. undefined =
   * no distinct 5-8-unit-specific citizenship restriction documented (the
   * program's general `citizenshipEligible` governs). */
  fiveToEightUnitCitizenshipEligible?: Citizenship[];
  /** Maximum number of vacant/unleased units this program's 5-8 unit
   * guideline tolerates before treating additional vacancies as
   * ineligible (real guidelines commonly cap this at 2). undefined = not
   * yet confirmed. */
  fiveToEightUnitMaxVacantUnits?: number;
  /** true = the lender's 5-8 unit guideline explicitly permits
   * short-term-rental (Airbnb/VRBO) income for qualification on THIS
   * property type; false = explicitly excluded/treated as vacant with no
   * income (a real, documented restriction distinct from the program's
   * general DSCR strIncomeEligible, since several lenders' 5-8 unit
   * products are long-term-lease-only even when their 1-4 unit DSCR
   * product allows STR); undefined = not yet confirmed. */
  fiveToEightUnitStrIncomeEligible?: boolean;

  // ── Bank Statement expense-factor methodology (2026-08-06 Bank Statement
  //    Expense Ratio Intelligence spec §§15-16). Every field is undefined by
  //    default = "not yet verified in the current guideline database" — the
  //    assistant must NEVER present these as confirmed until a real, cited
  //    guideline populates them (spec §14). Populate ONLY from a real,
  //    cited lender guideline, never inferred from another lender or from
  //    industry norms. ──────────────────────────────────────────────────────
  /** Standard (default) business expense factor, percent 0-100 (e.g. 50). */
  standardExpenseFactor?: number;
  /** Lowest expense factor the guideline permits with documentation. */
  minimumExpenseFactor?: number;
  /** Highest expense factor the guideline applies (e.g. high-overhead). */
  maximumExpenseFactor?: number;
  /** Whether the factor is a single fixed number or varies by business. */
  expenseFactorType?: "fixed" | "variable_by_business" | "documentation_driven";
  /** true = a reduced (below-standard) factor is allowed with documentation. */
  reducedExpenseFactorAvailable?: boolean;
  /** What documentation unlocks a reduced factor (e.g. "CPA/EA letter + P&L"). */
  reducedFactorDocumentation?: string;
  /** true = a CPA letter is accepted to support the expense factor. */
  cpaLetterAllowed?: boolean;
  /** true = an Enrolled Agent letter is accepted. */
  eaLetterAllowed?: boolean;
  /** true = a P&L can support/validate the expense factor. */
  pnlSupported?: boolean;
  /** true = a written business narrative is required for the reduced factor. */
  businessNarrativeRequired?: boolean;
  /** Percent of eligible business deposits initially considered (0-100). */
  eligibleDepositPercentage?: number;
  /** Free-text methodology for personal bank statements (e.g. "100% of eligible deposits"). */
  personalBankStatementRules?: string;
  /** Free-text methodology for business bank statements (e.g. "deposits × ownership% × (1 − expense factor)"). */
  businessBankStatementRules?: string;
  /** Any additional per-business-type factor rules or exceptions, as cited. */
  expenseFactorNotes?: string;

  // Structured discoverability and specialty-program facts. These remain
  // guideline data only when populated from a cited, reviewed source.
  searchTags?: string[];
  category?: string;
  subcategory?: string;
  displayIncomeDocumentation?: string;
  majorRestrictions?: string[];
  sourceRuleIndex?: Array<{
    field: string;
    sourceUrl: string;
    documentTitle: string;
    effectiveDate: string;
    page: number | string;
    section: string;
    status?: "verified" | "needs_review";
  }>;
  documentationRequirements?: string[];
  sourceDocuments?: string[];
  assetQualifierMethods?: string[];
  eligibleProfessions?: string[];
  futureEmploymentEligible?: boolean;
  employmentStartWithinDays?: number;
  pmiRequired?: boolean;
  /** DSCR-specific distinction: whether the IO payment may be used in the ratio. */
  ioDscrPaymentAllowed?: boolean;

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
