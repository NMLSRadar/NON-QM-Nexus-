import type { ProgramCatalog } from "@/domain/analyze";

/** Hard ceiling for catalog data sent with a chatbot request. */
export const MAX_ASSISTANT_GUIDELINE_CONTEXT_CHARS = 140_000;

/**
 * Selects the product family the user asked about and serializes only the
 * fields needed to answer that question. The full catalog includes hundreds
 * of large matrices and cannot safely be sent on every chat turn.
 */
export function buildRelevantGuidelineContext(catalog: ProgramCatalog, query: string): string {
  const q = query.toLowerCase();
  const wantsPnl = /\bp\s*&\s*l\b|profit\s*(?:and|&)\s*loss|pnl(?:\s+only)?/.test(q);
  const wantsBankStatements = /bank\s+statements?|business\s+deposits?|expense\s+factor/.test(q) && !wantsPnl;
  const wantsDscr = /\bdscr\b|debt\s+service\s+coverage|no\s*ratio/.test(q);
  const wantsItin = /\bitin\b/.test(q);
  const wantsForeignNational = /foreign\s+national|non[- ]?resident alien/.test(q);
  const wantsAsset = /asset\s+(?:depletion|qualifier)|assets?\s+as\s+income/.test(q);
  const hasIntent = wantsPnl || wantsBankStatements || wantsDscr || wantsItin || wantsForeignNational || wantsAsset;

  const lenderById = new Map(catalog.lenders.map((lender) => [lender.id, lender]));
  const selected = catalog.programs
    .filter((program) => program.active && !program.isSampleData)
    .filter((program) => {
      const lender = lenderById.get(program.lenderId);
      if (!lender || !lender.active || lender.isSampleData) return false;
      if (!hasIntent) return true;
      return (
        (wantsPnl && (program.incomeDocTypes.includes("pnl_only") || program.pnlOnlyAvailable === true)) ||
        (wantsBankStatements && program.incomeDocTypes.includes("bank_statement")) ||
        (wantsDscr && program.incomeDocTypes.includes("dscr")) ||
        (wantsItin && (program.citizenshipEligible.includes("itin") || program.itinSpecialist === true)) ||
        (wantsForeignNational &&
          (program.citizenshipEligible.includes("foreign_national") || program.foreignNationalSpecialist === true)) ||
        (wantsAsset && program.incomeDocTypes.includes("asset_depletion"))
      );
    })
    .sort((a, b) => {
      const lenderCompare = (lenderById.get(a.lenderId)?.name ?? "").localeCompare(
        lenderById.get(b.lenderId)?.name ?? "",
      );
      return lenderCompare || a.name.localeCompare(b.name);
    });

  const compact = (value: Record<string, unknown>): Record<string, unknown> =>
    Object.fromEntries(
      Object.entries(value).filter(([, item]) => {
        if (item == null || item === false || item === "") return false;
        if (Array.isArray(item) && item.length === 0) return false;
        return true;
      }),
    );

  const rows: string[] = [];
  let used = 0;
  let omitted = 0;

  for (const program of selected) {
    const lender = lenderById.get(program.lenderId)!;
    const fields: Record<string, unknown> = {
      lender: lender.name,
      program: program.name,
      incomeDocTypes: program.incomeDocTypes,
      loanPurposes: program.loanPurposes,
      occupancies: program.occupancies,
      propertyTypes: program.propertyTypes,
      citizenshipEligible: program.citizenshipEligible,
      vestingEligible: program.vestingEligible,
      minFico: program.minFico,
      maxLtv: program.baseMaxLtv,
      maxDti: program.maxDti,
      minDscr: program.minDscr,
      minLoanAmount: program.minLoanAmount,
      maxLoanAmount: program.maxLoanAmount,
      minReservesMonths: program.minReservesMonths,
      firstTimeHomebuyerAllowed: program.firstTimeHomebuyerAllowed,
      firstTimeInvestorAllowed: program.firstTimeInvestorAllowed,
      foreignNationalSpecialist: program.foreignNationalSpecialist,
      itinSpecialist: program.itinSpecialist,
      bankStatementCleanExecution: program.bankStatementCleanExecution,
      bankStatementFlexible: program.bankStatementFlexible,
      premierProduct: program.premierProduct,
      matrixConfirmationRequired: program.matrixConfirmationRequired,
      guidelineVersion: program.guidelineVersionLabel,
      effectiveDate: program.effectiveDate,
      lastVerifiedDate: program.lastVerifiedDate,
      sourceCitation: program.sourceCitation,
    };

    if (wantsPnl) {
      Object.assign(fields, {
        pnlOnlyAvailable: program.pnlOnlyAvailable,
        pnlMaxLtv: program.pnlMaxLtv,
        pnlMinFico: program.pnlMinFico,
        pnlMaxDti: program.pnlMaxDti,
        pnlMaxLoanAmount: program.pnlMaxLoanAmount,
        pnlRequiredMonthsSelfEmployed: program.pnlRequiredMonthsSelfEmployed,
        pnlPreparerRequirements: program.pnlPreparerRequirements,
        pnlTaxReturnsRequired: program.pnlTaxReturnsRequired,
        pnlPreparerAttestationPurpose: program.pnlPreparerAttestationPurpose,
        pnlBankStatementSupportRequired: program.pnlBankStatementSupportRequired,
        pnlSupportingStatementMonths: program.pnlSupportingStatementMonths,
        pnlReserveRequirements: program.pnlReserveRequirements,
        pnlFthbAllowed: program.pnlFthbAllowed,
        pnlOccupancy: program.pnlOccupancy,
        pnlPropertyTypes: program.pnlPropertyTypes,
        pnlNotes: program.pnlNotes,
      });
    }

    if (wantsBankStatements) {
      Object.assign(fields, {
        bankStatementMonthsEligible: program.bankStatementMonthsEligible,
        bankStatementAccountTypes: program.bankStatementAccountTypes,
        standardExpenseFactor: program.standardExpenseFactor,
        minimumExpenseFactor: program.minimumExpenseFactor,
        reducedExpenseFactorAvailable: program.reducedExpenseFactorAvailable,
        reducedFactorDocumentation: program.reducedFactorDocumentation,
        cpaLetterAllowed: program.cpaLetterAllowed,
        eaLetterAllowed: program.eaLetterAllowed,
        eligibleDepositPercentage: program.eligibleDepositPercentage,
      });
    }

    if (wantsDscr || wantsItin || wantsForeignNational) {
      Object.assign(fields, {
        itinDscrEligible: program.itinDscrEligible,
        itinNoRatioEligible: program.itinNoRatioEligible,
        foreignNationalDscrEligible: program.foreignNationalDscrEligible,
        ownerOccupiedItinEligible: program.ownerOccupiedItinEligible,
        investmentItinEligible: program.investmentItinEligible,
        propertyTypeLtvCaps: program.propertyTypeLtvCaps,
      });
    }

    if (wantsAsset) {
      Object.assign(fields, {
        assetQualifierMethods: program.assetQualifierMethods,
        documentationRequirements: program.documentationRequirements,
      });
    }

    const row = JSON.stringify(compact(fields));
    if (used + row.length + 1 > MAX_ASSISTANT_GUIDELINE_CONTEXT_CHARS) {
      omitted += 1;
      continue;
    }
    rows.push(row);
    used += row.length + 1;
  }

  if (rows.length === 0) return "No verified lender programs match the product family in the user's question.";
  if (omitted > 0) {
    let notice = JSON.stringify({
      contextLimitNotice: `${omitted} additional matching programs omitted to keep the request within the assistant's safe context limit.`,
    });
    while (rows.length > 1 && used + notice.length + 1 > MAX_ASSISTANT_GUIDELINE_CONTEXT_CHARS) {
      const removed = rows.pop()!;
      used -= removed.length + 1;
      omitted += 1;
      notice = JSON.stringify({
        contextLimitNotice: `${omitted} additional matching programs omitted to keep the request within the assistant's safe context limit.`,
      });
    }
    rows.push(notice);
  }
  return rows.join("\n");
}

