import { z } from "zod";
import { Citizenship, IncomeDocType, LoanPurpose, Occupancy, PropertyType, Vesting } from "@/domain/types/enums";

// The bulk-import CSV format: one row per PROGRAM. The lender is identified
// by name — a new lender is created the first time a name is seen (using
// lender_tier from that row), and reused (by name, case-insensitive) on
// every later row for the same lender. Rules are not part of this import;
// only lenders + programs (+ the guideline_version each program needs).

const semicolonList = (label: string, allowed: readonly string[]) =>
  z
    .string()
    .min(1, `${label} is required`)
    .transform((v) => v.split(";").map((s) => s.trim()).filter(Boolean))
    .refine((values) => values.every((v) => (allowed as readonly string[]).includes(v)), {
      message: `${label} must only contain: ${allowed.join(", ")}`,
    });

const boolField = (label: string, defaultValue: boolean) =>
  z
    .string()
    .trim()
    .toLowerCase()
    .refine((v) => v === "true" || v === "false" || v === "", { message: `${label} must be true or false` })
    .transform((v) => (v === "" ? defaultValue : v === "true"));

const dateField = (label: string, required: boolean) =>
  required
    ? z
        .string()
        .trim()
        .regex(/^\d{4}-\d{2}-\d{2}$/, `${label} must be YYYY-MM-DD`)
    : z
        .string()
        .trim()
        .regex(/^\d{4}-\d{2}-\d{2}$/, `${label} must be YYYY-MM-DD`)
        .optional()
        .or(z.literal(""));

const numberField = (label: string) =>
  z
    .string()
    .trim()
    .min(1, `${label} is required`)
    .transform((v) => Number(v))
    .refine((v) => Number.isFinite(v), { message: `${label} must be a number` });

const optionalNumberField = (label: string) =>
  z
    .string()
    .trim()
    .optional()
    .or(z.literal(""))
    .transform((v) => (v ? Number(v) : undefined))
    .refine((v) => v === undefined || Number.isFinite(v), { message: `${label} must be a number` });

export const programImportRowSchema = z.object({
  lender_name: z.string().trim().min(1, "lender_name is required"),
  lender_tier: z
    .string()
    .trim()
    .transform((v) => (v === "" ? 3 : Number(v)))
    .refine((v) => Number.isInteger(v) && v >= 1 && v <= 3, "lender_tier must be 1, 2, or 3"),
  program_name: z.string().trim().min(1, "program_name is required"),
  income_doc_types: semicolonList("income_doc_types", Object.values(IncomeDocType)),
  loan_purposes: semicolonList("loan_purposes", Object.values(LoanPurpose)),
  occupancies: semicolonList("occupancies", Object.values(Occupancy)),
  property_types: semicolonList("property_types", Object.values(PropertyType)),
  eligible_states: z
    .string()
    .trim()
    .min(1, "eligible_states is required")
    .transform((v) => (v.toUpperCase() === "ALL" ? ("ALL" as const) : v.split(";").map((s) => s.trim().toUpperCase()).filter(Boolean))),
  citizenship_eligible: semicolonList("citizenship_eligible", Object.values(Citizenship)),
  vesting_eligible: semicolonList("vesting_eligible", Object.values(Vesting)),
  min_loan_amount: numberField("min_loan_amount"),
  max_loan_amount: numberField("max_loan_amount"),
  min_fico: numberField("min_fico").refine((v) => v >= 300 && v <= 850, "min_fico must be between 300 and 850"),
  max_dti: optionalNumberField("max_dti"),
  min_dscr: optionalNumberField("min_dscr"),
  base_max_ltv: numberField("base_max_ltv").refine((v) => v > 0 && v <= 100, "base_max_ltv must be between 0 and 100"),
  min_reserves_months: numberField("min_reserves_months"),
  interest_only_available: boolField("interest_only_available", false),
  prepayment_penalty_options: z
    .string()
    .trim()
    .min(1, "prepayment_penalty_options is required")
    .transform((v) => v.split(";").map((s) => s.trim()).filter(Boolean)),
  guideline_version_label: z.string().trim().min(1, "guideline_version_label is required"),
  effective_date: dateField("effective_date", true),
  last_verified_date: dateField("last_verified_date", false),
  source_citation: z.string().trim().min(1, "source_citation is required"),
  notes: z.string().trim().optional().or(z.literal("")),
  active: boolField("active", true),
});

export type ProgramImportRow = z.infer<typeof programImportRowSchema>;

export const REQUIRED_CSV_COLUMNS = [
  "lender_name",
  "lender_tier",
  "program_name",
  "income_doc_types",
  "loan_purposes",
  "occupancies",
  "property_types",
  "eligible_states",
  "citizenship_eligible",
  "vesting_eligible",
  "min_loan_amount",
  "max_loan_amount",
  "min_fico",
  "max_dti",
  "min_dscr",
  "base_max_ltv",
  "min_reserves_months",
  "interest_only_available",
  "prepayment_penalty_options",
  "guideline_version_label",
  "effective_date",
  "last_verified_date",
  "source_citation",
  "notes",
  "active",
] as const;
