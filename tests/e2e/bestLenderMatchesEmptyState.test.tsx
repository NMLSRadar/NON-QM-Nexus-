// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import { BestLenderMatches } from "@/app/scenarios/[id]/best-lender-matches";

// Regression test for a real bug: a scenario belonging to an account with
// no active subscription (tierLevel 0) legitimately sees zero lender
// evaluations (the shared catalog is tier-gated), but the page previously
// showed the exact same "No applicable lender programs found for this
// scenario yet." message it uses when a scenario's own data genuinely
// doesn't match any program — which reads exactly like the matching engine
// is broken to a brand-new, not-yet-subscribed user. tierLevel must steer
// to a distinct, actionable "subscribe to unlock" message instead.
describe("BestLenderMatches empty states", () => {
  it("shows a subscribe-to-unlock message when there are no evaluations and tierLevel is 0", () => {
    render(<BestLenderMatches evaluations={[]} tierLevel={0} />);
    expect(screen.getByText(/no active subscription/i)).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /view plans/i })).toHaveAttribute("href", "/pricing");
    expect(screen.queryByText(/no applicable lender programs found/i)).not.toBeInTheDocument();
  });

  it("shows the generic empty state when there are no evaluations but tierLevel is > 0", () => {
    render(<BestLenderMatches evaluations={[]} tierLevel={1} />);
    expect(screen.getByText(/no applicable lender programs found/i)).toBeInTheDocument();
    expect(screen.queryByText(/no active subscription/i)).not.toBeInTheDocument();
  });

  it("shows the generic empty state when tierLevel is omitted (backward compatible)", () => {
    render(<BestLenderMatches evaluations={[]} />);
    expect(screen.getByText(/no applicable lender programs found/i)).toBeInTheDocument();
  });
});
