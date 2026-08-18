import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import {
  getPacificBetaFeedbackHour,
  isPacificBetaFeedbackWindowOpen,
} from "@/lib/beta-feedback/schedule";

describe("beta-feedback Pacific scheduling", () => {
  it("opens at 7 AM Pacific during daylight time", () => {
    expect(isPacificBetaFeedbackWindowOpen(Date.parse("2026-08-18T13:59:59Z"))).toBe(false);
    expect(isPacificBetaFeedbackWindowOpen(Date.parse("2026-08-18T14:00:00Z"))).toBe(true);
    expect(getPacificBetaFeedbackHour(Date.parse("2026-08-18T14:00:00Z"))).toBe(7);
  });

  it("waits for the 15:00 UTC recovery trigger during standard time", () => {
    expect(isPacificBetaFeedbackWindowOpen(Date.parse("2026-12-01T14:30:00Z"))).toBe(false);
    expect(isPacificBetaFeedbackWindowOpen(Date.parse("2026-12-01T15:00:00Z"))).toBe(true);
    expect(getPacificBetaFeedbackHour(Date.parse("2026-12-01T15:00:00Z"))).toBe(7);
  });

  it("keeps primary and recovery crons registered as daily UTC jobs", () => {
    const config = JSON.parse(readFileSync(resolve(process.cwd(), "vercel.json"), "utf8"));
    expect(config.crons).toContainEqual({
      path: "/api/cron/beta-feedback",
      schedule: "0 14 * * *",
    });
    expect(config.crons).toContainEqual({
      path: "/api/cron/beta-feedback-recovery",
      schedule: "0 15 * * *",
    });
  });
});
