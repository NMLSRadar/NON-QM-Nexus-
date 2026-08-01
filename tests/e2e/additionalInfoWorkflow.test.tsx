// @vitest-environment jsdom
//
// Additional Info workflow — redesigned 2026-08-01 (Lender Database Audit
// & 5-8 Unit Expansion spec), REPLACING the prior 5-second auto-expiring
// countdown (see git history / secondaryVoiceVitalsCountdown.test.tsx,
// removed) entirely. Once all 9 required (primary) vitals resolve, an
// "Additional Info" prompt appears with two explicit user actions — "Add
// Additional Info" or "Skip" — and there is NO timer of any kind: the
// panel never auto-expires, never auto-submits, and the user is never
// trapped waiting on a clock. Covers spec Phases 9-11 (TEST 5 / TEST 7)
// plus TEST 6 (optional-vital voice recognition while expanded).
import "@testing-library/jest-dom/vitest";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
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
  push.mockReset();
  createScenarioFromVoice.mockReset();
  createScenarioFromVoice.mockResolvedValue({ redirectTo: "/scenarios/mock-id" });
  getVoiceCatalog.mockReset();
  getVoiceCatalog.mockResolvedValue({ lenders: [], programs: [], rules: [] });
});

afterEach(() => {
  cleanup();
});

const COMPLETE_SCENARIO =
  "Purchase of a single family investment property worth $500,000, loan amount 400k, credit score 720, DSCR to qualify. Borrower is a U.S. citizen.";

describe("Additional Info — the prompt appears ONLY once all 9 primary (required) vitals are complete", () => {
  it("shows no Additional Info prompt while a required vital is still missing, and never auto-submits", () => {
    render(<VoiceClient />);
    // Deliberately incomplete — no citizenship stated, so only 8 of 9
    // required vitals resolve and the scenario is not yet ready.
    act(() => setTranscript("Purchase of a single family investment property worth $500,000, loan amount 400k, credit score 720, DSCR to qualify."));

    expect(screen.queryByText(/Vitals — 9 of 9 captured/)).not.toBeInTheDocument();
    expect(screen.queryByText("Additional Info")).not.toBeInTheDocument();
    expect(createScenarioFromVoice).not.toHaveBeenCalled();
  });

  it("shows the Additional Info prompt with Add Additional Info / Skip the MOMENT all 9 vitals resolve, and does NOT submit automatically", () => {
    render(<VoiceClient />);
    act(() => setTranscript(COMPLETE_SCENARIO));

    expect(screen.getByText(/Vitals — 9 of 9 captured/)).toBeInTheDocument();
    expect(screen.getByText("Additional Info")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Add Additional Info" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Skip" })).toBeInTheDocument();
    // No submission until the user explicitly resolves the prompt.
    expect(createScenarioFromVoice).not.toHaveBeenCalled();
  });
});

describe("Additional Info — NO timer of any kind (spec TEST 5)", () => {
  it("never auto-collapses or auto-submits on its own, no matter how long it sits open", async () => {
    render(<VoiceClient />);
    act(() => setTranscript(COMPLETE_SCENARIO));
    expect(screen.getByText("Additional Info")).toBeInTheDocument();

    // Wait comfortably longer than the old 5-second countdown ever was —
    // the prompt must still be sitting there, untouched, with no
    // submission, since only an explicit user action can resolve it now.
    await new Promise((r) => setTimeout(r, 200));
    expect(screen.getByText("Additional Info")).toBeInTheDocument();
    expect(createScenarioFromVoice).not.toHaveBeenCalled();
  });
});

