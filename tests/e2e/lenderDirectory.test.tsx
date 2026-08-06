// @vitest-environment jsdom
//
// Regression tests for the single-membership lender directory (2026-08-05):
// the 3-tier presentation is gone — every lender renders in one "All Lenders"
// section, a non-member sees every lender locked behind a "Membership
// required" card, and a member sees every lender unlocked (clickable). The
// old tier filter chips and "Upgrade to Unlock" copy are removed entirely.
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

const lenders: DirectoryLender[] = [
  { lender: makeLender({ id: "t1", name: "Alpha Lending", tierLevel: 1 }), programs: [makeProgram({ lenderId: "t1" })] },
  { lender: makeLender({ id: "t2", name: "Beta Mortgage", tierLevel: 2 }), programs: [makeProgram({ lenderId: "t2" })] },
  { lender: makeLender({ id: "t3", name: "Gamma Capital", tierLevel: 3 }), programs: [makeProgram({ lenderId: "t3" })] },
];

describe("LenderDirectory: single-membership — every lender visible, access locked or unlocked by membership", () => {
  it("a non-member still sees all lenders, all locked behind 'Membership required'", () => {
    render(<LenderDirectory lenders={lenders} isMember={false} />);
    expect(screen.getByText("Alpha Lending")).toBeInTheDocument();
    expect(screen.getByText("Beta Mortgage")).toBeInTheDocument();
    expect(screen.getByText("Gamma Capital")).toBeInTheDocument();
    expect(screen.getAllByText(/Membership required/)).toHaveLength(3);
    expect(screen.getAllByText(/Unlock with Membership/)).toHaveLength(3);
  });

  it("a member sees every lender unlocked (clickable link to the lender page)", () => {
    render(<LenderDirectory lenders={lenders} isMember={true} />);
    expect(screen.getByRole("link", { name: /View Alpha Lending programs and guidelines/ })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /View Beta Mortgage/ })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /View Gamma Capital/ })).toBeInTheDocument();
    expect(screen.queryByText(/Membership required/)).not.toBeInTheDocument();
    expect(screen.queryByText(/Unlock with Membership/)).not.toBeInTheDocument();
  });

  it("the locked card's Unlock button links to /pricing", () => {
    render(<LenderDirectory lenders={lenders} isMember={false} />);
    const unlockLinks = screen.getAllByRole("link", { name: /Unlock with Membership/ });
    for (const link of unlockLinks) expect(link).toHaveAttribute("href", "/pricing");
  });

  it("the single 'All Lenders' section heading is present", () => {
    render(<LenderDirectory lenders={lenders} isMember={true} />);
    expect(screen.getByRole("heading", { name: /All Lenders/ })).toBeInTheDocument();
  });

  it("the old tier / program filter chips have been completely removed", () => {
    render(<LenderDirectory lenders={lenders} isMember={true} />);
    for (const label of ["All", "Tier 1", "Tier 2", "Tier 3", "Investor", "DSCR", "Bank Statement", "P&L Only", "Foreign National", "Asset Depletion"]) {
      expect(screen.queryByRole("button", { name: label })).not.toBeInTheDocument();
    }
  });
});