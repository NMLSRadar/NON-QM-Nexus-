// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import { PlanSelect } from "@/app/account/team/subscribe/plan-select";

/**
 * Regression test for a real production bug (2026-07-30): the Team Plan
 * dropdown rendered completely BLANK because every plan lacked a real
 * Stripe team price (scripts/stripe-team-billing.js had been written but
 * never actually run), so every <option> rendered disabled — and with
 * EVERY option disabled, the browser has no valid default to display at
 * all. See tests/integration/teamPlanCheckoutRegression.test.ts for the
 * live-database/live-Stripe side of this same regression.
 */
describe("Team Plan dropdown populates correctly", () => {
  it("renders one option per plan, all ENABLED, when every plan has a real team price", () => {
    render(
      <PlanSelect
        plans={[
          { id: "p1", name: "Essential", monthlyPriceCents: 9900, hasTeamPrice: true },
          { id: "p2", name: "Professional", monthlyPriceCents: 12500, hasTeamPrice: true },
          { id: "p3", name: "Enterprise", monthlyPriceCents: 15000, hasTeamPrice: true },
        ]}
      />
    );

    const options = screen.getAllByRole("option") as HTMLOptionElement[];
    expect(options).toHaveLength(3);
    for (const option of options) {
      expect(option.disabled).toBe(false);
    }
    expect(screen.getByRole("option", { name: /Essential.*\$99\/seat\/mo/ })).toBeInTheDocument();
    expect(screen.getByRole("option", { name: /Professional.*\$125\/seat\/mo/ })).toBeInTheDocument();
    expect(screen.getByRole("option", { name: /Enterprise.*\$150\/seat\/mo/ })).toBeInTheDocument();
    // No option should carry the "not yet configured" flag when every plan is priced.
    expect(screen.queryByText(/not yet configured/i)).not.toBeInTheDocument();
  });

  it("THE EXACT REGRESSION: when every plan lacks a team price, every option is disabled (the real root cause of the blank dropdown)", () => {
    render(
      <PlanSelect
        plans={[
          { id: "p1", name: "Essential", monthlyPriceCents: 9900, hasTeamPrice: false },
          { id: "p2", name: "Professional", monthlyPriceCents: 12500, hasTeamPrice: false },
          { id: "p3", name: "Enterprise", monthlyPriceCents: 15000, hasTeamPrice: false },
        ]}
      />
    );

    const options = screen.getAllByRole("option") as HTMLOptionElement[];
    expect(options).toHaveLength(3);
    // This is the actual failure condition production hit: options exist
    // in the DOM, but every single one is disabled, so no browser can
    // show a valid selected value — the visible control renders blank.
    for (const option of options) {
      expect(option.disabled).toBe(true);
    }
    expect(screen.getAllByText(/not yet configured/i)).toHaveLength(3);
  });

  it("a MIX of priced and unpriced plans only disables the unpriced ones (partial-config case, distinct from the total-blank regression)", () => {
    render(
      <PlanSelect
        plans={[
          { id: "p1", name: "Essential", monthlyPriceCents: 9900, hasTeamPrice: true },
          { id: "p2", name: "Professional", monthlyPriceCents: 12500, hasTeamPrice: false },
        ]}
      />
    );

    const essential = screen.getByRole("option", { name: /Essential/ }) as HTMLOptionElement;
    const professional = screen.getByRole("option", { name: /Professional/ }) as HTMLOptionElement;
    expect(essential.disabled).toBe(false);
    expect(professional.disabled).toBe(true);
  });

  it("renders nothing (empty select) when no plans are passed at all — never crashes", () => {
    render(<PlanSelect plans={[]} />);
    expect(screen.queryAllByRole("option")).toHaveLength(0);
  });
});