/**
 * A no-LLM safety net for straightforward "who offers X?" discovery
 * questions. It is deliberately limited to catalog facts and never declares
 * borrower eligibility.
 */
export function buildCatalogDiscoveryFallback(catalog: ProgramCatalog, query: string): string | null {
  const q = query.toLowerCase();
  type Program = ProgramCatalog["programs"][number];
  type Matcher = { label: string; test: (program: Program) => boolean };
  let matcher: Matcher | null = null;

  if (/\bp\s*&\s*l\b|profit\s*(?:and|&)\s*loss|pnl(?:\s+only)?/.test(q)) {
    matcher = {
      label: "verified P&L Only",
      test: (program) => program.pnlOnlyAvailable === true && typeof program.pnlMaxLtv === "number",
    };
  } else if (/bank\s+statements?/.test(q)) {
    matcher = { label: "Bank Statement", test: (program) => program.incomeDocTypes.includes("bank_statement") };
  } else if (/\bdscr\b|debt\s+service\s+coverage/.test(q)) {
    matcher = { label: "DSCR", test: (program) => program.incomeDocTypes.includes("dscr") };
  } else if (/\bitin\b/.test(q)) {
    matcher = {
      label: "ITIN",
      test: (program) => program.citizenshipEligible.includes("itin") || program.itinSpecialist === true,
    };
  } else if (/foreign\s+national/.test(q)) {
    matcher = {
      label: "Foreign National",
      test: (program) =>
        program.citizenshipEligible.includes("foreign_national") || program.foreignNationalSpecialist === true,
    };
  }

  if (!matcher) return null;
  const lenderById = new Map(catalog.lenders.map((lender) => [lender.id, lender]));
  const matches = catalog.programs
    .filter((program) => program.active && !program.isSampleData && matcher!.test(program))
    .map((program) => ({ lender: lenderById.get(program.lenderId), program }))
    .filter(({ lender }) => lender?.active && !lender.isSampleData)
    .sort((a, b) => a.lender!.name.localeCompare(b.lender!.name) || a.program.name.localeCompare(b.program.name));

  if (matches.length === 0) return `I couldn't find a currently verified ${matcher.label} product in this account's catalog.`;
  const visible = matches.slice(0, 20);
  const lines = visible.map(({ lender, program }) => {
    const pnlCap = matcher!.label === "verified P&L Only" ? ` — P&L Only max ${program.pnlMaxLtv}% LTV` : "";
    return `• ${lender!.name}: ${program.name}${pnlCap}`;
  });
  const remainder = matches.length - visible.length;
  return [
    `The live catalog currently contains these ${matcher.label} products:`,
    ...lines,
    remainder > 0 ? `• Plus ${remainder} additional matching products. Run the full scenario to rank the exact fit.` : "",
    "This is catalog discovery, not an approval; exact eligibility depends on the complete scenario and current lender matrix.",
  ]
    .filter(Boolean)
    .join("\n");
}
