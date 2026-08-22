import { describe, expect, it } from "vitest";
import { parseReverseSolverTranscript } from "@/domain/toolkit/reverse-solver-voice";
import { formatNumericInput, numericDisplayValue, parseNumericInput } from "@/lib/toolkit/numeric-input";

describe("Toolkit numeric input formatting", () => {
  it("uses standard U.S. grouping and removes leading zeros", () => {
    expect(formatNumericInput("100000")).toBe("100,000");
    expect(formatNumericInput("0100000")).toBe("100,000");
    expect(formatNumericInput("$1,000,000.25")).toBe("1,000,000.25");
  });

  it("keeps internally-zero fields visually empty until the user enters a value", () => {
    expect(numericDisplayValue(0, true)).toBe("");
    expect(parseNumericInput("100,000.50")).toBe(100000.5);
    expect(parseNumericInput("")).toBeNull();
  });
});

describe("Reverse Solver independent voice parser", () => {
  it("maps a natural borrower scenario to Reverse Solver fields", () => {
    const result = parseReverseSolverTranscript("My borrower makes $14,000 per month, has $2,500 in monthly liabilities, we're using a 50% DTI, taxes are about $900 a month, insurance is $250, and the rate is 7.25%.");
    expect(result.fields).toMatchObject({
      income: 14000,
      liabilities: 2500,
      dti: 50,
      monthlyTaxes: 900,
      monthlyInsurance: 250,
      interestRate: 7.25,
    });
    expect(result.recognized.length).toBeGreaterThanOrEqual(6);
  });

  it("captures optional cash, reserves, closing costs, rent, DSCR, HOA and term", () => {
    const result = parseReverseSolverTranscript("Available cash is $160,000, reserves $24,000, closing costs 3%, rent $5,500, minimum DSCR 1.1, HOA $350, and a 30 year term.");
    expect(result.fields).toMatchObject({ cash: 160000, reserves: 24000, closing: 3, rent: 5500, dscr: 1.1, monthlyHoa: 350, termYears: 30 });
  });
});
