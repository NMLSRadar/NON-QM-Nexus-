import type { ProgramCatalog } from "@/domain/analyze";
import type { IncomeDocType } from "@/domain/types/enums";
import { resolveDocumentationProfile } from "@/domain/matching/documentationProfile";

/** Hard ceiling for catalog data sent with a chatbot request. */
export const MAX_ASSISTANT_GUIDELINE_CONTEXT_CHARS = 140_000;

type ActiveProgram = ProgramCatalog["programs"][number];

function scopedProgram(program: ActiveProgram, documentationType: IncomeDocType): ActiveProgram | undefined {
  if (!program.incomeDocTypes.includes(documentationType)) return undefined;
  const resolution = resolveDocumentationProfile(program, documentationType);
  return resolution.status === "resolved" ? resolution.program : undefined;
}

function uniqueLenderNames(
  programs: ActiveProgram[],
  lenderById: Map<string, ProgramCatalog["lenders"][number]>,
): string[] {
  return [...new Set(programs.map((program) => lenderById.get(program.lenderId)?.name).filter((name): name is string => Boolean(name)))].sort();
}

function availabilityLabel(matchCount: number, activeLenderCount: number): "common" | "readily_available" | "lender_specific" | "niche" | "not_verified" {
  if (matchCount === 0) return "not_verified";
  if (matchCount <= 2) return "niche";
  const share = activeLenderCount > 0 ? matchCount / activeLenderCount : 0;
  if (share >= 0.5) return "common";
  if (matchCount >= 5 || share >= 0.25) return "readily_available";
  return "lender_specific";
}

/**
 * A compact, deterministic market-wide rollup. This keeps the model from
 * treating the first/most-conservative row as the whole Non-QM market and
 * gives it an honest basis for words such as "common", "niche", and
 * "lender-specific". Counts include verified, active, non-sample records only.
 */
export function buildMarketAvailabilityContext(catalog: ProgramCatalog): string {
  const activeLenders = catalog.lenders.filter((lender) => lender.active && !lender.isSampleData);
  const activeLenderIds = new Set(activeLenders.map((lender) => lender.id));
  const lenderById = new Map(activeLenders.map((lender) => [lender.id, lender]));
  const programs = catalog.programs.filter(
    (program) => program.active && !program.isSampleData && activeLenderIds.has(program.lenderId),
  );
  const dscr = programs.map((program) => scopedProgram(program, "dscr")).filter((program): program is ActiveProgram => Boolean(program));
  const bankStatement = programs.map((program) => scopedProgram(program, "bank_statement")).filter((program): program is ActiveProgram => Boolean(program));
  const hundredPercentEligibleDeposits = bankStatement.filter(
    (program) => program.eligibleDepositPercentage === 100,
  );
  const noRatio = dscr.filter((program) => program.minDscr === 0);
  const dscrPurchase = dscr.filter((program) => program.loanPurposes.includes("purchase"));
  const strIncome = dscr.filter((program) => program.strIncomeEligible === true);
  const rural = programs.filter((program) => program.propertyTypes.includes("rural"));
  const llc = programs.filter((program) => program.vestingEligible.includes("llc"));
  const trust = programs.filter((program) => program.vestingEligible.includes("trust"));
  const bankStatementFthb90 = bankStatement.filter(
    (program) =>
      program.firstTimeHomebuyerAllowed === true &&
      program.loanPurposes.includes("purchase") &&
      program.occupancies.includes("primary") &&
      program.baseMaxLtv >= 90,
  );

  const feature = (matchingPrograms: ActiveProgram[]) => {
    const lenders = uniqueLenderNames(matchingPrograms, lenderById);
    return {
      verifiedLenderCount: lenders.length,
      availability: availabilityLabel(lenders.length, activeLenders.length),
      lenders,
    };
  };
  const numeric = (values: Array<number | null | undefined>, mode: "min" | "max") => {
    const verified = values.filter((value): value is number => typeof value === "number" && Number.isFinite(value));
    return verified.length === 0 ? null : mode === "min" ? Math.min(...verified) : Math.max(...verified);
  };

  return JSON.stringify({
    scope: "verified_active_non_sample_catalog",
    activeLenderCount: activeLenders.length,
    activeProgramCount: programs.length,
    dscr: {
      ...feature(dscr),
      lowestVerifiedDscr: numeric(dscr.map((program) => program.minDscr), "min"),
      highestVerifiedPurchaseLtv: numeric(dscrPurchase.map((program) => program.baseMaxLtv), "max"),
      noRatio: feature(noRatio),
      strIncome: feature(strIncome),
    },
    bankStatement: {
      ...feature(bankStatement),
      lowestVerifiedFico: numeric(bankStatement.map((program) => program.minFico), "min"),
      highestVerifiedPurchaseLtv: numeric(
        bankStatement.filter((program) => program.loanPurposes.includes("purchase")).map((program) => program.baseMaxLtv),
        "max",
      ),
      firstTimeHomebuyerAt90Ltv: feature(bankStatementFthb90),
      hundredPercentEligibleDeposits: feature(hundredPercentEligibleDeposits),
    },
    ruralProperty: feature(rural),
    llcVesting: feature(llc),
    trustVesting: feature(trust),
  });
}

/**
 * Selects the product family the user asked about and serializes only the
 * fields needed to answer that question. The full catalog includes hundreds
 * of large matrices and cannot safely be sent on every chat turn.
 */
