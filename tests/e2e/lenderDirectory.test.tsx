// @vitest-environment jsdom
//
// Regression tests for the "lenders always visible, guidelines locked by
// tier" correction: every lender must render, above-tier lenders show a
// locked "Upgrade to Unlock" card instead of disappearing, the old
// "No lenders are visible on your current plan." message is gone, and the
// Investor filter chip has been removed entirely.
import "@testing-library/jest-dom/vitest";
import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import { LenderDirectory, type DirectoryLender } from "@/app/lenders/lender-directory";
import type { Lender, Program } from "@/domain/types/program";

function makeLender(overrides: Partial<Lender>): Lender {
  return {
    id: overrides.id ?? "l1",
    organizationId: "o",
    name: overrides.name ?? "Test Lender",
    isSampleData: false,
    active: true,
    tierLevel: overrides.tierLevel ?? 1,
    ...overrides,
  };
}

function makeProgram(overrides: Partial<Program>): Program {
  return {
    id: overrides.id ?? "p1",
    lenderId: overrides.lenderId ?? "l1",
    organizationId: "o",
    name: overrides.name ?? "Test Program",
    isSampleData: false,
    active: true,
    incomeDocTypes: overrides.incomeDocTypes ?? ["dscr"],
    loanPurposes: ["purchase"],
    occupancies: overrides.occupancies ?? ["investment"],
    propertyTypes: ["single_family"],
    eligibleStates: "ALL",
    citizenshipEligible: overrides.citizenshipEligible ?? ["us_citizen"],
    vestingEligible: ["individual"],
    minLoanAmount: 100000,
    maxLoanAmount: 1000000,
    minFico: 660,
    baseMaxLtv: 80,
    minReservesMonths: 0,
    interestOnlyAvailable: false,
    prepaymentPenaltyOptions: [],
    guidelineVersionId: "gv1",
    guidelineVersionLabel: "v1",
    effectiveDate: "2026-01-01",
    sourceCitation: "test",
    ...overrides,
  };
}

const tier1: DirectoryLender[] = [{ lender: makeLender({ id: "t1", name: "Alpha Lending", tierLevel: 1 }), programs: [makeProgram({ lenderId: "t1" })] }];
const tier2: DirectoryLender[] = [{ lender: makeLender({ id: "t2", name: "Beta Mortgage", tierLevel: 2 }), programs: [makeProgram({ lenderId: "t2" })] }];
const tier3: DirectoryLender[] = [{ lender: makeLender({ id: "t3", name: "Gamma Capital", tierLevel: 3 }), programs: [makeProgram({ lenderId: "t3" })] }];

describe("LenderDirectory: every tier is always visible; access is locked, not hidden", () => {
  it("a user with NO subscription (tier 0) still sees all 3 tiers of lenders, all locked", () => {
    render(<LenderDirectory tier1={tier1} tier2={tier2} tier3={tier3} userTierLevel={0} />);
    expect(screen.getByText("Alpha Lending")).toBeInTheDocument();
    expect(screen.getByText("Beta Mortgage")).toBeInTheDocument();
    expect(screen.getByText("Gamma Capital")).toBeInTheDocument();
    // Never the old generic empty/plan-gated message.
    expect(screen.queryByText("No lenders are visible on your current plan.")).not.toBeInTheDocument();
    expect(screen.getAllByText(/Upgrade to Unlock/)).toHaveLength(3);
  });

  it("a Tier 1 subscriber sees Tier 2 and Tier 3 lenders too, but only Tier 1 is unlocked (clickable link)", () => {
    render(<LenderDirectory tier1={tier1} tier2={tier2} tier3={tier3} userTierLevel={1} />);
    expect(screen.getByRole("link", { name: /View Alpha Lending programs and guidelines/ })).toBeInTheDocument();
    expect(screen.queryByRole("link", { name: /View Beta Mortgage/ })).not.toBeInTheDocument();
    expect(screen.queryByRole("link", { name: /View Gamma Capital/ })).not.toBeInTheDocument();
    expect(screen.getByText("Beta Mortgage")).toBeInTheDocument();
    expect(screen.getByText("Gamma Capital")).toBeInTheDocument();
    expect(screen.getAllByText(/Upgrade to Unlock/)).toHaveLength(2);
  });

  it("a Tier 2 subscriber unlocks Tier 1 and Tier 2, but Tier 3 stays locked", () => {
    render(<LenderDirectory tier1={tier1} tier2={tier2} tier3={tier3} userTierLevel={2} />);
    expect(screen.getByRole("link", { name: /View Alpha Lending/ })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /View Beta Mortgage/ })).toBeInTheDocument();
    expect(screen.queryByRole("link", { name: /View Gamma Capital/ })).not.toBeInTheDocument();
    expect(screen.getAllByText(/Upgrade to Unlock/)).toHaveLength(1);
  });

  it("a Tier 3 (Enterprise) subscriber unlocks everything", () => {
    render(<LenderDirectory tier1={tier1} tier2={tier2} tier3={tier3} userTierLevel={3} />);
    expect(screen.getByRole("link", { name: /View Alpha Lending/ })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /View Beta Mortgage/ })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /View Gamma Capital/ })).toBeInTheDocument();
    expect(screen.queryByText(/Upgrade to Unlock/)).not.toBeInTheDocument();
  });

  it("the locked card's Upgrade button links to /pricing", () => {
    render(<LenderDirectory tier1={tier1} tier2={tier2} tier3={tier3} userTierLevel={0} />);
    const upgradeLinks = screen.getAllByRole("link", { name: /Upgrade to Unlock/ });
    for (const link of upgradeLinks) expect(link).toHaveAttribute("href", "/pricing");
  });

  it('the Investor filter chip has been completely removed', () => {
    render(<LenderDirectory tier1={tier1} tier2={tier2} tier3={tier3} userTierLevel={3} />);
    expect(screen.queryByRole("button", { name: "Investor" })).not.toBeInTheDocument();
  });

  it("the other real program filter chips (DSCR, Bank Statement, P&L Only, Foreign National, Asset Depletion) are present and functional", () => {
    render(<LenderDirectory tier1={tier1} tier2={tier2} tier3={tier3} userTierLevel={3} />);
    for (const label of ["DSCR", "Bank Statement", "P&L Only", "Foreign National", "Asset Depletion"]) {
      expect(screen.getByRole("button", { name: label })).toBeInTheDocument();
    }
  });
});
