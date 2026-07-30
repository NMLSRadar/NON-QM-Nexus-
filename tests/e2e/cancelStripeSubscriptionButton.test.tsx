// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";

vi.mock("@/app/admin/users/actions", () => ({ cancelStripeSubscriptionAdmin: vi.fn() }));

import { CancelStripeSubscriptionButton } from "@/app/admin/users/cancel-stripe-subscription-button";
import { cancelStripeSubscriptionAdmin } from "@/app/admin/users/actions";

const mockedCancel = cancelStripeSubscriptionAdmin as unknown as ReturnType<typeof vi.fn>;

describe("CancelStripeSubscriptionButton", () => {
  beforeEach(() => {
    mockedCancel.mockReset();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("does nothing if the reason prompt is dismissed (canceled)", () => {
    const promptSpy = vi.spyOn(window, "prompt").mockReturnValue(null);
    const confirmSpy = vi.spyOn(window, "confirm");
    render(<CancelStripeSubscriptionButton userId="user-1" userEmail="broker@example.com" />);
    fireEvent.click(screen.getByRole("button", { name: /cancel stripe subscription/i }));
    expect(promptSpy).toHaveBeenCalled();
    expect(confirmSpy).not.toHaveBeenCalled();
    expect(mockedCancel).not.toHaveBeenCalled();
  });

  it("does nothing if the confirmation is declined", () => {
    vi.spyOn(window, "prompt").mockReturnValue("Fraud review");
    vi.spyOn(window, "confirm").mockReturnValue(false);
    render(<CancelStripeSubscriptionButton userId="user-1" userEmail="broker@example.com" />);
    fireEvent.click(screen.getByRole("button", { name: /cancel stripe subscription/i }));
    expect(mockedCancel).not.toHaveBeenCalled();
  });

  it("calls cancelStripeSubscriptionAdmin with the entered reason once confirmed", async () => {
    vi.spyOn(window, "prompt").mockReturnValue("Chargeback dispute");
    vi.spyOn(window, "confirm").mockReturnValue(true);
    mockedCancel.mockResolvedValue({});
    render(<CancelStripeSubscriptionButton userId="user-42" userEmail="broker@example.com" />);
    fireEvent.click(screen.getByRole("button", { name: /cancel stripe subscription/i }));
    await waitFor(() => expect(mockedCancel).toHaveBeenCalledWith("user-42", "Chargeback dispute"));
  });

  it("surfaces a returned error instead of throwing", async () => {
    vi.spyOn(window, "prompt").mockReturnValue("Test");
    vi.spyOn(window, "confirm").mockReturnValue(true);
    mockedCancel.mockResolvedValue({ error: "This subscription is already canceled." });
    render(<CancelStripeSubscriptionButton userId="user-1" userEmail="broker@example.com" />);
    fireEvent.click(screen.getByRole("button", { name: /cancel stripe subscription/i }));
    expect(await screen.findByText(/already canceled/i)).toBeInTheDocument();
  });
});
