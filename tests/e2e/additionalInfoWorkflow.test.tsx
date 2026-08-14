// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import VoiceClient, { hasProceedCommand } from "@/app/scenarios/voice/voice-client";

const push = vi.fn();
vi.mock("next/navigation", () => ({ useRouter: () => ({ push }) }));

const createScenarioFromVoice = vi.fn();
const getVoiceCatalog = vi.fn();
vi.mock("@/app/scenarios/voice/actions", () => ({
  createScenarioFromVoice: (...args: unknown[]) => createScenarioFromVoice(...args),
  getVoiceCatalog: (...args: unknown[]) => getVoiceCatalog(...args),
}));

const COMPLETE_SCENARIO =
  "Purchase of a single family investment property worth $500,000, loan amount 400k, credit score 720, DSCR to qualify. Borrower is a U.S. citizen.";

function setTranscript(text: string) {
  fireEvent.change(screen.getByLabelText("Transcript (editable)"), { target: { value: text } });
}

beforeEach(() => {
  push.mockReset();
  createScenarioFromVoice.mockReset();
  createScenarioFromVoice.mockResolvedValue({ redirectTo: "/scenarios/mock-id" });
  getVoiceCatalog.mockReset();
  getVoiceCatalog.mockResolvedValue({ lenders: [], programs: [], rules: [] });
});

afterEach(cleanup);

describe("Proceed command recognition", () => {
  it.each(["Proceed", "Let's proceed", "Go ahead", "Continue", "Show me the lenders", "Show lenders", "Find lenders", "Show my matches", "Run the scenario"])(
    "recognizes %j as a command",
    (phrase) => expect(hasProceedCommand(phrase)).toBe(true),
  );

  it("does not consume ordinary scenario prose containing continue", () => {
    expect(hasProceedCommand("Continue employment income was verified by the employer")).toBe(false);
  });
});

describe("9/9 completion and Additional Information", () => {
  it("keeps required vitals open and hides Additional Information before 9/9", () => {
    render(<VoiceClient />);
    act(() => setTranscript("Purchase of a single family investment property worth $500,000, loan amount 400k, credit score 720, DSCR to qualify."));
    expect(screen.queryByText(/Required Vitals Complete/)).not.toBeInTheDocument();
    expect(screen.queryByText("Additional Information")).not.toBeInTheDocument();
    expect(screen.getAllByText("Occupancy").length).toBeGreaterThan(0);
  });

  it("collapses the nine required vitals and automatically reveals Additional Information at 9/9", () => {
    render(<VoiceClient />);
    act(() => setTranscript(COMPLETE_SCENARIO));
    expect(screen.getByText("✓ 9 of 9 Required Vitals Complete")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Review or correct required vitals" })).toHaveAttribute("aria-expanded", "false");
    expect(screen.queryByText("Occupancy")).not.toBeInTheDocument();
    expect(screen.getByText("Additional Information")).toBeInTheDocument();
    expect(screen.getAllByText(/Have more details\? Keep speaking/).length).toBeGreaterThan(0);
    expect(screen.queryByRole("button", { name: "PROCEED" })).not.toBeInTheDocument();
    expect(createScenarioFromVoice).not.toHaveBeenCalled();
  });

  it("lets the user expand the completed required-vitals summary", () => {
    render(<VoiceClient />);
    act(() => setTranscript(COMPLETE_SCENARIO));
    fireEvent.click(screen.getByRole("button", { name: "Review or correct required vitals" }));
    expect(screen.getAllByText("Occupancy").length).toBeGreaterThan(0);
    expect(screen.getByRole("button", { name: "Collapse required vitals" })).toHaveAttribute("aria-expanded", "true");
  });
});

describe("Proceed behavior", () => {
  it("9/9 + no optional information + spoken Proceed immediately runs matching", async () => {
    render(<VoiceClient />);
    act(() => setTranscript(COMPLETE_SCENARIO));
    act(() => setTranscript(`${COMPLETE_SCENARIO} Proceed.`));
    await waitFor(() => expect(createScenarioFromVoice).toHaveBeenCalledTimes(1));
    await waitFor(() => expect(push).toHaveBeenCalledWith("/scenarios/mock-id"));
  });

  it("optional information is captured and shows a prominent button without auto-submitting", () => {
    render(<VoiceClient />);
    act(() => setTranscript(`${COMPLETE_SCENARIO} Borrower has one mortgage late.`));
    expect(screen.getByText("30-Day Late")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "PROCEED" })).toBeInTheDocument();
    expect(createScenarioFromVoice).not.toHaveBeenCalled();
  });

  it("multiple optional vitals continue capturing and a spoken Proceed does not prematurely submit", () => {
    render(<VoiceClient />);
    act(() => setTranscript(`${COMPLETE_SCENARIO} Borrower has one mortgage late, is using gift funds from his parents, and has only been self-employed for one year. Proceed.`));
    expect(screen.getByText("30-Day Late")).toBeInTheDocument();
    expect(screen.getByText("Gift funds").parentElement?.textContent).toContain("Yes");
    expect(screen.getByText("One-year self-employed").parentElement?.textContent).toContain("Yes");
    expect(screen.getByRole("button", { name: "PROCEED" })).toBeInTheDocument();
    expect(createScenarioFromVoice).not.toHaveBeenCalled();
  });

  it("button click submits all captured optional information", async () => {
    render(<VoiceClient />);
    act(() => setTranscript(`${COMPLETE_SCENARIO} Borrower has one mortgage late, is using gift funds from his parents, and has only been self-employed for one year.`));
    fireEvent.click(screen.getByRole("button", { name: "PROCEED" }));
    await waitFor(() => expect(createScenarioFromVoice).toHaveBeenCalledTimes(1));
    const submitted = createScenarioFromVoice.mock.calls[0]![0];
    expect(submitted.mortgageLatesCategory?.value).toBe("late_30");
    expect(submitted.giftFundsUsed?.value).toBe("yes");
    expect(submitted.oneYearSelfEmployed?.value).toBe("yes");
  });
});
