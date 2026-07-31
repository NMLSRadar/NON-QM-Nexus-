// @vitest-environment jsdom
//
// Secondary Voice Vitals Expansion (2026-07-31), Step 1 & Step 2: once all
// 9 required (primary) vitals resolve, a 5-second "Additional Scenario
// Details (Optional)" countdown opens BEFORE matching runs — listening/
// extraction continue uninterrupted, silence auto-continues to matching
// with no extra clicks, and anything said during the window is captured
// (mortgage lates, gift funds, DSCR short-term-rental income, one-year
// self-employment).
import "@testing-library/jest-dom/vitest";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
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

/**
 * Advances the fake clock in the SAME 1-second increments the component's
 * own countdown effect uses (a fresh setTimeout(…, 1000) is scheduled on
 * every tick — see voice-client.tsx's "Additional Scenario Details
 * countdown" effect). Empirically, one single large vi.advanceTimersByTimeAsync
 * jump does not reliably let React flush each chained state update/effect
 * pass in between (each tick's setTimeout is only actually SCHEDULED once
 * the PREVIOUS tick's effect has committed) — advancing in the same 1s
 * steps the component itself uses, each inside its own act(), does.
 */
async function advanceCountdownSeconds(totalSeconds: number) {
  for (let i = 0; i < totalSeconds; i++) {
    await act(async () => {
      await vi.advanceTimersByTimeAsync(1000);
    });
  }
}

beforeEach(() => {
  push.mockReset();
  createScenarioFromVoice.mockReset();
  createScenarioFromVoice.mockResolvedValue({ redirectTo: "/scenarios/mock-id" });
  getVoiceCatalog.mockReset();
  // Resolved catalog is only consumed by a separate live-ranking panel —
  // never awaited by the assertions below, so no fake-timer interaction
  // needed for it specifically.
  getVoiceCatalog.mockResolvedValue({ lenders: [], programs: [], rules: [] });
  vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout"] });
});

afterEach(() => {
  cleanup();
  vi.useRealTimers();
});

const COMPLETE_SCENARIO =
  "Purchase of a single family investment property worth $500,000, loan amount 400k, credit score 720, DSCR to qualify. Borrower is a U.S. citizen.";

describe("Secondary Voice Vitals — the 5-second countdown appears ONLY once all 9 primary (required) vitals are complete", () => {
  it("shows NO countdown/optional card at all while a required vital is still missing", () => {
    render(<VoiceClient />);
    // Deliberately incomplete — no citizenship stated, so only 8 of 9
    // required vitals resolve and the scenario is not yet ready.
    act(() => setTranscript("Purchase of a single family investment property worth $500,000, loan amount 400k, credit score 720, DSCR to qualify."));

    expect(screen.queryByText(/Vitals — 9 of 9 captured/)).not.toBeInTheDocument();
    expect(screen.queryByText("Additional Scenario Details (Optional)")).not.toBeInTheDocument();
    expect(createScenarioFromVoice).not.toHaveBeenCalled();
  });

  it("opens the 'Additional Scenario Details (Optional)' countdown the MOMENT all 9 vitals resolve, instead of submitting immediately", () => {
    render(<VoiceClient />);
    act(() => setTranscript(COMPLETE_SCENARIO));

    expect(screen.getByText(/Vitals — 9 of 9 captured/)).toBeInTheDocument();
    // The countdown card must appear...
    expect(screen.getByText("Additional Scenario Details (Optional)")).toBeInTheDocument();
    expect(screen.getByText("Tell me any additional details that may improve your lender matches. You have approximately 5 seconds.")).toBeInTheDocument();
    // ...and matching must NOT have fired yet — no click/confirmation
    // needed to open the window, but it also must not skip it.
    expect(createScenarioFromVoice).not.toHaveBeenCalled();
  });
});

describe("Secondary Voice Vitals — the countdown auto-advances on silence, with NO click or confirmation", () => {
  it("visibly ticks down second by second", async () => {
    render(<VoiceClient />);
    act(() => setTranscript(COMPLETE_SCENARIO));
    expect(screen.getByText("Additional Scenario Details (Optional)")).toBeInTheDocument();

    await advanceCountdownSeconds(1);
    expect(screen.getByText(/You have approximately 4 seconds\./)).toBeInTheDocument();

    await advanceCountdownSeconds(1);
    expect(screen.getByText(/You have approximately 3 seconds\./)).toBeInTheDocument();
  });

  it("silence for the full ~5 seconds auto-continues to matching — no click, no confirmation button anywhere", async () => {
    render(<VoiceClient />);
    act(() => setTranscript(COMPLETE_SCENARIO));
    expect(screen.getByText("Additional Scenario Details (Optional)")).toBeInTheDocument();
    // Never any confirm/continue button rendered for this step.
    expect(screen.queryByRole("button", { name: /continue|confirm|skip/i })).not.toBeInTheDocument();

    await advanceCountdownSeconds(6);

    expect(createScenarioFromVoice).toHaveBeenCalledTimes(1);
    expect(push).toHaveBeenCalledWith("/scenarios/mock-id");
  });

  it("does NOT re-open the countdown a second time once it has already elapsed for this scenario", async () => {
    render(<VoiceClient />);
    act(() => setTranscript(COMPLETE_SCENARIO));
    expect(screen.getByText("Additional Scenario Details (Optional)")).toBeInTheDocument();

    await advanceCountdownSeconds(6);
    expect(createScenarioFromVoice).toHaveBeenCalledTimes(1);

    // The card must not still be showing after the window elapsed and
    // submission fired — and it must never come back for this scenario.
    expect(screen.queryByText("Additional Scenario Details (Optional)")).not.toBeInTheDocument();
  });
});

