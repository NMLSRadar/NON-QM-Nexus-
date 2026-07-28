// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import { TrialStatusBanner } from "@/components/trial-status-banner";

// Per spec Phase 6 ("Display the user's remaining trial time somewhere in
// the account interface... 'N days remaining'... When fewer than 72 hours
// remain, display a noticeable but professional expiration notification")
// and Phase 3 (exact required expired-trial copy).
describe("TrialStatusBanner", () => {
  it("renders nothing for an account that never had a trial", () => {
    const { container } = render(<TrialStatusBanner isTrial={false} trialExpiresAt={null} currentTierLevel={2} />);
    expect(container).toBeEmptyDOMElement();
  });

  it("shows the standard N-days-remaining banner when >72 hours remain", () => {
    const trialExpiresAt = new Date(Date.now() + 6 * 24 * 60 * 60 * 1000).toISOString();
    render(<TrialStatusBanner isTrial={true} trialExpiresAt={trialExpiresAt} currentTierLevel={3} />);
    expect(screen.getByText(/6 days remaining in your All Access trial/i)).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /choose a plan to keep access/i })).toHaveAttribute("href", "/pricing");
  });

  it("shows the urgent <72-hour banner with distinct styling when under 72 hours remain", () => {
    const trialExpiresAt = new Date(Date.now() + 36 * 60 * 60 * 1000).toISOString(); // 36 hours
    render(<TrialStatusBanner isTrial={true} trialExpiresAt={trialExpiresAt} currentTierLevel={3} />);
    expect(screen.getByText(/only 2 days left/i)).toBeInTheDocument();
  });

  it("shows the exact required expired-trial copy once the trial is no longer active", () => {
    const trialExpiresAt = new Date(Date.now() - 60 * 60 * 1000).toISOString(); // 1 hour ago
    render(<TrialStatusBanner isTrial={false} trialExpiresAt={trialExpiresAt} currentTierLevel={0} />);
    expect(
      screen.getByText(
        /Your 14-day Non-QM Nexus All Access trial has ended\. Select a membership tier to continue accessing lender guidelines, Voice Scenario analysis, lender rankings, and AI-powered recommendations\./i
      )
    ).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /view plans/i })).toHaveAttribute("href", "/pricing");
  });

  it("renders nothing once a trial user has since converted to a real paid plan (tierLevel > 0, isTrial false, but trialExpiresAt still set)", () => {
    const trialExpiresAt = new Date(Date.now() - 60 * 60 * 1000).toISOString();
    const { container } = render(<TrialStatusBanner isTrial={false} trialExpiresAt={trialExpiresAt} currentTierLevel={2} />);
    expect(container).toBeEmptyDOMElement();
  });
});
