// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import { describe, expect, it } from "vitest";
import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { ProgramDirectory } from "@/app/programs/program-directory";
import type { Lender, Program } from "@/domain/types/program";

function lender(id: string, name: string): Lender {
  return { id, organizationId: "org", name, isSampleData: false, active: true, tierLevel: 1 };
}

function program(overrides: Partial<Program> & Pick<Program, "id" | "lenderId" | "name">): Program {
  return {
    organizationId: "org",
    isSampleData: false,
    active: true,
    incomeDocTypes: ["full_doc"],
    loanPurposes: ["purchase"],
    occupancies: ["investment"],
    propertyTypes: ["single_family"],
    eligibleStates: "ALL",
    citizenshipEligible: ["us_citizen"],
    vestingEligible: ["individual"],
    minLoanAmount: 100000,
    maxLoanAmount: 1500000,
    minFico: 660,
    baseMaxLtv: 80,
    minReservesMonths: 3,
    interestOnlyAvailable: false,
    prepaymentPenaltyOptions: [],
    guidelineVersionId: "v1-id",
    guidelineVersionLabel: "v1",
    effectiveDate: "2026-01-01",
    sourceCitation: "verified test source",
    ...overrides,
  };
}

const lenders = [lender("orion", "Orion Lending"), lender("acra", "Acra Lending")];
const programs = [
  program({ id: "orion-dscr", lenderId: "orion", name: "COIN X", incomeDocTypes: ["dscr"] }),
  program({ id: "acra-itin", lenderId: "acra", name: "ITIN DSCR", incomeDocTypes: ["dscr"], citizenshipEligible: ["itin"] }),
  program({ id: "acra-asset", lenderId: "acra", name: "Asset Depletion", incomeDocTypes: ["asset_depletion"] }),
  program({ id: "acra-bank", lenderId: "acra", name: "12-Month Bank Statement", incomeDocTypes: ["bank_statement"] }),
];

describe("Programs directory", () => {
  it("shows live category counts while keeping program cards unrendered until expanded", async () => {
    const user = userEvent.setup();
    render(<ProgramDirectory lenders={lenders} programs={programs} />);

    expect(screen.getByRole("button", { name: /All Programs 4 Programs/i })).toHaveAttribute("aria-expanded", "false");
    expect(screen.getByRole("button", { name: /Bank Statement 1 Program/i })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /DSCR 2 Programs/i })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /ITIN 1 Program/i })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Asset Utilization \/ Asset Depletion 1 Program/i })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /WVOE 0 Programs/i })).toBeInTheDocument();
    expect(screen.queryByRole("link", { name: /View ITIN DSCR from Acra Lending/ })).not.toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: /All Programs 4 Programs/i }));
    const programLinks = screen.getAllByRole("link").filter((link) => link.getAttribute("href")?.includes("#program-"));
    expect(programLinks.map((link) => link.getAttribute("aria-label"))).toEqual([
      "View 12-Month Bank Statement from Acra Lending",
      "View Asset Depletion from Acra Lending",
      "View ITIN DSCR from Acra Lending",
      "View COIN X from Orion Lending",
    ]);
  });

  it("searches lender names, official program names, and combined terminology immediately", async () => {
    const user = userEvent.setup();
    render(<ProgramDirectory lenders={lenders} programs={programs} />);
    const search = screen.getByRole("searchbox", { name: /Search lenders or programs/i });

    await user.type(search, "Orion");
    expect(screen.getAllByRole("link", { name: /View COIN X from Orion Lending/ }).length).toBeGreaterThan(0);
    expect(screen.queryByRole("link", { name: /View ITIN DSCR from Acra Lending/ })).not.toBeInTheDocument();

    await user.clear(search);
    await user.type(search, "ITIN DSCR");
    const itinSection = screen.getByRole("button", { name: /ITIN 1 Program · 1 matching/i }).closest("section");
    expect(itinSection).not.toBeNull();
    expect(within(itinSection as HTMLElement).getByRole("link", { name: /View ITIN DSCR from Acra Lending/ })).toBeInTheDocument();
  });
});
