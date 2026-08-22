// @vitest-environment jsdom
//
// End-to-end simulation of a full Voice Scenario intake SESSION for each loan
// purpose (Purchase, Refinance [ambiguous], Cash-Out Refinance,
// Rate-and-Term Refinance), driving the REAL <VoiceClient /> component the
// way a user actually would (typing/dictating a transcript), and checking
// all three places a disagreement previously slipped through:
//   1. the Vitals UI tile — correct highlight state (green "filled" vs. the
//      gold "pending — subtype needed" state vs. amber "Needed"),
//   2. the assistant's spoken/typed summary — matches what was captured,
//   3. the stored scenario record — the same VoiceExtraction, once complete,
//      normalizes to the correct persisted `loanPurpose` enum value via the
//      real buildScenarioInput()/schema/repository path used by production.
//
// The server action (createScenarioFromVoice) is mocked here so this suite
// runs without a live Next.js request/session context — the "record is
// stored correctly" claim is verified for real against the live Supabase
// project in tests/integration/voiceIntakeRecord.test.ts, which calls the
// exact same buildScenarioInput() used here.
import "@testing-library/jest-dom/vitest";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
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

// A transcript covering the 8 non-purpose vitals (including citizenship,
// now a required core vital), so only loan-purpose classification differs
// between cases and every case but the ambiguous one reaches "9 of 9
// captured" and exposes the explicit lender-matches action.
const BASE =
  "single family primary residence worth $500,000, loan amount 350k, credit score 720, full doc income, U.S. citizen";

async function typeTranscript(text: string) {
  const box = screen.getByLabelText("Transcript (editable)");
  await userEvent.clear(box);
  await userEvent.type(box, text, { delay: 0 });
}

function purposeTile() {
  // Locate the Vitals tile by its exact label text ("Purchase, refinance,
  // HELOC, or second lien"), which is unique — the manual-correction
  // dropdown below uses different wording ("Purchase / refi") so there's no
  // ambiguity. The premium redesign wraps the label+value in an inner flex
  // column alongside an icon badge, so the bordered/colored tile itself is
  // now two ancestors up, not one.
  const label = screen.getByText("Purchase, refinance, HELOC, or second lien");
  return (label.closest("div")!.parentElement as HTMLElement) ?? label.closest("div")!;
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

describe("Voice intake session: Purchase", () => {
  it("tile fills green, assistant confirms purchase, and the saved payload carries loanPurpose=purchase", async () => {
    render(<VoiceClient />);
    await typeTranscript(`Purchase of a ${BASE}`);

    await waitFor(() => {
      const tile = purposeTile();
      expect(tile).toHaveTextContent(/✓ Purchase/);
      expect(tile.className).toContain("border-emerald-400/40");
      expect(tile.className).toContain("bg-emerald-500/10");
    });

    expect(screen.getByText(/All set — 9 of 9 required vitals captured/)).toHaveTextContent("purchase");

    await userEvent.click(screen.getByRole("button", { name: "See lender matches" }));

    await waitFor(() => expect(createScenarioFromVoice).toHaveBeenCalledTimes(1));
    const sentExtraction = createScenarioFromVoice.mock.calls[0]![0];
    expect(sentExtraction.loanPurpose.value).toBe("purchase");
    expect(sentExtraction.refinancePendingSubtype).toBeFalsy();
    await waitFor(() => expect(push).toHaveBeenCalledWith("/scenarios/mock-id"));
  });
});

describe("Voice intake session: Refinance (ambiguous, no subtype stated)", () => {
  it("tile shows the pending/subtype-needed state, assistant asks the clarifying question, and nothing is submitted", async () => {
    render(<VoiceClient />);
    await typeTranscript(`This is a refinance of a ${BASE}`);

    await waitFor(() => {
      const tile = purposeTile();
      expect(tile).toHaveTextContent("◐ Refinance — subtype needed");
      expect(tile.className).toContain("border-amber-400/60");
      expect(tile.className).toContain("bg-amber-500/10");
    });

    // Assistant must ask the one clarifying question rather than guess or
    // silently pick a subtype.
    await waitFor(() => {
      expect(screen.getByText(/Is the refinance rate-and-term or cash-out\?/)).toBeInTheDocument();
    });
    // Never reaches "8 of 8" / "All set" while the subtype is unresolved.
    expect(screen.queryByText(/All set —/)).not.toBeInTheDocument();

    // Give any stray effects a tick, then confirm no submission happened.
    await new Promise((r) => setTimeout(r, 50));
    expect(createScenarioFromVoice).not.toHaveBeenCalled();
    expect(push).not.toHaveBeenCalled();
  });
});

describe("Voice intake session: Cash-Out Refinance", () => {
  it("tile fills green as Cash-out refi, assistant summary says cash-out, and the saved payload carries loanPurpose=cash_out_refinance", async () => {
    render(<VoiceClient />);
    await typeTranscript(`The borrower wants to refinance and pull cash out of a ${BASE}`);

    await waitFor(() => {
      const tile = purposeTile();
      expect(tile).toHaveTextContent(/✓ Cash-out refi/);
      expect(tile.className).toContain("border-emerald-400/40");
    });

    expect(screen.getByText(/All set — 9 of 9 required vitals captured/)).toHaveTextContent("cash-out refinance");

    await userEvent.click(screen.getByRole("button", { name: "See lender matches" }));

    await waitFor(() => expect(createScenarioFromVoice).toHaveBeenCalledTimes(1));
    const sentExtraction = createScenarioFromVoice.mock.calls[0]![0];
    expect(sentExtraction.loanPurpose.value).toBe("cash_out_refinance");
    await waitFor(() => expect(push).toHaveBeenCalledWith("/scenarios/mock-id"));
  });
});

describe("Voice intake session: Rate-and-Term Refinance", () => {
  it("tile fills green as Rate/term refi, assistant summary says rate-and-term, and the saved payload carries loanPurpose=rate_term_refinance", async () => {
    render(<VoiceClient />);
    await typeTranscript(`They just want to lower their rate on a ${BASE}, not taking cash back`);

    await waitFor(() => {
      const tile = purposeTile();
      expect(tile).toHaveTextContent(/✓ Rate\/term refi/);
      expect(tile.className).toContain("border-emerald-400/40");
    });

    expect(screen.getByText(/All set — 9 of 9 required vitals captured/)).toHaveTextContent("rate-and-term refinance");

    await userEvent.click(screen.getByRole("button", { name: "See lender matches" }));

    await waitFor(() => expect(createScenarioFromVoice).toHaveBeenCalledTimes(1));
    const sentExtraction = createScenarioFromVoice.mock.calls[0]![0];
    expect(sentExtraction.loanPurpose.value).toBe("rate_term_refinance");
    expect(sentExtraction.refinancePendingSubtype).toBeFalsy();
    await waitFor(() => expect(push).toHaveBeenCalledWith("/scenarios/mock-id"));
  });
});
