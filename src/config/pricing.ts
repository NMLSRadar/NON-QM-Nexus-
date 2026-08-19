export type BillingMode = "recurring_monthly" | "prepaid_term";

export type PlanId = "monthly" | "commit_4mo";

export interface Plan {
  id: PlanId;
  name: string;
  amountCents: number;
  billingMode: BillingMode;
  termMonths: number;
  rollsToPlanId: PlanId | null;
  cancellableMidTerm: boolean;
  stripeLookupKey: string;
}

export const PRICING_VERSION = "v2" as const;
export const COMMITMENT_DISCLOSURE_VERSION = "commit-4mo-v1" as const;
export const COMMITMENT_DISCLOSURE =
  "By selecting this plan, you authorize NON-QM Nexus to charge your payment method $50.00 today and $50.00 per month for the following three months, for a total four-month commitment of $200.00. You may not cancel the remaining committed payments during this four-month term. After the fourth $50.00 payment, your membership will automatically continue at $59.99 per month on a month-to-month basis until you cancel. You may cancel the month-to-month membership at any time after the commitment term." as const;

export const PLANS: Readonly<Record<PlanId, Plan>> = Object.freeze({
  monthly: Object.freeze({
    id: "monthly",
    name: "Monthly",
    amountCents: 5999,
    billingMode: "recurring_monthly",
    termMonths: 1,
    rollsToPlanId: null,
    cancellableMidTerm: true,
    stripeLookupKey: "non_qm_nexus_monthly_v2",
  }),
  commit_4mo: Object.freeze({
    id: "commit_4mo",
    name: "4-Month Commitment",
    amountCents: 5000,
    billingMode: "recurring_monthly",
    termMonths: 4,
    rollsToPlanId: "monthly",
    cancellableMidTerm: false,
    stripeLookupKey: "non_qm_nexus_commit_4mo_v2",
  }),
});

export const LEGACY_PLAN = Object.freeze({
  key: "legacy_commit_3mo_120",
  amountCents: 12000,
  standardAmountCents: 15000,
  termMonths: 3,
});

export function termTotalCents(plan: Plan): number {
  return plan.amountCents * plan.termMonths;
}

export function effectiveMonthlyCents(plan: Plan): number {
  return Math.trunc(termTotalCents(plan) / plan.termMonths);
}
