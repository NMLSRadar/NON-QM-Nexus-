// Shared constants for Bulk Membership (docs/bulk-membership.md) — a single
// unified path for a brokerage to buy any number of loan-officer seats from
// 1 up to MAX_BULK_SEATS in one deal, at a custom negotiated price, fully
// separate from (and never modifying) the existing 3-tier self-serve system.
export const BULK_PLAN_KEY = "bulk_enterprise";
export const MAX_BULK_SEATS = 500;
export const MIN_BULK_SEATS = 1;

export function isValidBulkSeatCount(seatCount: number): boolean {
  return Number.isInteger(seatCount) && seatCount >= MIN_BULK_SEATS && seatCount <= MAX_BULK_SEATS;
}

export type BulkBillingMode = "custom_stripe" | "invoiced" | "comped";

export function formatCents(cents: number): string {
  const dollars = cents / 100;
  return `$${dollars % 1 === 0 ? dollars.toLocaleString("en-US") : dollars.toFixed(2)}`;
}
