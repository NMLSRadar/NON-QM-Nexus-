import { describe, expect, it } from "vitest";
import {
  classifyOverhead,
  estimateIncomeLadder,
  EXPENSE_FOLLOWUP_QUESTIONS,
  EXPENSE_FACTOR_PHRASES,
  EXPENSE_LADDER,
} from "@/domain/bankStatementIntelligence";
import { ASSISTANT_SYSTEM_PROMPT, extractAssistantVitals } from "@/lib/ai/assistantContext";

describe("classifyOverhead — business type → overhead profile", () => {
  it("treats a restaurant as high overhead", () => {
    const r = classifyOverhead("My borrower owns a restaurant");
    expect(r.profile).toBe("high");
    expect(r.typicalExpenseRange).toEqual([40, 50]);
  });

  it("treats a real estate agent as low overhead", () => {
    const r = classifyOverhead("self-employed real estate agent");
    expect(r.profile).toBe("low");
    expect(r.typicalExpenseRange).toEqual([10, 20]);
  });

  it("treats a consultant as low overhead by title", () => {
    expect(classifyOverhead("consultant").profile).toBe("low");
  });

  it("§5 — overhead DETAILS override a low title (consulting firm with employees/office/subcontractors → high)", () => {
    const r = classifyOverhead("consulting firm with 12 employees, an office lease, and subcontractors");
    expect(r.profile).toBe("high");
    expect(r.overheadDriven).toBe(true);
  });

  it("§5 — explicit low-overhead signals confirm low even without a clean title", () => {
    const r = classifyOverhead("works from home, no employees, no inventory");
    expect(r.profile).toBe("low");
  });

  it("returns unknown for an empty or unrecognizable description", () => {
    expect(classifyOverhead("").profile).toBe("unknown");
    expect(classifyOverhead("borrower has a business").profile).toBe("unknown");
  });
});

describe("estimateIncomeLadder — §9 qualifying income across expense factors", () => {
  it("computes income = deposits × (1 − factor) and never reverses the two percentages", () => {
    const rows = estimateIncomeLadder(60_000);
    const byPct = Object.fromEntries(rows.map((r) => [r.expensePercent, r.qualifyingMonthlyIncome]));
    expect(byPct[50]).toBe(30_000); // 50% expense → 50% income
    expect(byPct[10]).toBe(54_000); // 10% expense → 90% income
    expect(byPct[15]).toBe(51_000);
    expect(byPct[20]).toBe(48_000);
  });

  it("matches the spec §9 worked example ($60k deposits)", () => {
    const rows = estimateIncomeLadder(60_000);
    const byPct = Object.fromEntries(rows.map((r) => [r.expensePercent, r.qualifyingMonthlyIncome]));
    expect(byPct[30]).toBe(42_000);
    expect(byPct[40]).toBe(36_000);
  });

  it("uses the spec's ladder and never goes negative", () => {
    expect(EXPENSE_LADDER).toContain(50);
    expect(estimateIncomeLadder(0).every((r) => r.qualifyingMonthlyIncome === 0)).toBe(true);
  });

  it("§2 worked example: $50k deposits at 50% → $25k qualifying", () => {
    const rows = estimateIncomeLadder(50_000, [50]);
    expect(rows[0]?.qualifyingMonthlyIncome).toBe(25_000);
  });
});

describe("§12 phrase list + §11 follow-up questions", () => {
  it("carries the expense-factor vocabulary for voice/conversational detection", () => {
    for (const phrase of ["expense ratio", "expense factor", "cpa letter", "low overhead", "use 100% of deposits", "bank statement qualifying income"]) {
      expect(EXPENSE_FACTOR_PHRASES).toContain(phrase);
    }
  });

  it("follow-up questions cover the material §11 variables", () => {
    const joined = EXPENSE_FOLLOWUP_QUESTIONS.join(" ").toLowerCase();
    for (const kw of ["type of business", "employees", "inventory", "equipment", "cpa", "12-month", "24-month", "personal", "business"]) {
      expect(joined, kw).toContain(kw);
    }
  });
});

describe("extractAssistantVitals — expense-factor + deposit detection", () => {
  it("tags an expense-factor question", () => {
    const v = extractAssistantVitals([{ role: "user", content: "what expense ratio should I use for this bank statement loan?" }]);
    expect(v.notesFragments).toContain("expense_factor_question");
  });

  it("detects 'use 100% of deposits' phrasing", () => {
    const v = extractAssistantVitals([{ role: "user", content: "who lets me use 100% of the business deposits?" }]);
    expect(v.notesFragments).toContain("expense_factor_question");
  });

  it("captures approximate monthly deposits separately from loan amount", () => {
    const v = extractAssistantVitals([{ role: "user", content: "borrower averages $50k a month in deposits" }]);
    expect(v.monthlyDeposits).toBe(50_000);
  });
});

describe("Assistant system prompt — expense-factor intelligence contract", () => {
  const p = ASSISTANT_SYSTEM_PROMPT.toLowerCase();

  it("states the guidelines-first priority order", () => {
    expect(p).toContain("lender's actual guideline");
    expect(p).toContain("general industry expectation");
  });

  it("understands the income mechanic and never reverses the percentages", () => {
    expect(p).toContain("qualifying business income");
    expect(p).toContain("expense factor");
    expect(p).toContain("1 − expense factor");
    expect(p).toContain("$25,000");
  });

  it("distinguishes high-overhead vs low-overhead business types", () => {
    for (const b of ["restaurant", "construction", "retail"]) expect(p, b).toContain(b);
    for (const b of ["real estate agent", "consultant", "loan officer"]) expect(p, b).toContain(b);
    expect(p).toContain("10%–20%");
  });

  it("teaches §5 — don't decide from the business title alone", () => {
    expect(p).toContain("two \"consultants\"");
    expect(p).toContain("title alone");
  });

  it("surfaces CPA/EA letter, P&L, and business narrative documentation", () => {
    for (const d of ["cpa/ea letter", "business narrative", "p&l"]) expect(p, d).toContain(d);
  });

  it("carries the deposit-usage caveat (transfers, chargebacks, non-business deposits)", () => {
    expect(p).toContain("transfers");
    expect(p).toContain("chargebacks");
    expect(p).toContain("non-business deposits");
  });

  it("teaches the income-impact ladder and labels it as estimates", () => {
    expect(p).toContain("$54k");
    expect(p).toContain("$30k");
    expect(p).toContain("estimate");
  });

  it("never fabricates a lender's expense factor — states the exact not-verified line", () => {
    expect(p).toContain("not verified in the current guideline database");
    expect(p).toContain("never invent");
  });
});
