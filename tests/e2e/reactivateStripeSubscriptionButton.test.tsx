// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";

vi.mock("@/app/admin/users/actions", () => ({ reactivateStripeSubscriptionAdmin: vi.fn() }));

import { ReactivateStripeSubscriptionButton } from "@/app/admin/users/reactivate-stripe-subscription-button";
import { reactivateStripeSubscriptionAdmin } from "@/app/admin/users/actions";

const mockedReactivate = reactivateStripeSubscriptionAdmin as unknown as ReturnType<typeof vi.fn>;

describe("ReactivateStripeSubscriptionButton", () => {
  beforeEach(() => {
    mockedReactivate.mockReset();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("does nothing if the reason prompt is dismissed (canceled)", () => {
    vi.spyOn(window, "prompt").mockReturnValue(null);
    const confirmSpy = vi.spyOn(window, "confirm");
    render(<ReactivateStripeSubscriptionButton userId="user-1" userEmail="broker@example.com" />);
    fireEvent.click(screen.getByRole("button", { name: /reactivate stripe subscription/i }));
    expect(confirmSpy).not.toHaveBeenCalled();
    expect(mockedReactivate).not.toHaveBeenCalled();
  });

  it("does nothing if the confirmation is declined", () => {
    vi.spyOn(window, "prompt").mockReturnValue("Customer called back in");
    vi.spyOn(window, "confirm").mockReturnValue(false);
    render(<ReactivateStripeSubscriptionButton userId="user-1" userEmail="broker@example.com" />);
    fireEvent.click(screen.getByRole("button", { name: /reactivate stripe subscription/i }));
    expect(mockedReactivate).not.toHaveBeenCalled();
  });

  it("calls reactivateStripeSubscriptionAdmin with the entered reason once confirmed", async () => {
    vi.spyOn(window, "prompt").mockReturnValue("Customer called back in");
    vi.spyOn(window, "confirm").mockReturnValue(true);
    mockedReactivate.mockResolvedValue({ message: "Resumed the existing subscription — status \"active\"." });
    render(<ReactivateStripeSubscriptionButton userId="user-42" userEmail="broker@example.com" />);
    fireEvent.click(screen.getByRole("button", { name: /reactivate stripe subscription/i }));
    await waitFor(() => expect(mockedReactivate).toHaveBeenCalledWith("user-42", "Customer called back in"));
    expect(await screen.findByText(/resumed the existing subscription/i)).toBeInTheDocument();
  });

  it("surfaces a returned error instead of throwing", async () => {
    vi.spyOn(window, "prompt").mockReturnValue("Test");
    vi.spyOn(window, "confirm").mockReturnValue(true);
    mockedReactivate.mockResolvedValue({ error: "This subscription is not canceled." });
    render(<ReactivateStripeSubscriptionButton userId="user-1" userEmail="broker@example.com" />);
    fireEvent.click(screen.getByRole("button", { name: /reactivate stripe subscription/i }));
    expect(await screen.findByText(/not canceled/i)).toBeInTheDocument();
  });

  it("shows the recreated-subscription message distinctly when a brand new subscription had to be created", async () => {
    vi.spyOn(window, "prompt").mockReturnValue("Test");
    vi.spyOn(window, "confirm").mockReturnValue(true);
    mockedReactivate.mockResolvedValue({ message: 'Recreated a new subscription (sub_new123) — active immediately.' });
    render(<ReactivateStripeSubscriptionButton userId="user-1" userEmail="broker@example.com" />);
    fireEvent.click(screen.getByRole("button", { name: /reactivate stripe subscription/i }));
    expect(await screen.findByText(/recreated a new subscription/i)).toBeInTheDocument();
  });
});
