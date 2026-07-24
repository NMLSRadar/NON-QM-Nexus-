import { describe, expect, it } from "vitest";
import { programImportRowSchema } from "@/domain/validation/programImportSchema";

const validRow = {
  lender_name: "Summit Non-QM",
  lender_tier: "1",
  program_name: "12-Month Bank Statement",
  income_doc_types: "bank_statement",
  loan_purposes: "purchase;rate_term_refinance;cash_out_refinance",
  occupancies: "primary;second_home;investment",
  property_types: "single_family;condo;townhome;pud;2_4_unit",
  eligible_states: "ALL",
  citizenship_eligible: "us_citizen;permanent_resident;non_permanent_resident",
  vesting_eligible: "individual;joint_tenants;trust",
  min_loan_amount: "150000",
  max_loan_amount: "3000000",
  min_fico: "660",
  max_dti: "50",
  min_dscr: "",
  base_max_ltv: "90",
  min_reserves_months: "6",
  interest_only_available: "true",
  prepayment_penalty_options: "none",
  guideline_version_label: "v1.0",
  effective_date: "2026-01-01",
  last_verified_date: "2026-06-01",
  source_citation: "Guideline PDF, Section 4.2",
  notes: "",
  active: "true",
};

describe("programImportRowSchema", () => {
  it("accepts a fully valid row and transforms semicolon lists into arrays", () => {
    const result = programImportRowSchema.safeParse(validRow);
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.loan_purposes).toEqual(["purchase", "rate_term_refinance", "cash_out_refinance"]);
      expect(result.data.eligible_states).toBe("ALL");
      expect(result.data.min_loan_amount).toBe(150000);
      expect(result.data.interest_only_available).toBe(true);
    }
  });

  it("parses a specific state list when not ALL", () => {
    const result = programImportRowSchema.safeParse({ ...validRow, eligible_states: "ca;tx;fl" });
    expect(result.success).toBe(true);
    if (result.success) expect(result.data.eligible_states).toEqual(["CA", "TX", "FL"]);
  });

  it("rejects a row with an invalid enum value", () => {
    const result = programImportRowSchema.safeParse({ ...validRow, occupancies: "primary;vacation_rental" });
    expect(result.success).toBe(false);
  });

  it("rejects a row missing a required field", () => {
    const { program_name, ...withoutName } = validRow;
    void program_name;
    const result = programImportRowSchema.safeParse(withoutName);
    expect(result.success).toBe(false);
  });

  it("rejects an out-of-range min_fico", () => {
    const result = programImportRowSchema.safeParse({ ...validRow, min_fico: "200" });
    expect(result.success).toBe(false);
  });

  it("rejects a non-numeric loan amount", () => {
    const result = programImportRowSchema.safeParse({ ...validRow, min_loan_amount: "not-a-number" });
    expect(result.success).toBe(false);
  });

  it("rejects a blank required numeric field rather than silently defaulting to 0", () => {
    const result = programImportRowSchema.safeParse({ ...validRow, min_loan_amount: "" });
    expect(result.success).toBe(false);
  });

  it("defaults lender_tier to 3 and active to true when the CSV cell is blank", () => {
    // A real CSV parse always includes every header's key, just with an
    // empty string value for a blank cell — never an absent key.
    const result = programImportRowSchema.safeParse({ ...validRow, lender_tier: "", active: "" });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.lender_tier).toBe(3);
      expect(result.data.active).toBe(true);
    }
  });
});
