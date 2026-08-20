import type { IncomeDocType } from "../types/enums";
import type { DocumentationEligibilityProfile, Program } from "../types/program";

const LABELS: Record<IncomeDocType, string> = {
  full_doc: "Full Documentation",
  bank_statement: "Bank Statement",
  pnl_only: "P&L Only",
  dscr: "DSCR",
  asset_depletion: "Asset Depletion / Asset Utilization",
  wvoe_only: "WVOE Only",
  "1099": "1099",
};

const ALIASES: Record<string, IncomeDocType> = {
  full_doc: "full_doc",
  "full documentation": "full_doc",
  "full doc": "full_doc",
  bank_statement: "bank_statement",
  "bank statement": "bank_statement",
  "bank statements": "bank_statement",
  pnl_only: "pnl_only",
  "p&l only": "pnl_only",
  "p and l only": "pnl_only",
  "profit and loss only": "pnl_only",
  dscr: "dscr",
  asset_depletion: "asset_depletion",
  "asset depletion": "asset_depletion",
  "asset utilization": "asset_depletion",
  "asset utilisation": "asset_depletion",
  wvoe_only: "wvoe_only",
  wvoe: "wvoe_only",
  voe: "wvoe_only",
  "wvoe only": "wvoe_only",
  "written voe": "wvoe_only",
  "written verification of employment": "wvoe_only",
  "1099": "1099",
};

export function incomeDocTypeLabel(type: IncomeDocType | undefined): string {
  return type ? LABELS[type] : "Documentation program";
}

export function normalizeIncomeDocType(value: string): IncomeDocType | undefined {
  const normalized = value.trim().toLowerCase().replace(/[-/]+/g, " ").replace(/\s+/g, " ");
  return ALIASES[normalized] ?? ALIASES[normalized.replace(/ /g, "_")];
}

export type DocumentationProfileResolution =
  | {
      status: "resolved";
      documentationType: IncomeDocType;
      displayName: string;
      program: Program;
      ruleIds: string[] | null;
      sourceCitation: string;
      sourceSection?: string;
      sourcePage?: number;
      legacySingleDocument: boolean;
    }
  | {
      status: "verification_required";
      documentationType?: IncomeDocType;
      displayName: string;
      issues: string[];
    };

/**
 * Select one documentation program before eligibility evaluation. This is the
 * hard anti-leakage boundary: multi-document rows cannot use the parent row's
 * headline limits or a sibling profile. Only a complete, human-verified
 * profile is projected into a Program and allowed into checks/scoring.
 */
export function resolveDocumentationProfile(
  program: Program,
  requestedType: IncomeDocType | undefined,
): DocumentationProfileResolution {
  const displayName = incomeDocTypeLabel(requestedType);
  if (!requestedType) {
    return {
      status: "verification_required",
      displayName,
      issues: ["A specific income documentation program must be selected before eligibility can be evaluated."],
    };
  }

  if (!program.incomeDocTypes.includes(requestedType)) {
    // Not a profile-verification problem. Let ordinary program checks record
    // the hard documentation mismatch using the original single/broad row.
    return {
      status: "resolved",
      documentationType: requestedType,
      displayName,
      program: { ...program, incomeDocTypes: [...program.incomeDocTypes] },
      ruleIds: null,
      sourceCitation: program.sourceCitation,
      legacySingleDocument: program.incomeDocTypes.length === 1,
    };
  }

  if (program.matrixConfirmationRequired) {
    return {
      status: "verification_required",
      documentationType: requestedType,
      displayName,
      issues: [program.matrixConfirmationNotes ?? `The current ${displayName} matrix has not been independently verified.`],
    };
  }

  if (program.incomeDocTypes.length === 1 && !program.isSampleData) {
    const issues = validateSingleDocumentProgram(program, requestedType);
    if (issues.length > 0) {
      return { status: "verification_required", documentationType: requestedType, displayName, issues };
    }
  }

  if (program.incomeDocTypes.length === 1 || program.isSampleData) {
    // Fictional demonstration rows intentionally share one synthetic matrix
    // and are visibly labeled as non-guideline sample data. Real lender rows
    // never receive this compatibility treatment.
    return {
      status: "resolved",
      documentationType: requestedType,
      displayName,
      program: { ...program, incomeDocTypes: [requestedType] },
      ruleIds: null,
      sourceCitation: program.sourceCitation,
      legacySingleDocument: true,
    };
  }

  const profile = program.documentationProfiles?.[requestedType];
  const issues = validateProfile(profile, requestedType);
  if (!profile || issues.length > 0) {
    return { status: "verification_required", documentationType: requestedType, displayName, issues };
  }

  const scoped: Program = {
    id: program.id,
    lenderId: program.lenderId,
    organizationId: program.organizationId,
    name: `${program.name} — ${profile.displayName}`,
    isSampleData: program.isSampleData,
    active: program.active,
    incomeDocTypes: [requestedType],
    ...profile.criteria,
    guidelineVersionId: profile.guidelineVersionId,
    guidelineVersionLabel: profile.guidelineVersionLabel,
    effectiveDate: profile.effectiveDate,
    lastVerifiedDate: profile.lastVerifiedDate,
    sourceCitation: profile.sourceCitation,
    notes: profile.notes,
  };

  return {
    status: "resolved",
    documentationType: requestedType,
    displayName: profile.displayName,
    program: scoped,
    ruleIds: profile.ruleIds,
    sourceCitation: profile.sourceCitation,
    sourceSection: profile.sourceSection,
    sourcePage: profile.sourcePage,
    legacySingleDocument: false,
  };
}

