import { describe, expect, it } from "vitest";
import { buildPendingReviewContext, ASSISTANT_SYSTEM_PROMPT } from "@/lib/ai/assistantContext";

// Per Phase 12 of the "14-Day Loan Officer Testing Access + Brokers First
// Funding Integration" spec (2026-07-28): the AI assistant must be aware a
// pending-review lender (like Brokers First Funding, added this same
// session) exists and what program categories it's known to offer, but
// must NEVER be handed — and therefore can never fabricate — a numeric
// guideline fact for it before an admin has verified one.
describe("Pending-review lender context — awareness without fabrication", () => {
  it("serializes lender name, program name, and doc types only — never a numeric field", () => {
    const context = buildPendingReviewContext([
      { lenderName: "Brokers First Funding", programName: "DSCR (1-4 Unit)", incomeDocTypes: ["dscr"] },
      { lenderName: "Brokers First Funding", programName: "Bank Statement", incomeDocTypes: ["bank_statement"] },
    ]);
    expect(context).toContain("Brokers First Funding");
    expect(context).toContain("DSCR (1-4 Unit)");
    expect(context).toContain("Bank Statement");
    // No numeric guideline keys should ever appear in this serializer's output.
    for (const forbiddenKey of ["minFico", "baseMaxLtv", "maxLtv", "maxLoanAmount", "minLoanAmount", "minReservesMonths", "minDscr"]) {
      expect(context).not.toContain(forbiddenKey);
    }
  });

  it("returns a clear empty-state string when there is nothing pending", () => {
    expect(buildPendingReviewContext([])).toBe("(none currently)");
  });

  it("the system prompt instructs the model to acknowledge a pending lender's program category without inventing a guideline number", () => {
    expect(ASSISTANT_SYSTEM_PROMPT).toContain("pending_review_lender_programs");
    expect(ASSISTANT_SYSTEM_PROMPT).toMatch(/never state or imply any specific LTV, FICO, loan amount/i);
    expect(ASSISTANT_SYSTEM_PROMPT).toContain("Brokers First Funding");
  });
});
