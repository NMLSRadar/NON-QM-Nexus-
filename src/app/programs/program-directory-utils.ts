import type { Lender, Program } from "@/domain/types/program";

export type ProgramCategoryId = "all" | "bank_statement" | "dscr" | "itin" | "asset" | "wvoe";

export interface ProgramCategoryDefinition {
  id: ProgramCategoryId;
  label: string;
  shortLabel: string;
  description: string;
}

export const PROGRAM_CATEGORIES: ProgramCategoryDefinition[] = [
  {
    id: "all",
    label: "All Programs",
    shortLabel: "All",
    description: "Every active, human-verified program in the Non-QM Nexus directory.",
  },
  {
    id: "bank_statement",
    label: "Bank Statement",
    shortLabel: "Bank Statement",
    description: "Personal and business bank-statement programs, grouped by lender.",
  },
  {
    id: "dscr",
    label: "DSCR",
    shortLabel: "DSCR",
    description: "Debt-service-coverage-ratio and lender-branded investor cash-flow programs.",
  },
  {
    id: "itin",
    label: "ITIN",
    shortLabel: "ITIN",
    description: "Individual ITIN program variants remain independently visible and searchable.",
  },
  {
    id: "asset",
    label: "Asset Utilization / Asset Depletion",
    shortLabel: "Asset",
    description: "Asset-based qualification programs shown under each lender's official program name.",
  },
  {
    id: "wvoe",
    label: "WVOE",
    shortLabel: "WVOE",
    description: "Written verification of employment and VOE-only programs.",
  },
];

const collator = new Intl.Collator("en-US", {
  sensitivity: "base",
  numeric: true,
  ignorePunctuation: true,
});

export function compareAlphabetically(a: string, b: string): number {
  return collator.compare(a.trim(), b.trim());
}

function normalize(value: string): string {
  return value
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[_/–—-]+/g, " ")
    .replace(/[^a-z0-9\s]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

export function sortLendersAlphabetically<T extends { name: string }>(lenders: T[]): T[] {
  return [...lenders].sort((a, b) => compareAlphabetically(a.name, b.name));
}

/**
 * Program totals represent canonical active records, not repeated query rows or
 * accidental duplicate lender/program/version entries. Distinct official names
 * and distinct guideline versions remain separate.
 */
export function canonicalizePrograms(programs: Program[]): Program[] {
  const byId = new Map<string, Program>();
  for (const program of programs) {
    if (program.active && !program.isSampleData && !byId.has(program.id)) byId.set(program.id, program);
  }

  const byProgramVersion = new Map<string, Program>();
  for (const program of byId.values()) {
    const versionIdentity = normalize(
      `${program.guidelineVersionId || program.guidelineVersionLabel} ${program.guidelineVersionLabel} ${program.effectiveDate}`,
    );
    const signature = `${program.lenderId}|${normalize(program.name)}|${versionIdentity}`;
    const existing = byProgramVersion.get(signature);
    if (!existing || compareAlphabetically(program.id, existing.id) < 0) {
      byProgramVersion.set(signature, program);
    }
  }
  return [...byProgramVersion.values()];
}

function programTerms(program: Program): string {
  return normalize(
    [
      program.name,
      ...(program.searchTags ?? []),
      ...(program.documentationRequirements ?? []),
      ...(program.assetQualifierMethods ?? []),
      ...program.incomeDocTypes,
      ...program.citizenshipEligible,
    ].join(" "),
  );
}

export function programMatchesCategory(program: Program, categoryId: ProgramCategoryId): boolean {
  if (categoryId === "all") return true;
  const terms = programTerms(program);
  const docs = new Set(program.incomeDocTypes);

  switch (categoryId) {
    case "bank_statement":
      return docs.has("bank_statement") || /\bbank statements?\b/.test(terms);
    case "dscr":
      return docs.has("dscr") || /\bdscr\b|\bdebt service coverage\b/.test(terms) || /^coin(?: x)?$/.test(normalize(program.name));
    case "itin":
      return /\bitin\b/.test(terms) || program.citizenshipEligible.includes("itin");
    case "asset":
      return (
        docs.has("asset_depletion") ||
        /\basset (?:utilization|depletion|qualifier|based qualification|dissipation|amortization)\b/.test(terms)
      );
    case "wvoe":
      return (
        docs.has("wvoe_only") ||
        /\bwvoe\b|\bwritten (?:verification of employment|voe)\b|\bvoe only\b|\bverification of employment loan\b|\bwage earner voe\b/.test(
          terms,
        )
      );
  }
}

export function getProgramCategories(program: Program): ProgramCategoryId[] {
  return PROGRAM_CATEGORIES.map((category) => category.id).filter((id) => programMatchesCategory(program, id));
}

export function sortProgramsByLenderThenName(programs: Program[], lenders: Lender[]): Program[] {
  const lenderNames = new Map(lenders.map((lender) => [lender.id, lender.name]));
  return [...programs].sort((a, b) => {
    const lenderComparison = compareAlphabetically(
      lenderNames.get(a.lenderId) ?? "Unknown lender",
      lenderNames.get(b.lenderId) ?? "Unknown lender",
    );
    if (lenderComparison !== 0) return lenderComparison;
    const programComparison = compareAlphabetically(a.name, b.name);
    return programComparison !== 0 ? programComparison : compareAlphabetically(a.id, b.id);
  });
}

export function buildProgramSearchText(program: Program, lenderName: string): string {
  const categoryLabels = getProgramCategories(program)
    .map((id) => PROGRAM_CATEGORIES.find((category) => category.id === id)?.label ?? "")
    .join(" ");
  return normalize(
    [
      lenderName,
      program.name,
      categoryLabels,
      ...program.incomeDocTypes,
      ...program.citizenshipEligible,
      ...(program.searchTags ?? []),
      ...(program.documentationRequirements ?? []),
      ...(program.assetQualifierMethods ?? []),
      "written verification of employment voe only debt service coverage ratio asset based qualification",
    ].join(" "),
  );
}

export function normalizedSearchQuery(query: string): string {
  return normalize(query);
}