describe("Secondary Voice Vitals — optional vitals spoken DURING the window are extracted and reach the final submission", () => {
  it("captures a mortgage-lates mention made during the window and shows it live in the optional card", () => {
    render(<VoiceClient />);
    act(() => setTranscript(COMPLETE_SCENARIO));
    expect(screen.getByText("Additional Scenario Details (Optional)")).toBeInTheDocument();

    // Borrower/broker volunteers a detail while the window is open — the
    // transcript is edited live, exactly like ongoing dictation would be.
    // Asserted synchronously right after the update (no timer advance in
    // between) so this is unambiguously BEFORE the window elapses, not a
    // race against the countdown.
    act(() => setTranscript(`${COMPLETE_SCENARIO} Borrower has one mortgage late.`));
    expect(screen.getByText("30-Day Late")).toBeInTheDocument();
  });

  it("captures a gift-funds mention made during the window and shows it live in the optional card", () => {
    render(<VoiceClient />);
    act(() => setTranscript(COMPLETE_SCENARIO));
    expect(screen.getByText("Additional Scenario Details (Optional)")).toBeInTheDocument();

    act(() => setTranscript(`${COMPLETE_SCENARIO} The borrower is using gift funds from his parents.`));
    // "Gift funds" tile shows "Yes" — scope to that specific tile's label
    // (there can be other "Yes"-valued tiles rendered elsewhere).
    const giftLabel = screen.getByText("Gift funds");
    expect(giftLabel.parentElement?.textContent).toContain("Yes");
  });

  it("captures a one-year-self-employed mention made during the window and shows it live in the optional card", () => {
    render(<VoiceClient />);
    act(() => setTranscript(COMPLETE_SCENARIO));
    expect(screen.getByText("Additional Scenario Details (Optional)")).toBeInTheDocument();

    act(() => setTranscript(`${COMPLETE_SCENARIO} Business started last year.`));
    const label = screen.getByText("One-year self-employed");
    expect(label.parentElement?.textContent).toContain("Yes");
  });

  it("captures ALL THREE optional vitals mentioned together in one sentence during the window (spec Step 4) and carries every one of them into the final submission", async () => {
    render(<VoiceClient />);
    act(() => setTranscript(COMPLETE_SCENARIO));
    expect(screen.getByText("Additional Scenario Details (Optional)")).toBeInTheDocument();

    act(() =>
      setTranscript(
        `${COMPLETE_SCENARIO} Borrower has one mortgage late, is using gift funds from his parents, and has only been self-employed for one year.`
      )
    );
    expect(screen.getByText("30-Day Late")).toBeInTheDocument();
    expect(screen.getByText("Gift funds").parentElement?.textContent).toContain("Yes");
    expect(screen.getByText("One-year self-employed").parentElement?.textContent).toContain("Yes");

    // Silence for the rest of the window auto-continues to matching —
    // every captured optional vital rides along into the submitted payload.
    await advanceCountdownSeconds(6);

    expect(createScenarioFromVoice).toHaveBeenCalledTimes(1);
    const submitted = createScenarioFromVoice.mock.calls[0]![0];
    expect(submitted.mortgageLatesCategory?.value).toBe("late_30");
    expect(submitted.giftFundsUsed?.value).toBe("yes");
    expect(submitted.oneYearSelfEmployed?.value).toBe("yes");
  });

  it("shows the DSCR short-term-rental-income tile only for a DSCR scenario", () => {
    render(<VoiceClient />);
    act(() => setTranscript(COMPLETE_SCENARIO)); // already DSCR
    expect(screen.getByText("Additional Scenario Details (Optional)")).toBeInTheDocument();
    expect(screen.getByText("DSCR short-term-rental income")).toBeInTheDocument();
  });

  it("hides the DSCR short-term-rental-income tile for a non-DSCR income doc type", () => {
    render(<VoiceClient />);
    act(() =>
      setTranscript(
        "Purchase of a single family primary residence worth $500,000, loan amount 400k, credit score 720, 12 months of business bank statements. Borrower is a U.S. citizen."
      )
    );
    expect(screen.getByText("Additional Scenario Details (Optional)")).toBeInTheDocument();
    expect(screen.queryByText("DSCR short-term-rental income")).not.toBeInTheDocument();
  });
});
