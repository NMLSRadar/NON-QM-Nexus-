// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import VoiceClient from "@/app/scenarios/voice/voice-client";

const mocks = vi.hoisted(() => ({
  analyzeScenario: vi.fn(),
  captureException: vi.fn(),
  createScenarioFromVoice: vi.fn(),
  getVoiceCatalog: vi.fn(),
  liveRankingThrows: false,
  push: vi.fn(),
}));

vi.mock("next/navigation", () => ({ useRouter: () => ({ push: mocks.push }) }));
vi.mock("@sentry/nextjs", () => ({ captureException: mocks.captureException }));
vi.mock("@/components/live-lender-rankings", () => ({
  LiveLenderRankings: () => {
    if (mocks.liveRankingThrows) throw new Error("live ranking render failure");
    return null;
  },
}));
vi.mock("@/domain/analyze", async () => {
  const actual = await vi.importActual<typeof import("@/domain/analyze")>("@/domain/analyze");
  return { ...actual, analyzeScenario: mocks.analyzeScenario };
});
vi.mock("@/app/scenarios/voice/actions", () => ({
  createScenarioFromVoice: (...args: unknown[]) => mocks.createScenarioFromVoice(...args),
  getVoiceCatalog: (...args: unknown[]) => mocks.getVoiceCatalog(...args),
}));

beforeEach(() => {
  window.sessionStorage.clear();
  vi.spyOn(console, "error").mockImplementation(() => undefined);
  mocks.analyzeScenario.mockReset().mockImplementation(() => {
    throw new Error("malformed live catalog row");
  });
  mocks.captureException.mockReset();
  mocks.createScenarioFromVoice.mockReset();
  mocks.getVoiceCatalog.mockReset().mockResolvedValue({
    lenders: [{ id: "lender-1" }],
    programs: [],
    rules: [],
  });
  mocks.liveRankingThrows = false;
  mocks.push.mockReset();
});

afterEach(() => {
  vi.restoreAllMocks();
  cleanup();
});

describe("Voice completion crash containment", () => {
  it("keeps the 9/9 intake and submit action alive when live rankings throw", async () => {
    render(<VoiceClient />);
    fireEvent.change(screen.getByLabelText("Transcript (editable)"), {
      target: {
        value:
          "Purchase of a single family primary residence worth $500,000, loan amount 400k, credit score 720, full doc income. Borrower is a U.S. citizen.",
      },
    });

    await waitFor(() => expect(mocks.analyzeScenario).toHaveBeenCalled());
    expect(screen.getByText("✓ 9 of 9 Required Vitals Complete")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "See lender matches" })).toBeInTheDocument();
    expect(screen.getByLabelText("Transcript (editable)")).not.toHaveValue("");
    expect(mocks.captureException).toHaveBeenCalled();
    expect(mocks.createScenarioFromVoice).not.toHaveBeenCalled();
    expect(mocks.push).not.toHaveBeenCalled();
  });

  it("isolates a lender-ranking render crash from the completed intake", async () => {
    mocks.analyzeScenario.mockReset().mockReturnValue({ evaluations: [] });
    mocks.liveRankingThrows = true;

    render(<VoiceClient />);
    fireEvent.change(screen.getByLabelText("Transcript (editable)"), {
      target: {
        value:
          "Purchase of a single family primary residence worth $500,000, loan amount 400k, credit score 720, full doc income. Borrower is a U.S. citizen.",
      },
    });

    expect(await screen.findByText(/Live preview is temporarily unavailable/)).toBeInTheDocument();
    expect(screen.getByText("✓ 9 of 9 Required Vitals Complete")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "See lender matches" })).toBeInTheDocument();
    expect(mocks.createScenarioFromVoice).not.toHaveBeenCalled();
    expect(mocks.push).not.toHaveBeenCalled();
  });
});