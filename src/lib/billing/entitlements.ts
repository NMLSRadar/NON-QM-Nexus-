export type BillingAccessStatus = "active" | "trialing" | "past_due" | "canceled" | "unpaid" | "incomplete";

export function evaluateAccess(input: {
  status: BillingAccessStatus;
  currentPeriodEnd: Date | null;
  retryWindowEnd?: Date | null;
  now?: Date;
}): { allowed: boolean; banner: string | null } {
  const now = input.now ?? new Date();
  if (input.status === "active" || input.status === "trialing") return { allowed: true, banner: null };
  if (input.status === "past_due" && input.retryWindowEnd && input.retryWindowEnd > now) {
    const date = input.retryWindowEnd.toLocaleDateString("en-US", { year: "numeric", month: "long", day: "numeric" });
    return { allowed: true, banner: `Payment needs attention. Access continues through ${date}.` };
  }
  if (input.currentPeriodEnd && input.currentPeriodEnd > now && input.status === "canceled") {
    return { allowed: true, banner: `Access continues through ${input.currentPeriodEnd.toLocaleDateString("en-US")}.` };
  }
  return { allowed: false, banner: null };
}

export function evaluateCancellation(input: {
  legacyPlanKey?: string | null;
  commitmentEndAt?: Date | null;
  now?: Date;
}): { mode: "period_end" | "commitment_end"; effectiveAt: Date | null } {
  const now = input.now ?? new Date();
  if (!input.legacyPlanKey && input.commitmentEndAt && input.commitmentEndAt > now) {
    return { mode: "commitment_end", effectiveAt: input.commitmentEndAt };
  }
  return { mode: "period_end", effectiveAt: null };
}
