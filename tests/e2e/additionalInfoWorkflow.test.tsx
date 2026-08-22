// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import VoiceClient from "@/app/scenarios/voice/voice-client";

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
const INCOMPLETE_SCENARIO =
  "Purchase of a single family investment property worth $500,000, loan amount 400k, credit score 720, DSCR to qualify.";

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

describe("nine-vital lender-match gate", () => {
  it("is hidden below 9/9, appears immediately at 9/9, hides on regression, and returns when restored", () => {
    render(<VoiceClient />);

    act(() => setTranscript(INCOMPLETE_SCENARIO));
    expect(screen.queryByRole("button", { name: "See lender matches" })).not.toBeInTheDocument();

    act(() => setTranscript(COMPLETE_SCENARIO));
    expect(screen.getByText("✓ 9 of 9 Required Vitals Complete")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "See lender matches" })).toBeInTheDocument();
    expect(createScenarioFromVoice).not.toHaveBeenCalled();

    act(() => setTranscript(INCOMPLETE_SCENARIO));
    expect(screen.queryByRole("button", { name: "See lender matches" })).not.toBeInTheDocument();

    act(() => setTranscript(COMPLETE_SCENARIO));
    expect(screen.getByRole("button", { name: "See lender matches" })).toBeInTheDocument();
  });

  it("keeps the button mounted while optional vitals are captured", () => {
    render(<VoiceClient />);
    act(() => setTranscript(COMPLETE_SCENARIO));
    const button = screen.getByRole("button", { name: "See lender matches" });

    act(() => setTranscript(`${COMPLETE_SCENARIO} Borrower has one mortgage late and is using gift funds from his parents.`));

    expect(screen.getByRole("button", { name: "See lender matches" })).toBe(button);
    expect(createScenarioFromVoice).not.toHaveBeenCalled();
  });

  it("submits the same complete extraction, including optional vitals, and follows the returned route", async () => {
    render(<VoiceClient />);
    act(() => setTranscript(`${COMPLETE_SCENARIO} Borrower has one mortgage late, is using gift funds from his parents, and has only been self-employed for one year.`));

    fireEvent.click(screen.getByRole("button", { name: "See lender matches" }));

    await waitFor(() => expect(createScenarioFromVoice).toHaveBeenCalledTimes(1));
    const submitted = createScenarioFromVoice.mock.calls[0]![0];
    expect(submitted.mortgageLatesCategory?.value).toBe("late_30");
    expect(submitted.giftFundsUsed?.value).toBe("yes");
    expect(submitted.oneYearSelfEmployed?.value).toBe("yes");
    await waitFor(() => expect(push).toHaveBeenCalledWith("/scenarios/mock-id"));
  });
});