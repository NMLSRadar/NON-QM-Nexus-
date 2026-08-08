import { describe, expect, it } from "vitest";
import { getProgramConfigRuntimeIssues } from "@/lib/repository/supabaseRepository";

const validEligibilityConfig = {
  incomeDocTypes: ["bank_statement"],
  loanPurposes: ["purchase"],
  occupancies: ["primary"],
  propertyTypes: ["single_family"],
  eligibleStates: "ALL",
  citizenshipEligible: ["us_citizen"],
  vestingEligible: ["individual"],
  prepaymentPenaltyOptions: [],
};

describe("program config runtime quarantine", () => {
  it("accepts a complete eligibility config", () => {
    expect(getProgramConfigRuntimeIssues(validEligibilityConfig)).toEqual([]);
  });

  it("quarantines a config missing an array used by the matching engine", () => {
    const { incomeDocTypes: _missing, ...malformed } = validEligibilityConfig;
    expect(getProgramConfigRuntimeIssues(malformed)).toContain("incomeDocTypes");
  });

  it("quarantines malformed state eligibility instead of granting broad access", () => {
    expect(getProgramConfigRuntimeIssues({ ...validEligibilityConfig, eligibleStates: undefined })).toContain(
      "eligibleStates",
    );
  });

  it("quarantines a null JSONB payload", () => {
    expect(getProgramConfigRuntimeIssues(null)).toEqual(["config"]);
  });
});
