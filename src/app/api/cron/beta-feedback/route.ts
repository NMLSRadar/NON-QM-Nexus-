import { runBetaFeedbackCron } from "@/lib/beta-feedback/cron";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

/**
 * Primary beta-feedback reconciliation trigger.
 *
 * Vercel invokes this at 14:00 UTC. On the Hobby plan that means sometime
 * during that UTC hour, not necessarily at exactly 14:00. The sweep is
 * idempotent per tester and email milestone. A separate 15:00 UTC recovery
 * route runs the same reconciliation in case this best-effort delivery is
 * missed, and also keeps the business time at 7 AM Pacific after the switch
 * from daylight time to standard time.
 */
export async function GET(request: Request) {
  return runBetaFeedbackCron(request, "primary");
}
