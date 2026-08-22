// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import type { ReactNode } from "react";
import { ClearVoiceDraftAfterResultsReady, ScenarioResultsRuntimeGuard } from "@/app/scenarios/[id]/results-runtime-guard";
import { VOICE_DRAFT_STORAGE_KEY } from "@/domain/voice/draft";

vi.mock("@sentry/nextjs", () => ({ captureException: vi.fn() }));

function BrokenResults(): ReactNode {
  throw new Error("forced destination render failure");
}

beforeEach(() => {
  window.sessionStorage.clear();
  vi.spyOn(console, "error").mockImplementation(() => undefined);
});

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

describe("scenario results crash containment", () => {
  it("keeps the completed Voice draft when the destination client tree crashes", () => {
    window.sessionStorage.setItem(VOICE_DRAFT_STORAGE_KEY, JSON.stringify({ transcript: "complete 9/9", overrides: {} }));

    render(
      <ScenarioResultsRuntimeGuard>
        <BrokenResults />
        <ClearVoiceDraftAfterResultsReady />
      </ScenarioResultsRuntimeGuard>,
    );

    expect(screen.getByText("Your scenario was saved")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Return to saved Voice Scenario" })).toHaveAttribute("href", "/");
    expect(window.sessionStorage.getItem(VOICE_DRAFT_STORAGE_KEY)).not.toBeNull();
  });

  it("clears the recovery draft only after successful results commit", async () => {
    window.sessionStorage.setItem(VOICE_DRAFT_STORAGE_KEY, JSON.stringify({ transcript: "complete 9/9", overrides: {} }));

    render(
      <ScenarioResultsRuntimeGuard>
        <div>Best Lender Matches</div>
        <ClearVoiceDraftAfterResultsReady />
      </ScenarioResultsRuntimeGuard>,
    );

    expect(screen.getByText("Best Lender Matches")).toBeInTheDocument();
    await waitFor(() => expect(window.sessionStorage.getItem(VOICE_DRAFT_STORAGE_KEY)).toBeNull());
  });
});