import { runBetaFeedbackCron } from "@/lib/beta-feedback/cron";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

/**
 * Recovery reconciliation for Vercel's best-effort daily cron delivery.
 * It is intentionally safe to run after the primary trigger because the
 * survey table stores independent Day-3 and Day-5 send markers.
 */
export async function GET(request: Request) {
  return runBetaFeedbackCron(request, "recovery");
}