describe("Additional Info — Skip immediately proceeds to matching with no additional questions (spec TEST 7)", () => {
  it("clicking Skip submits immediately with no additional questions asked", async () => {
    render(<VoiceClient />);
    act(() => setTranscript(COMPLETE_SCENARIO));
    expect(screen.getByText("Additional Info")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Skip" }));

    await waitFor(() => expect(createScenarioFromVoice).toHaveBeenCalledTimes(1));
    await waitFor(() => expect(push).toHaveBeenCalledWith("/scenarios/mock-id"));
    // The prompt is gone and no optional-vital tiles/questions appeared.
    expect(screen.queryByText("Additional Info")).not.toBeInTheDocument();
    expect(screen.queryByText("Mortgage lates")).not.toBeInTheDocument();
  });
});

describe("Additional Info — Add Additional Info expands the panel; the user is never trapped", () => {
  it("clicking Add Additional Info expands the optional-vital tiles and a Find Matching Lenders button, without submitting", () => {
    render(<VoiceClient />);
    act(() => setTranscript(COMPLETE_SCENARIO));
    fireEvent.click(screen.getByRole("button", { name: "Add Additional Info" }));

    expect(screen.getByText("Mortgage lates")).toBeInTheDocument();
    expect(screen.getByText("Gift funds")).toBeInTheDocument();
    expect(screen.getByText("One-year self-employed")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Find Matching Lenders" })).toBeInTheDocument();
    expect(createScenarioFromVoice).not.toHaveBeenCalled();
  });

  it("clicking Find Matching Lenders (even with nothing additional filled in) proceeds to matching — the user is never trapped", async () => {
    render(<VoiceClient />);
    act(() => setTranscript(COMPLETE_SCENARIO));
    fireEvent.click(screen.getByRole("button", { name: "Add Additional Info" }));
    fireEvent.click(screen.getByRole("button", { name: "Find Matching Lenders" }));

    await waitFor(() => expect(createScenarioFromVoice).toHaveBeenCalledTimes(1));
    await waitFor(() => expect(push).toHaveBeenCalledWith("/scenarios/mock-id"));
  });
});

describe("Additional Info — optional vitals spoken while expanded are extracted and reach the final submission (spec TEST 6)", () => {
  it("captures a mortgage-lates mention made while expanded and shows it live in the tile", () => {
    render(<VoiceClient />);
    act(() => setTranscript(COMPLETE_SCENARIO));
    fireEvent.click(screen.getByRole("button", { name: "Add Additional Info" }));

    act(() => setTranscript(`${COMPLETE_SCENARIO} Borrower has one mortgage late.`));
    expect(screen.getByText("30-Day Late")).toBeInTheDocument();
  });

  it("captures a gift-funds mention made while expanded and shows it live in the tile", () => {
    render(<VoiceClient />);
    act(() => setTranscript(COMPLETE_SCENARIO));
    fireEvent.click(screen.getByRole("button", { name: "Add Additional Info" }));

    act(() => setTranscript(`${COMPLETE_SCENARIO} The borrower is using gift funds from his parents.`));
    const giftLabel = screen.getByText("Gift funds");
    expect(giftLabel.parentElement?.textContent).toContain("Yes");
  });

  it("captures a one-year-self-employed mention made while expanded and shows it live in the tile", () => {
    render(<VoiceClient />);
    act(() => setTranscript(COMPLETE_SCENARIO));
    fireEvent.click(screen.getByRole("button", { name: "Add Additional Info" }));

    act(() => setTranscript(`${COMPLETE_SCENARIO} Business started last year.`));
    const label = screen.getByText("One-year self-employed");
    expect(label.parentElement?.textContent).toContain("Yes");
  });

  it("captures ALL THREE optional vitals mentioned together in one sentence (spec TEST 6) and carries every one into the final submission after Find Matching Lenders", async () => {
    render(<VoiceClient />);
    act(() => setTranscript(COMPLETE_SCENARIO));
    fireEvent.click(screen.getByRole("button", { name: "Add Additional Info" }));

    act(() =>
      setTranscript(
        `${COMPLETE_SCENARIO} Borrower has one mortgage late, is using gift funds from his parents, and has only been self-employed for one year.`
      )
    );
    expect(screen.getByText("30-Day Late")).toBeInTheDocument();
    expect(screen.getByText("Gift funds").parentElement?.textContent).toContain("Yes");
    expect(screen.getByText("One-year self-employed").parentElement?.textContent).toContain("Yes");

    fireEvent.click(screen.getByRole("button", { name: "Find Matching Lenders" }));

    await waitFor(() => expect(createScenarioFromVoice).toHaveBeenCalledTimes(1));
    const submitted = createScenarioFromVoice.mock.calls[0]![0];
    expect(submitted.mortgageLatesCategory?.value).toBe("late_30");
    expect(submitted.giftFundsUsed?.value).toBe("yes");
    expect(submitted.oneYearSelfEmployed?.value).toBe("yes");
  });

  it("shows the DSCR short-term-rental-income tile only for a DSCR scenario, once expanded", () => {
    render(<VoiceClient />);
    act(() => setTranscript(COMPLETE_SCENARIO)); // already DSCR
    fireEvent.click(screen.getByRole("button", { name: "Add Additional Info" }));
    expect(screen.getByText("DSCR short-term-rental income")).toBeInTheDocument();
  });

  it("hides the DSCR short-term-rental-income tile for a non-DSCR income doc type, once expanded", () => {
    render(<VoiceClient />);
    act(() =>
      setTranscript(
        "Purchase of a single family primary residence worth $500,000, loan amount 400k, credit score 720, 12 months of business bank statements. Borrower is a U.S. citizen."
      )
    );
    fireEvent.click(screen.getByRole("button", { name: "Add Additional Info" }));
    expect(screen.queryByText("DSCR short-term-rental income")).not.toBeInTheDocument();
  });
});
