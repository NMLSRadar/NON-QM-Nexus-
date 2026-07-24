import { describe, expect, it } from "vitest";
import { scenarioInputSchema, friendlyValidationMessage } from "@/domain/validation/scenarioSchema";

// Section 4 of the spec: never show the generic "Please correct the
// highlighted fields." — always name the exact issue in plain language.

describe("friendlyValidationMessage: specific, plain-language errors", () => {
  it("credit score out of range", () => {
    const parsed = scenarioInputSchema.safeParse({ name: "x", fico: 900 });
    expect(parsed.success).toBe(false);
    if (!parsed.success) {
      expect(friendlyValidationMessage(parsed.error.issues)).toBe("The credit score must be between 300 and 850.");
    }
  });

  it("loan amount exceeding property value", () => {
    const parsed = scenarioInputSchema.safeParse({ name: "x", estimatedValue: 500_000, requestedLoanAmount: 700_000 });
    expect(parsed.success).toBe(false);
    if (!parsed.success) {
      expect(friendlyValidationMessage(parsed.error.issues)).toBe("The loan amount cannot exceed the property value.");
    }
  });

  it("loan amount exceeding purchase price (purchase transaction)", () => {
    const parsed = scenarioInputSchema.safeParse({ name: "x", purchasePrice: 400_000, requestedLoanAmount: 450_000 });
    expect(parsed.success).toBe(false);
    if (!parsed.success) {
      expect(friendlyValidationMessage(parsed.error.issues)).toBe("The loan amount cannot exceed the property value.");
    }
  });

  it("never returns the old generic blanket message", () => {
    const parsed = scenarioInputSchema.safeParse({ name: "x", fico: 900 });
    expect(parsed.success).toBe(false);
    if (!parsed.success) {
      expect(friendlyValidationMessage(parsed.error.issues)).not.toBe("Please correct the highlighted fields.");
    }
  });

  it("a loan amount at or below the property value is valid (no false positive)", () => {
    const parsed = scenarioInputSchema.safeParse({ name: "x", estimatedValue: 500_000, requestedLoanAmount: 500_000 });
    expect(parsed.success).toBe(true);
  });

  it("investor experience and title vesting are never the cause of a validation failure — omitting them never fails", () => {
    const parsed = scenarioInputSchema.safeParse({
      name: "x",
      loanPurpose: "purchase",
      occupancy: "investment",
      propertyType: "single_family",
      estimatedValue: 1_000_000,
      requestedLoanAmount: 800_000,
      fico: 760,
      incomeDocType: "bank_statement",
      // investorExperience and vesting intentionally omitted
    });
    expect(parsed.success).toBe(true);
  });
});
