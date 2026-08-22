// @vitest-environment jsdom
//
// Spec Tests 1, 3, and 6: investor experience and title vesting are
// voluntary — omitting them must never block the lender list, must never
// produce a validation error, and the manual-correction dropdowns for them
// must show "—" (not required) rather than any error state. Also confirms
// the refinance-only Current Loan Balance tab stays hidden on a purchase.
import "@testing-library/jest-dom/vitest";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import VoiceClient from "@/app/scenarios/voice/voice-client";

const push = vi.fn();
vi.mock("next/navigation", () => ({
  useRouter: () => ({ push }),
}));

const createScenarioFromVoice = vi.fn();
const getVoiceCatalog = vi.fn();
vi.mock("@/app/scenarios/voice/actions", () => ({
  createScenarioFromVoice: (...args: unknown[]) => createScenarioFromVoice(...args),
  getVoiceCatalog: (...args: unknown[]) => getVoiceCatalog(...args),
}));

function setTranscript(text: string) {
  const box = screen.getByLabelText("Transcript (editable)");
  fireEvent.change(box, { target: { value: text } });
}

beforeEach(() => {
  window.sessionStorage.clear();
  push.mockReset();
  createScenarioFromVoice.mockReset();
  createScenarioFromVoice.mockResolvedValue({ redirectTo: "/scenarios/mock-id" });
  getVoiceCatalog.mockReset();
  getVoiceCatalog.mockResolvedValue({ lenders: [], programs: [], rules: [] });
});

afterEach(() => {
  cleanup();
});

describe("Test 1 & 3 (spec): the 9 required vitals alone are enough — investor experience and vesting are optional", () => {
  it("submits from the lender-matches button with only the 9 core vitals", async () => {
    render(<VoiceClient />);
    setTranscript(
      "Purchase of a single family investment property worth $500,000, loan amount 400k, credit score 720, DSCR to qualify. Borrower is a U.S. citizen."
    );

    await waitFor(() => {
      expect(screen.getByText(/9 of 9 Required Vitals Complete/)).toBeInTheDocument();
    });

    // Both optional fields show "Not mentioned" — never an error state.
    expect(screen.getAllByText("Not mentioned").length).toBeGreaterThanOrEqual(2);
    expect(screen.queryByText(/investor experience/i, { selector: ".text-rose-700, .text-amber-800" })).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "See lender matches" }));

    await waitFor(() => expect(createScenarioFromVoice).toHaveBeenCalledTimes(1));
    await waitFor(() => expect(push).toHaveBeenCalledWith("/scenarios/mock-id"));

    // Never any generic/blocking validation message.
    expect(screen.queryByText("Please correct the highlighted fields.")).not.toBeInTheDocument();
  });

  it("the manual-correction dropdowns for investor experience and vesting default to unset, not an error", () => {
    render(<VoiceClient />);
    // Deliberately incomplete (no income doc) so no auto-submission fires
    // in the background during this synchronous assertion.
    setTranscript("Purchase of a single family primary residence worth $500,000, loan amount 400k, credit score 720.");

    const details = screen.getByText("Correct a field manually");
    fireEvent.click(details);

    const investorSelect = screen.getByLabelText("Investor experience") as HTMLSelectElement;
    const vestingSelect = screen.getByLabelText("Title vesting") as HTMLSelectElement;
    expect(investorSelect.value).toBe("");
    expect(vestingSelect.value).toBe("");
  });
});

describe("Test 6 (spec): purchase scenario hides the Current Loan Balance tab", () => {
  it("never shows a Current Loan Balance tile or manual field for a purchase", async () => {
    render(<VoiceClient />);
    setTranscript(
      "Purchase of a single family investment property worth $500,000, loan amount 400k, credit score 720, DSCR to qualify. Borrower is a U.S. citizen."
    );

    await waitFor(() => {
      expect(screen.getByText(/9 of 9 Required Vitals Complete/)).toBeInTheDocument();
    });

    expect(screen.queryByText("Current loan balance")).not.toBeInTheDocument();
    fireEvent.click(screen.getByText("Correct a field manually"));
    expect(screen.queryByLabelText("Current loan balance ($)")).not.toBeInTheDocument();
  });

  it("shows the Current Loan Balance tab once the transaction is a refinance", async () => {
    render(<VoiceClient />);
    setTranscript(
      "Rate and term refinance of a single family investment property worth $500,000, loan amount 400k, credit score 720, DSCR to qualify."
    );

    await waitFor(() => {
      expect(screen.getByText("Current loan balance")).toBeInTheDocument();
    });
    fireEvent.click(screen.getByText("Correct a field manually"));
    expect(screen.getByLabelText("Current loan balance ($)")).toBeInTheDocument();
  });
});