function validateSingleDocumentProgram(program: Program, requestedType: IncomeDocType): string[] {
  const issues: string[] = [];
  if (!program.sourceCitation?.trim()) issues.push(`The ${incomeDocTypeLabel(requestedType)} source citation is missing.`);
  for (const field of ["loanPurposes", "occupancies", "propertyTypes", "citizenshipEligible", "vestingEligible", "prepaymentPenaltyOptions"] as const) {
    if (!Array.isArray(program[field])) issues.push(`The ${incomeDocTypeLabel(requestedType)} program is missing ${field}.`);
  }
  if (program.eligibleStates !== "ALL" && !Array.isArray(program.eligibleStates)) issues.push(`The ${incomeDocTypeLabel(requestedType)} program is missing eligibleStates.`);
  for (const field of ["minLoanAmount", "maxLoanAmount", "minFico", "baseMaxLtv", "minReservesMonths"] as const) {
    if (typeof program[field] !== "number" || !Number.isFinite(program[field])) issues.push(`The ${incomeDocTypeLabel(requestedType)} program is missing a valid ${field}.`);
  }
  const applicableMaxDti = requestedType === "pnl_only" ? (program.pnlMaxDti ?? program.maxDti) : program.maxDti;
  if (requestedType !== "dscr" && (typeof applicableMaxDti !== "number" || !Number.isFinite(applicableMaxDti))) {
    issues.push(`The ${incomeDocTypeLabel(requestedType)} program is missing a verified maximum DTI.`);
  }
  if (typeof program.interestOnlyAvailable !== "boolean") issues.push(`The ${incomeDocTypeLabel(requestedType)} program is missing interestOnlyAvailable.`);
  return issues;
}

function validateProfile(
  profile: DocumentationEligibilityProfile | undefined,
  requestedType: IncomeDocType,
): string[] {
  if (!profile) return [`No independently verified ${incomeDocTypeLabel(requestedType)} profile is stored for this bundled product family.`];
  const issues: string[] = [];
  if (profile.documentationType !== requestedType) issues.push("The profile documentation key does not match the requested documentation type.");
  if (profile.verificationStatus !== "human_verified") issues.push("The documentation profile has not been human verified.");
  if (!profile.displayName?.trim()) issues.push("The documentation profile display name is missing.");
  if (!profile.sourceCitation?.trim()) issues.push("The documentation profile source citation is missing.");
  if (!profile.guidelineVersionId?.trim() || !profile.guidelineVersionLabel?.trim()) issues.push("The documentation profile guideline version is missing.");
  if (!profile.effectiveDate?.trim()) issues.push("The documentation profile effective date is missing.");
  if (!Array.isArray(profile.ruleIds)) issues.push("The documentation profile rule scope is missing.");

  const c = profile.criteria as Partial<Program> | undefined;
  if (!c || typeof c !== "object") return [...issues, "The documentation profile criteria are missing."];
  for (const field of ["loanPurposes", "occupancies", "propertyTypes", "citizenshipEligible", "vestingEligible", "prepaymentPenaltyOptions"] as const) {
    if (!Array.isArray(c[field])) issues.push(`The documentation profile is missing ${field}.`);
  }
  if (c.eligibleStates !== "ALL" && !Array.isArray(c.eligibleStates)) issues.push("The documentation profile is missing eligibleStates.");
  for (const field of ["minLoanAmount", "maxLoanAmount", "minFico", "baseMaxLtv", "minReservesMonths"] as const) {
    if (typeof c[field] !== "number" || !Number.isFinite(c[field])) issues.push(`The documentation profile is missing a valid ${field}.`);
  }
  if (requestedType !== "dscr" && (typeof c.maxDti !== "number" || !Number.isFinite(c.maxDti))) {
    issues.push("The documentation profile is missing a valid maxDti.");
  }
  if (typeof c.interestOnlyAvailable !== "boolean") issues.push("The documentation profile is missing interestOnlyAvailable.");
  return issues;
}