export function buildRelevantGuidelineContext(catalog: ProgramCatalog, query: string): string {
  const q = query.toLowerCase();
  const wantsPnl = /\bp\s*&\s*l\b|profit\s*(?:and|&)\s*loss|pnl(?:\s+only)?/.test(q);
  const wantsBankStatements =
    /bank\s+statements?|business\s+deposits?|expense\s+factor|\bzelle\b|\bvenmo\b|cash\s+deposits?|multiple\s+(?:bank\s+)?accounts?|combine\s+(?:personal|business)|personal\s+(?:and|&)\s+business/.test(q) &&
    !wantsPnl;
  const wantsCryptoReserves = /\bcrypto(?:currency)?\b|\bbitcoin\b|digital\s+assets?/.test(q);
  const wantsDscr = /\bdscr\b|debt\s+service\s+coverage|no\s*ratio/.test(q);
  const wantsItin = /\bitin\b/.test(q);
  const wantsForeignNational = /foreign\s+national|non[- ]?resident alien/.test(q);
  const wantsAsset = /asset\s+(?:depletion|utili[sz]ation|qualifier)|assets?\s+as\s+income/.test(q);
  const wantsWvoe = /\bwvoe\b|written\s+(?:verification|voe)|verification\s+of\s+employment/.test(q);
  const wants1099 = /\b1099\b/.test(q);
  const requestedDocumentation: IncomeDocType | undefined = wantsPnl
    ? "pnl_only"
    : wantsBankStatements
      ? "bank_statement"
      : wantsDscr
        ? "dscr"
        : wantsAsset
          ? "asset_depletion"
          : wantsWvoe
            ? "wvoe_only"
            : wants1099
              ? "1099"
              : undefined;
  const hasIntent = Boolean(requestedDocumentation) || wantsItin || wantsForeignNational || wantsCryptoReserves;

  const lenderById = new Map(catalog.lenders.map((lender) => [lender.id, lender]));
  const selected = catalog.programs
    .filter((program) => program.active && !program.isSampleData)
    .map((program) => requestedDocumentation ? scopedProgram(program, requestedDocumentation) : program)
    .filter((program): program is ActiveProgram => Boolean(program))
    .filter((program) => {
      const lender = lenderById.get(program.lenderId);
      if (!lender || !lender.active || lender.isSampleData) return false;
      if (!hasIntent) return true;
      return (
        (requestedDocumentation != null && program.incomeDocTypes.length === 1 && program.incomeDocTypes[0] === requestedDocumentation) ||
        (wantsItin && (program.citizenshipEligible.includes("itin") || program.itinSpecialist === true)) ||
        (wantsForeignNational &&
          (program.citizenshipEligible.includes("foreign_national") || program.foreignNationalSpecialist === true)) ||
        (wantsCryptoReserves &&
          /crypto|cryptocurrency|bitcoin|digital asset/i.test(
            [
              ...(program.searchTags ?? []),
              ...(program.documentationRequirements ?? []),
              ...(program.majorRestrictions ?? []),
              program.notes ?? "",
            ].join(" "),
          ))
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
        personalBankStatementRules: program.personalBankStatementRules,
        businessBankStatementRules: program.businessBankStatementRules,
        expenseFactorNotes: program.expenseFactorNotes,
        documentationRequirements: program.documentationRequirements,
        majorRestrictions: program.majorRestrictions,
        notes: program.notes,
      });
    }

    if (wantsCryptoReserves) {
      Object.assign(fields, {
        documentationRequirements: program.documentationRequirements,
        majorRestrictions: program.majorRestrictions,
        searchTags: program.searchTags,
        notes: program.notes,
      });
    }

    if (wantsDscr || wantsItin || wantsForeignNational) {
      Object.assign(fields, {
        strIncomeEligible: program.strIncomeEligible,
        strIncomeNotes: program.strIncomeNotes,
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
      test: (program) => {
        const scoped = scopedProgram(program, "pnl_only");
        return scoped?.pnlOnlyAvailable === true && typeof scoped.pnlMaxLtv === "number";
      },
    };
  } else if (/bank\s+statements?/.test(q)) {
    matcher = { label: "Bank Statement", test: (program) => Boolean(scopedProgram(program, "bank_statement")) };
  } else if (/\bdscr\b|debt\s+service\s+coverage/.test(q)) {
    matcher = { label: "DSCR", test: (program) => Boolean(scopedProgram(program, "dscr")) };
  } else if (/\bwvoe\b|written\s+(?:verification|voe)|verification\s+of\s+employment/.test(q)) {
    matcher = { label: "WVOE Only", test: (program) => Boolean(scopedProgram(program, "wvoe_only")) };
  } else if (/\b1099\b/.test(q)) {
    matcher = { label: "1099", test: (program) => Boolean(scopedProgram(program, "1099")) };
  } else if (/asset\s+(?:depletion|utili[sz]ation|qualifier)/.test(q)) {
    matcher = { label: "Asset Depletion / Asset Utilization", test: (program) => Boolean(scopedProgram(program, "asset_depletion")) };
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
    const scopedPnl = matcher!.label === "verified P&L Only" ? scopedProgram(program, "pnl_only") : undefined;
    const cap = scopedPnl?.pnlMaxLtv;
    return `• ${lender!.name}: ${program.name}${typeof cap === "number" ? ` — P&L Only max ${cap}% LTV` : ""}`;
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
