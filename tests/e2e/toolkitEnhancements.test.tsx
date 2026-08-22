// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { ToolkitClient } from "@/app/toolkit/toolkit-client";

describe("Loan Officer Toolkit enhancements", () => {
  it("applies an independent Reverse Solver transcript directly to its fields", async () => {
    render(<ToolkitClient />);
    expect(screen.getByText("Reverse Solver Voice Intake")).toBeInTheDocument();
    fireEvent.change(screen.getByLabelText("Scenario transcript"), { target: { value: "Borrower makes $14,000 per month, liabilities $2,500, DTI 50%, taxes $900, insurance $250, rate 7.25%." } });
    fireEvent.click(screen.getByRole("button", { name: "Populate fields" }));
    await waitFor(() => expect(screen.getByLabelText("Qualifying monthly income")).toHaveValue("14,000"));
    expect(screen.getByLabelText("Monthly liabilities")).toHaveValue("2,500");
    expect(screen.getByLabelText("Monthly property taxes")).toHaveValue("900");
    expect(screen.getByLabelText("Monthly insurance")).toHaveValue("250");
    expect(screen.getByLabelText("Interest rate")).toHaveValue("7.25");
  });

  it("keeps P&L expense amount and ratio synchronized in both directions", () => {
    render(<ToolkitClient />);
    fireEvent.click(screen.getByRole("button", { name: /P&L Income/ }));
    const ratio = screen.getByLabelText("Expense ratio");
    const expenses = screen.getByLabelText("Total expenses");
    fireEvent.focus(ratio);
    fireEvent.change(ratio, { target: { value: "20" } });
    expect(expenses).toHaveValue("120,000");
    fireEvent.blur(ratio);
    fireEvent.focus(expenses);
    fireEvent.change(expenses, { target: { value: "150000" } });
    expect(expenses).toHaveValue("150,000");
    expect(ratio).toHaveValue("25");
  });

  it("shows zero-value numeric fields as empty and formats U.S. thousands while editing", () => {
    render(<ToolkitClient />);
    fireEvent.click(screen.getByRole("button", { name: /DSCR Calculator/ }));
    const flood = screen.getByLabelText("Annual flood insurance");
    expect(flood).toHaveValue("");
    fireEvent.focus(flood);
    fireEvent.change(flood, { target: { value: "0100000" } });
    expect(flood).toHaveValue("100,000");
  });

  it("uses the clearer Asset Depletion months prompt", () => {
    render(<ToolkitClient />);
    fireEvent.click(screen.getByRole("button", { name: /Asset Depletion/ }));
    expect(screen.getByLabelText("Divide by How Many Months?")).toHaveValue("120");
    expect(screen.queryByText("Divisor")).not.toBeInTheDocument();
  });
});
