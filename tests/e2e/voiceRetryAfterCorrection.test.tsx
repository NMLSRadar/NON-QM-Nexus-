// @vitest-environment jsdom
//
// Regression test for the reported "stuck on Ranking matching lenders now,
// then Please correct the highlighted fields" freeze: a failed submit
// attempt reset submittedRef, but the retry effect only depended on
// `canAnalyze` (a boolean) — so a correction made afterward, while
// canAnalyze stayed true the whole time (already 8/8 vitals both before
// and after), never re-triggered a retry. The UI stayed frozen on the
// stale error message forever even once the data was fully valid.
//
// This drives the REAL <VoiceClient /> component through exactly that
// sequence: first submission attempt fails (server returns a validation
// message), then the user corrects the offending field via a manual
// override WITHOUT canAnalyze ever going false in between — and confirms
// the component automatically retries and clears the stale message.
import "@testing-library/jest-dom/vitest";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import VoiceClient from "@/app/scenarios/voice/voice-client";
import { VOICE_DRAFT_STORAGE_KEY } from "@/domain/voice/draft";

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

// Sets the FULL final transcript in one atomic change event — deliberately
// not character-by-character typing. Simulating live per-character speech
// interim results would (correctly, and separately from what's under test
// here) expose transient mid-word states — e.g. "...full doc inc" is
// briefly a real, boundary-terminated word fragment coinciding with a title
// vesting synonym — which is an existing, separate streaming/debounce
// consideration (spec section 12) and not what this regression test is
// about; a single atomic change event isolates the actual retry-after-
// correction behavior under test.
function setTranscript(text: string) {
  const box = screen.getByLabelText("Transcript (editable)");
  fireEvent.change(box, { target: { value: text } });
}

beforeEach(() => {
  window.sessionStorage.clear();
  push.mockReset();
  createScenarioFromVoice.mockReset();
  getVoiceCatalog.mockReset();
  getVoiceCatalog.mockResolvedValue({ lenders: [], programs: [], rules: [] });
});

afterEach(() => {
  cleanup();
});

describe("Voice resubmission after a correction", () => {
  it("submits the corrected extraction and clears the stale error on the next click", async () => {
    // First attempt: the server rejects with a specific validation message
    // (simulating, e.g., an out-of-range credit score slipping through).
    createScenarioFromVoice.mockResolvedValueOnce({ message: "The credit score must be between 300 and 850." });

    render(<VoiceClient />);
    setTranscript(
      "Purchase of a single family primary residence worth $500,000, loan amount 400k, credit score 720, full doc income. Borrower is a U.S. citizen."
    );

    await waitFor(() => {
      expect(screen.getByText(/9 of 9 Required Vitals Complete/)).toBeInTheDocument();
    });
    fireEvent.click(screen.getByRole("button", { name: "See lender matches" }));

    await waitFor(() => expect(createScenarioFromVoice).toHaveBeenCalledTimes(1));
    await waitFor(() => {
      expect(screen.getByText("The credit score must be between 300 and 850.")).toBeInTheDocument();
    });

    // Second attempt (a manual correction to a DIFFERENT field, e.g. loan
    // amount) should succeed — critically, all 8 vitals were ALREADY
    // complete both before and after this edit, so canAnalyze never
    // toggles false->true again. Only the effect's new `effective`/
    // `isPending` dependencies make the retry happen at all.
    createScenarioFromVoice.mockResolvedValueOnce({ redirectTo: "/scenarios/mock-id" });

    const user = userEvent.setup();
    await user.click(screen.getByText("Correct a field manually"));
    const loanAmountInput = screen.getByLabelText("Loan amount ($)");
    fireEvent.change(loanAmountInput, { target: { value: "410000" } });
    fireEvent.click(screen.getByRole("button", { name: "See lender matches" }));

    await waitFor(() => expect(createScenarioFromVoice).toHaveBeenCalledTimes(2));
    // The stale error message from the first attempt must be gone.
    expect(screen.queryByText("The credit score must be between 300 and 850.")).not.toBeInTheDocument();
    await waitFor(() => expect(push).toHaveBeenCalledWith("/scenarios/mock-id"));
    expect(window.sessionStorage.getItem(VOICE_DRAFT_STORAGE_KEY)).not.toBeNull();
  }, 15000);

  it("re-enables the action after an in-flight failure and submits the correction on the next click", async () => {
    let resolveFirst!: (value: { message: string }) => void;
    createScenarioFromVoice.mockImplementationOnce(
      () => new Promise((resolve) => { resolveFirst = resolve; })
    );

    render(<VoiceClient />);
    setTranscript(
      "Purchase of a single family primary residence worth $500,000, loan amount 400k, credit score 720, full doc income. Borrower is a U.S. citizen."
    );
    fireEvent.click(screen.getByRole("button", { name: "See lender matches" }));
    await waitFor(() => expect(createScenarioFromVoice).toHaveBeenCalledTimes(1));

    // A correction arrives WHILE the first request is still pending.
    createScenarioFromVoice.mockResolvedValueOnce({ redirectTo: "/scenarios/mock-id" });
    const user = userEvent.setup();
    await user.click(screen.getByText("Correct a field manually"));
    const ficoInput = screen.getByLabelText("FICO");
    fireEvent.change(ficoInput, { target: { value: "740" } });

    // Now the first (stale) request resolves with a failure.
    resolveFirst({ message: "Please provide the requested loan amount." });

    await waitFor(() => expect(screen.getByRole("button", { name: "See lender matches" })).not.toBeDisabled());
    fireEvent.click(screen.getByRole("button", { name: "See lender matches" }));
    await waitFor(() => expect(createScenarioFromVoice).toHaveBeenCalledTimes(2));
    await waitFor(() => expect(push).toHaveBeenCalledWith("/scenarios/mock-id"));
  }, 15000);

  it("contains a thrown server exception, preserves 9/9, and allows an immediate retry", async () => {
    createScenarioFromVoice
      .mockRejectedValueOnce(new Error("temporary server failure"))
      .mockResolvedValueOnce({ redirectTo: "/scenarios/mock-id" });

    render(<VoiceClient />);
    setTranscript(
      "Purchase of a single family primary residence worth $500,000, loan amount 400k, credit score 720, full doc income. Borrower is a U.S. citizen."
    );

    const submit = await screen.findByRole("button", { name: "See lender matches" });
    fireEvent.click(submit);

    await waitFor(() => {
      expect(screen.getByText(/temporary system error/)).toBeInTheDocument();
      expect(screen.getByText(/9 of 9 Required Vitals Complete/)).toBeInTheDocument();
      expect(screen.getByRole("button", { name: "See lender matches" })).not.toBeDisabled();
    });
    expect(push).not.toHaveBeenCalled();
    expect(window.sessionStorage.length).toBeGreaterThan(0);

    fireEvent.click(screen.getByRole("button", { name: "See lender matches" }));
    await waitFor(() => expect(createScenarioFromVoice).toHaveBeenCalledTimes(2));
    await waitFor(() => expect(push).toHaveBeenCalledWith("/scenarios/mock-id"));
  }, 15000);
});
