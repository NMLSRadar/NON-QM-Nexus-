// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";

vi.mock("@/app/admin/users/actions", () => ({
  assignSubscription: vi.fn(),
  reactivateSubscription: vi.fn(),
  cancelStripeSubscriptionAdmin: vi.fn(),
  reactivateStripeSubscriptionAdmin: vi.fn(),
}));

import { SubscriptionRow } from "@/app/admin/users/subscription-row";

const plans = [{ id: "p1", name: "Essential" }];
const discounts: Array<{ id: string; name: string }> = [];

describe("SubscriptionRow — the admin-side Stripe cancel button only appears where it's actually valid", () => {
  it("shows the Cancel Stripe subscription button for an ACTIVE, live Stripe-sourced subscription", () => {
    render(
      <SubscriptionRow
        userId="u1"
        userEmail="broker@example.com"
        currentPlanId="p1"
        currentDiscountId={null}
        canceledAt={null}
        isLiveStripeSubscription={true}
        plans={plans}
        discounts={discounts}
      />
    );
    expect(screen.getByRole("button", { name: /cancel stripe subscription/i })).toBeInTheDocument();
  });

  it("does NOT show the button for a comped (non-Stripe) subscription — nothing to cancel with Stripe here", () => {
    render(
      <SubscriptionRow
        userId="u1"
        userEmail="broker@example.com"
        currentPlanId="p1"
        currentDiscountId={null}
        canceledAt={null}
        isLiveStripeSubscription={false}
        plans={plans}
        discounts={discounts}
      />
    );
    expect(screen.queryByRole("button", { name: /cancel stripe subscription/i })).not.toBeInTheDocument();
  });

  it("does NOT show the button once the subscription is already canceled (Reactivate shows instead)", () => {
    render(
      <SubscriptionRow
        userId="u1"
        userEmail="broker@example.com"
        currentPlanId="p1"
        currentDiscountId={null}
        canceledAt="2026-07-01T00:00:00.000Z"
        isLiveStripeSubscription={true}
        plans={plans}
        discounts={discounts}
      />
    );
    expect(screen.queryByRole("button", { name: /cancel stripe subscription/i })).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: /reactivate/i })).toBeInTheDocument();
  });

  it("does NOT show the button when the user has no plan at all", () => {
    render(
      <SubscriptionRow
        userId="u1"
        userEmail="broker@example.com"
        currentPlanId={null}
        currentDiscountId={null}
        canceledAt={null}
        isLiveStripeSubscription={false}
        plans={plans}
        discounts={discounts}
      />
    );
    expect(screen.queryByRole("button", { name: /cancel stripe subscription/i })).not.toBeInTheDocument();
  });
});

describe("SubscriptionRow — the admin-side Stripe REACTIVATE button only appears where it's actually valid", () => {
  it("shows the 'Reactivate Stripe subscription' button for a CANCELED, live Stripe-sourced subscription — not the generic comped-style Reactivate", () => {
    render(
      <SubscriptionRow
        userId="u1"
        userEmail="broker@example.com"
        currentPlanId="p1"
        currentDiscountId={null}
        canceledAt="2026-07-01T00:00:00.000Z"
        isLiveStripeSubscription={true}
        plans={plans}
        discounts={discounts}
      />
    );
    expect(screen.getByRole("button", { name: /reactivate stripe subscription/i })).toBeInTheDocument();
    // The plain comped-style "Reactivate" button (exact match) must NOT
    // also render — the Stripe-aware one replaces it, never both.
    expect(screen.queryByRole("button", { name: /^reactivate$/i })).not.toBeInTheDocument();
  });

  it("shows the plain 'Reactivate' button (not the Stripe one) for a canceled COMPED subscription", () => {
    render(
      <SubscriptionRow
        userId="u1"
        userEmail="broker@example.com"
        currentPlanId="p1"
        currentDiscountId={null}
        canceledAt="2026-07-01T00:00:00.000Z"
        isLiveStripeSubscription={false}
        plans={plans}
        discounts={discounts}
      />
    );
    expect(screen.getByRole("button", { name: /^reactivate$/i })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /reactivate stripe subscription/i })).not.toBeInTheDocument();
  });

  it("does NOT show any reactivate button when the subscription is currently active (not canceled)", () => {
    render(
      <SubscriptionRow
        userId="u1"
        userEmail="broker@example.com"
        currentPlanId="p1"
        currentDiscountId={null}
        canceledAt={null}
        isLiveStripeSubscription={true}
        plans={plans}
        discounts={discounts}
      />
    );
    expect(screen.queryByRole("button", { name: /reactivate/i })).not.toBeInTheDocument();
  });
});
