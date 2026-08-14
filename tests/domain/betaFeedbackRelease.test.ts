import { describe, expect, it } from "vitest";
import {
  BETA_FEEDBACK_RELEASE_AT,
  isBetaFeedbackReleaseOpen,
} from "../../src/lib/beta-feedback/release";

describe("beta feedback first-survey release", () => {
  it("is pinned to Monday, August 17, 2026 at 7:00 AM Pacific", () => {
    expect(BETA_FEEDBACK_RELEASE_AT).toBe("2026-08-17T14:00:00.000Z");
  });

  it("blocks manual and automatic runs before release", () => {
    expect(isBetaFeedbackReleaseOpen(Date.parse("2026-08-17T13:59:59.999Z"))).toBe(false);
  });

  it("opens at the exact scheduled cron instant", () => {
    expect(isBetaFeedbackReleaseOpen(Date.parse("2026-08-17T14:00:00.000Z"))).toBe(true);
  });

  it("stays open for retries and future daily runs", () => {
    expect(isBetaFeedbackReleaseOpen(Date.parse("2026-08-18T14:00:00.000Z"))).toBe(true);
  });
});
